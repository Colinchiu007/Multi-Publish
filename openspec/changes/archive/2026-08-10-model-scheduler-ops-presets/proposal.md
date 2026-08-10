## Why

视频创作模块（Story2Video）目前调用模型的方式分散：`story2video-stages.js` 的 generate_assets 使用自实现的 `_mapWithConcurrency(concurrency=3)` 并行生成图片/TTS，未接入统一的并发/限流/排队网关；限流预算来自静态表（governor-provider-limits.js），运营后台配置的「每分钟连接次数/5小时限额次数」无法影响桌面端调用行为。用户要求把模型调用方法提炼为单独机制，依据前端设置的默认模型与运营后台配置的每分钟连接次数合理安排并行数量与排队。

## What Changes

- 新增 `model-call-scheduler.js`：统一调度封装（withModelBudget / resolveProviderBudget / mapWithModelBudget），复用既有 ApiUsageGovernor（并发信号量 + RPM 滑动窗口排队 + 429 冷却重试 + 5h token 额度窗口）。
- model provider 配置新增 `rate_per_minute`（每分钟连接次数）与 `limit_per_5h`（5小时限额次数）：种子预设补充、表单可编辑（可空）、ModelProviderManager 初始化/更新时把预算注入 governor（setProviderLimits + setTokenWindows）。
- story2video generate_assets 图片/TTS 并行生成改为按 provider 预算调度（上限 = min(请求并发, provider maxConcurrent)），无配置时回退原逻辑。
- 前端 ModelProviders.vue 展示/编辑限流字段，提示允许为空。

## Capabilities

### New Capabilities
- `story2video/model-call-scheduler`: 视频创作模块统一的模型调用调度机制（并发/排队/限流预算来源与联动）。

### Modified Capabilities
（无既有 spec 行为变更）

## Impact

- `apps/desktop/electron/services/model-call-scheduler.js`（新增）
- `apps/desktop/electron/services/model-provider-manager.js`（预算注入）
- `apps/desktop/electron/services/model-provider-seeds.js`（种子字段）
- `apps/desktop/electron/services/story2video-stages.js`（generate_assets 预算联动）
- `apps/desktop/src/views/ModelProviders.vue`（限流字段表单）
- 测试：model-call-scheduler.test.js、model-provider-manager 预算注入、story2video generate_assets 预算联动
- 文档：01-docs/PRD.md、01-docs/CHANGELOG.md、learnings.md
