"use strict"

// 测试收集接线棘轮：本仓没有任何机制会自动收集 scripts/ 与 .github/scripts/ 下的测试。
// vitest 只覆盖 apps/desktop 等 workspace，根 package.json 的 test 是 `pnpm -r run test`，
// 所以一条新写的 node --test / bash 测试若不同 PR 登记进 .github/workflows，它就永远不会执行，
// 而且没有任何东西会因此变红。本脚本把这条规矩变成门禁：
// 检查域内每个测试文件必须被某个 workflow 的**可执行正文**点名（注释不算）；
// 豁免只允许按欠账登记，且清单只能缩小。

const fs = require("node:fs")
const path = require("node:path")

const TEST_SUFFIXES = [".test.js", ".test.mjs", ".test.sh", ".test.ps1"]
const SCAN_DIRS = ["scripts", path.join(".github", "scripts")]

// 欠账登记：path -> 不可省略的原因。只能缩小，新增即红（与 platform-definitions 棘轮同形）。
// 2026-09-27 把 scripts 下 7 条 PowerShell 测试逐个实跑分档（pwsh 7.6 与 Windows PowerShell 5.1
// 各跑一遍）后，6 条已接进 Gate 2d / 2d-b；只剩这一条，理由是硬的而不是"没试过"。
const KNOWN_UNWIRED = {
  "scripts/session-isolation-automation.test.ps1":
    "内部直接调用 install-session-isolation-task.ps1 注册**真实**计划任务（跨会话共享的机器状态），" +
    "且本机非提权实跑 HRESULT 0x80070005 拒绝访问（AtLogOn 任务需提权注册）⇒ 接进 CI 要么恒误红、要么真改 runner 状态。" +
    "接线前提：把注册动作注入为假实现或隔离 task path，另立 change 处理",
}

function listTestFiles(root) {
  const found = []
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir)
    if (!fs.existsSync(abs)) continue
    // recursive readdir 返回的已是相对 abs 的路径字符串，Dirent 不保证带 relativePath
    for (const rel of fs.readdirSync(abs, { recursive: true })) {
      const relStr = String(rel).split(path.sep).join("/")
      if (!TEST_SUFFIXES.some((s) => relStr.endsWith(s))) continue
      if (!fs.statSync(path.join(abs, relStr)).isFile()) continue
      found.push(`${dir.split(path.sep).join("/")}/${relStr}`)
    }
  }
  return found.sort()
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
function collectCheck(root, exemptions = KNOWN_UNWIRED) {
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
  return { files, violations, staleExemptions }
}

function run(root) {
  const { files, violations, staleExemptions } = collectCheck(root)
  const findings = [...violations, ...staleExemptions]
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
  readWorkflowText,
  stripComments,
  collectCheck,
  run,
  KNOWN_UNWIRED,
  TEST_SUFFIXES,
  SCAN_DIRS,
}
