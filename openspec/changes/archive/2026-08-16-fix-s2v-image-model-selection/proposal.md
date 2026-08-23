## Why

用户在「设置-模型设置」中取消勾选「优先使用多模态模型进行所有的AI操作」（`prefer_multimodal`）并添加了专用生图模型（agnes image），但视频创造-历史记录中进入任务编辑后点击【重试图片】/【重生图片】仍调用任务创建时固化的多模态 provider（MiniMax，用户 Key 套餐已失效）→ 弹「模型 API 的额度或余额已用完」。期望是关闭多模态优先 + 已有生图模型时，历史任务图片重试走当前 image 默认（agnes image）。

根因：`Story2VideoProjectService.retrySegment`（image 分支）与 `generateSceneImage` 直接将任务创建时固化的 `project.options.imageProvider/imageModel` 透传给 `assetGenerator.generateImage`，从不按当前设置重新解析；而 `project.options` 由 `saveRun`→`_safeOptions(run.params)` 白名单固化，创建时 `listProviders('image')` 把声明了 image 能力的多模态行并入下拉且默认选中第一个，导致固化成了 `minimax-multimodal`。真正按设置解析的只有新流水线 `story2video-stages.js` 的 `resolveCapabilityProvider('image')`（走 `getDefault('image')`）。

## What Changes

- `story2video-project-service.js` 新增 `_resolveImageGenerator(savedProvider, savedModel)`，在 `retrySegment(mode='image')` 与 `generateSceneImage` 调用 `generateImage` 前按当前设置解析目标 provider+model：
  - 保存值缺失（老项目）→ 返回空 provider/model（透传，`asset-generator` 离线占位图语义不变）；
  - manager 不可用 → 原样透传保存值；
  - 保存的是多模态 provider 且 `prefer_multimodal !== true`，或保存的 provider 已删除/禁用/未配置 → 改走 `modelProviderManager.getDefault('image')`（关闭多模态优先时返回 image 类别 provider），模型取 `capability_models.image` 或 `models[0]`；
  - 其余情况（显式 image provider、多模态优先仍开启）→ 原样复用保存值。
  - 重新解析后无可用 image 默认 → 返回 null，调用方抛可读错误「未找到可用的图片生成器，请先在『模型设置』中配置并启用支持图片生成的模型」，不再回退占位图。
- 回归测试：`story2video-project-service.test.js` 新增 6 用例（关多模态改默认 / 开多模态保留 / 显式 image provider 保留 / 无默认明确报错 / 老项目空透传 / generateSceneImage 同逻辑）。

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `story2video-image-model-selection`：历史任务图片重试/重生成的目标 provider 解析——任务固化值仅在仍符合当前设置（多模态优先或显式 image provider 且仍配置可用）时复用，否则按当前 image 默认重新解析；无默认 fail closed。

## Impact

- `apps/desktop/electron/services/story2video-project-service.js`（两处 image 调用前解析 + 3 个解析函数）
- `apps/desktop/electron/services/story2video-project-service.test.js`（+6 回归用例）
- 不涉及 IPC 契约、不涉及数据库结构、不涉及 locale；真实生图验证会消耗用户生图模型额度（由用户确认后执行）。
