# Story2Video 历史记录场景内容编辑/重新生成/整片重合成 — 需求与现状

## 用户需求
在「视频创作-历史记录」中，某场景的内容（本场景内文案、字幕、语音、图片/视频优化词、图片、视频）需要修改时，
应能：文本类元素可修改（文案、字幕、语音设置、图片/视频优化词）；可重新生成（字幕、语音、图片/视频、优化词）；
最终可对整个视频重新合成。

## 现状（main @ ea4a756c）
- 入口：历史卡片 → 只读详情弹窗（3.1.28）→「打开结果」→ ResultView（route /result?project=xxx）。
- ResultView 已有：旁白文字 textarea（文案）、画面提示词 prompt textarea、保存分段（story2video:update-segments）、
  替换旁白（上传文件 story2video:replace-segment-audio）、重试图片/重试视频（story2video:retry-segment）、
  3 素材槽+生成新图/生成视频/选中/预览（3.1.26 story2video:select-scene-material / generate-scene-image / generate-scene-video）、
  整片重新合成（story2video:recompose-project，含 recompose-final 按钮）。
- 分段数据模型（story2video-project-service.js _persistComposeArtifacts）：
  id/index/sourceIndex/text/prompt/promptTranslation/imagePath/audioPath/videoPath/duration/
  imageMeta/audioMeta/subtitleBlocks/subtitleTimeline/sceneSource/subtitleSource/degraded/fallbackReason/status/
  alternateImages/selectedMaterial；voice 设置存于 project.options（voiceId/voiceProvider/voiceModel/voiceSpeed/voicePitch/voiceEmotion/voiceVolume）。
- TTS：assetGenerator.generateTTS(text, {voice_id, voice_provider, voice_model, rate, pitch, emotion, with_timestamps, index, runId})。
- prompt 优化：serviceBus.optimizePrompt(prompt, opts)（PromptBridge → /v1/optimize）；视频优化 prompt：serviceBus.optimizeVideoPrompt。
- 字幕：compose 时由 splitSubtitleBlocks(scene.text) 生成 subtitleBlocks → buildSubtitleTimeline；subtitleBlocks/subtitleTimeline 已随分段持久化。
- 视频优化词：流水线内 optimizedVideoPrompts Map 使用，未持久化到分段（无 videoPrompt 字段）。

## 缺口
1. 字幕：不可编辑、无重新生成按钮。
2. 语音：无 TTS 重新生成（仅上传替换）；voice 设置不可在结果页编辑。
3. 图片/视频优化词：可编辑 prompt 但无「重新生成优化词」；视频优化词无持久化字段。
4. 历史详情弹窗对 completed 任务的编辑入口不够显眼（按钮文案「打开结果」+ 无场景预览/提示）。
5. 整片重合成按钮存在但用户未感知到。

## 拟议方案
A. 服务层（story2video-project-service.js）：
   1. 扩展 updateSegments 白名单：subtitleBlocks、videoPrompt、voiceId/voiceProvider/voiceModel/voiceSpeed/voicePitch/voiceEmotion。
   2. regenerateSceneSubtitle(projectId, segmentId)：用 splitSubtitleBlocks(text) 重切字幕，清 subtitleTimeline，落库。
   3. regenerateSceneAudio(projectId, segmentId)：按分段/项目 voice 设置调 assetGenerator.generateTTS → 替换 audioPath，失败保留旧音频。
   4. regenerateScenePrompt(projectId, segmentId, kind: 'image'|'video')：调 prompt-engine 重新优化 → 更新 prompt / videoPrompt，失败不改动。
   5. _persistComposeArtifacts/saveRun：持久化 videoPrompt（stages 里 optimizedVideoPrompts 注入 pairedScenes）。
B. IPC/preload/api：新增 story2video:regenerate-scene-subtitle / regenerate-scene-audio / regenerate-scene-prompt（withSenderCheck+isSafeId+license story2video_write）。
C. 前端 ResultView：每分段新增「字幕」编辑区（每行一块，可编辑+重新生成字幕）、「语音」区（重新生成旁白+voice 设置）、
   「优化词」区（重新生成图片优化词/视频优化词+视频优化词 textarea）；历史详情弹窗 completed 任务按钮改「编辑并重新合成」+场景预览+提示。
D. locales zh/en 成对；CI Gate 7；测试（service/ipc/preload/ResultView/CreateViewHistory）。
E. 文档：PRD-video-creation.md 新章节（数据模型/校验/流程/功能逻辑/交互逻辑/显示项/提示文字/测试）、openspec propose、CHANGELOG。
