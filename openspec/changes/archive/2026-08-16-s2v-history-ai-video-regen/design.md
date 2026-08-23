# Design — Story2Video 历史场景 AI 视频重新生成（W4 闭环）

## 架构决策
- **复用而非重写**：AI 视频生成的提交/轮询/下载/校验全部复用 `story2video-stages.generateSceneVideo`（与流水线 generate_assets 同一契约），服务层只做参数装配、产物落盘与项目状态管理，保证历史记录重新生成的视频质量/安全守卫与新建流水线一致。
- **依赖注入**：`generateSceneVideoStage`/`estimateSceneSecondsStage` 经构造器可注入（缺省为 stages 导出），单测隔离、生产装配不变（phase1-context 已注入 `modelProviderManager`）。
- **双按钮并存**：【生成视频】（图片动效渲染，无供应商兜底）与【生成 AI 视频】（消费 videoPrompt）并存，最新一次生成替换 video 槽。
- **失败保留旧素材**：与 regenerateSceneAudio 同语义——失败不清空旧 videoPath，仅回写 `failed` 状态供用户感知。

## 服务层（story2video-project-service.js）
1. `generateSceneAiVideo(projectId, segmentId)`：
   - 深拷贝 previousProject；`_assertId(segmentId)`；分段不存在 → 抛「分段不存在」。
   - 提示词：`safeText(segment.videoPrompt || segment.prompt || segment.text, 20000)`；空 → 抛「该场景没有视频优化词，请先编辑或重新生成视频优化词」（前置校验，不改状态）。
   - 服务可用性：`modelProviderManager.callAdapter/getDefault` 缺失 → 「AI 视频生成服务不可用…」；`_defaultVideoGenerator` 为空 → 「未配置可用的视频供应商…」。
   - 参数：`estimateSceneSecondsStage({duration}, options.defaultSceneDuration)`；`_videoSize(options)`（resolution 解析 → aspectRatio 映射，长边封顶 1280）；`fps = options.fps > 0 ? options.fps : 30`；`pollIntervalMs = options.video.pollIntervalMs > 0 ? … : 10000`；`runDir = tmpdir/story2video/videoscenes/history_<projectId>`。
   - 成功：`_copyRequired(outcome.path, destination)` → 替换 `videoPath`/`videoMeta`/`status='completed'` → `_upsertProject` → `_cleanupUnreferencedProjectFiles`（旧视频按引用集删除）。
   - 失败：回写 `{...previous, status:'failed', error}`（保留旧 videoPath）；`_upsertProject` 失败仅 warn；`_cleanupProjectFiles(attemptFiles)`；throw。
2. `parseOutputSize(value)`：`/^\s*(\d{2,5})\s*[xX×]\s*(\d{2,5})\s*$/`，160..4096，非法返回 null。
3. `_defaultVideoGenerator(manager)`：`getDefault('video')`；`category==='multimodal' && capability_models.video` 优先（models 含则用之，否则用能力模型原值）；否则 `models[0]`；provider id trim 后必填。
4. `_videoSize(options)`：resolution 解析优先；aspectRatio 映射 16:9/9:16/1:1/4:3/3:4（缺省 9:16）；长边封顶 1280（下限 160）。

## IPC/preload/api
- `story2video:generate-scene-ai-video`：`withSenderCheck` + `isSafeId(projectId/segmentId)` + 对象校验 → `_serializeProject(projectId, () => service.generateSceneAiVideo(...))`；错误 `VALIDATION_ERROR` / `REQUEST_ERROR`。
- `license-access-control.js`：映射 `story2video_write`（与同级生成通道一致）。
- `preload/publish.js` + `build:preload` 产物；`api/publisher.js` `story2videoGenerateSceneAiVideo`。

## 前端 ResultView
- 模板：视频优化词操作行新增【生成 AI 视频】UiButton（`data-testid="generate-ai-video-button"`；`:disabled="isSegmentBusy(id) || !segment.videoPrompt"`；空提示词 `:title` 引导文案；busy 文案切换）。
- 方法 `generateSceneAiVideo(segmentId)`：`segmentsDirty && !(await saveSegments())` → return；`segmentBusy[id]='aiVideo'`；IPC 成功 → 整项目回写 + `segmentsDirty=true` + `refreshSegmentImageUrls()` + 成功通知；失败 → 归一化失败通知；finally 清 busy。
- busy 联动：`anySegmentBusy` 禁用全局【保存分段】【重新合成】（既有 W2 语义）。
