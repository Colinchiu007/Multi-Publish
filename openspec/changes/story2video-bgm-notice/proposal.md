# Proposal: BGM 跳过前端提示接线 + GC 惰性触发 + API-Key 正则拆分

## Why

PR #460/#464 之后：compose 已把 BGM 降级原因写入 `run.context.compose`（`bgmSkipped`/`bgmSkippedReason`），且 `pipeline:getRunContext` 快照已透传 context——但前端没有任何消费者，用户「选了 BGM 却被跳过」时完全无感知；同时 BGM 警告文案在服务层为中文硬编码（i18n 缺口）。另有两条审查 Info 待闭环：`gcImportedMedia` 仅启动一次（长会话内无界增长）、`MODEL_API_KEY_PATTERN` 单条正则过复杂难维护。

## What Changes

- `story2video-notifications.js`：新增 `BGM_SKIPPED` 通知 key（zh/en）+ `bgmSkippedReasonText(reason, locale)`（size_exceeded/format_unsupported/not_allowed/unreadable → 本地化原因）+ `formatBgmSkippedNotification(reason, locale)`；`MODEL_API_KEY_PATTERN` 拆分为命名子模式（UNCONFIGURED/MISSING/DECRYPT）再组合，行为不变。
- `CreateView.vue`：从 `orchestrationContext?.compose` 读取 BGM 跳过状态，完成态显示可关闭提示条（i18n 文案，`data-testid="story2video-bgm-skipped-notice"`），新运行/已恢复后重置。
- `story2video-paths.js`：`importUserSelectedMedia` 惰性触发 `gcImportedMedia`（默认间隔 1h，可注入 `gcIntervalMs`），长会话内老化回收不再只靠启动一次。
- 回归测试：通知 4 原因中英映射 + key 目录完整性、CreateView 提示条显示/隐藏/关闭、GC 惰性触发/间隔节流。

## Capabilities

- **Added Capabilities**: `story2video-bgm-notice`
- **Modified Capabilities**: `story2video-bgm-reuse`（降级结果前端消费）、`story2video-media-import-feedback`（GC 惰性 + 正则拆分）

## Impact

- 生产代码：`src/story2video/story2video-notifications.js`、`src/views/CreateView.vue`、`electron/services/story2video-paths.js`
- 测试：`notifications.test.js`、`CreateView.test.js`、`story2video-paths.test.js`
- 无 DB schema 变更；compose data 契约已存在（`bgmSkippedReason`），仅新增消费者。
