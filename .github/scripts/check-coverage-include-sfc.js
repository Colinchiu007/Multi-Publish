#!/usr/bin/env node
/**
 * check-coverage-include-sfc.js — 覆盖率门禁必须真的覆盖 Vue 单文件组件（CI Gate 5 配套）
 *
 * 查什么
 *   apps/desktop/vitest.config.js 的 test.coverage.include 是一组 glob。此前它 13 条**全是
 *   `*.js`**，而 apps/desktop/src 下有 146 个 `.vue` —— 它们对覆盖率的贡献恒为 0，
 *   而承载的却是渲染分支、事件处理、生命周期、computed 推导等绝大部分界面逻辑。
 *   于是「覆盖率 55%」这个数字是在一个**刻意排除了 SFC 的文件集**上量出来的，
 *   门禁绿灯并不代表界面代码被测过。
 *
 * 为什么要单独做门禁，而不是靠 review 看住
 *   因为这正好是一次「删掉一行 glob 就让门禁失去意义、且**自己不会变红**」的变更。
 *   覆盖率 include 被清空、缩到某个不存在的目录、或写成 `src/**.vue` 这类拼错的 glob，
 *   vitest 一声不响地按新范围出数，门禁照样绿。上面那行「已修 M-6」会留在文档里骗人。
 *
 * 三条断言（缺一不可）
 *   1. 存在至少一条能匹配 `.vue` 的 include 条目  —— 防「整条被删」
 *   2. 这些条目**实际匹配到 ≥1 个真实文件**        —— 防「假 glob」（拼错/路径搬走而匹配为空）
 *   3. src 下**每一个** `.vue` 都被至少一条 include 覆盖 —— 防「漏掉一部分」（新目录没被带上）
 *
 * 附带：thresholds 必须存在且为正数 —— 删掉阈值同样能让门禁变成装饰。
 *
 * 本地同口径：node .github/scripts/check-coverage-include-sfc.js
 * 回归：node --test .github/scripts/check-coverage-include-sfc.test.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const DESKTOP = path.join(ROOT, 'apps', 'desktop')
const SRC = path.join(DESKTOP, 'src')

/**
 * 用 fs.globSync 展开一条 glob，返回命中文件的**相对 DESKTOP 的 posix 路径**。
 *
 * 为什么不用 minimatch：它在本仓只是传递依赖（实测被解析到 3.1.5，导出形状是
 * `module.exports = fn`；而 v9+ 改成 `{ minimatch }`），写法一旦照抄另一种形状就会
 * `minimatch is not a function` —— 而那正是本门禁要防的那类「静默失效」的同构形态。
 * fs.globSync 是 Node 22 自带、也是 vitest 解析 include 时底层的同一套 glob 引擎，
 * 口径天然一致，且不引入随 hoisting 漂移的依赖。
 */
function expandGlob(glob, cwd = DESKTOP) {
  try {
    const out = fs.globSync(glob, { cwd, dot: true })
    return out.map((f) => f.replace(/\\/g, '/'))
  } catch {
    // glob 本身非法：按「命中 0 个」处理，交由上层的假-glob 判据出声。
    return []
  }
}

/** 递归收集目录下所有文件，返回相对 DESKTOP 的 posix 风格路径。 */
function walk(dir, base, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      // node_modules / dist 不可能出现在 src 下真源码里，但跳过可让本函数在
      // 「src 被误建成链接」时仍给出稳定答案，而不是把依赖树当源码统计。
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'coverage') continue
      walk(full, base, out)
    } else if (e.isFile()) {
      out.push(path.relative(base, full).replace(/\\/g, '/'))
    }
  }
  return out
}

/**
 * 纯函数判据。抽出成独立函数是为了能被单测直接喂构造数据 —— 若只在 main() 里写，
 * 回归锁就只能对着真仓库跑，测不出「构造出来的配置也判红」这件事本身。
 *
 * @param {string[]} include  coverage.include 条目
 * @param {string[]} srcVueFiles src 下的 .vue（相对 apps/desktop，posix）
 * @param {object}   [opts]
 * @param {object}   [opts.thresholds]
 * @param {(glob: string) => string[]} [opts.expand] glob 展开函数，测试可注入
 * @param {string} [opts.cwd] glob 展开的基准目录（测试用临时夹具目录）
 */
function evaluate(include, srcVueFiles, opts = {}) {
  const reasons = []
  const list = Array.isArray(include) ? include : []
  const cwd = opts.cwd || DESKTOP
  const expand = typeof opts.expand === 'function' ? opts.expand : (g) => expandGlob(g, cwd)

  // 断言 1
  const vueGlobs = list.filter((g) => typeof g === 'string' && g.includes('.vue'))
  if (vueGlobs.length === 0) {
    reasons.push(
      `coverage.include 里没有任何能匹配 .vue 的条目（当前 ${list.length} 条：${list.join(', ')}）。` +
      'SFC 对覆盖率贡献为 0，等于门禁在测一个不含界面逻辑的文件集。'
    )
  }

  // 断言 2 + 3：用同一次 glob 展开，既算「glob 命中什么」也算「谁没被覆盖」。
  const covered = new Set()
  for (const g of vueGlobs) {
    for (const f of expand(g)) covered.add(f.replace(/\\/g, '/'))
  }

  if (vueGlobs.length > 0 && covered.size === 0) {
    // 这是最容易骗过人的形态：glob 写得像模像样，实际一个文件都匹配不到。
    reasons.push(
      `这些 .vue glob 实测命中 0 个文件：${vueGlobs.join(', ')}。` +
      '拼错的 glob 与「目录搬家后失效的 glob」表现完全相同，都不会让 vitest 报错。'
    )
  }

  const uncovered = srcVueFiles.filter((f) => !covered.has(f))
  if (uncovered.length > 0) {
    const sample = uncovered.slice(0, 5).join(', ') + (uncovered.length > 5 ? ` …（共 ${uncovered.length} 个）` : '')
    reasons.push(`src 下有 ${uncovered.length} 个 .vue 未被 coverage.include 覆盖：${sample}`)
  }

  // 附带：阈值必须真的存在
  const th = opts.thresholds || {}
  for (const m of ['statements', 'branches', 'functions', 'lines']) {
    const v = th[m]
    if (typeof v !== 'number' || !(v > 0)) {
      reasons.push(`coverage.thresholds.${m} 缺失或非正数（读到 ${JSON.stringify(v)}）—— 删掉阈值等于取消门禁。`)
    }
  }

  return {
    pass: reasons.length === 0,
    reasons,
    vueGlobs,
    srcVueTotal: srcVueFiles.length,
    coveredCount: covered.size,
    uncovered,
  }
}

function readConfig() {
  // 配置是 CJS（module.exports = defineConfig({...})），纯 Node 可直接 require；
  // 若哪天改成 ESM，这里会当场抛错而不是静默拿到 undefined。
  const cfg = require(path.join(DESKTOP, 'vitest.config.js'))
  const cov = cfg?.test?.coverage
  if (!cov) throw new Error('apps/desktop/vitest.config.js 里没有 test.coverage —— 覆盖率门禁配置本身缺失')
  return cov
}

function main() {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')

  let result
  try {
    const cov = readConfig()
    const srcVue = walk(SRC, DESKTOP).filter((f) => f.endsWith('.vue'))
    result = evaluate(cov.include, srcVue, { thresholds: cov.thresholds })
  } catch (e) {
    result = { pass: false, reasons: [`无法完成判定：${e.message}`], vueGlobs: [], srcVueTotal: 0, coveredCount: 0, uncovered: [] }
  }

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    process.stdout.write(
      `[coverage-include-sfc] coverage.include 共 ${result.vueGlobs.length} 条 .vue glob；` +
      `src 下 .vue ${result.srcVueTotal} 个，被覆盖 ${result.coveredCount} 个\n`
    )
    for (const r of result.reasons) process.stdout.write(`[coverage-include-sfc] FAIL：${r}\n`)
    process.stdout.write(result.pass ? '[coverage-include-sfc] PASS\n' : '[coverage-include-sfc] 失败\n')
  }
  process.exit(result.pass ? 0 : 1)
}

if (require.main === module) main()
module.exports = { evaluate, walk, expandGlob }