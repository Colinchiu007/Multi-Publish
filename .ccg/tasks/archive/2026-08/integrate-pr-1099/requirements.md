# PR 1099 整合需求

目标：让已经在真实 Electron 实例验证过的 PR 1099 修复可以基于最新 `origin/main` 合并并长期进入主线。

范围：

- 保留 PR 1099 两个业务提交的原始逻辑与测试，不重新实现 voice clone 修复。
- 同步最新 `origin/main`，只解决真实合并冲突。
- 修复 Doc Sync Gate 所需的最小产品文档记录。
- 推送 PR 分支并核对 CI、mergeable 与最终远端状态。

验收：

- `origin/main` 与 PR 分支无冲突。
- `scripts/check-docs-sync.sh --base=main --head=codex/fix-run-voice-clone-001` 通过。
- 业务文件 diff 只保留 PR 1099 原有变更。
- PR 1099 合并后核对 `origin/main` 包含修复提交；若无法合并，记录明确 remoteStatus。
