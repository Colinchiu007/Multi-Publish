---
record: ccg-git-bash-entry
task: CCG 评审入口加 WSL 环境闸与 PowerShell 统一入口，消除误导性排查建议
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 回填 PR 的会话
---

## 本次执行记录：CCG 评审入口 WSL 环境闸 + PowerShell 统一入口（ccg-git-bash-entry，2026-10-07）

> 分支：`ccg-git-bash-entry`；worktree：`D:\Data\projects\mp-worktrees\mp-ccg-git-bash-entry`（`start-mp-task.ps1` 建的裸分支 worktree，裸分支名无斜杠）
> 范围：🔧 工具脚本 + CI 接线 —— 新增 `scripts/ccg-review.ps1` 与 `scripts/ccg-bash-entry.test.js`，改 `scripts/deep-review.sh`、`scripts/plan-review.sh` 加环境闸，改 `.github/workflows/quality-gate.yml` 接线
> 判定：`classify-docs-only` ⇒ **docs-only=false**（改了 `.github/workflows/` 与 `scripts/`）⇒ 混合 PR，走完整质量节拍

### 动因：问题定位

用户报「另一个会话环境变量没传到 Git Bash」。**实测证伪了这个前提**：

| 检查项 | 实测结果 |
|---|---|
| `Get-Command bash -All` | `C:\windows\system32\bash.exe` ← **WSL shim**，不是 Git Bash |
| Git Bash 真身 | `C:\Program Files\Git\bin\bash.exe` |
| `CCG_ARL_DIR`（Process/User/Machine 三级） | **全部为空** |
| `CODEAGENT_WRAPPER` / `CCG_BACKEND_BIN_DIRS` | 全部为空 |
| 真实 Git Bash 里 `HOME` | `/c/Users/邱领` → `C:\Users\邱领`，**映射完全正常** |

⇒ `CCG_ARL_DIR` 不是「没穿透到 Git Bash」，而是**从来没被设置过**。前一会话读的「bash 的 HOME 是 `/home/qiu`」是 **WSL 的 HOME**，据此得出的「用 Git Bash 路径映射修正 HOME」是误诊——它一直在修一个不存在的环境。

### 第一性原因（QM-5 ①）

**入口缺少「我跑在哪个 shell 里」的自证**，于是在错误环境里输出一串**指向性错误的排查建议**：

- `deep-review.sh` 找不到 `codeagent-wrapper` 时打印「生成：npx ccg-workflow」，找不到驱动时打印「c) 设置 CCG_ARL_DIR 指向引擎目录」；
- 这些建议在 WSL 语境下**全部是错的**（WSL 里 `npx` 与 Windows 侧资源都不可见），却没有任何一处提示「你可能跑在 WSL 上」；
- 于是排查者照着建议去查/去设 `CCG_ARL_DIR`，在一个**三级作用域都不存在的幻影变量**上耗掉整个会话，真实根因（用错 shell）始终没被说破。

症状分类：**不是「环境坏掉」，而是「报错文案把人带偏」**。

### 逃逸分析（QM-5 ②）

逐层追问为什么没人拦住：

1. **单元测试层**：`deep-review-deps.test.js`（11 条）覆盖的是「后端 CLI 不在 PATH 时能否按绝对路径恢复」，但它**默认脚本跑在一个正常 shell 里**——没有任何一条断言关心「这个 shell 本身对不对」。
2. **集成层**：`--check-deps` 是专门为「为什么我的评审降级了」准备的第一手诊断入口，但它在 WSL 下**输出的恰恰是那串误导性建议**。一个诊断入口在关键故障场景下给出错误指引，比没有入口更糟。
3. **Code Review 层**：既有 `.sh` 注释里已反复警告「裸 bash 解析到 WSL」（`start-mp-task.ps1` / `run-bash-gate.ps1` / `AGENTS.md` 三处都写了），但**警告只存在于 PowerShell 侧入口脚本里**，`deep-review.sh` / `plan-review.sh` 自身零防护。
4. **流程层**：`AGENTS.md` 的隔离纪律反复要求「统一使用 Git for Windows Bash」，但那是**人工纪律**，脚本本身不强制，于是纪律一旦被忽略就静默降级成一句误导性建议。

### 修复 + 回归保护（QM-5 ④）

`scripts/ccg-bash-entry.test.js`（7 条，TDD：先写、实现前 6 红）：

| # | 判据 | 类型 |
|---|---|---|
| ① | WSL 标记在场时 `deep-review.sh --check-deps` 必须拦下、点名 WSL、指向 Git Bash，且**不得**输出「设置 CCG_ARL_DIR」建议 | 行为 |
| ② | `plan-review.sh` 同样必须拦下（它连 `--check-deps` 都没有，更没有退路） | 行为 |
| ③ | **反向锁**：无 WSL 标记时不得拦下——不得误伤真 Linux / ubuntu CI | 行为 |
| ④ | 必须保留 `/proc/version` 兜底检测 | 结构 |
| ⑤ | WSL 检测不得依赖外部命令（剥注释后不得出现 `cat`/`grep`/`uname`） | 结构 |
| ⑥⑦ | `ccg-review.ps1` 存在、自带 Git Bash 身份校验、派发到两个 `.sh` | 结构 |

①③ 是本锁的核心：③ 挡住「把判据写成必须是 Git Bash 从而打死 CI」这个最容易写坏的方向。

### 防止再次发生（QM-5 ⑤）

- **预防层**：新增 `scripts/ccg-review.ps1`，把「定位 Git Bash + 身份校验 + 派发」收在一处，人不必再手敲 `bash scripts/deep-review.sh`。探测链与 `run-bash-gate.ps1` / `start-mp-task.ps1` 同源（`MP_GIT_BASH` 覆盖 → git 派生 → 硬编码候选），WSL shim 与缺 `dirname.exe` 的精简安装均被显式拒绝。
- **检测层**：两个 `.sh` 入口最前面加 `_is_wsl` 闸，命中即 `exit 2`，并**主动劝退**「去设 CCG_ARL_DIR」这条死路。
- **流程层**：新增测试接线进 `quality-gate.yml` Gate 2b，`check-unwired-tests.js` 从此把这条锁纳入棘轮。

### 关键设计取舍

**只拦 WSL，不拦真 Linux。** WSL 的家目录/PATH/互操作全是另一套，本脚本无法工作，必须拦；真 Linux（含 GitHub Actions ubuntu runner）上 `.local/bin`、`npm prefix -g`、无扩展名 sh shim 那套 POSIX 分支**是能工作的**（`deep-review-deps.test.js` 每天都在 ubuntu 上跑）。把判据写成「必须是 Git Bash」会直接打死 CI。检测只用 WSL 自身必设的环境变量 + `/proc/version` 兜底，且不调用任何外部命令——沿用本仓既有教训：入口自己不能依赖 PATH 里的工具目录（`dirname: command not found` 已坑过一次，一个「查别人坏没坏」的命令自己先坏掉是最坏的失败形态）。

### 门禁证据

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 新增测试 | PASS | `node --test scripts/ccg-bash-entry.test.js` → **7 pass / 0 fail** |
| 既有 CCG 锁回归 | PASS | `deep-review-deps.test.js` → **11 pass / 0 fail**，无回归 |
| 套件横扫 | PASS | 8 个套件合计 **61 pass / 0 fail**（含 `check-unwired-tests` / `check-ps1-bom` / `check-text-encoding-integrity` / `check-no-brand-residue` / `quality-rhythm-spec-mirror` / `branch-naming-contract`） |
| 接线棘轮 | PASS | `node scripts/check-unwired-tests.js` → 检查域内 66 个测试，**全部已接线** |
| ps1 BOM | PASS | `check-ps1-bom.js` → tracked `.ps1` 全部守约（`.ps1` 含中文时 PS 5.1 按 ANSI 解码可致 tokenize 失败，本仓既有门禁） |
| 编码完整性 | PASS | `check-text-encoding-integrity.js` → **无新增编码损坏**（存量 8 个基线文件不判红） |
| 品牌残留 | PASS | `check-no-brand-residue.js` → 扫描 7239 tracked 文件 PASS |
| 行尾对账 | PASS | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` **两口径逐行相同**；删除数 **0**（纯新增，461 行） |
| `.sh` 行尾 | PASS | `deep-review.sh` CR=0/LF=469、`plan-review.sh` CR=0/LF=155 ⇒ 纯 LF，bash 可执行（BOM 会打断 shebang） |
| 手工验证：正常环境 | PASS | `ccg-review.ps1 -Mode Deep -CheckDeps` 自动定位 `C:\Program Files\Git\usr\bin\bash.exe` 并派发，双后端齐备 rc=0、**无降级** |
| 手工验证：WSL 环境 | PASS | 置 `WSL_DISTRO_NAME=Ubuntu` 实跑 → 正确拦下 **rc=2**，输出指向性修复文案 |
| 手工验证：WSL shim 拒绝 | PASS | `ccg-review.ps1 -GitBash C:\windows\system32\bash.exe` → 按预期抛错拒绝 |
| 手工验证：Plan 模式 | PASS | `-Mode Plan -Proposal AGENTS.md` 正确派发到 `plan-review.sh` 并跑出 DUAL 判定 |
| QM-1 打包 / QM-4 视觉 | ➖ N/A | 未触 `apps/desktop/electron/**`；无 UI 变更 |
| QM-6 双模型外部评审 | **PASS** | 已执行，proposer=opencode + critic=claude 跨家族，6 条 findings 逐条处置，见下 |

### QM-6 CCG 双模型外部评审（**已执行**，非自审）

**跨家族组合**：`proposer=opencode`（deepseek/hy3）+ `critic=claude`（anthropic），family-snapshot 落盘 `.adversarial/ccg-deep-ba5096f3/family-snapshot.json`。判定 `DUAL`（461 行 > 200 行阈值）。

**两处执行障碍，均已定位根因、未以「工具不可用」搪塞**：

1. **引擎两次 ETIMEDOUT**：`ccg-deep-review.js` 把 `timeoutMs: 600000`（10 分钟）**写死在 base config**，无 CLI 覆盖、无环境变量，`retryCount: 2` 三次尝试全部耗尽。
   - 证伪「后端不可用」：按 `model-call.js` 的真实 arity（`wrapper --backend claude --lite - <workdir>`，prompt 走 stdin）单独探测，**28.2 秒返回 `status=0` + 合法 JSON**；`claude --version` = 2.1.292。
   - 处置：直接调用**同一引擎的 `mc.callCritic`**（同 prompt、同 schema、同后端），仅把 `timeoutMs` 放大到 30 分钟 —— 评审逻辑一行没改，**不是自审**。26KB diff 下 **25.3 秒**返回完整 critique。
   - ⚠ 首次 runner 读错返回字段（写成 `cr.output`，真实字段是 `data` / `rawOutput`），导致 critique 落盘 0 字节，已纠正。
2. **产物未被隔离**：上一条记录出现过 `Session Isolation Write Guard` 把整个 `.adversarial/` 搬进隔离区导致 findings 丢失。本次产物完整可读，未复现。

**评审结论：6 条 findings（1 Critical / 3 Warning / 2 Info）**——correctness 4 / security 1 / performance 0 / maintainability 3。逐条处置：

| # | severity | 处置 |
|---|----------|------|
| i1 | **Critical** | **部分成立，已修**。评审称「`*[Mm]icrosoft*` 会误杀 Git Bash（MSYS 的 `/proc/version` 含 Microsoft Corporation）」——**实测证伪**：本机 Git Bash 读到的是 `MINGW64_NT-10.0-26200 version 3.6.9-...`，**不含 Microsoft**，所以闸从未误杀（这也正是实跑一路绿的原因）。但它顺带查出的两点**成立且更严重**：① 原注释断言「Windows 上没有 `/proc/version`」是**事实错误**（MSYS 有虚拟 `/proc` 且可读）；② 判据只认 Microsoft **确实过宽**，别的 MSYS/Cygwin 发行版版本串可能带厂商字样。已把判据收紧为**「行首 `Linux version ` 且含 microsoft/WSL」两者取交集**，并新增锁⑧钉住，防回潮。 |
| i2 | Warning | **成立，已修**。`ccg-review.ps1` 的 `cd <repoRoot> && sh <target>` 路径裸拼，含空格时被拆词；首版只给 `$scriptArgs` 加引号、路径没加，属不一致。已抽 `Quote-Bash` 统一包裹。**变异反证**：未修复时含空格路径报 `cd: too many arguments`，修复后同一路径正常运行。 |
| i3 | Warning | **不采纳（附理由）**。两个 `.sh` 各留一份 `_is_wsl` 确有漂移风险，但抽 `scripts/lib/*.sh` 需要 `source`，而 `deep-review.sh` 的既有设计教训恰恰是「入口不得依赖外部文件 / PATH 工具目录」（`dirname` 事故）。防漂移改由**行为锁**承担：测试①② 三个断言都覆盖两个 `.sh`，任何一侧被删或改坏立刻变红。 |
| i4 | Warning | **成立，已修**。结构锁原用 `/_is_wsl[\s\S]*?\n}/` 截取，撞上第一个独占 `}` 就停；将来函数内加多行块会提前截断。改为锚定函数末尾 `return 1` + `}`（与「检测失败」语义绑定，内层块抢不走）。 |
| i5 | Info | **不采纳（附理由）**。`bash -lc` 是登录 shell，会读用户 profile。改 `-c` 会丢掉 profile 里的 PATH，而 `.sh` 依赖 PATH 里的 node；本仓 `run-bash-gate.ps1` 同样用 `-lc`。**与既有入口保持一致**优先于消除 profile 副作用。 |
| i6 | Info | **成立，已修**。测试①的备选断言 `/不是环境变量/` 永不匹配——实际文案是 `这**不是**环境变量没传进来`，夹了 Markdown 粗体星号，该分支是死代码。改为容忍星号的正则，不动用户可见文案。 |

**评审后复测**：新测试 8 pass / 0 fail（新增锁⑧）；`deep-review-deps.test.js` 11 pass / 0 fail 无回归；四个 checker 全 rc=0；六个套件横扫 51 pass / 0 fail。

**双向实测取真实退出码**（⚠ 不可用 `cmd | Select-Object` 取 rc，管道会吃掉真值）：WSL 场景 `rc=2`、Git Bash 场景 `rc=0`，`deep-review.sh` 与 `plan-review.sh` 两个脚本均正确。

| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#3107)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin ccg-git-bash-entry` 返回 0 行证远端分支已删。⚠ **本载体（`openspec/records/`）的登记走 frontmatter，不进 `gate-record-debt-ledger.json`** —— 后者的键必须匹配 `.quality-gates.md` 的 `## 标题`（`check-gate-record-debt.js:191` 的 `stale` 判据），给文件源载体登记会被判「陈旧登记」而恒红。首版正是踩了这个坑，已撤销 |

### ⚠️ 过程中自查抓到的真实缺陷

1. **提示语里有 3 个 U+FFFD 损坏字符**：`deep-review.sh` 的 `（要用的???是这个）` 实为 `（要用的就是这个）`。由编辑环节的编码损坏引入，落在**用户可见的诊断文案**上。已修。
2. **提交信息里同样有 3 个 U+FFFD**（`探测链` 损坏）。已用 Node 写消息文件 + `git commit --amend` 修复。
3. **自写测试自身的假阳性**：⑤ 的结构锁最初把注释里的「不经 `cat`」判成了调用外部命令。参照 `AGENTS.md` 对 `2>&1` 结构锁的既有成例（「注释行里的 `2>&1` 不算捕获点」），改为先剥注释再判。

### 遗留（不假装已闭合）

- **`timeoutMs: 600000` 写死在 CCG 引擎里**（`~/.claude/skills/adversarial-review-loop/scripts/ccg-deep-review.js`，**技能目录非本仓**），无 CLI 覆盖、无环境变量。461 行 diff 的 critic 调用连续两次评审、共 6 次尝试全部 ETIMEDOUT。已验证 wrapper→claude 链路本身健康（单独探测 **28.2 秒返回合法 JSON**），判定为**预算不足**。本仓无权改技能目录；本次靠直接调用同引擎 `mc.callCritic` 并放大超时绕过。**如需根治应另开一条针对该技能的任务**（加 `--timeout` CLI 或环境变量覆盖）。
- **`model-call.js` 有一处假绿灯风险**：wrapper 只输出诊断头、stdout 为空时，因 `isWrapperDiagnostic` 判定而**跳过错误分支**，返回 `{ok: true, output: ''}`。本次未触发（critic 正常返回），但它意味着「空输出」可能被当成成功。同样属技能目录，未改。
- **`deep-review.sh` 只按精确 sha 匹配判定记录**（`.ccg/reviews/$SHA.json`），没有回退到 `ccg-review-decider.js` 已实现的 `stagedDiffHash` 内容寻址回退（引擎 `ccg-deep-review.js` 有这个回退，入口脚本没有）。后果：`--force` 在记录缺失时救不回来——它只绕过 `mode=skip`，遇空记录仍在 `exit 0` 提前返回。本次靠直接调用引擎完成评审，未改入口。
- **本机 PATH 有 40+ 条被剥掉盘符的条目**（盘符与反斜杠被拆成独立条目，如 `C` + `\Program Files\npm-global`）。`deep-review.sh` 靠自己 prepend 绝对目录绕过了，但其他不这么做的工具仍可能中招。属**机器级**问题，不在本仓 PR 范围。
- **`C:\Users\<user>\bin\claude.exe` 是 0 字节空壳**（真身 `.local\bin\claude.exe` 254MB）。该目录目前**不在 PATH 上**，暂不会误命中；建议直接删除该 0 字节文件。**未执行**——删除用户目录下的文件风险过高，交人工确认。
- **`plan-review.sh` 的后端体检仍是旧形态**：`command -v claude || say "⚠ 找不到 claude"` 这条**被动告警后照跑**，正是 `deep-review-deps.test.js` ⑧ 明令禁止的反模式（只 warn 不改变行为 ⇒ 静默降级成单后端）。`deep-review.sh` 早已修好，`plan-review.sh` 没有。本次只加了 WSL 闸，**未同步这处加固**，属独立改进项。