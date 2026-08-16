## 方案

在 `Story2VideoProjectService` 内新增与既有 `_defaultVideoGenerator` 同源的 image 解析语义，复用一个纯函数 `_resolveImageGenerator(savedProvider, savedModel)`，在两个调用点（`retrySegment` image 分支、`generateSceneImage`）统一接入，避免在 service 层重复内联判断。

### 解析规则

```
saved 为空 → { providerId: '', model: '' }（老项目占位图语义不变）
manager 不可用 → { providerId: saved, model: savedModel }（透传，行为与原实现一致）
saved 可用 且 (非多模态 或 prefer_multimodal) → 原样复用（model 缺失时取 provider 默认模型）
saved 不可用 或 (多模态 且 关闭多模态优先) → getDefault('image')
    getDefault 有结果 → { providerId: default.id, model: _imageModelFor(default) }
    getDefault 无结果 → null → 调用方抛可读错误（fail closed，不回退占位图）
```

### 与流水线对齐

`story2video-stages.js` 的 `resolveCapabilityProvider('image')` 已走 `getDefault('image')`，其语义：
- `prefer_multimodal=true` 时返回声明 image 能力的多模态 provider；
- `prefer_multimodal=false` 时返回 `category='image'` 且 enabled + 有可用 Key 的 provider。

本次修复让历史任务图片重试/重生与新建流水线使用同一套解析来源，消除「创建时固化」与「当前设置」的偏差。userData 里 `model_providers` 行的 `is_configured` 已在 `_safeRow` 中按「enabled 且有可用 Key」计算，用作 saved 可用性判断。

### fail closed 选择

重新解析无默认时抛错而非回退占位图：用户关闭多模态优先却没有配置 image 类模型时，静默占位图会掩盖配置缺失；可读错误引导用户在「模型设置」补配置，与项目「失败如实暴露」系列合同（retry-error-transparency / QUOTA 归一化）一致。
