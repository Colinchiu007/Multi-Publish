# story2video-history-scene-edit Specification

## Purpose
历史任务详情页（ResultView）每个场景支持对文案、字幕、语音、图片/视频优化词、图片、视频的修改与重新生成，并在历史详情弹窗显式提供「编辑并重新合成」整片重合成入口。全部复用既有 pipeline/compose/asset/TTS/prompt-engine 能力，不重跑流水线。

## ADDED Requirements

### Requirement: 分段数据模型扩展
每个 segment SHALL 持久化以下字段（`_persistComposeArtifacts` 与 `saveRun` 输出）：
- `subtitleBlocks: Array<string>`（已有，≤200 项、每项 ≤500 字符）；
- `subtitleTimeline: Array<{index,text,startTime,endTime,duration}>`（已有，派生数据）；
- `videoPrompt: string|null`（新增，≤20000 字符；来自流水线 `optimizedVideoPrompts`，缺失为 null，旧项目无需迁移）；**compose 输出分段经 `normalizeComposeScenes` 白名单不含 `videoPrompt`，`_persistComposeArtifacts`/`recomposeProject` SHALL 按 index 从原项目分段回填，禁止重新合成后清空为 null（C1）**；
- voice 设置（新增分段级覆盖）：`voiceId/voiceProvider/voiceModel/voiceSpeed/voicePitch/voiceEmotion`（缺失时回退 `project.options.*`）。

#### Scenario: 旧项目兼容
- **WHEN** 打开旧项目（无 `videoPrompt`/voice 设置字段）
- **THEN** 分段编辑区显示空/缺省值，保存或重新生成不破坏既有字段，无需迁移

#### Scenario: videoPrompt 持久化
- **WHEN** 流水线 generate_assets 完成且某场景为视频场景
- **THEN** `pairedScenes` 该场景携带 `videoPrompt`（来自 `optimizedVideoPrompts.get(index)?.prompt`），`saveRun` 持久化到分段 `videoPrompt`

### Requirement: updateSegments 白名单扩展
`story2video:update-segments` 的逐分段更新 SHALL 支持白名单键：`id`（必填，已存在分段）、`text`（≤10000）、`prompt`（≤20000）、`subtitleBlocks`（走 `safeSubtitleBlocks`，≤200 项、每项 ≤500 字符，非法项丢弃）、`subtitleTimeline`（走 `safeSubtitleTimeline`，时间校验：`startTime ≥ 0`、`endTime > startTime`、`endTime ≤ 3600`，非法项丢弃）、`videoPrompt`（≤20000）、`voiceId/voiceProvider/voiceModel`（≤160）、`voiceSpeed`（数字或数字字符串，收敛到 `0.5..2`）、`voicePitch`（数字或数字字符串，收敛到 `-12..12`，0/负值原样保留，与 story2video-text-config 契约一致）、`voiceEmotion`（≤80）。未知键 SHALL 忽略（保持既有语义），分段不存在 SHALL 抛错。

#### Scenario: 保存字幕编辑
- **WHEN** 用户编辑分段字幕并以每行一块保存
- **THEN** `subtitleBlocks` 落库；合成时 `normalizeSceneSubtitleBlocks` 优先使用 `subtitleBlocks` 重建时间轴

#### Scenario: 保存 voice 设置
- **WHEN** 用户修改音色/语速/音调并保存
- **THEN** 分段持久化 voice 设置，重新生成旁白使用该设置；未设置的分段回退项目 options

### Requirement: 重新生成字幕（regenerate-scene-subtitle）
`story2video:regenerate-scene-subtitle`（参数 `{projectId, segmentId}`）SHALL 校验分段存在且 `text` 非空（否则 `VALIDATION_ERROR`「该场景没有旁白文字，无法重新生成字幕」），用本地 `splitSubtitleBlocks(text)` 重新分句生成 `subtitleBlocks`，并清空 `subtitleTimeline`（派生数据，防止陈旧时间轴干扰合成），同时重置 `error=null`、`subtitleSource='local-typescript'`（清理旧失败状态与远端切分来源标记，I2），置 `dirty=true` 落库并返回完整 project。不消耗任何外部额度。

#### Scenario: 重新生成字幕
- **WHEN** 用户点击【重新生成字幕】且分段有文案
- **THEN** 字幕按文案重新分句，旧字幕替换，时间轴清空，界面刷新新字幕

#### Scenario: 无文案
- **WHEN** 分段无旁白文字时点击【重新生成字幕】
- **THEN** 返回 `VALIDATION_ERROR`，状态不变

### Requirement: 重新生成旁白（regenerate-scene-audio）
`story2video:regenerate-scene-audio`（参数 `{projectId, segmentId}`）SHALL：
- 校验分段存在且 `text` 非空（否则「该场景没有旁白文字，无法生成语音」）；
- 按分段 voice 设置（缺失回退 `project.options`）调 `assetGenerator.generateTTS(text, {voice_id, voice_provider, voice_model, rate, pitch, emotion, with_timestamps: true, index, runId})`；
- `assetGenerator` 不可用 → 抛「语音生成服务不可用」；
- 成功 → 复制产物到项目目录替换 `audioPath`，状态 `completed`；
- 失败 → 清理本次尝试文件，保留旧音频，状态回写 `failed`，抛可展示错误。

#### Scenario: 成功重新生成
- **WHEN** 用户点击【重新生成旁白】且服务可用
- **THEN** 新 TTS 音频替换该分段 `audioPath`，旧音频经 `_cleanupUnreferencedProjectFiles` 回收，界面刷新

#### Scenario: 失败保留旧音频
- **WHEN** TTS 生成抛错
- **THEN** 分段 `audioPath` 保持生成前值，本次产物清理，状态 failed，前端 toast 展示错误

### Requirement: 重新生成优化词（regenerate-scene-prompt）
`story2video:regenerate-scene-prompt`（参数 `{projectId, segmentId, kind}`，`kind ∈ image|video`）SHALL：
- 校验分段存在、`kind` 白名单、分段 `text` 非空；
- `kind=image` → `serviceBus.optimizePrompt(text, 优化选项)`，成功后更新 `segment.prompt`（≤20000）并**清空 `promptTranslation`**（防陈旧翻译）；输出非法（非空字符串）→ fail-closed 抛错不改动；
- `kind=video` → `serviceBus.optimizeVideoPrompt(text, 优化选项)`，成功后更新 `segment.videoPrompt`；
- 失败 → 分段不改动，抛可展示错误；不消耗图片/视频生成额度。

#### Scenario: 重新生成图片优化词
- **WHEN** 用户点击【重新生成图片优化词】
- **THEN** `prompt` 更新为新优化词，旧翻译清空，界面刷新；后续【生成新图】/【重试图片】使用新 `prompt`

#### Scenario: 重新生成视频优化词
- **WHEN** 用户点击【重新生成视频优化词】
- **THEN** `videoPrompt` 更新为新优化词并持久化；本地视频渲染（renderSegment）与 AI 视频流水线语义不受影响

#### Scenario: 优化服务不可用
- **WHEN** PromptBridge/服务不可用
- **THEN** 返回「提示词优化服务不可用」，分段不改动

### Requirement: 同项目写串行
对同一 `projectId` 的写操作（`update-segments`、`recompose-project`、三种 `regenerate-scene-*`）在主进程 SHALL 经 per-project promise 队列（`_serializeProject`）串行执行：每个写操作 read-modify-write 全程持锁，后续操作在前一操作落库后执行；队列项完成后 SHALL 清理，不跨项目串行、不泄漏（W2）。渲染端任一分段 busy（`segmentBusy` 非空）时 SHALL 禁用全局【保存分段】与【重新合成】按钮。

### Requirement: 重新生成前自动保存
渲染端触发任一【重新生成*】前，若存在未落盘编辑（`segmentsDirty=true`）SHALL 先执行【保存分段】（失败则中止本次重新生成），确保重新生成基于最新文案且服务端响应不会覆盖本地编辑（W3）；成功后按服务端返回整体回写 `project/segments` 并重新解析素材 URL。

### Requirement: IPC 安全
三个新通道（`story2video:regenerate-scene-subtitle/regenerate-scene-audio/regenerate-scene-prompt`）SHALL `withSenderCheck` + `isSafeId(projectId)` + `isSafeId(segmentId)` + 参数类型校验（kind 白名单），失败统一 `VALIDATION_ERROR`；license-access-control SHALL 映射 `story2video_write`；preload `publish.js` 与构建产物 `index.bundle.js`（`pnpm run build:preload`）SHALL 同步新增方法；前端 `api/publisher.js` SHALL 同步转发。

### Requirement: 历史详情弹窗编辑入口
历史详情弹窗（CreateViewHistory.vue）对 completed 且有 `projectId` 的任务 SHALL：
- 底部主按钮文案为「编辑并重新合成」（打开 ResultView，`open-result` 事件不变）；
- 弹窗内展示只读场景列表（`segments` 序号 + `text` 预览 ≤60 字符）与提示文字「点击「编辑并重新合成」打开结果页：可修改每个场景的文案、字幕、语音设置与图片/视频优化词，重新生成字幕/旁白/图片/视频，最后重新合成整片」。

#### Scenario: completed 任务展示编辑入口
- **WHEN** 用户打开 completed 历史详情
- **THEN** 可见场景列表与「编辑并重新合成」按钮，点击进入 ResultView 编辑态

#### Scenario: 非 completed 任务
- **WHEN** 任务非 completed（running/paused/failed）
- **THEN** 不展示「编辑并重新合成」，保持既有恢复/打开结果语义

### Requirement: ResultView 场景编辑区
ResultView 每分段 SHALL 新增/调整编辑区：
- 「字幕」区：textarea（每行一个字幕块）+【重新生成字幕】按钮；按钮 busy 态文案「重新生成中...」；
- 「语音」区：【重新生成旁白】按钮 + 音色/语速/音调设置输入（保存随【保存分段】）；输入边界与流水线契约一致：语速 `min=0.5 max=2 step=0.1`、音调 `min=-12 max=12 step=0.1`（W1）；原「替换旁白」上传保持；
- 「优化词」区：图片优化词 textarea（既有 prompt）+【重新生成图片优化词】；视频优化词 textarea（videoPrompt）+【重新生成视频优化词】；
- 全部新按钮 busy 时禁用对应分段操作（沿用 `isSegmentBusy`），成功后刷新项目与缩略图；任一分段 busy 时同时禁用全局【保存分段】与【重新合成】（W2）；
- 字幕 textarea SHALL 支持清空（清空后不回退旧时间轴），手动编辑 SHALL 同步清空 `subtitleTimeline`（I1）；
- 「重新合成」与「再次合成最终成片」按钮保持显式并列（既有 recompose-final 语义）。

#### Scenario: 编辑并保存
- **WHEN** 用户修改字幕/语音设置/视频优化词后点击【保存分段】
- **THEN** 白名单字段落库，toast「分段已保存」

#### Scenario: 编辑入口可发现
- **WHEN** 用户从历史详情进入 ResultView
- **THEN** 分段编辑区可见全部内容元素编辑/重新生成入口与整片重合成按钮

### Requirement: 文案与通知
全部新增用户可见文案 SHALL 写入 `locales/zh.js` 与 `locales/en.js`（成对，CI Gate 7 通过）；通知类文案经 `story2video-notifications.js` 键常量引用；渲染端 `src/` 非 locales 文件不得新增中文字符串字面量。

### Requirement: 测试
- 服务层（`story2video-project-service.test.js`）：updateSegments 新字段校验（合法/非法/未知键忽略，voiceSpeed/voicePitch 分界收敛）、`regenerateSceneSubtitle/Audio/Prompt` 成功-失败-回滚（含 error/subtitleSource 重置）、旧项目兼容、videoPrompt 持久化与 recompose 回填（C1 回归）、`_serializeProject` 串行且队列不泄漏（W2 回归）；
- IPC（`ipc-handlers/story2video.test.js`）：新通道参数校验（非法 id/kind、空槽）、返回 `VALIDATION_ERROR`；
- preload（`preload.test.js`）：新方法通道转发与数量断言；
- ResultView（`ResultView.test.js`）：新按钮渲染/点击调用 IPC/busy 态/成功失败通知、重新生成前自动保存（W3 回归）、任一分段 busy 禁用全局按钮（W2 回归）、字幕清空/手动编辑清时间轴（I1 回归）；
- CreateViewHistory（`CreateViewHistory.test.js`）：completed 按钮文案、场景列表、提示文字、非 completed 不展示；
- locale 成对（`check-locale-sync`）通过。
