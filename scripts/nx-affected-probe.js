'use strict'
/**
 * scripts/nx-affected-probe.js —— 判读 `nx show projects --affected --json` 的输出
 *
 * 一句话：把「这次 PR 到底有没有受影响的（带 test target 的）非桌面项目」这个判定
 * 从 workflow 的内联 PowerShell 搬进可单测的纯函数，判成三态之一：
 *
 *   - `empty`     —— 确证没有受影响项目。调用方**应当**据此早退、跳过测试。
 *   - `non-empty` —— 确证有受影响项目，projects 里有清单。
 *   - `unparsable`—— 取不到可信证据。调用方**不得**据此早退（fail-closed 方向）。
 *
 * 为什么必须分三态而不是「空 / 非空」两态：#2902 已经踩过一次同族坑 ——
 * 空集若被误当成「探测失败」而继续往下跑，`nx affected` 会跑 0 个任务、
 * 根本不启动测试进程，于是运行时出站台账的 sink 从未产出，末尾那道
 * fail-closed 判定（见 check-test-egress-ledger.js）就把一条正常 PR 判红。
 * 「不知道」和「没有」必须能区分，否则门禁只能一边误红、一边假绿。
 *
 * 起因（本脚本存在的那次具体假红）：PR #2596 的 QG Unit Tests。
 * CI runner 会还原 Nx 缓存（workflow 的 `actions/cache` 只把 `.nx/cache` 存进缓存，
 * `.nx/workspace-data/d` 那个 db 不在缓存键内），于是 nx 判定"缓存里有条目但
 * 本地 db 无对应元数据"，把这段提示打到 **stdout**：
 *
 *     NX   Unrecognized Cache Artifacts
 *     Nx found unrecognized artifacts in the cache directory and will not be able to use them.
 *     ...
 *
 * 旧判据是字符串全等 `$t -eq '' -or $t -eq '[]'`（#2902 引入，用来接住
 * `ConvertFrom-Json '[]'` 摊平成 $null 的坑）。加了这段提示之后 $t 变成
 * 「提示 + `[]`」，全等两条都不成立 ⇒ 空集被误分类成「探测失败」⇒ 降级照跑 ⇒
 * 假红。本脚本改为**逐行找能独立 parse 成 JSON 数组的那一行**，与提示文本解耦。
 *
 * 退出码契约（调用方按这个分工，不要混）：
 *   0 —— 判定完成（三种 kind 都算完成；`unparsable` 是合法结论不是错误）
 *   2 —— 用法错误（读不到 stdin / 参数不认识）
 * 刻意不为 `unparsable` 返非零：那会让调用方无法区分「取不到证据」和「脚本自己坏了」。
 *
 * 用法：
 *   pnpm exec nx show projects --affected --json | node scripts/nx-affected-probe.js --exit 0
 */
const fs = require('node:fs')

const KIND_EMPTY = 'empty'
const KIND_NON_EMPTY = 'non-empty'
const KIND_UNPARSABLE = 'unparsable'

/**
 * 在原始输出里找出 nx 打印的那个 JSON 数组。
 *
 * 两条路径，先逐行后整体：
 *   1) 逐行 trim 后单独 parse —— nx 的 `--json` 是单行紧凑输出（`[]` / `["a"]`），
 *      而提示文本是散文行。这样散文里出现方括号也污染不到判定。
 *   2) 整体 parse —— 只在「整个文本恰好是一个 JSON 值」时成功，覆盖将来 nx 改成
 *      多行 pretty-print 的可能。带提示的文本整体不是合法 JSON，所以不会误命中。
 *
 * @returns {string[]|null} 解析出的项目名数组；取不到可信证据时返回 null
 */
function extractAffectedArray (text) {
  if (typeof text !== 'string') return null
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let value
    try {
      value = JSON.parse(trimmed)
    } catch (_) {
      continue
    }
    if (Array.isArray(value)) return value.map((v) => String(v))
  }
  const whole = text.trim()
  if (whole === '') return null
  let value
  try {
    value = JSON.parse(whole)
  } catch (_) {
    return null
  }
  return Array.isArray(value) ? value.map((v) => String(v)) : null
}

/**
 * 判定 nx affected 探测的结果。
 *
 * fail-closed 侧的两条硬约束（都有测试钉住）：
 *   1) nx 自身非零退出时**一律** unparsable，哪怕文本里能 parse 出一个数组 ——
 *      探测失败时不能因为"文本碰巧像空的"就早退，那会把测试静默关掉。
 *   2) 只有确证的空数组才是 empty；解析不出来就是 unparsable，不猜。
 *
 * @param {{text: string, exitCode?: number}} input
 * @returns {{kind: string, projects: string[], count: number, reason: string}}
 */
function classifyNxAffectedOutput ({ text, exitCode = 0 }) {
  if (exitCode !== 0) {
    return {
      kind: KIND_UNPARSABLE,
      projects: [],
      count: 0,
      reason: 'nx exited with code ' + exitCode + ' (failed detection must never be read as an empty set)',
    }
  }
  const projects = extractAffectedArray(text)
  if (projects === null) {
    return {
      kind: KIND_UNPARSABLE,
      projects: [],
      count: 0,
      reason: 'no line in the nx output parsed as a JSON array',
    }
  }
  if (projects.length === 0) {
    return { kind: KIND_EMPTY, projects: [], count: 0, reason: 'nx reported an empty affected-project array' }
  }
  return { kind: KIND_NON_EMPTY, projects, count: projects.length, reason: 'nx reported ' + projects.length + ' affected project(s)' }
}

function readStdin () {
  try {
    return fs.readFileSync(0, 'utf8')
  } catch (_) {
    return ''
  }
}

function main (argv) {
  const exitIdx = argv.indexOf('--exit')
  if (exitIdx < 0 || argv[exitIdx + 1] === undefined) {
    console.error('用法：<nx 输出> | node scripts/nx-affected-probe.js --exit <code>')
    return 2
  }
  const exitCode = Number(argv[exitIdx + 1])
  if (!Number.isInteger(exitCode)) {
    console.error('--exit 必须是整数，收到：' + argv[exitIdx + 1])
    return 2
  }
  const verdict = classifyNxAffectedOutput({ text: readStdin(), exitCode })
  // 机器可读单行：workflow 只读 kind 与 projects，不做任何二次解析。
  console.log(JSON.stringify(verdict))
  return 0
}

module.exports = { classifyNxAffectedOutput, extractAffectedArray, KIND_EMPTY, KIND_NON_EMPTY, KIND_UNPARSABLE }

if (require.main === module) process.exitCode = main(process.argv.slice(2))
