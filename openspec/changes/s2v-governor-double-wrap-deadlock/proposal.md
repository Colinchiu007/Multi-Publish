## Why

2026-08-10 用户反馈：图片轮播流水线运行到「生成图片与旁白」阶段后永久卡住。真实模块复现确认根因：`story2video-stages.js` generate_assets 在阶段外层用 `modelCallScheduler.withModelBudget` → `governor.run` 包裹每项图片/TTS 调用，而 `AIGenerator.generate` 内部又用**同一个 ApiUsageGovernor 单例**对**同一 key（providerId:type:model）**做第二次 `governor.run`。并发 ≥2 时（默认 maxConcurrent=2），外层占满并发信号量，内层排队等待自己占用的槽位 → 自死锁；`StageExecutor._safeRun` 无阶段超时，`sweepAll` 只在 run 终态调用，死锁期间无人回收 → 阶段永不结束，前端「图片 0/N · 旁白 0/M」停滞。

## What Changes

- `story2video-stages.js`：generate_assets 调度边界收敛——assetGenerator 路径（生产）已由 AIGenerator.generate 内部 governor 单层调度，阶段外层不再套 `withModelBudget`/`governor.run`（避免同 key 双包）；仅 legacy python 路径（无 assetGenerator）保留外层统一调度。
- `api-usage-governor.js`（预防措施）：`run()` 增加**同 key 重入保护**——用 AsyncLocalStorage 记录当前 async 调用链已持有的 key 集合，同 key 内层 run 直接透传执行（外层已负责槽位/节奏/冷却/重试/记账），从根上杜绝「在已 governor 化的调用上再叠一层」的自死锁；`_pump` 放行排队 waiter 时做**槽位转移**（active+=1），修复排队后 active 漂移为负的记账缺陷。
- 回归保护测试：api-usage-governor 同 key 嵌套重入透传 / 不同 key 独立调度 / 记账归零；story2video-stages assetGenerator 路径不套外层 governor、legacy 路径保留外层调度、真实 governor 3 场景并发有界完成（旧代码 10s 超时失败已负向验证）。
- 文档：learnings.md Bug 复盘、CHANGELOG.md。

## Capabilities

### Modified Capabilities
- `story2video/model-call-scheduler`: 调度边界单层收敛 + 网关同 key 重入保护 + 排队槽位记账修正（增量合同）。

## Impact

- `apps/desktop/electron/services/story2video-stages.js`（调度边界）
- `apps/desktop/electron/services/api-usage-governor.js`（重入保护 + 槽位转移）
- 测试：`api-usage-governor.test.js`（+2）、`story2video-stages.test.js`（+2 修改 1）
- 文档：`01-docs/learnings.md`、`CHANGELOG.md`
