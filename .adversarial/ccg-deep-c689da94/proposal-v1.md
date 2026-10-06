# 变更提案（自动生成，待对抗评审）

- base: `origin/main`
- head: `c689da94027137f18ff34e61bc9421049754830f`
- 采集模式: `diff`
- 变更规模: 612 行

## 变更内容

```diff
diff --git a/.github/workflows/quality-gate.yml b/.github/workflows/quality-gate.yml
index f7497ad6..5e264a49 100644
--- a/.github/workflows/quality-gate.yml
+++ b/.github/workflows/quality-gate.yml
@@ -217,6 +217,10 @@ jobs:
           # openspec-sync-check.test.js 自带「镜像与真源逐字节一致」锁，但历史上从未被任何
           # workflow 收集（CI 只显式挂 scripts 下 5 个测试文件，无通配），锁等于没在跑；在此收编。
           node --test scripts/openspec-sync-check.test.js
+          # CCG 深度双模型审查（QM-6）的后端依赖体检锁：后端 CLI 不在 PATH 时引擎会
+          # **静默降级成单后端**（评审照跑、结论照出，只少一路跨家族交叉验证），
+          # 旧实现只有一句被动 ⚠ 告警。判据与假 HOME 复现方式见该测试头注释。
+          node --test scripts/deep-review-deps.test.js
           # 质量节拍 vendored 契约镜像（.quality-rhythm/）与 openspec 真源的漂移锁
           node --test scripts/quality-rhythm-spec-mirror.test.js
           # Windows PowerShell 5.1 读**无 BOM** 的 .ps1 时按 ANSI 码页解码，中文注释/字符串可让
diff --git a/docs/ccg-review-backend-path-2026-10-07.md b/docs/ccg-review-backend-path-2026-10-07.md
new file mode 100644
index 00000000..827d8fa9
--- /dev/null
+++ b/docs/ccg-review-backend-path-2026-10-07.md
@@ -0,0 +1,187 @@
+# CCG 深度双模型审查（QM-6）后端解析缺陷复盘
+
+- 日期：2026-10-07
+- 分支：`ccg-review-claude-path`（worktree `D:/Data/projects/mp-worktrees/mp-ccg-review-claude-path`）
+- 影响面：`scripts/deep-review.sh`（QM-6 本地入口）与其上游 `adversarial-review-loop` 引擎
+- 症状：双模型外部审查时 `claude` 报「不在 PATH」，引擎**静默降级成单后端**
+
+---
+
+## 一、根因
+
+### 1.1 表面现象
+
+跑 CCG 双模型外部审查（QM-6）时，`claude` 不在 PATH。`codeagent-wrapper` 用**裸名** spawn
+后端，于是评审后端缺席。
+
+### 1.2 第一性原因：进程 PATH 里的 C: 盘条目被剥掉了盘符
+
+实测（本机 2026-10-07）进程 `$env:PATH` 中存在两种形态并存的情况：
+
+| 注册表（HKCU + HKLM）里的形态 | 进程 `$env:PATH` 里的形态 |
+|---|---|
+| `C:\Users\<user>\.local\bin` | `\Users\<user>\.local\bin` |
+| `D:\Program Files\npm-global` | `\Program Files\npm-global` |
+
+**Windows 会把「无盘符的 PATH 条目」按当前工作目录所在盘符解析。** 实测：
+
+```
+cwd = D:\Data\projects\mulpub   （仓库所在盘）
+  where claude    -> 找不到
+  where opencode  -> D:\Program Files\npm-global\opencode
+  where codex     -> D:\Program Files\npm-global\codex
+
+cwd = C:\
+  where claude    -> C:\Users\<user>\.local\bin\claude.exe
+  where opencode  -> 找不到
+  where codex     -> 找不到
+```
+
+两组条目**没有任何一条同时对两个盘符有效**。仓库 cwd 在 D: → 恰好 `claude` 挂、
+`opencode`/`codex` 好用。这与 `.quality-gates.md` 里那次
+「通道偏差声明：primary 前端 claude 静默空转（rc=2、completed without agent_message
+output、无产物）⇒ 降级 opencode 免费模型」的现象完全吻合。
+
+`claude.exe` 本体健康（`2.1.278 (Claude Code)`），注册表里的 PATH 也是对的——坏的只是
+**会话进程继承下来的那份**。git 钩子与非登录 shell 又不重读注册表，于是稳定复现。
+
+### 1.3 第二性原因：入口脚本把「告警」当成了「处理」
+
+`scripts/deep-review.sh` 由 `d98f54db`（PR #2955，2026-10-06 01:09:40）**一次引入**，
+下面两行从出生就在，不是从可用态退化来的：
+
+```sh
+command -v claude   >/dev/null 2>&1 || say "⚠ 找不到 claude —— 评审后端不可用，引擎会降级为单后端"
+command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— 出方案后端不可用，跨家族校验会降级"
+```
+
+这两句**发现了问题，但不改变任何行为**：不补 PATH、不改退出码、不阻断。评审照跑、
+结论照出，只是少了一路跨家族交叉验证。旁边对 `codeagent-wrapper` 的处理恰恰相反
+（找不到就 `exit 2`）——同一个「依赖体检」段落里两种哲学并存。
+
+---
+
+## 二、逃逸分析（逐层）
+
+| 层 | 为什么没拦住 |
+|---|---|
+| 单元测试 | `deep-review.sh` **从来没有任何测试**。它不在任何 `node --test` 列表里，CI 也没有结构锁保护。本 PR 补 7 例。 |
+| 集成测试 | 深度审查**明确不进 CI**（脚本头注释：单次 >15 分钟，挂 required check 会把仓库锁死）。于是 PR 层也没有它的回归保护，只能靠人工把关。 |
+| 端到端 | 有 QM-6 人工环节，产物是 `.quality-gates.md` 记录 + `.ccg/qm6-*.json`。但**人眼看的是评审结论，不是「几路后端参与了」**。 |
+| 代码审查 | `d98f54db` 的评审重点在「wrapper 缺失要 exit 2」；两条 `|| say` 看起来是合理的降级提示。关键是**评审者当时的环境里 claude 是可解析的**——环境恰好是好的，缺陷就不可见。 |
+| 流程 | `.quality-gates.md` 允许把降级「如实登记」后继续。降级因此从异常变成**可接受常态**，掩盖了它其实是环境缺陷而非审查本身的问题。 |
+
+---
+
+## 三、系统性漏洞定位
+
+1. **告警不改行为**（结构性根因）。凡是「发现了但照跑」的检查，实质上把缺陷转化为
+   沉默。本仓的 fail-closed 原则在别处执行得很严，唯独这里开了口子。
+2. **依赖继承的 PATH 而非绝对路径**。凡是把「环境可解析性」当输入的脚本都在赌会话
+   环境。值得注意的是 `deep-review.sh` 自己的第 1 步**已经**为 `node` 写过同类兜底
+   （`fnm env` 兜底，注释写明「git 钩子不继承登录 shell 的 PATH，node 常常在这里丢失」）——
+   这个问题在本仓已被认知过一次，但只修了 `node` 一个工具，没推广到评审后端。
+3. **缺诊断入口**。真降级时没有一条命令能问「为什么少了一路」，只能靠读引擎日志反推。
+4. **降级被流程合法化**（掩盖层）。见上表最后一行的流程层。
+
+---
+
+## 四、修复与回归保护
+
+### 4.1 机器层（本机环境态，不在版本控制内）
+
+在**全盘符限定**的 PATH 目录里放一个指向真身的符号链接，使其与 cwd 所在盘符无关：
+
+- 位置：`C:\hermes-home\bin\claude.exe` → `C:\Users\<user>\.local\bin\claude.exe`
+  （`C:\hermes-home` 是 junction，真实路径 `C:\Users\<user>\bin`）
+- 为什么用符号链接而不是 `.cmd` shim：实测 wrapper 走 `CreateProcess`
+  （`UseShellExecute=false`），**不解析 `.cmd`**，放 `.cmd` 上去只会把失败推迟到引擎深处。
+  符号链接还不会像硬链接那样在 Claude Code 自更新后滞留在旧版本。
+- 实测收益：`where claude` 在 D: 与 C: 两个盘符下均命中；
+  `codeagent-wrapper --backend claude` 端到端 `exit=0`、stdout 返回正常内容。
+
+### 4.2 仓库层（本次 PR，持久化）
+
+`scripts/deep-review.sh` 不再信任继承的 PATH：
+
+1. 新增 `posix_dir` / `candidate_dirs` / `resolve_backend` / `report_backends`。
+   候选目录：`$HOME/.local/bin`、`$HOME/bin`、`$APPDATA/npm`、`npm prefix -g`
+   （经 `cygpath -u` 或 sed 归一）、`$CCG_BACKEND_BIN_DIRS`（显式追加）。
+2. 命中即把目录 `prepend` 进 PATH 并 **`export`**（wrapper 是子进程，看不到未导出的
+   shell 变量——这是「补了等于没补」的常见坑）。
+3. 状态四取一并如实分开报出：
+   - `PATH` 裸名已可解析
+   - `ABS` 原本不可解析，已按绝对路径补入
+   - `CMD` 只找到 `.cmd`/`.bat` → **明确判为不可用**并说明 CreateProcess 限制
+   - `MISS` 彻底找不到 → 给出可操作修法
+4. 新增 `--check-deps`：**纯依赖体检入口**，刻意放在定位 node / 驱动 / 判定记录**之前**，
+   即「环境坏掉时的第一手诊断」自己不能依赖那些可能已坏的东西。
+   为此把 `ROOT` 的计算从 `dirname -- "$0"` 改成参数展开——`dirname` 原本是全脚本第一个
+   外部依赖，实测它会先于体检逻辑把 `--check-deps` 打死
+   （`dirname: command not found`）。
+5. 退出码分三档：两个后端都在 = 0；有缺失 = 2。**单后端不算通过**——那正是本条坑
+   造成的形态，把它判 0 会让体检语义与它要检的缺陷相反。主流程仍保持非致命（与旧语义
+   一致），要 fail-closed 请显式用 `--check-deps`。
+
+### 4.3 回归保护测试
+
+`scripts/deep-review-deps.test.js`，7 例，用**假 HOME + 最小 PATH**（`/usr/bin:/bin`）
+精确复现「后端不在 PATH 却已安装」这一条件——修复前 5/5 全红，修复后 7/7 全绿：
+
+1. 后端不在 PATH 但装在 `$HOME/.local/bin` → 必须判为可用并报出补入的绝对路径
+2. 只存在 `.cmd` → 必须告警 CreateProcess 限制，不得判为可用
+3. 后端确实不存在 → `--check-deps` 必须非零退出并给出可操作提示
+4. 降级为单后端 → 必须非零退出并点名「跨家族交叉验证会缺失」
+5. `--check-deps` 必须出现在用法说明里（诊断入口保持可发现）
+6. `ROOT` 计算不得再依赖 `dirname`
+7. 防回潮结构锁：不得写回 `command -v claude … || say` 的被动告警形态，
+   且必须存在 `prepend + export PATH` 的真实恢复动作
+
+已接线进 `.github/workflows/quality-gate.yml` 的 Gate 2b
+（`check-unwired-tests` 实跑：检查域内 59 份测试全部接线或按欠账登记，rc=0）。
+
+### 4.4 真实环境取证
+
+```
+# 真实环境（PATH 正常）
+$ sh scripts/deep-review.sh --check-deps
+  ✓ codeagent-wrapper  /c/Users/<user>/.claude/bin/codeagent-wrapper.exe
+  · claude  [PATH] 裸名已可解析（无需干预）（评审后端（主力））
+  · opencode  [PATH] 裸名已可解析（无需干预）（出方案后端 / 跨家族校验）
+体检通过：后端可用。                                    rc=0
+
+# 故意打成坏 PATH（模拟无机器层符号链接时的真实形态）
+$ PATH=/usr/bin:/bin sh scripts/deep-review.sh --check-deps
+  · claude  [ABS] 已从绝对路径补入 PATH: /c/Users/<user>/.local/bin/claude
+  · opencode  [MISS] 找不到（PATH 与候选目录均未命中）
+      ↳ 修法：装一个（npm i -g @anthropic-ai/claude-code），…
+体检不通过：见上方逐条修法。                            rc=2
+```
+
+第二段是本次修复的核心证据：坏 PATH 下 `claude` 仍被**绝对路径分支救回**，
+`opencode` 诚实报缺失并给修法，退出码自解释。
+
+---
+
+## 五、预防措施
+
+1. **已落地**：告警改行为（`--check-deps` 三档退出码）+ 绝对路径解析 + 独立诊断入口 +
+   防回潮结构锁。
+2. **本仓既有认知的推广**：第 1 步为 `node` 写过 PATH 兜底，本次把同一思路推广到评审
+   后端。后续若有脚本把「某个 CLI 能否解析」当输入，应默认继承同一套候选目录解析，
+   不要新写 `command -v` 一次性告警。
+3. **流程层待办（不在本 PR 范围）**：
+   - `.quality-gates.md` 允许 QM-6 降级「如实登记」，建议补一条：**降级登记时必须附
+     `--check-deps` 输出**，否则「登记」会退化成「免责」。
+   - QM-6 记录应显式写明**实际参与了几路后端**，而不只是结论。
+4. **未在本 PR 修**：其他脚本对继承 PATH 的依赖（本次只审了 `deep-review.sh` 一条路径）。
+
+## 六、附：一条无害观察
+
+wrapper 诊断头打印的命令行里 `--setting-sources` 后面是**空值**：
+
+```
+Command: claude -p --dangerously-skip-permissions --setting-sources  --output-format stream-json --verbose -
+```
+
+实测该形态调用正常（`exit=0`、stdout 正常），故判定为无害，未按缺陷处理，仅留痕。
diff --git a/scripts/deep-review-deps.test.js b/scripts/deep-review-deps.test.js
new file mode 100644
index 00000000..dd87a7ef
--- /dev/null
+++ b/scripts/deep-review-deps.test.js
@@ -0,0 +1,172 @@
+"use strict"
+
+// CCG 深度双模型审查（QM-6）后端依赖体检的回归保护。
+//
+// 背景（本机 2026-10-07 实测根因）：
+//   codeagent-wrapper 用**裸名** spawn 后端（stderr 诊断头原文：
+//   `Command: claude -p --dangerously-skip-permissions ...`），所以后端 CLI
+//   能否解析完全取决于 PATH。本机进程 PATH 里 C: 盘条目被剥掉了盘符
+//   （`C:\Users\<user>\.local\bin` → `\Users\<user>\.local\bin`），
+//   而 Windows 会把「无盘符的 PATH 条目」按**当前工作目录所在盘符**解析：
+//     cwd 在 D: → claude 不可解析（仓库正好在 D:）
+//     cwd 在 C: → opencode / codex 反而不可解析
+//   没有任何一条条目能同时对两个盘符有效。
+//
+// 为什么这值得一个锁：症状不是报错退出，而是引擎**静默降级成单后端**——
+// 评审照跑、结论照出，只是少了一路跨家族交叉验证。.quality-gates.md 里
+// 那次「通道偏差声明：primary 前端 claude 静默空转 ⇒ 降级 opencode 免费模型」
+// 就是这个坑的产物。旧实现对此只有一句 `⚠ 找不到 claude` 的被动告警，
+// 照跑不误，属典型的「有告警但告警不改变行为」。
+//
+// 本锁用「假 HOME + 最小 PATH」精确复现该条件：PATH 里没有后端，
+// 但后端确实装在 $HOME/.local/bin —— 修复前必红，修复后必须绿。
+
+const assert = require("node:assert/strict")
+const fs = require("node:fs")
+const os = require("node:os")
+const path = require("node:path")
+const { test } = require("node:test")
+const { spawnSync } = require("node:child_process")
+
+const ROOT = path.join(__dirname, "..")
+const SCRIPT = path.join(ROOT, "scripts", "deep-review.sh")
+
+// 本机跑脚本需要 Git for Windows Bash（裸 bash 可能解析到 WSL，且本机 PATH 无 bash）。
+// 与 start-mp-task.ps1 / branch-naming-contract.test.js 同一探测链：
+// MP_GIT_BASH 覆盖 → git 派生 → 硬编码候选。CI（ubuntu）上系统 bash 在 PATH。
+function resolveGitBash() {
+  if (process.env.MP_GIT_BASH) return process.env.MP_GIT_BASH
+  const candidates = []
+  try {
+    const { execFileSync } = require("node:child_process")
+    const git = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim()
+    if (git) candidates.push(path.join(git, "..", "..", "usr", "bin", "bash.exe"))
+  } catch {}
+  candidates.push(
+    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
+    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
+    "D:\\Program Files\\Git\\usr\\bin\\bash.exe",
+  )
+  for (const c of candidates) {
+    if (fs.existsSync(c)) {
+      const gitRoot = c.replace(/[\\/]usr[\\/]bin[\\/]bash\.exe$|[\\/]bin[\\/]bash\.exe$/, "")
+      if (gitRoot && fs.existsSync(path.join(gitRoot, "usr", "bin", "dirname.exe"))) return c
+    }
+  }
+  return "bash"
+}
+
+// 故意「贫瘠」的 PATH：只留 POSIX 基础工具目录，**不含任何后端安装目录**。
+// 这正是本机 cwd 在 D: 时的真实形态（.local\bin 那条被剥了盘符，落在 D: 上不存在）。
+const BARE_PATH = "/usr/bin:/bin"
+
+let seq = 0
+function makeFakeHome(backends) {
+  const home = fs.mkdtempSync(path.join(os.tmpdir(), `ccg-deps-${process.pid}-${seq++}-`))
+  // wrapper 默认在 $HOME/.claude/bin —— 同样按假 HOME 造桩，否则体检会先在 wrapper 上退出。
+  fs.mkdirSync(path.join(home, ".claude", "bin"), { recursive: true })
+  fs.writeFileSync(path.join(home, ".claude", "bin", "codeagent-wrapper.exe"), "stub")
+  for (const [name, file] of Object.entries(backends || {})) {
+    const dir = path.join(home, ".local", "bin")
+    fs.mkdirSync(dir, { recursive: true })
+    fs.writeFileSync(path.join(dir, file), `#!/bin/sh\nexit 0\n`)
+    assert.ok(name, "backends 的键是后端名")
+  }
+  return home
+}
+
+function runCheckDeps(home, extraEnv) {
+  const res = spawnSync(resolveGitBash(), [SCRIPT, "--check-deps"], {
+    encoding: "utf8",
+    timeout: 60000,
+    env: {
+      PATH: BARE_PATH,
+      HOME: home,
+      USERPROFILE: home,
+      // 显式清空：不能被调用者的环境污染（父进程 PATH 里可能有真 claude）。
+      CCG_BACKEND_BIN_DIRS: "",
+      ...(extraEnv || {}),
+    },
+  })
+  return { rc: res.status, out: `${res.stdout || ""}${res.stderr || ""}` }
+}
+
+// ① 核心回归锁：后端不在 PATH，但装在 $HOME/.local/bin —— 修复前必红。
+test("后端不在 PATH 但装在 $HOME/.local/bin 时，必须按绝对路径恢复为可用", () => {
+  const home = makeFakeHome({ claude: "claude", opencode: "opencode" })
+  const { rc, out } = runCheckDeps(home)
+  assert.match(out, /claude/, "体检输出必须点名 claude")
+  assert.match(out, /opencode/, "体检输出必须点名 opencode")
+  // 关键：不能再是「找不到」。旧实现在这里只会 say 一句 ⚠ 然后照跑。
+  assert.doesNotMatch(out, /claude[^\n]*找不到/, "claude 已装在 $HOME/.local/bin，不得判为找不到")
+  assert.match(out, /\.local[\\/]bin/, "必须报出补入 PATH 的绝对路径，便于事后核对")
+  assert.match(out, /已从绝对路径补入 PATH/, "必须明确区分「靠 PATH 命中」与「靠绝对路径补入」")
+  assert.equal(rc, 0, "两个后端都可用时体检应通过退出")
+})
+
+// ② 把本机实测到的硬事实钉住：.cmd/.bat 是 CreateProcess 起不来的。
+// 若这里判成「可用」，引擎会拿一个起不来的后端去跑，失败信息还落在很后面。
+test("只存在 .cmd 时必须告警，不得判为可用（wrapper 走 CreateProcess，起不了 .cmd）", () => {
+  const home = makeFakeHome({ claude: "claude.cmd" })
+  const { out } = runCheckDeps(home)
+  assert.match(out, /CreateProcess/, "必须点明这是 CreateProcess 的限制，否则无人知道下一步做什么")
+  assert.match(out, /\.cmd/, "必须点名实际命中的文件")
+})
+
+// ③ fail-closed：真的没有后端时不能静默降级，诊断命令要能自己失败。
+test("后端确实不存在时，--check-deps 必须非零退出并给出可操作提示", () => {
+  const home = makeFakeHome({})
+  const { rc, out } = runCheckDeps(home)
+  assert.notEqual(rc, 0, "一个后端都不可用时不得返回 0")
+  assert.match(out, /claude/, "必须点名缺失的后端")
+  assert.match(out, /找不到|不可用/, "必须说清是「找不到」而不是含糊的「失败」")
+  assert.match(out, /npm|安装|装/, "必须给出下一步可操作动作，不能只报错")
+})
+
+// ④ 结构锁：诊断入口必须留在用法说明里，否则真出事时没人知道有这条命令。
+test("--check-deps 必须在用法说明中出现（诊断入口要保持可发现）", () => {
+  const src = fs.readFileSync(SCRIPT, "utf8")
+  assert.match(src, /--check-deps/, "用法块未提及 --check-deps")
+  const usageAt = src.indexOf("--check-deps")
+  const helpAt = src.indexOf("--help")
+  assert.ok(usageAt >= 0 && helpAt >= 0, "用法块与 --help 分支都应存在")
+  assert.ok(usageAt < helpAt, "--check-deps 应出现在 --help 之前的用法说明里")
+})
+
+// ⑥b 退出码分三档：单后端就是本条坑造成的降级形态，不能判 0。
+// 否则体检自己的语义与它要检的缺陷相反。
+test("只剩单后端时 --check-deps 必须返回非零并点名降级（不能判通过）", () => {
+  const home = makeFakeHome({ claude: "claude" }) // 故意不给 opencode
+  const { rc, out } = runCheckDeps(home)
+  assert.notEqual(rc, 0, "只剩一个后端时不得返回 0")
+  assert.match(out, /只剩单后端|跨家族/, "必须明说已降级、且缺的是跨家族交叉验证")
+  assert.doesNotMatch(out, /体检通过：后端可用/, "降级态不得出现「体检通过」字样")
+})
+
+// ⑦ 诊断入口自身不得有前置外部依赖。
+// 实测踩到：ROOT 用 dirname -- "$0" 计算，而那是全脚本第一个外部依赖；
+// 本机 PATH 会丢工具目录，于是 `--check-deps` 先被 `dirname: command not found`
+// 打死——一个「查别人坏没坏」的命令自己先坏了。
+test("--check-deps 路径上不得依赖 dirname（诊断入口自身必须无前置外部依赖）", () => {
+  const src = fs.readFileSync(SCRIPT, "utf8")
+  assert.doesNotMatch(
+    src,
+    /ROOT="\$\(cd "\$\(dirname/,
+    "ROOT 计算不得再用 dirname；否则 --check-deps 会被 dirname 缺失打死",
+  )
+  assert.match(src, /_self_dir="\$\{_self_dir%\/\*\}"/, "应改用参数展开剥掉最后一段路径")
+})
+
+// ⑦ 防回潮：不得再写回「只 say 一句被动告警然后照跑」的旧形态。
+test("不得回潮成被动告警：后端体检必须在补 PATH 之后再判定", () => {
+  const src = fs.readFileSync(SCRIPT, "utf8")
+  // 旧实现原句：command -v claude >/dev/null 2>&1 || say "⚠ 找不到 claude …"
+  assert.doesNotMatch(
+    src,
+    /command -v claude[^\n]*\|\|\s*say/,
+    "claude 的可用性判定不得退化为「不在 PATH 就 say 一句然后继续跑」",
+  )
+  // 真正的恢复动作必须存在：把探测到的目录 prepend 进 PATH 并导出。
+  assert.match(src, /PATH="\$[A-Za-z_]+:\$PATH"/, "必须存在把目录 prepend 进 PATH 的恢复动作")
+  assert.match(src, /export PATH/, "恢复后的 PATH 必须导出，否则子进程（wrapper）看不到")
+})
diff --git a/scripts/deep-review.sh b/scripts/deep-review.sh
index 746e970b..c0fd4a89 100644
--- a/scripts/deep-review.sh
+++ b/scripts/deep-review.sh
@@ -9,31 +9,203 @@
 # 会把仓库锁死。它是本地跑、结果落盘进 PR 的人工把关环节。
 #
 # 用法：
-#   sh scripts/deep-review.sh            # 读 HEAD 的判定记录，按 mode 决定跑不跑
-#   sh scripts/deep-review.sh --force    # 忽略 mode=skip，强制跑
-#   sh scripts/deep-review.sh --dry-run  # 只打印将要做什么
+#   sh scripts/deep-review.sh              # 读 HEAD 的判定记录，按 mode 决定跑不跑
+#   sh scripts/deep-review.sh --force      # 忽略 mode=skip，强制跑
+#   sh scripts/deep-review.sh --dry-run    # 只打印将要做什么
+#   sh scripts/deep-review.sh --check-deps # 只体检评审后端依赖（不需要 node / git 记录）
 #
 # 退出码：0 无阻断 / 1 有阻断 / 2 环境或配置问题
 
 set -u
 
-ROOT="$(cd "$(dirname -- "$0")/.." && pwd)"
+# 刻意不依赖 dirname：这行在任何别的检查之前跑，是全脚本第一个外部依赖。
+# 用 dirname 的话，--check-deps 这个「环境坏掉时的第一手诊断」会先被
+# `dirname: command not found` 打死——而本机 PATH 恰恰是会丢工具目录的那种
+# （见下面「后端解析」注释）。参数展开版对相对/绝对 $0 语义完全一致。
+_self_dir="$0"
+case "$_self_dir" in
+  */*) _self_dir="${_self_dir%/*}" ;;
+  *)   _self_dir="." ;;
+esac
+ROOT="$(cd "$_self_dir/.." && pwd)"
 cd "$ROOT" || exit 2
 
 FORCE=0
 DRY=0
+CHECK_DEPS=0
 for a in "$@"; do
   case "$a" in
     --force) FORCE=1 ;;
     --dry-run) DRY=1 ;;
+    --check-deps) CHECK_DEPS=1 ;;
     --help|-h)
-      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
+      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
       exit 0 ;;
   esac
 done
 
 say() { printf '%s\n' "$1"; }
 
+# ==========================================================================
+#  后端解析：为什么不能只靠继承来的 PATH
+# ==========================================================================
+# codeagent-wrapper 用**裸名** spawn 后端（实测 stderr 诊断头原文：
+#   Command: claude -p --dangerously-skip-permissions --output-format stream-json ...
+#），所以后端能不能起来只取决于 PATH。
+#
+# 而本机进程 PATH 不可信：里面 C: 盘的条目被剥掉了盘符
+# （`C:\Users\<user>\.local\bin` → `\Users\<user>\.local\bin`），
+# Windows 会把「无盘符的 PATH 条目」按**当前工作目录所在盘符**解析：
+#   cwd 在 D: → claude 不可解析（仓库正好在 D:）
+#   cwd 在 C: → opencode / codex 反而不可解析
+# 没有任何一条条目能同时对两个盘符有效。git 钩子与非登录 shell 又不重读
+# 注册表，于是这条坑稳定复现，且症状不是报错退出，而是引擎**静默降级成
+# 单后端**——评审照跑、结论照出，只是少了一路跨家族交叉验证。
+# （.quality-gates.md 那次「通道偏差声明：primary 前端 claude 静默空转
+#   ⇒ 降级 opencode 免费模型」就是本条坑的产物。）
+#
+# 所以：命中即把目录 prepend 进 PATH 并**导出**（wrapper 是子进程，
+# 看不到未导出的 shell 变量），并把「靠 PATH 命中」与「靠绝对路径补入」
+# 如实分开报出来。
+
+# Windows 风格路径 → POSIX 风格。
+# `npm prefix -g` 在 Windows 上返回反斜杠路径，直接拼进 sh 的 PATH 会失效。
+posix_dir() {
+  _pd="$1"
+  [ -n "$_pd" ] || return 1
+  if command -v cygpath >/dev/null 2>&1; then
+    _po="$(cygpath -u "$_pd" 2>/dev/null)" || _po=""
+    [ -n "$_po" ] && { printf '%s' "$_po"; return 0; }
+  fi
+  case "$_pd" in
+    [A-Za-z]:*)
+      _pv="$(printf '%s' "$_pd" | cut -c1 | tr 'A-Z' 'a-z')"
+      printf '%s' "$_pd" | sed -e 's|\\|/|g' -e "s|^${_pv}:|/${_pv}|"
+      ;;
+    *) printf '%s' "$_pd" ;;
+  esac
+}
+
+# 候选目录清单（不依赖 PATH 本身，故 PATH 坏掉时仍可用）。
+#   $HOME/.local/bin  Claude Code 原生安装位置
+#   $HOME/bin          常见手工安装位置
+#   $APPDATA/npm       Windows npm 默认全局 bin
+#   npm prefix -g      自定义 npm 全局前缀（opencode / codex 通常装在这）
+#   $CCG_BACKEND_BIN_DIRS  显式追加（冒号或分号分隔），给非常规安装与测试用
+candidate_dirs() {
+  [ -n "$HOME" ] && printf '%s\n' "$HOME/.local/bin" "$HOME/bin"
+  [ -n "$APPDATA" ] && printf '%s\n' "$APPDATA/npm"
+  if command -v npm >/dev/null 2>&1; then
+    _pp="$(npm prefix -g 2>/dev/null)" || _pp=""
+    if [ -n "$_pp" ]; then
+      _pq="$(posix_dir "$_pp" 2>/dev/null)" || _pq=""
+      [ -n "$_pq" ] && printf '%s\n' "$_pq"
+    fi
+  fi
+  if [ -n "${CCG_BACKEND_BIN_DIRS:-}" ]; then
+    printf '%s' "$CCG_BACKEND_BIN_DIRS" | tr ':;' '\n\n'
+  fi
+  return 0
+}
+
+# 探一个后端。输出 "<状态>|<说明>"，状态四取一：
+#   PATH  已在 PATH，裸名可解析
+#   ABS   原本不可解析，已按绝对路径补进 PATH（真身可直接 spawn）
+#   CMD   只找到 .cmd/.bat —— CreateProcess 起不来，只能算半个可用
+#   MISS  彻底找不到
+resolve_backend() {
+  _rb_tool="$1"
+  if command -v "$_rb_tool" >/dev/null 2>&1; then
+    printf 'PATH|裸名已可解析（无需干预）'
+    return 0
+  fi
+  for _rb_d in $(candidate_dirs); do
+    [ -n "$_rb_d" ] || continue
+    [ -d "$_rb_d" ] || continue
+    for _rb_f in "$_rb_d/$_rb_tool" "$_rb_d/$_rb_tool.exe" "$_rb_d/$_rb_tool.com" \
+                  "$_rb_d/$_rb_tool.cmd" "$_rb_d/$_rb_tool.bat"; do
+      [ -f "$_rb_f" ] || continue
+      PATH="$_rb_d:$PATH"
+      export PATH
+      case "$_rb_f" in
+        *.cmd|*.bat)
+          # 实测：wrapper 走 CreateProcess（UseShellExecute=false），它不解析
+          # .cmd/.bat；放个 .cmd 上去只会把失败推迟到引擎深处、错误信息还更难读。
+          printf 'CMD|只找到 %s —— CreateProcess 起不了 .cmd/.bat，wrapper 仍会失败' "$_rb_f"
+          return 0 ;;
+        *)
+          printf 'ABS|已从绝对路径补入 PATH: %s' "$_rb_f"
+          return 0 ;;
+      esac
+    done
+  done
+  printf 'MISS|找不到（PATH 与候选目录均未命中）'
+  return 1
+}
+
+# 逐个后端体检并打印。
+# 退出码刻意分三档而不是「有一个能跑就算过」——单后端正是本条坑造成的降级形态，
+# 把它做成 0 会让体检失去意义：
+#   0  两个后端都在（双模型齐备）
+#   2  有后端缺失（能跑，但已降级；两个都缺时另加硬提示）
+report_backends() {
+  _rb_rc=0
+  _rb_ok=0
+  for _rb_b in claude opencode; do
+    case "$_rb_b" in
+      claude)   _rb_why="评审后端（主力）" ;;
+      opencode) _rb_why="出方案后端 / 跨家族校验" ;;
+    esac
+    _rb_st="$(resolve_backend "$_rb_b")"
+    _rb_code="${_rb_st%%|*}"
+    _rb_msg="${_rb_st#*|}"
+    say "  · $_rb_b  [$_rb_code] $_rb_msg（$_rb_why）"
+    case "$_rb_code" in
+      PATH|ABS) _rb_ok=1 ;;
+      CMD)
+        say "      ↳ 修法：让真身以 .exe/.com 形式出现在某个全盘符限定的 PATH 目录下"
+        say "        （符号链接 / 硬链接都可以；.cmd 不作数，原因见上）" ;;
+      MISS)
+        _rb_rc=2
+        say "      ↳ 修法：装一个（npm i -g @anthropic-ai/claude-code），"
+        say "        或把它所在目录写进系统 PATH 后重开终端；"
+        say "        也可用 CCG_BACKEND_BIN_DIRS 显式指一个目录" ;;
+    esac
+  done
+  if [ "$_rb_ok" -eq 0 ]; then
+    say ""
+    say "  ✗ 没有任何评审后端可用 —— 深度审查根本起不来。"
+  else
+    say ""
+    say "  ⚠ 只剩单后端可用 —— 评审能跑，但跨家族交叉验证会缺失（这正是本条坑的形态）。"
+  fi
+  return "$_rb_rc"
+}
+
+# ---------- 0a. 纯依赖体检（--check-deps）----------
+# 刻意放在定位 node / 驱动 / 判定记录**之前**：这是「为什么我的评审降级了」
+# 的第一手诊断入口，真出事时 node 可能本身就是坏的，届时仍要能问。
+if [ "$CHECK_DEPS" -eq 1 ]; then
+  say "═══ CCG 深度审查 · 依赖体检 ═══"
+  _CD_WRAPPER="${CODEAGENT_WRAPPER:-$HOME/.claude/bin/codeagent-wrapper.exe}"
+  if [ -f "$_CD_WRAPPER" ] || [ -x "$_CD_WRAPPER" ]; then
+    say "  ✓ codeagent-wrapper  $_CD_WRAPPER"
+    _CD_RC=0
+  else
+    say "  ✗ codeagent-wrapper 找不到: $_CD_WRAPPER"
+    say "    修法：npx ccg-workflow（生成 wrapper）"
+    _CD_RC=2
+  fi
+  report_backends || _CD_RC=2
+  say ""
+  if [ "$_CD_RC" -eq 0 ]; then
+    say "体检通过：后端可用。"
+  else
+    say "体检不通过：见上方逐条修法。"
+  fi
+  exit "$_CD_RC"
+fi
+
 # ---------- 1. 定位 node ----------
 if ! command -v node >/dev/null 2>&1; then
   if [ -d "$HOME/.fnm" ]; then
@@ -100,8 +272,9 @@ WRAPPER="${CODEAGENT_WRAPPER:-$HOME/.claude/bin/codeagent-wrapper.exe}"
   say "  生成：npx ccg-workflow"
   exit 2
 }
-command -v claude >/dev/null 2>&1 || say "⚠ 找不到 claude —— 评审后端不可用，引擎会降级为单后端"
-command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— 出方案后端不可用，跨家族校验会降级"
+# 后端体检**并补 PATH**（旧实现只 say 一句被动告警然后照跑 ⇒ 静默降级）。
+# 这里保持非致命，与旧语义一致：真要 fail-closed 请用 --check-deps。
+report_backends || true
 say ""
 say "依赖体检通过，开始深度审查（可能耗时 15 分钟以上，取决于 diff 体量）…"
 say ""

```

> 这是机械生成的变更提案，不代表任何设计意图。评审方请只针对上述内容挑刺。