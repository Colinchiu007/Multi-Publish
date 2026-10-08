"use strict"

// 任务分支命名的契约锁。
// 背景：gwm-task.sh 自 2026-09-15 起默认建**裸 task 名**分支（含斜杠名在本机 ref 写入不可靠），
// 前缀改为 MP_BRANCH_PREFIX 可选。但 AGENTS.md 铁律与 openspec 真源 spec 仍写着
// `codex/<task-name>`，而唯一能证伪它的 scripts/session-init.test.sh 从没接进 CI，
// 于是"文档 ↔ 实现 ↔ 夹具"三方漂移无人察觉。本锁把三者的口径钉在一起。

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const { spawnSync } = require("node:child_process")
const { resolveGitBash, toPosixPath } = require("./lib/ccg-test-helpers")

const ROOT = path.join(__dirname, "..")
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")

// 本机跑夹具需要 Git for Windows Bash（裸 bash 可能解析到 WSL，且本机 PATH 无 bash）。
// 与 start-mp-task.ps1 同一探测链：MP_GIT_BASH 覆盖 → git 派生 → 硬编码候选。
// CI（ubuntu）上系统 bash 在 PATH，直接可用。

// 只针对「命令式命名」的两种写法；AGENTS.md 里记述事故的 `git worktree add -b codex/...`
// 属于历史根因叙述，不是口径，不得被本锁误伤。
const MANDATE_PATTERNS = [/codex\/<task-name>/, /的 codex\/ 分支/]

const CONTRACT_DOCS = [
  "AGENTS.md",
  path.join("openspec", "specs", "openspec-integration", "spec.md"),
  path.join(".quality-rhythm", "integrations", "openspec", "spec-contract.md"),
]

test("实现侧：任务分支名默认裸 task 名，前缀由 MP_BRANCH_PREFIX 决定", () => {
  const src = read(path.join("scripts", "gwm-task.sh"))
  assert.match(src, /MP_BRANCH_PREFIX:\+\$\{MP_BRANCH_PREFIX\}\/\}\$TASK_NAME/, "实现不再支持 MP_BRANCH_PREFIX 可选前缀，本锁与文档需同步重判")
  assert.doesNotMatch(src, /BRANCH="codex\/\$TASK_NAME"/, "实现里不得再写死 codex/ 前缀")
})

for (const doc of CONTRACT_DOCS) {
  test(`文档侧不得把 codex/ 当命令式口径：${doc.split(path.sep).join("/")}`, () => {
    const text = read(doc)
    for (const pattern of MANDATE_PATTERNS) {
      assert.equal(
        pattern.test(text),
        false,
        `${doc} 仍写着 ${pattern}；实现默认建裸 task 名分支（前缀经 MP_BRANCH_PREFIX 可选）`,
      )
    }
    assert.ok(text.includes("MP_BRANCH_PREFIX"), `${doc} 应改述 MP_BRANCH_PREFIX 可选前缀语义`)
  })
}

test("夹具侧：session-init.test.sh 断言的是裸 task 名", () => {
  const text = read(path.join("scripts", "session-init.test.sh"))
  assert.doesNotMatch(text, /"codex\/alpha-task"/, "夹具仍断言带斜杠分支名，与实现不符")
  assert.match(text, /= "alpha-task"/, "夹具必须正向断言默认分支名")
})

test("前缀语义那一支必须真被执行（实跑夹具，而不是 grep 文本）", () => {
  // 反证实测：把 scenario_opt_in_prefix 从调用清单里删掉、只留定义，
  // 任何按文本 grep `MP_BRANCH_PREFIX=` 的断言都会假绿。唯一可信判据是它跑出来的结果行。
  const script = path.join(ROOT, "scripts", "session-init.test.sh")
  const out = spawnSync(resolveGitBash(), [script], { encoding: "utf8" })
  const text = `${out.stdout || ""}${out.stderr || ""}`
  assert.equal(out.status, 0, `session-init.test.sh 未全绿：\n${text}`)
  assert.match(text, /PASS: MP_BRANCH_PREFIX opts into a prefixed branch/, "MP_BRANCH_PREFIX 那一支没有被真正执行（定义在但未被调用？）")
  assert.match(text, /PASS: dedicated branch is the bare task name/, "裸 task 名那一支没有被真正执行")
  assert.doesNotMatch(text, /FAIL: /, `夹具报告了失败：\n${text}`)
})
