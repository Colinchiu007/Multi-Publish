## Why

在模型设置中将 OpenRouter 这类普通文字推理 provider 设为默认后，界面会提示成功，但一个遗留的多模态全局默认标记仍可优先劫持文字推理路由。这让用户无法从卡片状态确认实际默认模型，并可能继续使用错误的 provider。

基线差异审计（`origin/main`，2026-08-24）：当前主线尚未包含该修复；问题由 `9d7fa58fc` 的“多模态模型按能力设置默认”改造引入，待办仅限默认解析与状态一致性，不重复规格化已交付的多模态能力选择功能。

## What Changes

- 普通能力 provider 被设为默认时，清除同一能力上多模态 provider 的默认资格，包括遗留的全局多模态默认标记。
- 将被覆盖的多模态全局默认规范化为其余能力的显式默认，避免文字推理覆盖意外取消 TTS、图片或视频等独立能力。
- 保证持久化后的文字推理默认、列表中的 `is_default` 状态与设置页重新加载后的卡片样式指向同一 provider。
- 为普通 LLM 覆盖多模态文字推理默认的顺序，以及 renderer 列表刷新，增加回归测试。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `model-multimodal`: 明确普通能力默认与多模态能力默认的互斥和路由优先级。

## Impact

- `apps/desktop/electron/services/model-provider-manager.js`
- `apps/desktop/electron/services/model-provider-multimodal.test.js`
- `apps/desktop/src/composables/useModelProviderCrud.test.js`
- 模型设置中的默认状态展示与文字推理默认路由；不新增 API 或依赖。
