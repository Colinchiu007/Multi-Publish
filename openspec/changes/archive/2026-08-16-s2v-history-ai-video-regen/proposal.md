## Why

3.1.29 交付后，历史记录场景的「视频优化词」可编辑、可重新生成，但结果页既有【生成视频】按钮走 `generateSceneVideo`（图片动效渲染，**不消费 `videoPrompt`、不调用 AI 视频生成**），AI 视频生成此前只存在于流水线 generate_assets 阶段。用户需求「修改视频优化词后可重新生成视频」存在 **W4 真缺口**：修改/重新生成视频优化词后没有对应的 AI 视频重新生成消费路径。

目标：为历史记录场景补齐**分段级 AI 视频重新生成**——以 `videoPrompt`（缺省回退 `prompt`/`text`）为提示词，复用流水线同一 stages 契约（generateVideo 提交 → getVideoStatus 轮询 → http(s) 下载 → ffprobe 解码校验），成功后替换分段 `videoPath`/`videoMeta`，失败保留旧视频并回写失败态；随后用户仍走【保存分段】+【重新合成】整片重合成。

## What Changes

- **服务端 `generateSceneAiVideo(projectId, segmentId)`**（story2video-project-service.js）：提示词取 `videoPrompt || prompt || text`（`safeText` 20000 收敛，空则 fail-closed 不调生成器）；供应商取 `modelProviderManager.getDefault('video')`（multimodal 优先 `capability_models.video`）；尺寸按 `options.resolution`/`aspectRatio` 映射（长边封顶 1280，与流水线 `resolveVideoSize` 同源）；fps 默认 30；轮询间隔取 `options.video.pollIntervalMs`（缺省 10000）；时长复用 stages `estimateSceneSeconds`。复用 stages `generateSceneVideo`（W3/W5 守卫：错误终止态不空转、仅 http/https、probe 校验）。成功 `_copyRequired` 到项目目录（`<segmentId>_video_ai_<ts>.mp4`）替换 `videoPath` + `videoMeta={provider,model,source:'ai-video'}`，持久化后按引用集清理旧素材；失败保留旧视频、清理 attemptFiles、回写 `failed`+error 并上抛。stage 函数经构造器可注入（`generateSceneVideoStage`/`estimateSceneSecondsStage`）。
- **IPC/权益/preload/api**：新通道 `story2video:generate-scene-ai-video`（`withSenderCheck` + `isSafeId` 双参数 + 类型校验 + `_serializeProject` 同项目串行队列）；license-access-control 映射 `story2video_write`；`preload/publish.js` + 构建产物 `index.bundle.js` + `api/publisher.js` 同步。
- **渲染端 ResultView**：视频优化词区新增【生成 AI 视频】按钮（无 `videoPrompt` 禁用 + title 引导；busy 键 `aiVideo` 文案「AI 视频生成中...」）；重新生成前 `segmentsDirty` 时先【保存分段】（W3 语义）；成功整项目回写 + `refreshSegmentImageUrls` + 通知 `scene_ai_video_generated`；失败归一化通知 `scene_ai_video_generate_failed`。
- **文案**：locales zh/en 成对新增 `generateAiVideo/generatingAiVideo/aiVideoNeedsPromptHint`、`scene_ai_video_generated/generate_failed`；通知归一化新增 AI 视频失败模式（锚定于 PROMPT 模式之后，避免误归）。
- **测试**：服务层 5 用例（成功替换/回退/fail-closed×2/失败保留旧视频/multimodal+分辨率）、IPC 校验与队列断言、ResultView 交互、preload 计数与转发、notifications 中英文归一化。

## Capabilities

### New Capabilities
- `story2video-history-ai-video-regen`: 历史任务详情页场景「生成 AI 视频」的行为契约（提示词/供应商/尺寸解析、stages 复用、成功替换与失败回滚语义、IPC 校验、交互与文案、测试要求）。

### Modified Capabilities
- 无（3.1.29 的 `story2video-history-scene-edit` 行为保持不变；本 change 为其 W4 闭环补充消费路径）。

## Impact

- **代码**：`apps/desktop/electron/services/story2video-project-service.js`（+`parseOutputSize`/`_defaultVideoGenerator`/`_videoSize`）、`apps/desktop/electron/ipc-handlers/story2video.js`、`apps/desktop/electron/ipc-handlers/license-access-control.js`、`apps/desktop/electron/preload/publish.js`（+`index.bundle.js`）、`apps/desktop/src/api/publisher.js`、`apps/desktop/src/views/ResultView.vue`、`apps/desktop/src/locales/zh.js`、`apps/desktop/src/locales/en.js`、`apps/desktop/src/story2video/story2video-notifications.js`。
- **测试**：`story2video-project-service.test.js`、`ipc-handlers/story2video.test.js`、`preload.test.js`、`ResultView.test.js`、`story2video-notifications.test.js`、CI check-locale-sync。
- **文档**：`01-docs/PRD-video-creation.md`（3.1.29.1 小节＋迭代记录）、`CHANGELOG.md`、本 change 的 specs/design/tasks。
- **不涉及**：流水线阶段流（复用 stages 导出，不改动 stages 内部）、compose 引擎、Python sidecar、数据库、第三方服务契约。
