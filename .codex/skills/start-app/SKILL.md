---
name: start-app
version: 1.2.0
description: >
  用当前项目最新代码 + 共享数据（shared-user-data 锚点）启动/重启 Multi-Publish 桌面应用。
  支持 Windows 与 WSL（Ubuntu-E）双环境，默认启动 WSL 环境的应用。
  自动判断应用是否已在运行，区分「启动 / 重启 / 仅确认状态」三种场景。
  完整定义在 .agents/skills/start-app/SKILL.md。
tags: [launch, desktop, electron, dev, sync, profile, restart, wsl, windows]
---

# 启动应用（Codex 入口）

> **本文件是 Codex 的轻量入口。完整定义见 `.agents/skills/start-app/SKILL.md`（单一事实源）。**
> 逻辑修改请改单一事实源，不要在本文件维护重复逻辑。

## 执行要点

1. **先判定环境（默认 WSL）**：`uname -s` → Linux 走 WSL 脚本（`scripts/start-desktop-wsl.sh`），Windows 走 `start-desktop.ps1`。不指定默认 WSL。

2. **先探测应用是否在运行**（只读，不杀进程）：
   ```bash
   ps aux | grep electron | grep -v grep     # WSL
   # 或 Get-Process electron（Windows）
   ```
   - 未运行 → 走启动流程。
   - 已在运行 + 用户说「重启」→ 直接执行（脚本自动停旧起新）。
   - 已在运行 + 用户只说「启动」→ **先询问**是否重启，避免丢会话状态。
   - 用户只问「在跑吗」→ 只报告状态，不执行停止/启动。

3. **同步最新（防旧代码启动）**：`git fetch origin` + 核对 `HEAD...origin/main` 落后数。
   - **仅落后** → `git merge --ff-only origin/main`
   - **分叉（本地领先 + 落后）** → ⚠️ `--ff-only` 必然失败，**必须**用 `git merge origin/main`
   - **合并后验证落后数必须为 0**，否则停止不启动（避免用旧代码）
   - ⚠️ **共享主工作区脏文件多时（其他会话在用）**：**绝不在共享主工作区做 git 写操作**（stash/merge/checkout），改用**隔离 worktree** 启动。详见单一事实源「0a/0b」。

4. **WSL 启动（默认）**：
   ```bash
   bash /mnt/d/Data/projects/Multi-Publish/scripts/start-desktop-wsl.sh
   # 依赖 Linux 依赖树 ~/mp-wsl-deps/mp-wsl + 持久库 ~/mp-wsl-deps/electron-libs
   # 共享 userData 由脚本显式传 --user-data-dir 指向 shared-user-data
   ```
   - 端口被占用时：`MP_VITE_PORT=5175 MP_CDP_PORT=9224` 覆盖。

5. **Windows 启动（显式指定时）**：
   ```powershell
   pwsh -File scripts/start-desktop.ps1 -Worktree <工作区> -Profile 'D:\tmp\Multi-Publish-debug-profile' -CheckIdentity -Json
   ```
   - 端口被无关 Chrome 占用（9222）时：`$env:MP_VITE_PORT="5175"; $env:MP_CDP_PORT="9224"` 覆盖。
   - 同 profile 被其他 worktree 占用时：加 `-StopForeignProfile`。

6. **验证**：窗口出现（WSL 看 CDP `/json/list`，Windows 看窗口 handle）+ identity 登录态。

完整流程、失败处理、Pitfalls 见 `.agents/skills/start-app/SKILL.md`。