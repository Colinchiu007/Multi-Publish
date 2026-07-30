# 实施计划

## 决策记录

- 复杂度为 L+，风险为高，领域为 release-integration。
- antigravity 与 Claude 外部分析在用户批准后仍被租户安全策略拒绝；不绕过限制，改用两个本地隔离子代理独立复核。
- 两份本地复核均确认应先完成 scene/subtitles，再在更新后的 `main` 上整合 baseline。
- 仓库 QM-1 明确要求打包通过后才能提交，因此当前 merge commit 必须等 fresh 门禁完成。

## Phase 1：scene/subtitles 合并门禁

1. 固定 `HEAD`、`MERGE_HEAD`、净变更文件和 workspace junction 证据。
2. 使用 `C:\tmp` 下唯一目录重跑 coverage，绕开旧报告文件锁，不删除未知产物。
3. 将 Story2Video TypeScript 输出定向到隔离目录并完成真实类型/构建验证。
4. 使用临时 Python 依赖目录运行 `test_pipeline_loader.py`，不修改项目依赖。
5. 运行 Vue build，并复核 8002/8013 可用性；外部服务不可用时明确记录边界。
6. 执行 Windows x64 electron-builder；核对媒体工具锁与 SHA-256、ASAR 文件集、真实 RPA require、配置解析及隐藏启动 stderr。
7. 更新 fresh 门禁记录，精确暂存 CCG 文件和门禁文档，执行双独立审查。
8. 创建 merge commit，推送分支，创建 PR，等待 GitHub checks 全部完成后合并。

## Phase 2：desktop baseline 整合

1. 更新本地 `main` 到 scene PR 的合并提交。
2. 在 baseline 工作树合入最新 `main`，人工融合 updater 与文档冲突。
3. 运行 license、STT、updater 聚焦测试、桌面串行全量、coverage、fault、monkey、Vue 和 QM-1。
4. 双独立审查后提交、推送、创建 PR；等待 checks 成功后合并。

## Phase 3：归档与清理

1. 从最终 `main` 创建短期归档分支，将本任务移动到 `.ccg/tasks/archive/2026-07/` 并提交。
2. 合并归档提交，更新本地 `main`。
3. 删除已合并的本地/远端功能分支与已注册工作树，执行 `git worktree prune`。
4. 对未注册残留目录只在确认无 `.git`、无活动进程、无未交付文件后删除。
5. 最终确认 `main == origin/main`、仅主工作树、无目标开放 PR、无未提交或未推送分支。

## 回滚点与禁止事项

- 不执行 `git reset --hard`、`git checkout --` 或宽泛暂存。
- 不删除未知 coverage、dist、ASAR 或锁文件；优先使用隔离输出目录。
- 不复用其他工作树的 junction、构建产物或 merge 前 CI 作为当前交付证据。
- 不在 scene PR 合并前将 baseline 合入当前未提交 merge。
- 外部 8002/8013、真实 provider 和生产部署未执行时不得标记为通过。
