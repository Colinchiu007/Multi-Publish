# Proposal: BGM 跳过提示单一来源（服务层 warnings 改机器码）

## Why

PR #466 审查 Minor7：`story2video-compose-engine.js` 的 `BGM_SKIP_WARNING_MESSAGES`（中文）与前端 `BGM_SKIP_REASON_TEXT`（zh/en）对同一组 `bgmSkippedReason` 码维护两份映射，新增码需同步两处，且引擎侧中文 `warnings` 无 renderer 消费者。收敛为单一来源：服务层只返回机器可读码，文案统一由前端 i18n 负责（满足原 W3「服务层不硬编码用户可见中文」）。

## What Changes

- `story2video-compose-engine.js`：`BGM_SKIP_WARNING_MESSAGES`（中文）→ `BGM_SKIP_WARNING_CODES`（`bgm_size_exceeded`/`bgm_format_unsupported`/`bgm_not_allowed`/`bgm_unreadable`），`data.warnings` 只含机器码字符串；`bgmSkippedReason` 仍是权威码，前端 i18n 唯一文案来源。
- `story2video-paths.js`：Minor9 注释明确 `_lastImportedMediaGcByBaseDir` 节流按 baseDir 且仅生产单目录场景成立。
- 规格：`story2video-bgm-reuse` 的「BGM 降级区分原因」Requirement 更新 warnings 语义（机器码，不含用户可见文案）。

## Capabilities

- **Modified Capabilities**: `story2video-bgm-reuse`（warnings 语义收敛）

## Impact

- 生产代码：`apps/desktop/electron/services/story2video-compose-engine.js`、`story2video-paths.js`（注释）
- 测试：`story2video-compose-engine.test.js`（warnings 断言改机器码）
- 无 DB schema 变更；renderer 契约不变（仍读 bgmSkippedReason）。
