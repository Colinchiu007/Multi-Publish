# story2video-history-ai-video-regen Specification

## Purpose
历史记录任务详情页（ResultView）为每个场景提供「生成 AI 视频」能力：以场景 `videoPrompt`（缺省回退 `prompt`/`text`）为提示词，复用流水线 stages 的 AI 视频生成契约（generateVideo 提交 → getVideoStatus 轮询 → http(s) 下载校验），成功后替换分段 `videoPath`/`videoMeta`，失败保留旧视频并回写失败态；随后经既有【保存分段】+【重新合成】整片重合成。

## ADDED Requirements

### Requirement: 提示词与服务前置校验（fail-closed）
`generateSceneAiVideo(projectId, segmentId)` SHALL：
- `projectId`/`segmentId` 通过 `isSafeId`（`[a-zA-Z0-9_-]{1,100}`）；分段不存在抛「分段不存在」；
- 提示词取 `safeText(segment.videoPrompt || segment.prompt || segment.text, 20000)`；全部为空时抛「该场景没有视频优化词，请先编辑或重新生成视频优化词」，**不调用生成器、不改动分段状态**；
- `modelProviderManager` 缺失或 `callAdapter`/`getDefault` 不可用 → 抛「AI 视频生成服务不可用，请在模型设置中启用视频供应商」；
- 默认 video 供应商解析失败 → 抛「未配置可用的视频供应商，请在模型设置中启用视频生成能力」。

#### Scenario: 无视频优化词
- **WHEN** 分段无 `videoPrompt`/`prompt`/`text` 时调用
- **THEN** 拒绝且生成器不被调用，分段状态不变

### Requirement: 供应商/尺寸/帧率解析
- 供应商：`_defaultVideoGenerator` SHALL 取 `manager.getDefault('video')`；`category==='multimodal'` 且 `capability_models.video` 为字符串时优先（不在 `models` 列表时仍可用该能力模型原值），否则取 `models[0]`；provider id trim 后必填，model 可为空串（stages 按 undefined 处理）。
- 尺寸：`_videoSize` SHALL 优先解析 `options.resolution`（`parseOutputSize`：`WxH`/`W×H`，160..4096，非法回退），否则按 `options.aspectRatio` 映射（16:9→1280x720、9:16→720x1280、1:1→1024x1024、4:3→1280x960、3:4→960x1280，未知回退 9:16），长边封顶 1280。
- 帧率：`options.fps > 0` 透传，否则 30；轮询间隔：`options.video.pollIntervalMs > 0` 透传，否则 10000ms；时长：`estimateSceneSeconds({duration}, options.defaultSceneDuration)`。

#### Scenario: multimodal 能力模型
- **WHEN** 默认 video 供应商为 multimodal 且声明 `capability_models.video`
- **THEN** 提交 generateVideo 使用该能力模型；`videoMeta.model` 同步记录

### Requirement: 生成、落盘与回滚语义
`generateSceneAiVideo` SHALL 复用 stages `generateSceneVideo`（generateVideo 提交 `{prompt, model, width, height, numFrames, frameRate}` → getVideoStatus 轮询 ≤10 分钟，provider `code<0`/`success=false`/状态 `failed|error|cancelled` 立即终止 → http(s) 下载 ≤5 重定向与字节上限 → ffprobe 解码校验）：
- 成功：`_copyRequired` 复制到项目目录 `<segmentId>_video_ai_<ts>.mp4`，替换 `videoPath`，`videoMeta={provider, model, source:'ai-video'}`，`status='completed'`，持久化后 `_cleanupUnreferencedProjectFiles` 按引用集删除旧视频；
- 失败（stage 返回 `success:false` 或异常）：保留旧 `videoPath`、清理本次 attemptFiles、回写 `status='failed'` + `error`、异常上抛（不吞错）。
- stage 函数经构造器可注入（`generateSceneVideoStage`/`estimateSceneSecondsStage`），生产缺省为 stages 导出。

#### Scenario: 生成成功
- **WHEN** 生成器返回有效视频 URL 且下载/解码校验通过
- **THEN** 分段 videoPath 指向项目目录内新文件，videoMeta 记录 provider/model/source='ai-video'，旧视频文件被清理

#### Scenario: 生成失败
- **WHEN** 提交/轮询/下载/校验任一失败
- **THEN** 旧 videoPath 保留，分段回写 failed+error，本次产物清理

### Requirement: IPC 与权限
`story2video:generate-scene-ai-video` SHALL：`withSenderCheck`（不可信 sender 拒绝）+ `isSafeId` 双参数 + 参数类型校验（非法返回 `VALIDATION_ERROR`）；执行经 `_serializeProject` 同项目串行队列；license-access-control 映射 `story2video_write`。preload `story2videoGenerateSceneAiVideo` 透传并重建 `index.bundle.js`；`api/publisher.js` 同步导出。

#### Scenario: 不可信调用来源
- **WHEN** 非可信 sender 调用该通道
- **THEN** 返回未授权错误，服务方法不被调用

### Requirement: 渲染端交互与文案
ResultView SHALL 在视频优化词操作行提供【生成 AI 视频】按钮（`data-testid="generate-ai-video-button"`）：
- 场景 busy 或 `segment.videoPrompt` 为空时禁用；空提示词时按钮 title 显示「请先编辑或重新生成视频优化词，再生成 AI 视频」；
- busy 键 `aiVideo`，文案切换「AI 视频生成中...」；`anySegmentBusy` 联动禁用全局【保存分段】【重新合成】；
- 执行前 `segmentsDirty` 时先保存分段（W3 语义）；成功整项目回写 + `refreshSegmentImageUrls` + 通知 `story2video.scene_ai_video_generated`；失败通知 `story2video.scene_ai_video_generate_failed`。
- 全部新文案写入 locales zh/en 成对（`generateAiVideo/generatingAiVideo/aiVideoNeedsPromptHint`、`scene_ai_video_generated/generate_failed`）；渲染端不得新增中文字面量。

#### Scenario: 空提示词禁用
- **WHEN** 分段无 videoPrompt
- **THEN** 按钮禁用并显示引导 title，点击不触发 IPC

#### Scenario: 生成成功/失败反馈
- **WHEN** 生成成功/失败
- **THEN** 分别提示 scene_ai_video_generated / scene_ai_video_generate_failed（失败含归一化：无法生成 AI 视频/未配置可用的视频供应商/AI 视频生成服务不可用/视频生成（调用失败|任务失败|未返回任务|超时或失败|下载超过|文件无法解码|任务状态为）/ai video.*(fail|unavailable|invalid)，匹配顺序在 SCENE_PROMPT_REGENERATE_FAILED 之后）

### Requirement: 测试要求
- 服务层（story2video-project-service.test.js「AI 视频重新生成（W4）」）：成功替换 videoPath/videoMeta + 旧素材清理 + stages 调用参数（providerId/model/prompt/size/fps/manager 透传）；videoPrompt 缺省回退 prompt；无文案 fail-closed 不调生成器且状态不变；未配置供应商/服务不可用 fail-closed；失败保留旧视频 + 回写 failed + 清理本次产物；multimodal 能力模型 + resolution 尺寸解析。
- IPC（story2video.test.js）：不可信来源/非法 id 拒绝且不调服务；成功路径经 `_serializeProject`（断言 6 次包裹 + 参数透传）。
- ResultView.test.js：按钮渲染/禁用/引导 title；成功通知 + 预保存 + 分段回写；失败归一化通知。
- preload.test.js：`story2videoGenerateSceneAiVideo` 通道转发；数量断言 100 / 290 / 88。
- notifications：中英文 AI 视频失败归一化（未配置可用的视频供应商 / 视频生成调用失败 / ai video generation failed）。
- locale：zh/en 成对 + check-locale-sync；preload bundle 含新通道行。
