## Why

结果页/历史编辑页的分段状态徽标直接输出英文原值（`failed` / `completed` / `processing`），失败分段不展示任何原因；分段 `error` 虽已持久化，但成功写回后不清理，形成「completed 却残留失败原因」的数据误导。用户无法判断失败来自欠费、模型参数不支持、API Key 无效还是服务波动，也不知道下一步该做什么。

## What Changes

- 分段状态徽标改为本地化标签（完成/失败/生成中），不再渲染英文原值
- `status=failed` 的分段内联展示一行可读原因：复用既有通知归一化（quota/rate-limit/API Key/参数不支持等分类），未命中回退通用文案，并截断避免撑爆布局
- 主进程所有把分段写为 `completed` 的素材路径（图片/视频/音频/优化词等）清除 `error` 字段；`failed` 路径保持写入 `error`（既有契约）
- `apps/desktop/src/locales/{zh,en}.js` 成对新增分段状态与失败原因文案

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `story2video-retry-error-transparency`: 扩展失败原因端到端契约——(1) 分段成功写回须清除失败痕迹，禁止 `completed` 与 `error` 并存；(2) 分段卡片内联展示本地化状态标签与失败原因

## Impact

- 渲染层：`apps/desktop/src/views/ResultView.vue`
- 文案：`apps/desktop/src/locales/{zh,en}.js`
- 主进程：`apps/desktop/electron/services/story2video-project-service.js`（成功路径清 `error`）
- 测试：`ResultView.test.js`（标签/原因行/残留 error 不显示失败）、`story2video-project-service.test.js`（成功清 error、失败保留 error）
- 无 IPC/存储契约变更，无需数据迁移

## 基线差异审计

- 已交付：任务级历史「失败阶段 + 错误摘要」与重试失败 toast 归一化（`story2video-retry-error-transparency` 既有 requirement、`CreateViewHistory.vue`、PR #878/#894）
- 待办：分段内联本地化状态/失败原因、成功路径 `error` 清理（本 change 承载）