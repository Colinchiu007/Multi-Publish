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
    const r = checker.collectCheck(root, {}, {})
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
    const r = checker.collectCheck(root, {}, {})
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
    const exact = checker.collectCheck(fullPath.root, {}, {})
    assert.deepEqual(
      exact.violations.map((v) => v.file),
      ["scripts/other/x.test.sh"],
      "同名文件只有被写全路径的那一份算已接线，另一份仍须显式登记",
    )
    const loose = checker.collectCheck(basenameOnly.root, {}, {})
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
    assert.throws(() => checker.collectCheck(noFiles.root, {}, {}), /没有 workflow 文件/, "workflows 目录为空必须抛错")
    fs.rmSync(path.join(noDir.root, ".github"), { recursive: true, force: true })
    assert.throws(() => checker.collectCheck(noDir.root, {}, {}), /未找到 workflows 目录/, "缺 workflows 目录必须抛错")
    const r = checker.collectCheck(emptyBody.root, {}, {})
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
    const r = checker.collectCheck(onlyComment.root, {}, {})
    assert.deepEqual(
      r.violations.map(v => v.file),
      ["scripts/a.test.js"],
      "仅注释提及必须仍判未接线",
    )
    assert.deepEqual(checker.collectCheck(realLine.root, {}, {}).violations, [], "正文点名（含行尾注释）应判已接线")
  } finally {
    cleanup(onlyComment.root)
    cleanup(realLine.root)
  }
})

test("真实仓库：检查域非空、欠账清单已钉住且无违规", () => {
  const root = path.join(__dirname, "..")
  const r = checker.collectCheck(root, checker.KNOWN_UNWIRED)
  assert.ok(r.files.length >= 40, `真实仓库解析到的测试文件数异常：${r.files.length}（解析退化会让本门禁假绿）`)
  assert.ok(checker.TEST_SUFFIXES.includes(".test.ps1"), "PowerShell 测试必须在扫描域内，否则它们继续隐身")
  assert.deepEqual(
    Object.keys(checker.KNOWN_UNWIRED).sort(),
    [
      // 2026-09-29：最后一条 session-isolation-automation.test.ps1 已接进 Gate 2d（夹具 = CI 侧
      // 自有的临时 clone：checkout -B main + 复制两个 hook），清单清空。
      // 这里刻意继续用 deepEqual 钉成"恰好等于"而不是改成 <=/长度比较：
      // 清单变空**不代表**机制可以拆——任何新增豁免会当场变红，而删掉本断言会让"回归成
      // 无人发现的状态"重新变成可行路径。
    ].sort(),
    "欠账清单只能缩小；新增豁免须先在门禁里明确接受（棘轮与 platform-definitions 同形）",
  )
  // 空清单的另一半证明：那条销过账的文件仍在检查域内（不是靠把它排除出域来"清零"的），
  // 且下面的 violations 为空即意味着它确实被 workflow 正文点名了。
  assert.ok(
    r.files.includes("scripts/session-isolation-automation.test.ps1"),
    "已销账的测试必须仍在检查域内，否则「清单归零」可以靠缩小域来作弊",
  )
  for (const [file, reason] of Object.entries(checker.KNOWN_UNWIRED)) {
    assert.ok(String(reason).trim().length > 10, `豁免 ${file} 缺少可用原因`)
    assert.ok(r.files.includes(file), `豁免指向不存在的文件：${file}`)
  }
  assert.deepEqual(r.violations.map((v) => v.file), [], "存在未接线的测试文件，必须登记进 .github/workflows")
  assert.deepEqual(r.staleExemptions.map((v) => v.file), [], "存在过时豁免，请删除")
  // 域从"两个写死目录"扩成"全仓减显式排除"，所以排除表本身必须钉住（只能缩小）：
  // 谁把 apps/ 从 WORKSPACE_COVERED 里摘掉，全仓上千个 vitest 测试会当场涌进检查域并变红。
  assert.deepEqual(
    checker.WORKSPACE_COVERED.slice().sort(),
    ["apps/", "ops-center/", "packages/"],
    "workspace 排除表被改动：它决定 vitest 已收集的目录是否进本棘轮，改动须显式评审",
  )
  assert.deepEqual(
    checker.VENDORED_MIRROR.slice().sort(),
    [".quality-rhythm/"],
    "vendored 副本排除表被改动：新增副本目录必须带理由登记",
  )
  // 副本里那份 tpl-contract.test.js 必须**不在**域内（它属于制品副本，不是本仓被测代码）；
  // 这条断言是"排除真的生效"的证据，而不是" walker 恰好没遍历到" —— 后者由下一条共同保证。
  assert.ok(
    !r.files.includes(".quality-rhythm/.github/scripts/tpl-contract.test.js"),
    "vendored 副本内的测试文件不得进检查域",
  )
  assert.ok(
    checker.walkRepoFiles(root).includes(".quality-rhythm/.github/scripts/tpl-contract.test.js"),
    "排除应发生在测试域这一步，而不是靠『没遍历到』—— 遍历必须仍然看得见它",
  )
  // 嵌套 workflow：GitHub 只调度顶层，副本里那份永不执行，必须处于"带理由承认"状态。
  assert.ok(r.nestedFiles.length >= 1, "真实仓库存在嵌套 workflow（.quality-rhythm 副本），解析不到说明遍历退化")
  assert.deepEqual(r.nested.map((v) => v.file), [], "出现未被承认的嵌套 workflow：它看起来像门禁但永远不会被执行")
  assert.deepEqual(r.staleNested.map((v) => v.file), [], "存在过时的嵌套 workflow 承认，请删除")
  assert.deepEqual(
    Object.keys(checker.KNOWN_NESTED_WORKFLOWS).sort(),
    [".quality-rhythm/.github/workflows/mechanism-check.yml"],
    "嵌套 workflow 承认清单只能缩小；新增须带理由",
  )
  for (const [file, reason] of Object.entries(checker.KNOWN_NESTED_WORKFLOWS)) {
    assert.ok(String(reason).trim().length > 10, `承认 ${file} 缺少可用原因`)
  }
})

test("嵌套 workflow 未被承认必须变红", () => {
  const { root } = makeFixture({
    tests: ["scripts/a.test.js"],
    workflowBody: "run: node --test scripts/a.test.js\n",
  })
  const nestedDir = path.join(root, "vendor", ".github", "workflows")
  fs.mkdirSync(nestedDir, { recursive: true })
  fs.writeFileSync(path.join(nestedDir, "mechanism-check.yml"), "on:\n  push: {}\n", "utf8")
  try {
    const r = checker.collectCheck(root, {}, {})
    assert.deepEqual(
      r.nested,
      [{ code: "NESTED_WORKFLOW_NOT_EXECUTED", file: "vendor/.github/workflows/mechanism-check.yml" }],
      "嵌套在子目录里的 workflow 不会被 GitHub 调度，必须出声",
    )
    assert.deepEqual(r.violations, [], "测试本身已点名，不应误报未接线")
  } finally {
    cleanup(root)
  }
})

test("承认过的嵌套 workflow 放行，文件消失即判过时", () => {
  const { root } = makeFixture({
    tests: ["scripts/a.test.js"],
    workflowBody: "run: node --test scripts/a.test.js\n",
  })
  const nestedDir = path.join(root, "vendor", ".github", "workflows")
  fs.mkdirSync(nestedDir, { recursive: true })
  fs.writeFileSync(path.join(nestedDir, "m.yml"), "on:\n  push: {}\n", "utf8")
  try {
    const ack = { "vendor/.github/workflows/m.yml": "vendored 副本，本仓不执行" }
    const held = checker.collectCheck(root, {}, ack)
    assert.deepEqual(held.nested, [], "带理由承认后应放行")
    assert.deepEqual(held.staleNested, [])
    const gone = checker.collectCheck(root, {}, { "vendor/.github/workflows/other.yml": "已经不存在的承认" })
    assert.deepEqual(
      gone.staleNested.map((v) => v.file),
      ["vendor/.github/workflows/other.yml"],
      "承认清单里指向不存在的文件必须变红（棘轮只能缩小）",
    )
    assert.deepEqual(
      gone.nested.map((v) => v.file),
      ["vendor/.github/workflows/m.yml"],
      "换了承认对象不能把真实存在的嵌套 workflow 也一起放行",
    )
  } finally {
    cleanup(root)
  }
})

test("排除表只挡测试域，不把同级 scripts/ 一起吞掉", () => {
  const { root } = makeFixture({
    tests: [
      "apps/desktop/src/widget.test.js",
      ".quality-rhythm/.github/scripts/tpl-contract.test.js",
      "scripts/real.test.js",
    ],
    workflowBody: "run: echo nothing\n",
  })
  try {
    const r = checker.collectCheck(root, {}, {})
    assert.deepEqual(
      r.violations.map((v) => v.file),
      ["scripts/real.test.js"],
      "workspace 与 vendored 副本被排除，但同域内的 scripts/ 必须仍然报未接线",
    )
    assert.deepEqual(
      r.files,
      ["scripts/real.test.js"],
      `检查域应恰好剩 1 个，实际：${JSON.stringify(r.files)}`,
    )
  } finally {
    cleanup(root)
  }
})

test("遍历不完整必须抛错，不能静默判定全绿", () => {
  const { root } = makeFixture({ tests: ["scripts/a.test.js"], workflowBody: "run: node --test a.test.js\n" })
  const blocked = path.join(root, "lockeddir")
  fs.mkdirSync(blocked, { recursive: true })
  // 把一个"目录"位置换成文件，readdirSync 对其子项会 ENOTDIR —— 用来验证不退化成跳过
  fs.writeFileSync(path.join(root, "notadir"), "x", "utf8")
  try {
    assert.ok(checker.walkRepoFiles(root).length >= 2, "正常遍历应看得见夹具文件")
    assert.throws(
      () => checker.walkRepoFiles(path.join(root, "definitely-missing-root")),
      /无法枚举目录/,
      "根目录不存在时必须抛错，而不是返回空集合判绿",
    )
  } finally {
    void blocked
    cleanup(root)
  }
})

// —— 接线资格登记表（MUST_LIVE_IN_UNGATED_JOB）——
// 动因：一条锁「被 workflow 点名」和「在纯文档 PR 上真的会跑」是两件事。
// 归档 PR #3114 的镜像漂移就是被这个区别放过去的（PR 侧 QG Changes=pass / QG Static=skipping，
// 漂移靠 main push 才红）。所以本判据的输入必须是 job 级结构，而不是整份 workflow 的 includes。

function jobsFixture(tests, jobsYaml) {
  return makeFixture({
    tests,
    workflowBody: `on:\n  push:\n    branches: [main]\njobs:\n${jobsYaml}`,
  })
}

test("登记表里的锁只住在被 job 级 if 门控的 job ⇒ 必须变红", () => {
  const { root } = jobsFixture(
    ["scripts/mirror.test.js"],
    [
      "  changes:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: node scripts/other.js",
      "  static-gates:",
      "    if: needs.changes.outputs.docs-only != 'true'",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: node --test scripts/mirror.test.js",
      "",
    ].join("\n"),
  )
  try {
    const r = checker.collectCheck(root, { "scripts/mirror.test.js": "已接 static-gates" }, {}, {
      "scripts/mirror.test.js": "输入命中 docs-only 白名单",
    })
    assert.deepEqual(
      r.ungatedViolations,
      [{
        code: "TEST_ONLY_IN_SKIPPABLE_JOB",
        file: "scripts/mirror.test.js",
        where: "gate.yml::static-gates(gated)",
        reason: "输入命中 docs-only 白名单",
      }],
      "接在会被 docs-only 整片跳过的 job 里，等于对纯文档 PR 没有门禁",
    )
  } finally {
    cleanup(root)
  }
})

test("同一条锁接进无 job 级 if 的 job ⇒ 判合规（上一条的正控）", () => {
  const { root } = jobsFixture(
    ["scripts/mirror.test.js"],
    [
      "  changes:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: node --test scripts/mirror.test.js",
      "  static-gates:",
      "    if: needs.changes.outputs.docs-only != 'true'",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: node --test scripts/mirror.test.js",
      "",
    ].join("\n"),
  )
  try {
    const r = checker.collectCheck(root, {}, {}, { "scripts/mirror.test.js": "输入命中 docs-only 白名单" })
    assert.deepEqual(r.ungatedViolations, [], "只要有一个不被跳过的 job 点名即合规")
    assert.deepEqual(r.violations, [])
  } finally {
    cleanup(root)
  }
})

test("step 级 if 不得被当成 job 级门控", () => {
  // 8 空格缩进的 if: 只门控那一个 step。把它误读成"整片 job 被门控"会让合规接线变假红，
  // 而假红的结局是逼人把登记表清空 —— 那是把锁拆掉换安静。
  const { root } = jobsFixture(
    ["scripts/mirror.test.js"],
    [
      "  changes:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - name: gated step",
      "        if: github.event_name == 'pull_request'",
      "        run: node --test scripts/mirror.test.js",
      "",
    ].join("\n"),
  )
  try {
    const jobs = checker.listJobBlocks(root)
    assert.deepEqual(jobs.map((j) => ({ name: j.name, gated: j.gated })), [{ name: "changes", gated: false }],
      "step 级 if 出现在 steps: 之后，不得标记 job 为 gated")
    const r = checker.collectCheck(root, {}, {}, { "scripts/mirror.test.js": "输入命中 docs-only 白名单" })
    assert.deepEqual(r.ungatedViolations, [])
  } finally {
    cleanup(root)
  }
})

test("job 级 if 写在 steps: 之后同样是整片门控（按缩进判，不按位置判）", () => {
  // YAML 映射的键序是自由的。若按「if: 必须出现在 steps: 之前」来判，这种写法会被读成
  // "不被跳过的 job" ⇒ 假绿；而假绿正是本判据要消灭的形态（#3114 就是被它放过去的）。
  // 这条测试由反证 W3 逼出来：那一版实现确实有这个洞。
  const { root } = jobsFixture(
    ["scripts/mirror.test.js"],
    [
      "  changes:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: node --test scripts/mirror.test.js",
      "    if: needs.other.outputs.docs-only != 'true'",
      "",
    ].join("\n"),
  )
  try {
    const jobs = checker.listJobBlocks(root)
    assert.deepEqual(jobs.map((j) => ({ name: j.name, gated: j.gated })), [{ name: "changes", gated: true }],
      "写在 steps: 之后的 job 级 if 必须仍然标记该 job 为被门控")
    const r = checker.collectCheck(root, { "scripts/mirror.test.js": "已点名" }, {}, {
      "scripts/mirror.test.js": "输入命中 docs-only 白名单",
    })
    assert.equal(r.ungatedViolations[0].code, "TEST_ONLY_IN_SKIPPABLE_JOB",
      "这种 job 里点名不得被当成合法接线")
  } finally {
    cleanup(root)
  }
})

test("注释里点名不构成接线资格", () => {
  const { root } = jobsFixture(
    ["scripts/mirror.test.js"],
    [
      "  changes:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      # - run: node --test scripts/mirror.test.js",
      "      - run: echo none",
      "",
    ].join("\n"),
  )
  try {
    const r = checker.collectCheck(root, { "scripts/mirror.test.js": "历史欠账" }, {}, {
      "scripts/mirror.test.js": "输入命中 docs-only 白名单",
    })
    assert.deepEqual(r.ungatedViolations, [{
      code: "TEST_ONLY_IN_SKIPPABLE_JOB",
      file: "scripts/mirror.test.js",
      where: "未被任何 job 点名",
      reason: "输入命中 docs-only 白名单",
    }], "注释里的点名不是执行，本判据不得被它糊过去")
  } finally {
    cleanup(root)
  }
})

test("登记的锁文件消失 ⇒ 判过时，不许留死登记也不许靠删文件逃避", () => {
  const { root } = jobsFixture(
    ["scripts/other.test.js"],
    [
      "  changes:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: node --test scripts/other.test.js",
      "",
    ].join("\n"),
  )
  try {
    const r = checker.collectCheck(root, {}, {}, { "scripts/mirror.test.js": "已经不存在的锁" })
    assert.deepEqual(
      r.staleUngated.map((v) => v.file),
      ["scripts/mirror.test.js"],
      "登记项指向不存在的文件必须变红（清单只能缩小）",
    )
    assert.deepEqual(r.ungatedViolations, [], "文件不在域内时不再重复报接线资格")
  } finally {
    cleanup(root)
  }
})

test("job 解析退化必须抛错，不得读成「没有需要核对的接线」", () => {
  const { root } = makeFixture({ tests: ["scripts/a.test.js"], workflowBody: "run: node --test scripts/a.test.js\n" })
  try {
    assert.throws(
      () => checker.listJobBlocks(root),
      /一个 job 都没解析出来/,
      "workflow 没有 jobs: 结构时，「谁会被跳过」无从谈起 —— 必须出声而不是判合规",
    )
  } finally {
    cleanup(root)
  }
})

test("真实仓库：接线资格清单只能缩小，且登记的锁确实住在不被跳过的 job", () => {
  const root = path.join(__dirname, "..")
  const jobs = checker.listJobBlocks(root)
  // 规模下界（2026-10-08 实测：解析到 26 个 job，其中 14 个被 job 级 if 门控、12 个不被门控）。
  // 下界而不是精确值：新增 job 是常态；但一旦解析退化（少一大半），本断言当场红。
  assert.ok(jobs.length >= 20, `真实仓库解析到的 job 数异常：${jobs.length} —— 解析退化会让本判据假绿`)
  assert.ok(
    jobs.filter((j) => !j.gated).length >= 8,
    `不被跳过的 job 只剩 ${jobs.filter((j) => !j.gated).length} 个：若接线面整体被门控，这条门禁就失去意义`,
  )
  assert.deepEqual(
    Object.keys(checker.MUST_LIVE_IN_UNGATED_JOB).sort(),
    ["scripts/quality-rhythm-spec-mirror.test.js"],
    "接线资格登记表只能缩小；新增登记须在同 PR 把点名补进不被跳过的 job",
  )
  for (const [file, reason] of Object.entries(checker.MUST_LIVE_IN_UNGATED_JOB)) {
    assert.ok(String(reason).trim().length > 10, `登记 ${file} 缺少可用原因`)
    assert.ok(String(reason).includes("销账"), `登记 ${file} 必须写明销账条件，否则清单只会增不会减`)
  }
  const r = checker.collectCheck(root, checker.KNOWN_UNWIRED, checker.KNOWN_NESTED_WORKFLOWS, checker.MUST_LIVE_IN_UNGATED_JOB)
  assert.deepEqual(r.ungatedViolations.map((v) => v.file), [], "登记的锁必须真的住在不被 docs-only 短路的 job 里")
  assert.deepEqual(r.staleUngated.map((v) => v.file), [], "存在过时的接线资格登记，请删除")
  // 现场证据：点名它的那一行确实落在 changes job 的可执行正文里（不是靠"某处出现了文件名"）
  const carriers = jobs.filter((j) => j.code.includes("scripts/quality-rhythm-spec-mirror.test.js"))
  assert.ok(carriers.length >= 1, `没解析到点名该锁的 job：${JSON.stringify(jobs.map((j) => j.name))}`)
  assert.ok(
    carriers.some((j) => !j.gated && j.name === "changes"),
    `该锁的承载 job 应为不被门控的 changes，实际：${JSON.stringify(carriers.map((j) => [j.workflow, j.name, j.gated]))}`,
  )
})
