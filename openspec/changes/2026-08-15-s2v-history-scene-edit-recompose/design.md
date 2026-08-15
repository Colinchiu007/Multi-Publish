# Design — Story2Video 历史场景内容编辑/重新生成/整片重合成

## 架构决策
- **不重跑流水线**：全部能力挂在既有 project-service 层（复用 `_persistComposeArtifacts`/`_cleanupUnreferencedProjectFiles`/`_scenesForCompose` 语义），前端 ResultView 为唯一编辑中枢；历史详情弹窗只增强入口与信息展示。
- **分段级 voice 覆盖**：分段 voice 设置字段缺省回退 `project.options.*`，保持旧项目零迁移。
- **videoPrompt 新字段**：仅持久化与编辑用途；本地视频渲染（renderSegment）与 AI 视频流水线语义不受影响。
- **字幕为派生但可覆盖**：`subtitleBlocks` 持久化并优先于 `subtitleTimeline`（compose `normalizeSceneSubtitleBlocks` 已按此优先级）；重新生成字幕即清空陈旧 timeline。

## 服务层改动（story2video-project-service.js）
1. `_persistComposeArtifacts` 分段输出新增：`videoPrompt: safeText(segment.videoPrompt, 20000) || null`。
2. `updateSegments` 逐分段白名单扩展（见 spec）；`subtitleBlocks`/`subtitleTimeline` 复用既有 `safeSubtitleBlocks`/`safeSubtitleTimeline`；voice 数字收敛 `0.1..10`（非法回退 undefined→保留原值）。
3. 新增 `async regenerateSceneSubtitle(projectId, segmentId)`：读分段 → `text` 空则抛「该场景没有旁白文字，无法重新生成字幕」→ `splitSubtitleBlocks(text)`（require `./story2video-segmentation`）→ 写 `subtitleBlocks`、`subtitleTimeline: []` → `_upsertProject` → 返回 project。
4. 新增 `async regenerateSceneAudio(projectId, segmentId)`：校验 → 取 voice 设置（分段优先，回退 options）→ `assetGenerator.generateTTS(text, {...})` → `normalizeAssetResult` 取 path → `_copyRequired` 到项目目录 `segment.id + '_audio_tts_' + Date.now() + ext` → 替换 `audioPath`、`status:'completed'`；catch → 清理 attemptFiles、回写 failed（保留旧值）、throw。
5. 新增 `async regenerateScenePrompt(projectId, segmentId, kind)`：`kind` 白名单 `['image','video']`；image → `serviceBus.optimizePrompt({ prompt: text, ...})`（无 serviceBus/PromptBridge → 抛「提示词优化服务不可用」）；video → `serviceBus.optimizeVideoPrompt`；提取 `prompt || optimized_prompt || optimized`，非空字符串校验；写 `segment.prompt`（image，并 `promptTranslation: null`）或 `segment.videoPrompt`（video）；失败不改动。

## IPC/preload/api
- `ipc-handlers/story2video.js` 新增三通道（`withSenderCheck` + `isSafeId` + 参数校验，错误 `VALIDATION_ERROR`，走 `requireProjectService()`）。
- `license-access-control.js`：三个通道映射 `story2video_write`。
- `preload/publish.js`：新增 `story2videoRegenerateSceneSubtitle/Audio/Prompt`；`pnpm run build:preload` 重新生成 `index.bundle.js`。
- `api/publisher.js`：新增三个转发函数（`invokeWithFallback`）。

## 前端 ResultView
- 模板：分段卡片新增「字幕」区（textarea + 重新生成字幕）、「语音」区（重新生成旁白 + voice 设置输入 + 原替换旁白）、「优化词」区（视频优化词 textarea + 重新生成图片/视频优化词按钮）。
- 方法：`regenerateSceneSubtitle/Audio/Prompt`、voice 设置绑定 `segment.voiceId/voiceSpeed/voicePitch/voiceEmotion`；busy 复用 `segmentBusy`（kind: 'subtitle'/'audio'/'promptImage'/'promptVideo'）；成功后刷新 `project/segments` + 缩略图 + 通知。
- `saveSegments` 增加白名单字段透传（text/prompt/subtitleBlocks/videoPrompt/voice*）。
- `subtitleText` 计算：segment.subtitleBlocks.join('\n')，保存时 split('\n')。

## 前端 CreateViewHistory
- completed 且有 projectId：底部按钮文案「编辑并重新合成」（locale 键），弹窗内新增场景列表（`segments` 序号+text 预览）与提示文字；`open-result` 事件语义不变。

## 流水线注入（story2video-stages.js）
- generate_assets 最终 `pairedScenes` 组装处新增 `videoPrompt: (videoByIndex.has(i) ? (optimizedVideoPrompts.get(i)?.prompt || null) : null)`（同一 executor 作用域）。

## 通知文案（story2video-notifications.js）
- 新增键：`SCENE_SUBTITLE_REGENERATED`、`SCENE_AUDIO_REGENERATED`、`SCENE_PROMPT_REGENERATED`、`SCENE_PROMPT_REGENERATE_FAILED`、`SCENE_SUBTITLE_REGENERATE_FAILED`、`SCENE_AUDIO_REGENERATE_FAILED`（zh/en 成对）。

## 测试计划
- service：新字段校验、三 regenerate 成功/失败/回滚、videoPrompt 持久化、旧项目兼容；
- ipc/preload：通道转发与校验；
- ResultView/CreateViewHistory：按钮/交互/通知/locale；
- `pnpm --filter @multi-publish/desktop test` 相关套件 + `build:vue` + `check-locale-sync`。
