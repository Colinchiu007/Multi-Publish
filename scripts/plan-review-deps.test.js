"use strict"

// plan-review.sh 后端体检的反模式回归锁（QM-6 补充）。
//
// 背景（2026-10-08 前一任务 PR #3107 执行记录登记的遗留项）：
//   plan-review.sh 的「依赖体检」段至今是旧形态——
//     command -v claude   >/dev/null 2>&1 || say "⚠ 找不到 claude —— …"
//     command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— …"
//   只 say 一句被动告警然后**照跑**。deep-review.sh 早已修好同一问题：
//   后端不在 PATH 时主动扫候选目录、把命中目录 prepend 到 PATH 最前并导出。
//
// 为什么「告警后照跑」是反模式（deep-review-deps.test.js ⑧ 已在 code 层钉过一次）：
//   症状不是报错退出，而是引擎**静默降级成单后端**——评审照跑、结论照出，
//   只是少了一路跨家族交叉验证。决策层（plan）恰恰是质量节拍的第一道闸，
//   在这里降级意味着整个「先对抗再动手」的承诺名存实亡。
//
// 本机实测形态（为什么 command -v 命中也不能幸免）：
//   进程 PATH 里 C: 盘条目被剥掉盘符（`C:\Users\<user>\.local\bin` →
//   `\Users\<user>\.local\bin`），Windows 按 cwd 盘符解析：cwd 在 D: 时
//   claude 不可解析、cwd 在 C: 时 opencode 反而不可解析——没有任何一条
//   PATH 条目能同时对两个盘符有效。且 wrapper 是 Go 原生进程，其
//   exec.LookPath 对无盘符条目拿相对路径后直接 ErrDot 拒绝执行，
//   而 bash 的 command -v 照样成功——「裸名能解析」根本推不出「wrapper 能起」。
//   所以唯一可靠的修法是把绝对目录顶到 PATH 最前并导出（ABS-prepend）。
//
// 判据与 deep-review-deps.test.js 同源，只是对象换成 plan-review.sh；
// 两个脚本必须**同步受锁**，否则修好一个、漏掉另一个的形态会静默回归
// ——这正是本锁要防的事。

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { spawnSync } = require("node:child_process")

const ROOT = path.join(__dirname, "..")
const PLAN_REVIEW = path.join(ROOT, "scripts", "plan-review.sh")

// 与 ccg-bash-entry.test.js / deep-review-deps.test.js 同一探测链。
function resolveGitBash() {
  if (process.env.MP_GIT_BASH) return process.env.MP_GIT_BASH
  const candidates = []
  try {
    const { execFileSync } = require("node:child_process")
    const git = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim()
    if (git) candidates.push(path.join(git, "..", "..", "usr", "bin", "bash.exe"))
  } catch { /* git 不在 PATH 时走硬编码候选 */ }
  candidates.push(
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
    "D:\\Program Files\\Git\\usr\\bin\\bash.exe",
  )
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const gitRoot = c.replace(/[\\/]usr[\\/]bin[\\/]bash\.exe$|[\\/]bin[\\/]bash\.exe$/, "")
      if (gitRoot && fs.existsSync(path.join(gitRoot, "usr", "bin", "dirname.exe"))) return c
    }
  }
  return "bash"
}

// 造「方案 + 判定器 + 引擎 + 假 HOME」最小环境，让脚本跑到依赖体检段。
// 判定器（ccg-review-decider.js）在仓库 scripts/ 下本来就存在，直接用；
// 引擎（ccg-deep-review.js）用技能目录真身；SKIP 模式会在体检前退出，
// 所以方案必须写成 DUAL（>200 行）才能走到被测的那段。
let seq = 0
function makeFakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `plan-deps-${process.pid}-${seq++}-`))
  fs.mkdirSync(path.join(home, ".claude", "bin"), { recursive: true })
  fs.writeFileSync(path.join(home, ".claude", "bin", "codeagent-wrapper.exe"), "stub")
  // 引擎驱动桩：plan-review.sh 第 3 候选在 $HOME/.claude/skills/.../ccg-deep-review.js。
  // 被测段（依赖体检）在引擎启动**之前**，桩只需要存在；--dry-run 路径同样不会真跑它。
  const skillDir = path.join(home, ".claude", "skills", "adversarial-review-loop", "scripts")
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, "ccg-deep-review.js"), "// stub\n")
  return home
}
function makeDualProposal() {
  const f = path.join(os.tmpdir(), `plan-proposal-${process.pid}-${seq++}.md`)
  const body = Array.from({ length: 220 }, (_, i) => `第 ${i} 行：方案正文占位，用于把复杂度推过 DUAL 阈值。`).join("\n")
  fs.writeFileSync(f, "# 方案\n\n" + body, "utf8")
  return f
}
function run(scriptArgs, extraEnv) {
  const home = makeFakeHome()
  const res = spawnSync(resolveGitBash(), [PLAN_REVIEW, ...scriptArgs], {
    encoding: "utf8",
    timeout: 120000,
    env: {
      PATH: bashPath(),
      HOME: home,
      USERPROFILE: home,
      CCG_BACKEND_BIN_DIRS: "",
      ...(extraEnv || {}),
    },
  })
  return { rc: res.status, out: `${res.stdout || ""}${res.stderr || ""}` }
}

// 「半贫瘠」PATH：node 必须可解析（否则脚本在体检段之前就死于
// 「找不到 node」，测不到目标行为），而后端 CLI 故意不在。
// node 目录从当前进程派生（fnm/系统 node 均可）；Git Bash 需 /c/... 形态。
function toPosixPath(p) {
  const q = p.replace(/\\/g, "/")
  const m = q.match(/^([A-Za-z]):(.*)$/)
  return m ? `/${m[1].toLowerCase()}${m[2]}` : q
}
function bashPath() {
  const nodeDir = path.dirname(process.execPath)
  const posix = path.sep === "\\" ? toPosixPath(nodeDir) : nodeDir
  return `/usr/bin:/bin:${posix}`
}

// ① 核心行为锁：后端不在 PATH 但装在候选目录时，必须 ABS-prepend 恢复，
//    不得只 say 一句 ⚠ 然后照跑（旧形态）。
test("plan-review.sh：后端在候选目录时必须 prepend PATH 恢复，不得被动告警后照跑", () => {
  const proposal = makeDualProposal()
  const home = makeFakeHome()
  const bin = path.join(home, ".local", "bin")
  fs.mkdirSync(bin, { recursive: true })
  const IS_WIN = process.platform === "win32"
  for (const tool of ["claude", "opencode"]) {
    const f = path.join(bin, IS_WIN ? `${tool}.exe` : tool)
    fs.writeFileSync(f, "#!/bin/sh\nexit 0\n")
    try { fs.chmodSync(f, 0o755) } catch { /* Windows 空操作 */ }
  }
  const res = spawnSync(resolveGitBash(), [PLAN_REVIEW, proposal], {
    encoding: "utf8",
    timeout: 120000,
    env: { PATH: bashPath(), HOME: home, USERPROFILE: home, CCG_BACKEND_BIN_DIRS: "" },
  })
  const out = `${res.stdout || ""}${res.stderr || ""}`
  assert.match(out, /已把绝对目录 .* 补到 PATH 最前/, "必须主动把候选目录 prepend 进 PATH（ABS 分支）")
  assert.doesNotMatch(out, /找不到 claude|找不到 opencode/, "装在候选目录的后端不得被判「找不到」")
  fs.rmSync(proposal, { force: true })
  fs.rmSync(home, { recursive: true, force: true })
})

// ② 结构锁：与 deep-review-deps.test.js ⑧ 同判据，对象换成 plan-review.sh。
//    防回潮：「command -v X || say …」就是被动告警形态本身。
test("plan-review.sh 不得回潮成被动告警：体检必须先修 PATH 再判定", () => {
  const src = fs.readFileSync(PLAN_REVIEW, "utf8")
  assert.doesNotMatch(
    src,
    /command -v (claude|opencode)[^\n]*\|\|\s*say/,
    "后端可用性判定不得是「不在 PATH 就 say 一句然后继续跑」的旧形态",
  )
  assert.match(src, /PATH="\$[A-Za-z_]+:\$PATH"/, "必须存在把目录 prepend 进 PATH 的恢复动作")
  assert.match(src, /export PATH/, "恢复后的 PATH 必须导出，否则子进程（wrapper）看不到")
})

// ③ fail-closed：一个后端都没有时必须早退，不能带着降级继续跑引擎。
//    与 deep-review.sh 语义一致：0 个后端 = 深度审查根本起不来（rc=2）；
//    1 个后端 = 降级可跑但必须点名（决策矩阵由引擎自己处理）。
test("plan-review.sh：一个后端都没有时必须 rc=2 早退并给出修法", () => {
  const proposal = makeDualProposal()
  const { rc, out } = run([proposal])
  assert.notEqual(rc, 0, "零后端时不得照跑引擎")
  assert.match(out, /claude/, "必须点名缺失后端")
  assert.match(out, /npm|安装|装/, "必须给出可操作修法")
  fs.rmSync(proposal, { force: true })
})

// ④ 单后端降级必须点名跨家族缺失（不得静默）。
test("plan-review.sh：只剩单后端时必须点名降级（不得静默放行）", () => {
  const proposal = makeDualProposal()
  const home = makeFakeHome()
  const bin = path.join(home, ".local", "bin")
  fs.mkdirSync(bin, { recursive: true })
  const IS_WIN = process.platform === "win32"
  const f = path.join(bin, IS_WIN ? "claude.exe" : "claude")
  fs.writeFileSync(f, "#!/bin/sh\nexit 0\n")
  try { fs.chmodSync(f, 0o755) } catch { /* 空操作 */ }
  const res = spawnSync(resolveGitBash(), [PLAN_REVIEW, proposal], {
    encoding: "utf8",
    timeout: 120000,
    env: { PATH: bashPath(), HOME: home, USERPROFILE: home, CCG_BACKEND_BIN_DIRS: "" },
  })
  const out = `${res.stdout || ""}${res.stderr || ""}`
  assert.match(out, /只剩单后端|跨家族/, "降级必须点名跨家族交叉验证缺失")
  fs.rmSync(proposal, { force: true })
  fs.rmSync(home, { recursive: true, force: true })
})
