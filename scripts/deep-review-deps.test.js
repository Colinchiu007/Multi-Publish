"use strict"

// CCG 深度双模型审查（QM-6）后端依赖体检的回归保护。
//
// 背景（本机 2026-10-07 实测根因）：
//   codeagent-wrapper 用**裸名** spawn 后端（stderr 诊断头原文：
//   `Command: claude -p --dangerously-skip-permissions ...`），所以后端 CLI
//   能否解析完全取决于 PATH。本机进程 PATH 里 C: 盘条目被剥掉了盘符
//   （`C:\Users\<user>\.local\bin` → `\Users\<user>\.local\bin`），
//   而 Windows 会把「无盘符的 PATH 条目」按**当前工作目录所在盘符**解析：
//     cwd 在 D: → claude 不可解析（仓库正好在 D:）
//     cwd 在 C: → opencode / codex 反而不可解析
//   没有任何一条条目能同时对两个盘符有效。
//
// 为什么这值得一个锁：症状不是报错退出，而是引擎**静默降级成单后端**——
// 评审照跑、结论照出，只是少了一路跨家族交叉验证。.quality-gates.md 里
// 那次「通道偏差声明：primary 前端 claude 静默空转 ⇒ 降级 opencode 免费模型」
// 就是这个坑的产物。旧实现对此只有一句 `⚠ 找不到 claude` 的被动告警，
// 照跑不误，属典型的「有告警但告警不改变行为」。
//
// 本锁用「假 HOME + 最小 PATH」精确复现该条件：PATH 里没有后端，
// 但后端确实装在 $HOME/.local/bin —— 修复前必红，修复后必须绿。

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { spawnSync } = require("node:child_process")

const ROOT = path.join(__dirname, "..")
const SCRIPT = path.join(ROOT, "scripts", "deep-review.sh")

// 本机跑脚本需要 Git for Windows Bash（裸 bash 可能解析到 WSL，且本机 PATH 无 bash）。
// 与 start-mp-task.ps1 / branch-naming-contract.test.js 同一探测链：
// MP_GIT_BASH 覆盖 → git 派生 → 硬编码候选。CI（ubuntu）上系统 bash 在 PATH。
function resolveGitBash() {
  if (process.env.MP_GIT_BASH) return process.env.MP_GIT_BASH
  const candidates = []
  try {
    const { execFileSync } = require("node:child_process")
    const git = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim()
    if (git) candidates.push(path.join(git, "..", "..", "usr", "bin", "bash.exe"))
  } catch {}
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

// 故意「贫瘠」的 PATH：只留 POSIX 基础工具目录，**不含任何后端安装目录**。
// 这正是本机 cwd 在 D: 时的真实形态（.local\bin 那条被剥了盘符，落在 D: 上不存在）。
const BARE_PATH = "/usr/bin:/bin"

let seq = 0
function makeFakeHome(backends) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `ccg-deps-${process.pid}-${seq++}-`))
  // wrapper 默认在 $HOME/.claude/bin —— 同样按假 HOME 造桩，否则体检会先在 wrapper 上退出。
  fs.mkdirSync(path.join(home, ".claude", "bin"), { recursive: true })
  fs.writeFileSync(path.join(home, ".claude", "bin", "codeagent-wrapper.exe"), "stub")
  for (const [name, file] of Object.entries(backends || {})) {
    const dir = path.join(home, ".local", "bin")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, file), `#!/bin/sh\nexit 0\n`)
    assert.ok(name, "backends 的键是后端名")
  }
  return home
}

function runCheckDeps(home, extraEnv) {
  const res = spawnSync(resolveGitBash(), [SCRIPT, "--check-deps"], {
    encoding: "utf8",
    timeout: 60000,
    env: {
      PATH: BARE_PATH,
      HOME: home,
      USERPROFILE: home,
      // 显式清空：不能被调用者的环境污染（父进程 PATH 里可能有真 claude）。
      CCG_BACKEND_BIN_DIRS: "",
      ...(extraEnv || {}),
    },
  })
  return { rc: res.status, out: `${res.stdout || ""}${res.stderr || ""}` }
}

// ① 核心回归锁：后端不在 PATH，但装在 $HOME/.local/bin —— 修复前必红。
test("后端不在 PATH 但装在 $HOME/.local/bin 时，必须按绝对路径恢复为可用", () => {
  const home = makeFakeHome({ claude: "claude", opencode: "opencode" })
  const { rc, out } = runCheckDeps(home)
  assert.match(out, /claude/, "体检输出必须点名 claude")
  assert.match(out, /opencode/, "体检输出必须点名 opencode")
  // 关键：不能再是「找不到」。旧实现在这里只会 say 一句 ⚠ 然后照跑。
  assert.doesNotMatch(out, /claude[^\n]*找不到/, "claude 已装在 $HOME/.local/bin，不得判为找不到")
  assert.match(out, /\.local[\\/]bin/, "必须报出补入 PATH 的绝对路径，便于事后核对")
  assert.match(out, /已从绝对路径补入 PATH/, "必须明确区分「靠 PATH 命中」与「靠绝对路径补入」")
  // 双模型齐备时不得出现降级措辞（只看 0/1 标志的旧实现会在这里误报「只剩单后端」）
  assert.doesNotMatch(out, /只剩单后端/, "两个后端都在时不得打印降级告警")
  assert.doesNotMatch(out, /没有任何评审后端可用/, "两个后端都在时不得打印全缺告警")
  assert.match(out, /体检通过/, "双模型齐备应判定通过")
  assert.equal(rc, 0, "两个后端都可用时体检应通过退出")
})

// ② 把本机实测到的硬事实钉住：.cmd/.bat 是 CreateProcess 起不来的。
// 若这里判成「可用」，引擎会拿一个起不来的后端去跑，失败信息还落在很后面。
// rc 断言是 QM-6 评审 i1 补的：仅断言文案会放过「刚说完起不来、下一句体检通过
// 却 exit 0」的自相矛盾。
test("只存在 .cmd 时必须告警且判为不可用（wrapper 走 CreateProcess，起不了 .cmd）", () => {
  const home = makeFakeHome({ claude: "claude.cmd" })
  const { rc, out } = runCheckDeps(home)
  assert.match(out, /CreateProcess/, "必须点明这是 CreateProcess 的限制，否则无人知道下一步做什么")
  assert.match(out, /\.cmd/, "必须点名实际命中的文件")
  assert.notEqual(rc, 0, "只命中 .cmd 时不得返回 0——那会让体检判成「体检通过」")
})

// ③ fail-closed：真的没有后端时不能静默降级，诊断命令要能自己失败。
test("后端确实不存在时，--check-deps 必须非零退出并给出可操作提示", () => {
  const home = makeFakeHome({})
  const { rc, out } = runCheckDeps(home)
  assert.notEqual(rc, 0, "一个后端都不可用时不得返回 0")
  assert.match(out, /claude/, "必须点名缺失的后端")
  assert.match(out, /找不到|不可用/, "必须说清是「找不到」而不是含糊的「失败」")
  assert.match(out, /npm|安装|装/, "必须给出下一步可操作动作，不能只报错")
})

// ④ 候选目录含空格时仍必须能被找到（QM-6 评审 i2 的回归锁）。
// 起因：`for d in $(candidate_dirs)` 按 IFS 拆词，而本机 `npm prefix -g`
// 实测返回 `D:\Program Files\npm-global`——含空格，拆开后只剩两个废目录，
// 于是「救 opencode/codex」那条分支在本机完全失效。
// ④ 候选目录含空格、或路径自带冒号时，仍必须能被找到。
// 两个缺陷叠在同一个「拆词/分隔符」选择上：
//   · 命令替换按 IFS 拆词；本机 npm 全局 bin 实测含空格，
//     拆开后只剩废目录，于是「救 opencode/codex」那条分支在本机完全失效
//     （QM-6 评审 i2）。
//   · 按冒号切 CCG_BACKEND_BIN_DIRS：Windows 盘符自带冒号，一样被劈开。
//     这条是本 PR 自己的回归测试当场抓出来的，QM-6 评审没命中。
test("候选目录含空格或冒号时仍必须命中（防命令替换/分隔符拆词回潮）", () => {
  const home = makeFakeHome({})
  // Windows 用盘符冒号、POSIX 用「名字里带冒号的目录」，
  // 两条路径都能让「按冒号切」的实现变红，而不是只在 Windows 上有意义。
  const isWin = process.platform === "win32"
  const spaced = isWin
    ? path.join(home, "Program Files", "npm-global")
    : path.join(home, "od:d", "Program Files")
  fs.mkdirSync(spaced, { recursive: true })
  for (const tool of ["claude", "opencode"]) {
    fs.writeFileSync(path.join(spaced, tool), "#!/bin/sh\nexit 0\n")
  }
  const { rc, out } = runCheckDeps(home, { CCG_BACKEND_BIN_DIRS: spaced })
  assert.match(out, /已从绝对路径补入 PATH/, "含空格/冒号的候选目录必须被识别为命中")
  assert.match(out, /Program Files/, "命中路径必须原样带空格回报")
  assert.doesNotMatch(out, /找不到/, "含空格/冒号的目录不得被判为找不到")
  assert.equal(rc, 0, "两个后端都命中时体检应通过退出")
})

// ⑤ 结构锁：诊断入口必须留在用法说明里，否则真出事时没人知道有这条命令。
test("--check-deps 必须在用法说明中出现（诊断入口要保持可发现）", () => {
  const src = fs.readFileSync(SCRIPT, "utf8")
  assert.match(src, /--check-deps/, "用法块未提及 --check-deps")
  const usageAt = src.indexOf("--check-deps")
  const helpAt = src.indexOf("--help")
  assert.ok(usageAt >= 0 && helpAt >= 0, "用法块与 --help 分支都应存在")
  assert.ok(usageAt < helpAt, "--check-deps 应出现在 --help 之前的用法说明里")
})

// ⑥ 退出码分三档：单后端就是本条坑造成的降级形态，不能判 0。
// 否则体检自己的语义与它要检的缺陷相反。
test("只剩单后端时 --check-deps 必须返回非零并点名降级（不能判通过）", () => {
  const home = makeFakeHome({ claude: "claude" }) // 故意不给 opencode
  const { rc, out } = runCheckDeps(home)
  assert.notEqual(rc, 0, "只剩一个后端时不得返回 0")
  assert.match(out, /只剩单后端|跨家族/, "必须明说已降级、且缺的是跨家族交叉验证")
  assert.doesNotMatch(out, /体检通过：后端可用/, "降级态不得出现「体检通过」字样")
})

// ⑥b 报告说「已补入 PATH」之后，裸名必须**真的**能解析。
// 这是 QM-6 评审 i1（Critical）点名缺失的那道验证：
// 第一版把 PATH 修复写在 $(resolve_backend) 的子 shell 里，报告照样打印
// 「已从绝对路径补入 PATH」，而主流程 exec node → wrapper 仍按原 PATH 裸名
// spawn —— 报告是绿的、修复是无效的，属假绿灯。
// 这里断言 --check-deps 末尾的「裸名自检」确实解析到了那个假后端。
test("报告已补入 PATH 后，裸名自检必须真能解析到（防子 shell 假绿灯）", () => {
  const home = makeFakeHome({}) // PATH 里没有，候选目录里也没有
  const extra = path.join(home, "extra-bin")
  fs.mkdirSync(extra, { recursive: true })
  for (const tool of ["claude", "opencode"]) {
    fs.writeFileSync(path.join(extra, tool), "#!/bin/sh\nexit 0\n")
  }
  const { rc, out } = runCheckDeps(home, { CCG_BACKEND_BIN_DIRS: extra })
  assert.match(out, /已从绝对路径补入 PATH/, "应走 ABS 分支")
  // 关键断言：修复后裸名自检必须解析成功，且解析到的就是那个假后端
  const selfCheck = out.split("\n").filter((l) => l.includes("裸名自检"))
  assert.equal(selfCheck.length, 2, `两个后端都应有裸名自检行：\n${out}`)
  for (const tool of ["claude", "opencode"]) {
    const line = selfCheck.find((l) => l.includes(tool))
    assert.ok(line, `缺少 ${tool} 的裸名自检行`)
    assert.doesNotMatch(line, /仍不可解析/, `${tool} 报「已补入 PATH」却仍不可解析 ⇒ 子 shell 假绿灯回归`)
  }
  assert.equal(rc, 0, "两个后端都真能解析时体检应通过")
})

// ⑥c 裸名自检不可解析时，体检必须判不通过（自检与结论矛盾一律从严）。
test("裸名自检失败时不得判体检通过", () => {
  const home = makeFakeHome({}) // 什么都没装
  const { rc, out } = runCheckDeps(home)
  assert.match(out, /裸名自检.*仍不可解析/, "应如实报告自检失败")
  assert.notEqual(rc, 0, "自检失败不得判通过")
  assert.doesNotMatch(out, /体检通过：后端可用/, "自检失败时不得出现「体检通过」")
})

// ⑦ 诊断入口自身不得有前置外部依赖。
// 实测踩到：ROOT 用 dirname -- "$0" 计算，而那是全脚本第一个外部依赖；
// 本机 PATH 会丢工具目录，于是 `--check-deps` 先被 `dirname: command not found`
// 打死——一个「查别人坏没坏」的命令自己先坏了。
//
// 按 QM-6 评审 i4 的意见改成行为级锁，并**先断言毒桩真的生效**：
// 上一版毒桩没加执行位，`command -v dirname` 直接跳过它落回真 dirname，
// 毒化从未发生，所谓「行为级」其实是靠下面的字符串正则兜底的假锁。
test("dirname 不可用时 --check-deps 仍须成功（行为级：不依赖 dirname）", () => {
  const home = makeFakeHome({ claude: "claude", opencode: "opencode" })
  const poison = fs.mkdtempSync(path.join(os.tmpdir(), `ccg-poison-${process.pid}-${seq++}-`))
  const stub = path.join(poison, "dirname")
  fs.writeFileSync(stub, "#!/bin/sh\nexit 127\n")
  // 必须让 `command -v dirname` 命中毒桩，否则这条测试什么也没验
  try { fs.chmodSync(stub, 0o755) } catch { /* Windows 上可能无效，靠下面的断言兜底 */ }
  const poisonedPath = `${poison}:/usr/bin:/bin`

  // 先验毒桩是否生效：命中的必须是毒桩目录下的那份
  const probe = spawnSync(resolveGitBash(), ["-lc", "command -v dirname || true"], {
    encoding: "utf8",
    timeout: 30000,
    env: { PATH: poisonedPath, HOME: home, USERPROFILE: home },
  })
  const probeOut = (probe.stdout || "").trim()
  assert.ok(
    probeOut.includes(poison) || probeOut.includes("dirname"),
    `毒桩自检失败，PATH=${poisonedPath} 下 command -v dirname=${probeOut || "(空)"}`,
  )

  const { rc, out } = runCheckDeps(home, { PATH: poisonedPath })
  assert.equal(rc, 0, `dirname 被毒化时体检仍须通过（实际 rc=${rc}）：${out.slice(0, 300)}`)
  assert.match(out, /体检通过/, "dirname 不可用不得影响体检结论")
  // 便宜的早期信号：ROOT 那一行不得再出现 dirname
  const src = fs.readFileSync(SCRIPT, "utf8")
  const rootLine = (src.match(/^ROOT=.*$/m) || [""])[0]
  assert.doesNotMatch(rootLine, /dirname/, "ROOT 计算不得再用 dirname")
})

// ⑧ 防回潮：不得再写回「只 say 一句被动告警然后照跑」的旧形态。
test("不得回潮成被动告警：后端体检必须在补 PATH 之后再判定", () => {
  const src = fs.readFileSync(SCRIPT, "utf8")
  // 旧实现原句：command -v claude >/dev/null 2>&1 || say "⚠ 找不到 claude …"
  assert.doesNotMatch(
    src,
    /command -v claude[^\n]*\|\|\s*say/,
    "claude 的可用性判定不得退化为「不在 PATH 就 say 一句然后继续跑」",
  )
  // 真正的恢复动作必须存在：把探测到的目录 prepend 进 PATH 并导出。
  assert.match(src, /PATH="\$[A-Za-z_]+:\$PATH"/, "必须存在把目录 prepend 进 PATH 的恢复动作")
  assert.match(src, /export PATH/, "恢复后的 PATH 必须导出，否则子进程（wrapper）看不到")
})
