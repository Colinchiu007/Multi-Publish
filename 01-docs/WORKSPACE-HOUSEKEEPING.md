# 工作区 / Worktree / 分支治理 SOP（2026-08-09 建立）

> 背景：2026-08-09 全面梳理后，回收 8 个 worktree、18 个本地分支、9 个远程分支，
> 并清理 C:\tmp 历史残留约 17.6GB（C 盘剩余从 7.9GB 恢复到 25.5GB）。
> 本文固化回收流程与目录约定，防止再次堆积。

## 一、Worktree 生命周期（四同步）

任务从合并到回收必须完成 **4 个同步动作**（合并 PR 后执行）：

1. **规格同步**：OpenSpec archive（openspec/changes → archive）
2. **CCG 归档**：`.ccg/tasks/<task>` → `.ccg/tasks/archive/<yyyy-mm>/`
3. **worktree 回收**：`git worktree remove <path>`（dirty 时先确认是行尾噪音/构建产物等可丢弃内容，再 `--force`；残留目录用 `rm -rf` 清理，路径必须已在 `git worktree list` 中解除注册）
4. **分支回收**：`git branch -d <branch>`（已合并）+ `git push origin --delete <branch>`（已合并 PR 的 head，删除前用 `gh pr list --state merged` 核对）

## 二、目录约定

| 位置 | 用途 | 生命周期 |
|------|------|---------|
| `C:\tmp\Multi-Publish-<task>` | 隔离 worktree | 合并后立即回收（四同步第 3 步） |
| `C:\tmp\multi-publish-tmp\<task>/` | 一次性调试产物/日志/临时 profile | 任务归档时连同删除 |
| `C:\tmp\Multi-Publish-debug-profile` | **已登录调试 profile**（含登录态） | 永久保留，绝不删除 |
| `E:\Multi-Publish-builds\` | 打包/构建产物 | 旧版本构建（非当前 source）随版本归档清理 |
| `E:\Multi-Publish-builds\main-<sha>-source` | 注册 worktree（构建源） | 保留 |

## 三、清理判定规则

- **可回收**：分支已合并进 `origin/main`（`git branch --merged origin/main`）+ 无未推送提交（非 `ahead`）+ 远程 PR 已 merged。
- **保留**：`ahead`（本地有未推送提交）、并发会话当前分支、已登录 profile、验收证据（截图/报告目录，如 `yixiaoer-gui-e2e-ci-artifacts`、`worktree-evidence-backup-*`）、当前交付 worktree。
- **行尾噪音**：`packages/ai-writer/src/cli.js`、`packages/api-publish-engine/bin/publish-api` 等在所有 worktree 中恒为 `M` 的是 EOL 差异（非真实改动），归档时可直接丢弃；删除前用 `git diff` 确认。

## 四、磁盘告警

- C 盘剩余 < 10GB 时执行一次全量清理（worktree 残留 + `C:\tmp` 临时产物）。
- 打包产物默认落 `E:\Multi-Publish-builds`，不堆 C 盘。

## 五、启动脚本与已知环境差异

- **启动脚本**：`scripts/launch-worktree.js`（收编自 `C:\tmp\launch-worktree-4k.js`）——以指定 worktree + 已登录 profile 启动桌面应用；参数 `--worktree/--profile/--cdp/--backend-port/--prompt-port/--splitter-port/--dev-server-port/--callback-port/--env-file`；macOS 前瞻（electron 可执行路径按平台解析）。用法：`node scripts/launch-worktree.js --env-file /d/Data/projects/prompt-engine/.env`。
- **已知环境差异（worktree junction 双模块实例）**：worktree 的 `node_modules/@multi-publish/*` 指向主仓库 packages（junction），导致 `@multi-publish/ai-writer` 解析到主仓库副本、而 `ai-writer-flow.integration.test.js` 直连本 worktree 副本 → 本地全量测试 1 例 `instanceof AiWriter` 失败（主仓库原生路径与 CI 全绿，非代码 bug）。根治工具：`scripts/fix-worktree-node-modules.sh`（停应用 → 删 junction → 独立 `npm install` → 验证解析）；默认保留 junction 并记录差异。

## 六、常用命令

```bash
# 盘点
git worktree list
git branch --merged origin/main        # 可回收本地分支
git branch -r                          # 远程分支
gh pr list --state merged --limit 60 --json number,headRefName   # 已合并 PR 的 head

# 回收（示例）
git worktree remove --force C:/tmp/Multi-Publish-<task>
git branch -d codex/<task>
git push origin --delete codex/<task>
```
