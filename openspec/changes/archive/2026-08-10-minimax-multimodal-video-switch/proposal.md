# Proposal: MiniMax 多模态「支持生成视频」开关（默认关闭）

## Why

真实环境实证（2026-08-09/10，本机已登录 profile + 真实 provider）：

1. `minimax-multimodal` 预设声明 `capabilities: [llm, tts, image, video]`，开启「优先使用多模态模型」后，`ModelProviderManager.getDefault('video')` 总是返回 MiniMax（`_multimodalProviderFor('video')` 只看 capabilities 声明）；
2. 用户 MiniMax Key 为特殊套餐，**不支持视频生成**：`generateVideo` 请求 ~120ms 被拒绝，adapter 报 `Missing task_id in response`，videogen 流水线（animation / avatar-spokesperson / character-animation / hybrid）全部失败；
3. 用户显式配置的视频模型（`agnes-video`）被多模态优先抢占，无法通过 UI 让 video 默认落到 agnes——必须临时手工改 DB config 才能绕开，且重启会被 `_syncPresetCapabilities` 回填。

## What Changes

- MiniMax 多模态 provider 配置新增能力开关 `config.capability_enabled.video`（布尔），**默认关闭**；
- `_multimodalProviderFor('video')`：仅当 `capability_enabled.video === true` 时才把 MiniMax 视为 video 能力可用；缺省视为关闭；
- 模型设置页多模态表单新增「支持生成视频」开关（默认关），保存到 `config.capability_enabled.video`；llm/tts/image 能力不受影响（无开关，维持现状）；
- 同步 PRD（7.4.1 多模态合同）与相关文档。

## Capabilities

- **Modified Capabilities**: `model-multimodal`（多模态能力路由语义：video 能力由开关控制）

## Impact

- 生产代码：`apps/desktop/electron/services/model-provider-manager.js`；`apps/desktop/src/composables/useModelProviderCrud.js`；`apps/desktop/src/views/ModelProviders.vue`
- 测试：`apps/desktop/electron/services/model-provider-multimodal.test.js`、`apps/desktop/src/views/ModelProviders.test.js`
- 文档：`01-docs/PRD.md`（7.4.1）
- 无 DB schema 变更；行为变更仅限多模态 video 能力默认解析。
