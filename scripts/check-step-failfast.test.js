"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const checker = require("./check-step-failfast.js")

function makeFixture(workflowBody) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "step-failfast-"))
  const dir = path.join(root, ".github", "workflows")
  fs.mkdirSync(dir, { recursive: true })
  if (workflowBody !== null) fs.writeFileSync(path.join(dir, "gate.yml"), workflowBody, "utf8")
  return root
}

const STEP_PWSH_MULTI = [
  "jobs:",
  "  t:",
  "    steps:",
  '      - name: "multi"',
  "        shell: pwsh",
  "        run: |",
  "          node --test a.test.js",
  "          node --test b.test.js",
  "",
].join("\n")

const STEP_BASH_MULTI = STEP_PWSH_MULTI.replace("shell: pwsh", "shell: bash")
const STEP_PWSH_WITH_EXITCHECK = STEP_PWSH_MULTI + "          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n"
const STEP_SINGLE = ["jobs:", "  t:", "    steps:", '      - name: "one"', "        shell: pwsh", "        run: |", "          node --test a.test.js", ""].join("\n")

test("pwsh 步骤里多条测试命令且不查退出码 → 必须报违规", () => {
  const root = makeFixture(STEP_PWSH_MULTI)
  try {
    const r = checker.collectCheck(root)
    assert.equal(r.stepsScanned, 1, "夹具应恰好解析出 1 个多测试步骤")
    assert.deepEqual(r.violations.map(v => [v.code, v.key]), [["STEP_NOT_FAIL_FAST", "gate.yml::multi"]])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("shell: bash 视为 fail-fast（GitHub 默认 bash -e -o pipefail）", () => {
  const root = makeFixture(STEP_BASH_MULTI)
  try {
    assert.deepEqual(checker.collectCheck(root).violations, [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("pwsh 步骤自行检查 $LASTEXITCODE 也算 fail-fast", () => {
  const root = makeFixture(STEP_PWSH_WITH_EXITCHECK)
  try {
    assert.deepEqual(checker.collectCheck(root).violations, [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("单条测试命令的步骤不受本门禁约束", () => {
  const root = makeFixture(STEP_SINGLE)
  try {
    const r = checker.collectCheck(root)
    assert.equal(r.stepsScanned, 0)
    assert.deepEqual(r.violations, [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("workflows 集合为空时抛错，不静默判绿", () => {
  const root = makeFixture(null)
  try {
    assert.throws(() => checker.collectCheck(root), /没有 workflow 文件/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("真实仓库：已无未登记的非 fail-fast 多测试步骤", () => {
  const root = path.join(__dirname, "..")
  const r = checker.collectCheck(root)
  assert.ok(r.stepsScanned >= 4, `解析到的多测试步骤数异常：${r.stepsScanned}（解析退化会让本门禁假绿）`)
  assert.deepEqual(r.violations.map(v => v.key), [], "存在会吞失败的多命令步骤")
  assert.deepEqual(
    Object.keys(checker.KNOWN_NON_FAIL_FAST),
    [],
    "欠账清单应保持为空：任何非 fail-fast 的多测试步骤都必须改成 shell: bash，而不是登记豁免",
  )
})
