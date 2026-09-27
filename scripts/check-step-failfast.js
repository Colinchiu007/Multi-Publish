"use strict"

// CI 步骤 fail-fast 棘轮。
// 实测事故：`run: |` 块里塞多条测试命令时，GitHub 的 PowerShell 步骤**不会**在中间某条
// 非零退出时中止 —— 只有最后一条命令的 $LASTEXITCODE 决定步骤成败。于是
// `session-write-guard.test.ps1` 在 runner 上抛 FAIL 之后，后面的测试照跑、步骤照绿
// （run 36313053992 / step "Gate 2d"）。这种步骤看起来是门禁，实际是装饰。
// 口径：一个 run 块里执行 ≥2 个测试文件时，必须显式 fail-fast
// —— 要么 shell: bash（GitHub 默认 `bash -e -o pipefail`），要么在正文里自己查 $LASTEXITCODE。

const fs = require("node:fs")
const path = require("node:path")

// 既有欠账：file::step 名 -> 原因。只能缩小，新增即红。
const KNOWN_NON_FAIL_FAST = {}

const TEST_INVOCATION = /(\bnode\s+(?:--test\s+\S|\S*\.test\.(?:js|mjs))|\bbash\s+\S*\.test\.sh|\b(?:pwsh|powershell)\b[^|\n]*-File\s+\S*\.test\.ps1|\bpytest\b|\bpython\s+-m\s+pytest)/
const SHELL_LINE = /^\s*shell:\s*(\S+)/
const RUN_BLOCK = /^(\s*)run:\s*[|>]\s*$/
const NAME_LINE = /^(\s*)-\s*name:\s*(.+)$/

function stepName(lines, idx) {
  for (let i = idx; i >= 0; i--) {
    const m = lines[i].match(NAME_LINE)
    if (m) return m[2].trim().replace(/^["']|["']$/g, "")
    const other = lines[i].match(/^\s*-\s/)
    if (other && i !== idx) return "(未命名步骤)"
  }
  return "(未知步骤)"
}

function stepShell(lines, idx, indent) {
  for (let i = idx; i >= 0; i--) {
    if (lines[i].trim() === "") continue
    const own = lines[i].match(/^(\s*)/)
    if (own && own[1].length <= indent.length && !/^\s*#/.test(lines[i])) {
      const s = lines[i].match(SHELL_LINE)
      if (s) return s[1]
    }
    if (i < idx - 12) break
    const s = lines[i].match(SHELL_LINE)
    if (s) return s[1]
  }
  return "(默认)"
}

function collectCheck(root) {
  const dir = path.join(root, ".github", "workflows")
  if (!fs.existsSync(dir)) throw new Error(`未找到 workflows 目录：${dir}（解析退化会让本门禁假绿）`)
  const files = fs.readdirSync(dir).filter(f => /\.(yml|yaml)$/.test(f)).sort()
  if (files.length === 0) throw new Error(`${dir} 下没有 workflow 文件，拒绝以空集合判定全部合规`)

  const violations = []
  let stepsScanned = 0
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n").split("\n")
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(RUN_BLOCK)
      if (!m) continue
      const indent = m[1]
      const body = []
      for (let k = i + 1; k < lines.length; k++) {
        if (lines[k].trim() === "") continue
        const ind = lines[k].match(/^(\s*)/)[1]
        if (ind.length <= indent.length) break
        body.push(lines[k])
      }
      const tests = body.filter(l => TEST_INVOCATION.test(l))
      if (tests.length < 2) continue
      stepsScanned++
      const shell = stepShell(lines, i, indent)
      const name = stepName(lines, i)
      const fast = /^bash$/.test(shell) || body.some(l => /\$LASTEXITCODE/.test(l))
      const key = `${f}::${name}`
      if (!fast && !KNOWN_NON_FAIL_FAST[key]) {
        violations.push({ code: "STEP_NOT_FAIL_FAST", key, shell, tests: tests.length, hint: `shell: ${shell}，${tests.length} 条测试命令` })
      }
      if (fast && KNOWN_NON_FAIL_FAST[key]) {
        violations.push({ code: "STEP_EXEMPTION_STALE", key, shell, tests: tests.length, hint: "该步骤已 fail-fast，请删除欠账登记" })
      }
    }
  }
  return { stepsScanned, violations }
}

function run(root) {
  const { stepsScanned, violations } = collectCheck(root)
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ ok: violations.length === 0, multiTestSteps: stepsScanned, violations }, null, 2) + "\n")
  } else {
    process.stdout.write(`含 ≥2 条测试命令的 run 步骤：${stepsScanned} 个\n`)
    for (const v of violations) process.stdout.write(`  ${v.code} ${v.key} —— ${v.hint}\n`)
    if (violations.length === 0) process.stdout.write("OK: 所有多测试步骤均 fail-fast（或已按欠账登记）\n")
  }
  return { exitCode: violations.length === 0 ? 0 : 1, violations }
}

if (require.main === module) {
  try {
    const rootArg = process.argv.slice(2).find(a => a.startsWith("--root="))
    process.exitCode = run(rootArg ? path.resolve(rootArg.slice(7)) : process.cwd()).exitCode
  } catch (error) {
    process.stderr.write(`ERROR: ${error && error.message}\n`)
    process.exitCode = 2
  }
}

module.exports = { collectCheck, run, KNOWN_NON_FAIL_FAST, TEST_INVOCATION }
