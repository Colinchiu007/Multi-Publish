## Why

运行 run_1787360004146_izko 使用 legacy Python TTS 后端时，音色失效会触发本地样本重克隆，但重克隆成功后的重试回调错误地固定调用不存在的 assetGenerator。因此“样本存在且重新克隆成功”仍会以原始音色错误结束。

昨天的 d2b1b31dc 已经交付 MiniMax 业务错误 fail-closed 以及禁止静默切官方音色；本 change 只补齐遗留的 TTS 后端选择，不重复实现已交付逻辑。

## What Changes

- 让 generate_assets 和 finalize_assets 的重克隆回调复用初次 TTS 的后端选择。
- 增加 legacy serviceBus 重克隆成功回归测试，并保留 fail-closed 回归。

## Capabilities

### Modified Capabilities

- story2video-voice-clone-retry

## Impact

- 修改 apps/desktop/electron/services/story2video-stages.js。
- 修改该服务的 Vitest 测试。
- 不修改数据库、provider API 合同或用户音色 registry 数据。
