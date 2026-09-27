"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const checker = require("./check-unwired-tests.js")

function makeFixture({ tests, workflowBody, exemptions = {} }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "unwired-tests-"))
  for (const rel of tests) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, "// fixture\n", "utf8")
  }
  const wfDir = path.join(root, ".github", "workflows")
  fs.mkdirSync(wfDir, { recursive: true })
  if (workflowBody !== null) {
    fs.writeFileSync(path.join(wfDir, "gate.yml"), workflowBody, "utf8")
  }
  return { root, exemptions }
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true })
}

test("被 workflow 点名的测试判为已接线", () => {
  const { root } = makeFixture({
    tests: ["scripts/a.test.js"],
    workflowBody: "run: node --test scripts/a.test.js\n",
  })
  try {
    const r = checker.collectCheck(root, {})
    assert.equal(r.files.length, 1, "夹具应恰好解析出 1 个测试文件")
    assert.deepEqual(r.violations, [])
    assert.deepEqual(r.staleExemptions, [])
  } finally {
    cleanup(root)
  }
})

test("未点名且无豁免必须变红", () => {
  const { root } = makeFixture({
    tests: ["scripts/a.test.js", "scripts/b.test.js"],
    workflowBody: "run: node --test scripts/a.test.js\n",
  })
  try {
    const r = checker.collectCheck(root, {})
    assert.deepEqual(r.violations, [{ code: "TEST_NOT_COLLECTED_BY_CI", file: "scripts/b.test.js", ambiguous: false }])
  } finally {
    cleanup(root)
  }
})

test("带原因的豁免放行，但被收集后豁免即过时", () => {
  const wired = makeFixture({
    tests: ["scripts/a.test.js"],
    workflowBody: "run: node --test scripts/a.test.js\n",
    exemptions: { "scripts/a.test.js": "历史欠账" },
  })
  const unwired = makeFixture({
    tests: ["scripts/a.test.js"],
    workflowBody: "run: echo none\n",
    exemptions: { "scripts/a.test.js": "历史欠账" },
  })
  try {
    assert.deepEqual(checker.collectCheck(wired.root, wired.exemptions).violations, [])
    const stale = checker.collectCheck(wired.root, wired.exemptions).staleExemptions
    assert.deepEqual(stale, [{ code: "TEST_EXEMPTION_STALE", file: "scripts/a.test.js" }], "已接线的文件仍留豁免必须报过时")
    const held = checker.collectCheck(unwired.root, unwired.exemptions)
    assert.deepEqual(held.violations, [], "豁免应放行未接线文件")
    assert.deepEqual(held.staleExemptions, [])
  } finally {
    cleanup(wired.root)
    cleanup(unwired.root)
  }
})

test("豁免必须带非空原因，否则视同无豁免", () => {
  const { root } = makeFixture({
    tests: ["scripts/a.test.js"],
    workflowBody: "run: echo none\n",
  })
  try {
    assert.equal(
      checker.collectCheck(root, { "scripts/a.test.js": "" }).violations.length,
      1,
      "空原因不得算作豁免",
    )
  } finally {
    cleanup(root)
  }
})

test("同名 basename 时要求写全相对路径", () => {
  const body = "run: node --test scripts/hooks/x.test.sh\n"
  const fullPath = makeFixture({ tests: ["scripts/hooks/x.test.sh", "scripts/other/x.test.sh"], workflowBody: body })
  const basenameOnly = makeFixture({
    tests: ["scripts/hooks/x.test.sh", "scripts/other/x.test.sh"],
    workflowBody: "run: bash x.test.sh\n",
  })
  try {
    const exact = checker.collectCheck(fullPath.root, {})
    assert.deepEqual(
      exact.violations.map((v) => v.file),
      ["scripts/other/x.test.sh"],
      "同名文件只有被写全路径的那一份算已接线，另一份仍须显式登记",
    )
    const loose = checker.collectCheck(basenameOnly.root, {})
    assert.equal(loose.violations.length, 2, "仅出现裸文件名时两份同名文件都不得算已接线")
    assert.ok(loose.violations.every((v) => v.ambiguous === true))
  } finally {
    cleanup(fullPath.root)
    cleanup(basenameOnly.root)
  }
})

test("workflow 集合为空时必须报错而非静默判绿", () => {
  const noFiles = makeFixture({ tests: ["scripts/a.test.js"], workflowBody: null })
  const noDir = makeFixture({ tests: ["scripts/a.test.js"], workflowBody: "run: node --test scripts/a.test.js\n" })
  const emptyBody = makeFixture({ tests: ["scripts/a.test.js"], workflowBody: "" })
  try {
    assert.throws(() => checker.collectCheck(noFiles.root, {}), /没有 workflow 文件/, "workflows 目录为空必须抛错")
    fs.rmSync(path.join(noDir.root, ".github"), { recursive: true, force: true })
    assert.throws(() => checker.collectCheck(noDir.root, {}), /未找到 workflows 目录/, "缺 workflows 目录必须抛错")
    const r = checker.collectCheck(emptyBody.root, {})
    assert.equal(r.violations.length, 1, "workflow 存在但正文为空时，测试判为未接线而不是判绿")
  } finally {
    cleanup(noFiles.root)
    cleanup(noDir.root)
    cleanup(emptyBody.root)
  }
})

test("注释里提到文件名不算接线（只有可执行正文算）", () => {
  const onlyComment = makeFixture({
    tests: ["scripts/a.test.js"],
    workflowBody: "# a.test.js 曾被漏掉\nrun: echo nothing\n",
  })
  const realLine = makeFixture({
    tests: ["scripts/a.test.js"],
    workflowBody: "# 说明\nrun: node --test scripts/a.test.js # 收编\n",
  })
  try {
    const r = checker.collectCheck(onlyComment.root, {})
    assert.deepEqual(
      r.violations.map(v => v.file),
      ["scripts/a.test.js"],
      "仅注释提及必须仍判未接线",
    )
    assert.deepEqual(checker.collectCheck(realLine.root, {}).violations, [], "正文点名（含行尾注释）应判已接线")
  } finally {
    cleanup(onlyComment.root)
    cleanup(realLine.root)
  }
})

test("真实仓库：检查域非空、欠账清单已钉住且无违规", () => {
  const root = path.join(__dirname, "..")
  const r = checker.collectCheck(root, checker.KNOWN_UNWIRED)
  assert.ok(r.files.length >= 30, `真实仓库解析到的测试文件数异常：${r.files.length}（解析退化会让本门禁假绿）`)
  assert.deepEqual(
    Object.keys(checker.KNOWN_UNWIRED).sort(),
    ["scripts/session-init.test.sh"],
    "欠账清单只能缩小；新增豁免须先在门禁里明确接受（棘轮与 platform-definitions 同形）",
  )
  for (const [file, reason] of Object.entries(checker.KNOWN_UNWIRED)) {
    assert.ok(String(reason).trim().length > 10, `豁免 ${file} 缺少可用原因`)
    assert.ok(r.files.includes(file), `豁免指向不存在的文件：${file}`)
  }
  assert.deepEqual(r.violations.map((v) => v.file), [], "存在未接线的测试文件，必须登记进 .github/workflows")
  assert.deepEqual(r.staleExemptions.map((v) => v.file), [], "存在过时豁免，请删除")
})
