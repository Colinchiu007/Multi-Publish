"use strict"

// 测试收集接线棘轮：本仓没有任何机制会自动收集 scripts/ 与 .github/scripts/ 下的测试。
// vitest 只覆盖 apps/desktop 等 workspace，根 package.json 的 test 是 `pnpm -r run test`，
// 所以一条新写的 node --test / bash 测试若不同 PR 登记进 .github/workflows，它就永远不会执行，
// 而且没有任何东西会因此变红。本脚本把这条规矩变成门禁：
// 检查域内每个测试文件必须被某个 workflow 的**可执行正文**点名（注释不算）；
// 豁免只允许按欠账登记，且清单只能缩小。
//
// 检查域**不再是两个写死的目录**，而是「整仓减去显式声明的排除项」。旧口径把域钉死在
// scripts/ 与 .github/scripts/，于是落在两目录之外的测试文件对棘轮**完全隐身**。实测漏例：
// `.quality-rhythm/.github/scripts/tpl-contract.test.js` 被同目录那份
// `.quality-rhythm/.github/workflows/mechanism-check.yml` 用 `node --test` 点名，看起来"已接线"，
// 但 GitHub 只执行**仓库顶层**的 .github/workflows/，那份嵌套 workflow 永远不会被调度 ⇒
// 一条"看着是门禁、实际零执行"的死锁。故本文件同时新增 NESTED_WORKFLOW_NOT_EXECUTED。

const fs = require("node:fs")
const path = require("node:path")

const TEST_SUFFIXES = [".test.js", ".test.mjs", ".test.sh", ".test.ps1"]

// 排除项必须**逐个带理由**地写在这里，且只能缩小（test 侧用 deepEqual 钉住）。
// WORKSPACE_COVERED：由 vitest 按 workspace 自动收集，不属于"没人点名"这一类。
const WORKSPACE_COVERED = ["apps/", "packages/", "ops-center/"]
// VENDORED_MIRROR：上游技能制品的 vendored 副本（含它自带的 .github/workflows），
// 不是本仓的被测代码；本仓 CI 不去执行它，也不把它内部的 *.test.* 计入检查域。
// 这一条同时也是 NESTED_WORKFLOW_NOT_EXECUTED 的白名单——新增嵌套 workflow 必须先在这里显式承认。
const VENDORED_MIRROR = [".quality-rhythm/"]
// 目录级剪枝：构建产物与依赖，永远不是本仓测试源。
const PRUNE_DIRS = [".git", "node_modules", "dist", "dist-electron", "coverage", ".playwright-browsers", ".next", "build"]

// 欠账登记：path -> 不可省略的原因。只能缩小，新增即红（与 platform-definitions 棘轮同形）。
// 2026-09-27 把 scripts 下 7 条 PowerShell 测试逐个实跑分档（本机 pwsh 7.6 / PS 5.1 各一遍，
// 再以 runner 首跑为准）：6 条接进 Gate 2d，1 条按硬证据登记欠账（不是"没试过"）。
// session-write-guard 曾在欠账里（runner 红、本机绿），根因是夹具与真实工作树不同形，已修并回接：
// 判「runner 端差异」时先问这一维是不是**可配置的**（git 全局配置、shell、环境变量都算），
// 可配置就能在本机用 GIT_CONFIG_GLOBAL 指到临时配置文件复现，不属于"只有 runner 知道"那一类。
const KNOWN_UNWIRED = {
  "scripts/session-isolation-automation.test.ps1":
    "注册动作内部调 Register-ScheduledTask，其中写保护任务用的是 AtLogOn 触发器：实测非提权一律" +
    " PermissionDenied / HRESULT 0x80070005（同一次探针里，非 AtLogOn 的健康巡检任务注册成功并可" +
    "干净删除，所以提权门槛精确只在 AtLogOn 那一格）。接进 CI 的未知量因此收窄成“runner 的进程令牌" +
    "是否提权”。接线前提已就位一半：installer 自本 PR 起支持 -TaskPath 一次性路径，测试再也" +
    "不可能删掉生产任务；剩下的是一次带留痕的 runner 实测，用来确定 AtLogOn 在 runner 上能否注册"
}

// 嵌套 workflow 承认清单：path -> 为什么允许它存在但永不执行。只能缩小，新增即红。
// 这类文件的危害不是"没跑测试"，而是**看起来像门禁**：正文里写着 node --test，读的人以为
// 有东西在守；实际 GitHub 只调度仓库顶层的 .github/workflows/，嵌套那份永远不会被排队执行。
const KNOWN_NESTED_WORKFLOWS = {
  ".quality-rhythm/.github/workflows/mechanism-check.yml":
    "质量节拍技能的 vendored 副本自带一份上游 CI 配置，本仓不会执行它；它与副本内的 " +
    ".quality-rhythm/.github/scripts/tpl-contract.test.js 同属制品内容，本仓的契约由 " +
    "scripts/quality-rhythm-spec-mirror.test.js（Gate 2b）对真源逐 Requirement 钉死",
}

// 测试域排除 = workspace（vitest 已收集）+ vendored 副本（不是本仓被测代码）。
// 注意：VENDORED_MIRROR **只排除测试域**，不排除遍历——否则里面那份永不执行的 workflow
// 就看不见，而"承认它是副本"这件事就退化成了无人核对的默认值。
const TEST_DOMAIN_EXCLUDED = [...WORKSPACE_COVERED, ...VENDORED_MIRROR]

function inAnyPrefix(relPosix, prefixes) {
  return prefixes.some((p) => relPosix.startsWith(p))
}

// 全仓遍历（不跟随链接：Windows 上 worktree 的 node_modules 里全是 junction，跟随会跨到别处）。
// 返回相对 root 的正斜杠路径清单。剪枝 PRUNE_DIRS 与 workspace 目录，保证不遍历依赖与构建产物。
function walkRepoFiles(root) {
  const out = []
  const absRoot = path.resolve(root)
  const stack = [""]
  while (stack.length) {
    const rel = stack.pop()
    const abs = rel ? path.join(absRoot, rel) : absRoot
    let entries
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true })
    } catch (error) {
      // 读不动的目录必须出声：静默跳过就是"以不完整遍历判定全绿"（同 R3 链接扫描的教训）
      throw new Error(`无法枚举目录 ${abs}：${error && error.message}（遍历不完整时本门禁拒绝判定）`)
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isSymbolicLink() || e.isFIFO() || e.isSocket()) continue
      if (e.isDirectory()) {
        if (PRUNE_DIRS.includes(e.name) || inAnyPrefix(childRel + "/", WORKSPACE_COVERED)) continue
        stack.push(childRel)
        continue
      }
      if (!e.isFile()) continue
      out.push(childRel)
    }
  }
  return out.sort()
}

// 嵌套的 workflow 文件：GitHub 只调度仓库顶层 .github/workflows/ 下的文件，
// 任何 `.../.github/workflows/*.yml` 都是**永远不会被执行**的配置副本。
function isNestedWorkflow(relPosix) {
  return /(^|\/)\.github\/workflows\/.*\.(yml|yaml)$/.test(relPosix) && !relPosix.startsWith(".github/workflows/")
}

function listTestFiles(root) {
  return walkRepoFiles(root)
    .filter((rel) => !inAnyPrefix(rel, TEST_DOMAIN_EXCLUDED))
    .filter((rel) => TEST_SUFFIXES.some((s) => rel.endsWith(s)))
    .sort()
}

function listNestedWorkflows(root) {
  return walkRepoFiles(root).filter(isNestedWorkflow).sort()
}

// 注释里提到文件名不构成接线：反证实测过「删掉 run 行、只留注释」仍被判绿。
// 逐行剥掉 YAML 注释（行首 # 或前置空白后的 #）。
function stripComments(text) {
  return text
    .split(/\r?\n/)
    .map(line => {
      const idx = line.search(/(^|\s)#/)
      return idx < 0 ? line : line.slice(0, idx)
    })
    .join("\n")
}

function readWorkflowText(root) {
  const dir = path.join(root, ".github", "workflows")
  if (!fs.existsSync(dir)) {
    throw new Error(`未找到 workflows 目录：${dir}（解析退化会让本门禁假绿）`)
  }
  const files = fs.readdirSync(dir).filter(f => /\.(yml|yaml)$/.test(f))
  if (files.length === 0) throw new Error(`${dir} 下没有 workflow 文件，拒绝以空集合判定全部未接线`)
  return stripComments(files.map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n"))
}

// 同名 basename 会让「按文件名点名」串到另一个文件上，那种情况要求 workflow 写全相对路径。
function collectCheck(root, exemptions = KNOWN_UNWIRED, nestedAcks = KNOWN_NESTED_WORKFLOWS) {
  const files = listTestFiles(root)
  const workflows = readWorkflowText(root)
  const basenameCount = new Map()
  for (const file of files) {
    const base = path.basename(file)
    basenameCount.set(base, (basenameCount.get(base) || 0) + 1)
  }

  const violations = []
  const staleExemptions = []
  for (const file of files) {
    const base = path.basename(file)
    const ambiguous = (basenameCount.get(base) || 0) > 1
    const referenced = ambiguous ? workflows.includes(file) : workflows.includes(base)
    if (!referenced && !exemptions[file]) {
      violations.push({ code: "TEST_NOT_COLLECTED_BY_CI", file, ambiguous })
    }
    if (referenced && exemptions[file]) {
      staleExemptions.push({ code: "TEST_EXEMPTION_STALE", file })
    }
  }
  // 嵌套 workflow 单独一档：它不是"测试没接线"，而是"配置看着像门禁、实际永不排队执行"。
  const nestedFiles = listNestedWorkflows(root)
  const nested = []
  for (const f of nestedFiles) {
    if (!nestedAcks[f]) nested.push({ code: "NESTED_WORKFLOW_NOT_EXECUTED", file: f })
  }
  const staleNested = []
  for (const f of Object.keys(nestedAcks)) {
    if (!nestedFiles.includes(f)) staleNested.push({ code: "NESTED_WORKFLOW_ACK_STALE", file: f })
  }

  return { files, violations, staleExemptions, nested, staleNested, nestedFiles }
}

function run(root) {
  const { files, violations, staleExemptions, nested, staleNested } = collectCheck(root)
  const findings = [...violations, ...staleExemptions, ...nested, ...staleNested]
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ ok: findings.length === 0, checked: files.length, findings }, null, 2) + "\n")
  } else {
    process.stdout.write(`检查域内测试文件 ${files.length} 个\n`)
    for (const v of violations) {
      process.stdout.write(
        `  未接线 ${v.file}${v.ambiguous ? "（同名文件存在，须写全相对路径）" : ""} —— ` +
          "本仓不自动收集 scripts/ 下的测试，必须在 .github/workflows 正文里点名\n",
      )
    }
    for (const s of staleExemptions) {
      process.stdout.write(`  豁免已过时 ${s.file} —— 它已被 CI 收集，请删除 KNOWN_UNWIRED 条目\n`)
    }
    for (const n of nested) {
      process.stdout.write(
        `  嵌套 workflow 永不执行 ${n.file} —— GitHub 只调度仓库顶层 .github/workflows/；` +
          "要么删掉，要么在 KNOWN_NESTED_WORKFLOWS 里带理由承认\n",
      )
    }
    for (const n of staleNested) {
      process.stdout.write(`  过时的嵌套 workflow 承认 ${n.file} —— 文件已不在，请删除该条\n`)
    }
    if (findings.length === 0) process.stdout.write("OK: 全部测试均已接线或按欠账登记\n")
  }
  return { exitCode: findings.length === 0 ? 0 : 1, findings }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2)
    const rootArg = args.find(a => a.startsWith("--root="))
    const root = rootArg ? path.resolve(rootArg.slice(7)) : process.cwd()
    process.exitCode = run(root).exitCode
  } catch (error) {
    process.stderr.write(`ERROR: ${error && error.message}\n`)
    process.exitCode = 2
  }
}

module.exports = {
  listTestFiles,
  listNestedWorkflows,
  walkRepoFiles,
  readWorkflowText,
  stripComments,
  collectCheck,
  run,
  KNOWN_UNWIRED,
  KNOWN_NESTED_WORKFLOWS,
  TEST_SUFFIXES,
  WORKSPACE_COVERED,
  VENDORED_MIRROR,
  TEST_DOMAIN_EXCLUDED,
}
