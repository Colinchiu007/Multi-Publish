## Why

「视频创作-全能创作-历史记录」进入任务详情页（ResultView）后，每个场景目前只能编辑「旁白文字」与「画面提示词」，可上传替换旁白、重试/生成图片视频并整片重新合成（3.1.26）。但用户对成片后某个场景的其余内容元素仍缺少修改与重新生成途径：

- **字幕**：只能随「旁白文字」在合成时自动分句生成，无独立编辑区，无「重新生成字幕」按钮；
- **语音**：只有上传文件替换旁白，没有按场景文字与已选音色重新生成 TTS 旁白，也没有音色/语速/音调设置入口；
- **图片/视频优化词**：可手改「画面提示词」但没有「重新生成优化词」按钮；视频优化词根本没有持久化字段，成片后无法查看或修改；
- **整片重合成**：按钮存在于 ResultView，但历史详情弹窗只提供「打开结果」，编辑入口不显眼，用户感知为「没有整个视频重新合成的按钮」。

目标：让历史记录中每个场景的**文案、字幕、语音、图片优化词、视频优化词、图片、视频**都可修改（文本类）或重新生成（字幕/语音/图片/视频/优化词），并显式提供整片重合成入口，全程复用既有 pipeline/compose/asset/TTS/prompt-engine 能力，不重跑流水线、不重复消耗额度。

## What Changes

- **字幕**：ResultView 每分段新增「字幕」编辑区（每行一个字幕块，可手改，保存时经扩展后的 `story2video:update-segments` 持久化 `subtitleBlocks`）；新增「重新生成字幕」按钮（按场景文字用本地 `splitSubtitleBlocks` 重新分句并清空陈旧 `subtitleTimeline`）。
- **语音**：每分段新增「重新生成旁白」按钮（按分段/项目 voice 设置调用 `assetGenerator.generateTTS` 重新生成并替换 `audioPath`，失败保留旧音频）；新增音色/语速/音调设置输入（`voiceId/voiceSpeed/voicePitch/voiceEmotion`），随 `update-segments` 持久化到分段。
- **优化词**：每分段新增「重新生成图片优化词」按钮（`PromptBridge.optimize`，以场景文字为种子，成功后更新 `prompt` 并清空陈旧 `promptTranslation`）与「重新生成视频优化词」按钮（`PromptBridge.optimizeVideo`，更新分段新字段 `videoPrompt`）；新增「视频优化词」编辑 textarea（`videoPrompt` 持久化）。
- **视频优化词持久化**：`saveRun`/`_persistComposeArtifacts` 持久化分段 `videoPrompt`（来自流水线 `optimizedVideoPrompts`，缺失为 null）；`generateSceneVideo`/`retrySegment('video')` 的视频渲染不受影响（本地 ffmpeg 渲染不消费视频优化词），AI 视频生成仍走流水线。
- **整片重合成入口**：历史详情弹窗 completed 任务的按钮文案改为「编辑并重新合成」（打开 ResultView），弹窗内新增只读场景列表（序号+文案预览）与提示文字；ResultView 顶部保留显式「重新合成」与「再次合成最终成片」按钮。
- **数据校验（fail-closed）**：`updateSegments` 白名单扩展为 `text/prompt/subtitleBlocks/subtitleTimeline/videoPrompt/voiceId/voiceProvider/voiceModel/voiceSpeed/voicePitch/voiceEmotion`；非法值按字段规则收敛或丢弃，未知键忽略（既有语义）；三个新 IPC 均 `withSenderCheck` + `isSafeId` + 参数类型校验 + `story2video_write` 权限。
- **IPC/preload**：新增 `story2video:regenerate-scene-subtitle`、`story2video:regenerate-scene-audio`、`story2video:regenerate-scene-prompt` 三个通道；`preload/publish.js` 与构建产物 `preload/index.bundle.js`（`pnpm run build:preload`）同步，前端 `api/publisher.js` 同步。
- **文案**：全部新增用户可见文案写入 `locales/zh.js` + `locales/en.js` 成对（CI Gate 7），通知类文案经 `story2video-notifications.js` 键常量引用。
- **测试**：服务层（updateSegments 新字段/三个 regenerate 的成功-失败-回滚）、IPC 校验、preload 转发、ResultView 交互、历史详情弹窗入口、locale 成对。

## Capabilities

### New Capabilities
- `story2video-history-scene-edit`: 历史任务详情页场景内容（字幕/语音/图片与视频优化词）编辑与重新生成、整片重合成入口的行为契约（数据模型、校验、生成语义、交互、文案与测试要求）。

### Modified Capabilities
- 无（既有 spec 不涉及场景内容编辑；3.1.26 素材槽位行为保持不变）。

## Impact

- **代码**：`apps/desktop/src/views/ResultView.vue`、`apps/desktop/src/views/CreateViewHistory.vue`、`apps/desktop/src/api/publisher.js`、`apps/desktop/electron/preload/publish.js`（+ 构建产物 `index.bundle.js`）、`apps/desktop/electron/ipc-handlers/story2video.js`、`apps/desktop/electron/ipc-handlers/license-access-control.js`、`apps/desktop/electron/services/story2video-project-service.js`、`apps/desktop/electron/services/story2video-stages.js`（videoPrompt 注入 pairedScenes）、`apps/desktop/src/locales/zh.js`、`apps/desktop/src/locales/en.js`、`apps/desktop/src/story2video/story2video-notifications.js`。
- **测试**：`story2video-project-service.test.js`、`ipc-handlers/story2video.test.js`、`preload.test.js`、`license-access-control.test.js`、`ResultView.test.js`、`CreateViewHistory.test.js`、`check-locale-sync` CI。
- **文档**：`01-docs/PRD-video-creation.md`（新增 3.1.29 章节＋迭代记录）、`01-docs/CHANGELOG.md`、本 change 的 specs/design/tasks。
- **不涉及**：流水线执行引擎阶段流（除 videoPrompt 注入一行外）、compose 引擎、Python sidecar、数据库、第三方服务契约。
