---
name: start-app
version: 1.2.0
description: >
  用当前项目最新代码 + 共享数据（shared-user-data 锚点）启动/重启 Multi-Publish
  桌面应用。支持 Windows 与 WSL（Ubuntu-E）双环境：默认启动 Windows 环境的应用，
  显式指定或检测到 WSL 时走 WSL 流程。启动前先核对本地工作区与远程
  origin/main 对齐（保证跑的是最新代码），再检查环境齐备（node / 依赖 /
  electron / 端口），最后启动并验证窗口与登录态。自动判断应用是否已在运行，
  区分「启动 / 重启 / 仅确认状态」三种场景。触发词：启动应用、启动桌面、
  重启应用、start-app、restart-app、应用在跑吗、跑最新代码。
tags: [launch, desktop, electron, dev, sync, profile, restart, wsl, windows]
---

# 启动应用（最新代码 + 已登录 profile）

> **本文件是单一事实源（single source of truth）。**
> 各 agent 目录（`.codex/skills/`、`.claude/commands/`、`.cursor/commands/` 等）
> 下的 `start-app` / `启动应用` 入口均为轻量包装，指向本文件。修改逻辑请改这里。

## When to Use

- 用户想「启动应用」「打开桌面端」「跑一下最新代码」
- 用户想用**已登录的 profile**（保留登录态 / 模型 key）启动应用做手动验证
- 用户要求「先同步最新代码再启动」，保证跑的不是旧代码
- 需要确认应用能正常起来、登录态还在
- 用户想**重启应用**（`重启应用` / `restart-app`）——先停旧实例再加载最新代码
- 用户想确认应用**是否在运行**（`应用在跑吗` / `app status`）——只查状态不重启

## 自动判断当前 agent（本 skill 如何被各 agent 加载）

本 skill 的完整定义只维护一份（本文件）。各 agent 通过**各自约定目录**的轻量入口
加载，入口内容统一为「指向本文件 + 执行要点」。当前已覆盖：

| Agent | 入口路径 | 加载方式 |
|-------|---------|---------|
| Codex | `.codex/skills/start-app/SKILL.md` | `/start-app` |
| Claude Code | `.claude/commands/启动应用.md` | `/启动应用` |
| Cursor | `.cursor/commands/启动应用.md` | `/启动应用` |

> 说明：不同 agent 只扫描**自己约定目录**下的文件，无法用一个文件同时服务多个
> agent。因此「整合」= 单一事实源 + 各 agent 轻量入口，而非单文件多 agent。

## 三种场景（先判断应用当前是否在运行）

启动前**必须先探测**应用是否已在运行，据此决定处理方式：

| 场景 | 触发词 | 处理 |
|------|--------|------|
| **A. 未运行** | `启动应用` / `start-app` | 正常走完整启动流程（见下）|
| **B. 已在运行 + 想重启** | `重启应用` / `restart-app` | 明确接受丢失当前会话状态 → 先停旧实例再启动（脚本已内置清旧实例）|
| **C. 已在运行 + 只想确认/复用** | `应用在跑吗` / `app status` | 只检查进程+端口，**不重启**，避免丢失正在编辑的草稿/未保存操作 |

**探测方法**（只读，不杀进程）：

```powershell
Get-Process electron -ErrorAction SilentlyContinue | Select-Object Id,MainWindowTitle
Get-NetTCPConnection -LocalPort <vitePort> -State Listen -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort <cdpPort> -State Listen -ErrorAction SilentlyContinue
```

**关键规则：**
- 用户说「**启动**」但发现已在运行 → **先询问**是否要重启，不要默默杀掉（可能丢失会话状态）。
- 用户说「**重启**」→ 明确接受重启，直接执行（`start-desktop.ps1` 第 4 步会自动停掉同 worktree 的旧 Electron/Vite 再启动新的）。
- 用户只问「在跑吗」→ 只报告状态，不执行任何停止/启动动作。

## 核心目标

1. **代码最新**：启动前核对本地工作区与远程 origin/main 对齐，落后则 fast-forward 同步
2. **环境齐备**：node、依赖、electron 二进制、端口都健康，避免启动即崩
3. **共享数据**：用 `shared-user-data` 锚点（WSL/Windows 共用同一数据库、模型 key、账号），不设显式 profile 以免绕过锚点导致数据分裂
4. **双环境**：默认启动 **Windows** 环境的应用；显式指定或检测到 WSL 时走 WSL 流程
5. **验证**：窗口出现 + 登录态可读

## 关键事实（本项目）

- **双环境**：Windows（`start-desktop.ps1`，PowerShell 7）与 WSL Ubuntu-E（`start-desktop-wsl.sh`，bash）。**默认 Windows**。
- **共享数据锚点**：仓库根 `shared-user-data/.shared-data-anchor`（已创建）。`startup-compat.js` 自动检测并启用共享 userData，WSL/Windows 数据一致。**⚠️ 显式设 `ELECTRON_USER_DATA_DIR` / `--user-data-dir=` 会绕过锚点 → 数据分裂**，默认不要设。
- **Windows 启动契约**：`scripts/start-desktop.ps1`（同步 + 依赖 + 端口 + 单实例锁 + 启动 + 验证）。
- **WSL 启动契约**：`scripts/start-desktop-wsl.sh`（bash 版；依赖 Linux 版 node_modules + `LD_LIBRARY_PATH` 指向 `~/mp-wsl-deps/electron-libs`）。
- **WSL 依赖**：项目 node_modules 是 Windows 版（缺 `@rollup/rollup-linux-x64-gnu` 等 Linux 可选依赖），WSL 端须用**独立 Linux 依赖树**（`~/mp-wsl-deps/mp-wsl` worktree 内 `pnpm install --frozen-lockfile`）。
- **WSL electron 库**：Linux electron 缺 5 个 GUI 库（libnspr4/libnss3/libnssutil3/libsmime3/libasound），用 `LD_LIBRARY_PATH=~/mp-wsl-deps/electron-libs` 注入（持久目录，WSL 重启不丢）。
- **远程**：`origin = https://github.com/Colinchiu007/Multi-Publish.git`，主干 `main`。
- **登录态校验**：`scripts/start-desktop-identity.js` 经 CDP 读 `window.electronAPI.identityGetState()`。
- **端口**：worktree 下按路径稳定派生独立端口（`apps/desktop/scripts/dev-ports.js`），避免并发互抢。

## 流程

### 0. 环境判定（默认 Windows）

**先判定当前运行环境，决定用哪个启动脚本：**

```bash
uname -s   # Linux → WSL；MINGW/CYGWIN/MSYS → Windows
# 或检测 WSL：/proc/version 含 microsoft-standard-WSL2
```

| 判定 | 启动脚本 | 说明 |
|------|---------|------|
| **Windows（默认）** | `scripts/start-desktop.ps1` | PowerShell 7 版 |
| **WSL** | `scripts/start-desktop-wsl.sh` | bash 版，Linux electron + LD_LIBRARY_PATH |

- **不指定时默认 Windows**（用户要求「启动应用/重启应用」默认走 Windows）。
- 用户显式说「WSL 启动」/「wsl 环境」→ 走 WSL 流程。
- 若当前 shell 本身在 WSL 内（如本会话），直接用 WSL 流程；若在 Windows PowerShell，默认走 Windows 流程。

**WSL 启动核心命令（显式指定 WSL 时）：**

```bash
# 在 WSL Ubuntu-E 内执行
bash /mnt/d/Data/projects/Multi-Publish/scripts/start-desktop-wsl.sh
```

> 该脚本自动：同步 origin/main → 用 Linux 依赖树（`~/mp-wsl-deps/mp-wsl`）→ 注入 `LD_LIBRARY_PATH` → 启动 vite + electron（共享 userData 由锚点决定）。

### 0. 确认目标工作区

- 默认目标 = 当前仓库根（`D:\Data\projects\Multi-Publish`）。
- 若用户指定 worktree（如 `D:\Data\projects\mp-worktrees\mp-<task>`），用该 worktree。
- ⚠️ `start-desktop.ps1` 默认 **fail-closed 拒绝共享主工作区**（`git-dir == common-dir`），因为脚本会 fetch/merge 并强停进程。若确实要在共享主目录启动，需 `-ForceShared`（高风险，先向用户说明）。

#### 0a. 共享主工作区脏文件检测（关键，曾踩坑）

**若目标是共享主工作区（`D:\Data\projects\Multi-Publish`），必须先检测脏文件数：**

```powershell
git -C <repo> status --short | Measure-Object | Select-Object -ExpandProperty Count   # 脏文件数
```

- **脏文件数 > 0（尤其 > 100）**：说明共享主工作区有**其他会话遗留的未提交改动**（常见：`.ccg/tasks/archive/` 归档 + `apps/desktop/electron/` 等）。此时：
  - ⛔ **绝不在共享主工作区做任何 git 写操作**（stash / merge / checkout / restore）——违反 AGENTS.md 铁律「共享仓库根禁止 stash/checkout，stash/index/HEAD 属同一 Git 状态会互相竞争」。
  - ✅ **改用隔离 worktree 启动**（见下方「隔离 worktree 启动」），不动共享主工作区。
- **脏文件数 = 0**：共享主工作区干净，可正常走下方流程。

> **⚠️ 核心教训（曾导致在共享主工作区误 stash）**：
> 之前重启时，共享主工作区有 1204 个其他会话的脏文件，我直接 `git stash` 处理冲突，违反铁律。**正确做法：脏文件多时直接改用隔离 worktree，绝不在共享主工作区动 git 状态。**

#### 0b. 隔离 worktree 启动（共享主工作区脏时用）

当共享主工作区脏文件多（其他会话在用）时，在隔离 worktree 启动最新代码：

```powershell
# 1. 创建隔离 worktree（基于 origin/main 最新代码），用 PowerShell 原生 D:\ 路径
git -C <repo> worktree add -b "local/<task>" "D:\Data\projects\mp-worktrees\mp-<task>" origin/main
# 2. 验证 worktree 可进入（铁律：失败则 worktree remove --force，不留半失效注册）
git -C "D:\Data\projects\mp-worktrees\mp-<task>" rev-parse --show-toplevel

# 3. 新 worktree 依赖就绪
cd "D:\Data\projects\mp-worktrees\mp-<task>"
pnpm install --frozen-lockfile
node scripts/ensure-electron.js
node scripts/verify-worktree-deps.js

# 4. 在隔离 worktree 启动（-StopForeignProfile 停掉占用同 profile 的旧实例；MP_*_PORT 覆盖端口避免 9222 被无关 Chrome 占用）
$env:MP_VITE_PORT="5175"; $env:MP_CDP_PORT="9224"
pwsh -File scripts/start-desktop.ps1 -Worktree "D:\Data\projects\mp-worktrees\mp-<task>" -Profile 'D:\tmp\Multi-Publish-debug-profile' -CheckIdentity -Json -StopForeignProfile
```

- 隔离 worktree 的端口由 `dev-ports.js` 按路径独立派生，不会与共享主工作区互抢。
- `-StopForeignProfile`：审计停止占用同一 profile 的其他 worktree 实例（避免单实例锁互杀）。
- `MP_VITE_PORT` / `MP_CDP_PORT`：显式覆盖端口（9222 常被无关 Chrome 的 `--remote-debugging-port=9222` 占用，需避开）。
- 完成后可 `git -C <repo> worktree remove "D:\Data\projects\mp-worktrees\mp-<task>"`（走 `safe-worktree-remove.ps1`，遵守 R1-R5 铁律）。

### 1. 核对本地工作区与远程对齐（保证代码最新）

在目标工作区执行：

```powershell
git fetch origin
git rev-list --left-right --count HEAD...origin/main   # 输出 "a<TAB>b"：a=领先数 b=落后数
```

**按 a/b 组合处理（关键：分叉状态必须 fallback 到普通 merge，不能只用 --ff-only）：**

| 状态 | 处理 |
|------|------|
| **0/0**（已对齐）| 继续，无需同步 |
| **0/b**（b>0，仅落后）| `git merge --ff-only origin/main`（可 fast-forward）|
| **a/0**（a>0，仅领先）| 本地有远程没有的提交（如未 push 的本地提交/未合并 PR），提示用户确认是否要跑本地领先版本 |
| **a/b**（a>0 且 b>0，**分叉**）| ⚠️ **`--ff-only` 必然失败**。必须用普通 merge：`git merge origin/main`（ort 策略，可合并分叉）。若本地领先提交是文档/流程类，合并通常无冲突；若冲突，停止并报告用户先处理，**不要**强推或丢弃改动 |

> **⚠️ 核心教训（曾导致启动用旧代码）**：
> 之前 skill/脚本只用 `merge --ff-only`，在**分叉状态**（本地领先 + 落后）下必然失败，导致同步失败后应用仍用旧代码启动。**必须**在分叉时 fallback 到普通 `git merge origin/main`。

**合并后必须验证 HEAD 已更新到最新（防旧代码启动）：**

```powershell
# 合并后确认 HEAD 已包含 origin/main 最新提交
git rev-list --left-right --count HEAD...origin/main   # 应输出 "a<TAB>0"（落后必须为 0）
git log --oneline -1 origin/main                       # 远程最新提交
git log --oneline -1 HEAD                              # 本地 HEAD，应 >= 远程
```

- **落后数必须为 0** 才允许启动。若合并后仍落后（合并失败/被中断），**停止，不要启动**，否则跑的是旧代码。
- 若用户指定了某个修复/功能，启动前用 `git merge-base --is-ancestor <修复提交> HEAD` 确认该提交已在 HEAD 中。

> 说明：`start-desktop.ps1` 内部也会做同步（除非 `-NoSync`），但**先手动核对 + 验证**能确保启动前 HEAD 已是最新，避免脚本同步失败时静默用旧代码启动。

### 2. 检查环境齐备

- **node**：`Get-Command node` 或按 `start-desktop.ps1` 的候选路径探测；缺失则提示先装/激活 Node。
- **依赖**：
  ```powershell
  node scripts/ensure-desktop-deps.js --check   # 只检查；缺失返回非零
  ```
  缺失时运行 `node scripts/ensure-desktop-deps.js`（默认 restore 自愈）。
- **electron 二进制**：`node_modules\electron\dist\electron.exe` 存在（缺失先 `node scripts/ensure-electron.js`）。
- **端口**：目标 Vite/CDP 端口未被其他 worktree 占用（`start-desktop.ps1` 会自动 fail-closed 检查）。

> 这些检查 `start-desktop.ps1` 默认都会做（`-NoDepsCheck` 可跳过）。手动跑 `--check` 便于提前暴露问题。

### 3. 用已登录 profile 启动

**首选（推荐）——复用启动契约脚本：**

```powershell
pwsh -File scripts/start-desktop.ps1 `
  -Worktree <目标工作区绝对路径> `
  -Profile 'D:\tmp\Multi-Publish-debug-profile' `
  -CheckIdentity `
  -Json
```

参数说明：
- `-Worktree`：目标工作区（默认脚本所在仓库根）。
- `-Profile`：已登录 profile（默认 `D:\tmp\Multi-Publish-debug-profile`）。
- `-CheckIdentity`：窗口出现后经 CDP 校验登录态。
- `-Json`：输出结构化证据块。
- 可选：`-InvalidateViteCache`（陈旧 Vite 缓存导致 504 空白页时用）、`-StopForeignProfile`（其他 worktree 占用同一 profile 时审计停止后继续）。

**备选——直接启动（不经过完整契约，仅调试用）：**

```powershell
node scripts/launch-worktree.js --worktree <dir> --profile 'D:\tmp\Multi-Publish-debug-profile'
```

### 4. 验证

- 脚本轮询等待可见主窗口（默认 150s），成功输出 `START_CONTRACT_OK` + 窗口 handle/标题。
- `-CheckIdentity` 会输出登录态 JSON（`identity-session.json` 解密后的状态）。
- 若 `identity` 输出 `IDENTITY_UNAVAILABLE` / `NO_PAGE`：窗口起来了但登录态不可读，提示用户确认是否已登录。

## 失败处理

| 现象 | 处理 |
|------|------|
| merge --ff-only 失败 | 有未提交脏文件冲突，报告用户先处理，不丢弃改动 |
| 端口被其他 worktree 占用 | 脚本 fail-closed；先停占用方或换 worktree |
| profile 被其他 worktree 占用 | 加 `-StopForeignProfile` 审计停止，或手动停旧实例 |
| 依赖缺失 | `node scripts/ensure-desktop-deps.js` 自愈后重试 |
| 150s 无窗口 | 看 `%TEMP%\mp-start-dev.err.log`（Windows）或脚本输出日志（WSL）尾部错误 |
| 504 空白页 | 加 `-InvalidateViteCache` 重试 |
| WSL electron 缺库 | `LD_LIBRARY_PATH=~/mp-wsl-deps/electron-libs` 注入；缺失则从 `/tmp/electron-libs/extracted/usr/lib/x86_64-linux-gnu/` 复制 |
| WSL GPU 崩溃（GPU process isn't usable）| 加 `--in-process-gpu`（start-desktop-wsl.sh 已内置）|
| WSL 数据分裂 | 确认 electron 用共享目录：`--user-data-dir=/mnt/d/Data/projects/Multi-Publish/shared-user-data`；不要设 `ELECTRON_USER_DATA_DIR` |

## Pitfalls

- **共享主目录默认被拒**：`start-desktop.ps1` 对共享主工作区 fail-closed，需 `-ForceShared` 且先向用户说明风险。
- **不要静默连别人的 Vite**：端口归属检查是 fail-closed，绝不绕过。
- **profile 单实例锁**：同 profile 多实例互杀会导致窗口空白，先处理占用。
- **同步失败即停**：代码未对齐时不要启动，否则跑的是旧代码。
- **git 写操作走 PowerShell 原生路径**：避免 Git Bash `/d/...` 触发 `D:/d/...` 混写（项目硬纪律）。
- **WSL/Windows 数据分裂（双环境核心坑）**：项目 node_modules 是 Windows 版，WSL 端必须用独立 Linux 依赖树（`~/mp-wsl-deps/mp-wsl`）；electron 必须显式 `--user-data-dir` 指向共享目录（Linux worktree 上溯不到共享主仓库锚点）；**默认不要设 `ELECTRON_USER_DATA_DIR`**（显式值会绕过共享目录）。
- **WSL /tmp 是 tmpfs**：`/tmp/mp-electron`、`/tmp/electron-libs`、`/tmp/mp-wsl-profile` 都是临时方案，WSL 重启即清空。持久方案是 `~/mp-wsl-deps/`（electron-libs 库 + mp-wsl worktree）。
- **单一事实源**：逻辑修改只改本文件；各 agent 入口只做「指向本文件 + 执行要点」，不要各自维护重复逻辑。