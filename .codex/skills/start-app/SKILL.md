---
name: start-app
version: 1.1.0
description: >
  用当前项目最新代码 + 已登录 profile 启动/重启 Multi-Publish 桌面应用。
  自动判断应用是否已在运行，区分「启动 / 重启 / 仅确认状态」三种场景。
  完整定义在 .agents/skills/start-app/SKILL.md。
tags: [launch, desktop, electron, dev, sync, profile, restart]
---

# 启动应用（Codex 入口）

> **本文件是 Codex 的轻量入口。完整定义见 `.agents/skills/start-app/SKILL.md`（单一事实源）。**
> 逻辑修改请改单一事实源，不要在本文件维护重复逻辑。

## 执行要点

1. **先探测应用是否在运行**（只读，不杀进程）：
   ```powershell
   Get-Process electron -ErrorAction SilentlyContinue | Select-Object Id,MainWindowTitle
   ```
   - 未运行 → 走启动流程。
   - 已在运行 + 用户说「重启」→ 直接执行（脚本自动停旧起新）。
   - 已在运行 + 用户只说「启动」→ **先询问**是否重启，避免丢会话状态。
   - 用户只问「在跑吗」→ 只报告状态，不执行停止/启动。

2. **同步最新（防旧代码启动）**：`git fetch origin` + 核对 `HEAD...origin/main` 落后数。
   - **仅落后** → `git merge --ff-only origin/main`
   - **分叉（本地领先 + 落后）** → ⚠️ `--ff-only` 必然失败，**必须**用 `git merge origin/main`
   - **合并后验证落后数必须为 0**，否则停止不启动（避免用旧代码）

3. **环境齐备**：`node scripts/ensure-desktop-deps.js --check`（缺失自愈）、确认 electron 二进制存在。

4. **带登录态启动**（推荐）：
   ```powershell
   pwsh -File scripts/start-desktop.ps1 -Worktree <工作区> -Profile 'D:\tmp\Multi-Publish-debug-profile' -CheckIdentity -Json
   ```

5. **验证**：`START_CONTRACT_OK` + 窗口 handle + identity 登录态。

完整流程、失败处理、Pitfalls 见 `.agents/skills/start-app/SKILL.md`。