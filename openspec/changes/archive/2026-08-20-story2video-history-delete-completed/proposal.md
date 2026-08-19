## Why

视频创作历史把 Story2Video 项目和流水线运行记录合并展示，但删除操作依赖不同的身份字段和后端契约。状态历史重构后，已完成记录可能把流水线 id 当作项目删除键，最终由项目服务在当前 owner 索引中找不到对应项目并显示笼统的“项目未能删除”。

## What Changes

- 统一历史合并结果的项目/运行记录身份规则，确保只有真实项目记录进入项目删除分支。
- 保留纯流水线运行记录的 runId，使其走 pipeline:delete-run，不再把运行记录当作 Story2Video 项目删除。
- 对项目删除与运行记录删除分别增加 completed 场景、失败返回和持久化索引不匹配的回归保护。
- 删除失败时保留历史卡片，并继续使用稳定的本地化消息键。

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- story2video-history-browsing: 历史合并记录必须保留可执行删除所需的正确项目/运行身份，并按身份选择删除操作。
- story2video-history-error-messages: 删除失败必须对应正确的项目或运行记录错误消息，不能将身份错配伪装成项目删除失败。

## Impact

- Renderer: CreateView.vue, CreateViewHistory.vue, usePipelineHistory.js 及对应 Vitest 测试。
- Electron: Story2Video 项目删除与 pipeline run 删除 IPC 的集成测试；不改变路径安全或认证边界。
- 持久化: 不迁移既有项目数据；修复只避免错误删除目标，删除失败时不修改历史或项目索引。
