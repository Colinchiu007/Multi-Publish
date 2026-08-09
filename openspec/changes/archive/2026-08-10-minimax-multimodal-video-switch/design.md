# Design: MiniMax 多模态「支持生成视频」开关

## 目标

让 MiniMax 多模态模型对 video 能力的声明由用户开关控制（默认关），从而：
- 开启「优先使用多模态模型」时，video 默认解析不再被 MiniMax 抢占 → 回落显式视频模型（如 agnes-video）；
- 用户可在设置页显式开启 MiniMax 视频生成（若套餐支持）。

## 方案

### 1. 配置载体

`model_providers.config` 增加 `capability_enabled: { video: boolean }`：
- 缺省（无该字段）→ video 视为关闭（向后兼容现有用户，符合「默认关」）；
- `capability_enabled.video === true` → MiniMax 多模态对 video 能力可用。

llm / tts / image 能力无开关，维持 `capabilities.includes(category)` 语义（不受影响）。

### 2. 后端路由（model-provider-manager.js）

`_multimodalProviderFor(category)`：当 `category === 'video'` 时额外要求
`config.capability_enabled?.video === true`，否则跳过该多模态 provider。

`_syncPresetCapabilities` 只合并 `capabilities` / `capability_models`，**不**回填/覆盖 `capability_enabled`（用户开关优先）。

### 3. 前端（useModelProviderCrud.js + ModelProviders.vue）

- 新增响应式访问器 `multimodalVideoEnabled`（get/set）：读写 `form.config.capability_enabled.video`，缺省 false；
- 多模态表单（`form.category === 'multimodal'` 且预设声明 video 能力）显示「支持生成视频」开关；
- 提交（create/update）时把 `form.config.capability_enabled` 一并提交；新建 minimax-multimodal 默认 false。

### 4. 文档

`01-docs/PRD.md` 7.4.1 补充开关合同：默认关闭、能力路由语义、验收标准。

## 备选方案（不采用）

- 直接删掉预设 `capabilities` 中的 video：会丢失「目录声明」，且 `_syncPresetCapabilities` 会回填，无法持久；
- 改预设 seeds 默认：同样被回填逻辑覆盖，且无法表达用户级开关。
