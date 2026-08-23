## Why

历史记录进入的任务详情页（ResultView，`/create/result?project=id`）目前每个场景只展示并支持 1 张图片素材，无法在成片后更换/备选素材；自动模式（如 全自动 + 全部图片轮播）每个场景只有 1 张图，用户希望成片后仍能继续生成更多图片与视频、按场景选择最终素材并重新合成，无需重跑整条流水线（避免重复消耗 TTS/图片/视频额度）。

## What Changes

- 任务详情页每个场景最多展示并支持 **3 个可选素材槽位：图 1（当前图）＋图 2（备选图）＋视频（备选素材）**；选中态唯一，合成时视频槽优先、否则使用选中的图片。
- 新增每场景操作按钮 **【生成新图】**：复用既有图片生成能力（`assetGenerator.generateImage`，同一提示词/风格/模型参数）；槽位规则——只有 1 图时补第 2 槽；2 图已满时替换**未选中**的那张（图 1 被选中→替换图 2，图 2 被选中→替换图 1）；不自动重渲染视频。
- 新增每场景操作按钮 **【生成视频】**：基于「当前选中图片＋该场景已有 TTS 旁白音频」经 ffmpeg 渲染生成视频片段（复用 `Story2VideoComposeEngine.renderSegment`，不消耗 AI 视频生成额度）；已有视频槽时直接替换原视频。
- 新增 **【再次合成视频】** 按钮：用当前选定的素材＋已有的 TTS 语音音频、字幕文本、背景音乐音频，经既有 `story2video:recompose-project`（`composeEngine.compose({ scenes: segments }, options)`）生成新的成片。
- 数据模型：segment 新增 `alternateImages: [{ path, meta }]`（图 2 槽）；`imagePath` 保持为「当前选中图 1」，`videoPath` 为「视频槽」；持久化/清理（`referencedProjectFiles`、`_cleanupUnreferencedProjectFiles`、`_persistComposeArtifacts`）必须纳入备选图，旧项目无需迁移（无字段即无备选图）。
- IPC：新增 `story2video:generate-scene-image`、`story2video:generate-scene-video`、`story2video:select-scene-material` 三个通道（权限 `story2video_write`），preload、前端 API 层、license-access-control 同步。
- 布局：分段编辑区每 segment 新增「场景素材」区（3 槽位缩略图＋选中徽标＋点击预览）；【生成新图】【生成视频】置于素材区；【再次合成视频】置于分段编辑区头部；原有重试/下载/编辑/旁白替换功能保持不变。
- 文案：全部新增用户可见文案写入 `locales/zh.js` + `locales/en.js` 成对（CI Gate 7 校验），通知类文案经 `story2video-notifications.js` 键常量引用。

## Capabilities

### New Capabilities
- `story2video-history-material-selection`: 历史任务详情页的场景素材多槽位展示与选择、生成新图/生成视频、再次合成视频的行为契约（数据模型、IPC、生成语义、布局、文案与测试要求）。

### Modified Capabilities
- 无（既有 spec 不涉及详情页素材行为；`story2video-asset-selection-ux` 只覆盖流水线检查点选择面板，本次不改变其需求）。

## Impact

- **代码**：`apps/desktop/src/views/ResultView.vue`（布局与交互）、`apps/desktop/src/api/publisher.js`、`apps/desktop/electron/preload/publish.js`、`apps/desktop/electron/ipc-handlers/story2video.js`、`apps/desktop/electron/ipc-handlers/license-access-control.js`、`apps/desktop/electron/services/story2video-project-service.js`（数据模型/生成/选择/清理）、`apps/desktop/src/locales/zh.js`、`apps/desktop/src/locales/en.js`、`apps/desktop/src/story2video/story2video-notifications.js`。
- **测试**：`story2video-project-service.test.js`、`ipc-handlers/story2video.test.js`、`preload.test.js`、`license-access-control.test.js`、ResultView 组件测试（如存在）、`check-locale-sync` CI。
- **文档**：`01-docs/PRD-video-creation.md`（新增 3.1.x 章节＋迭代记录）、本 change 的 specs/design/tasks。
- **不涉及**：流水线执行引擎（story2video-stages.js）、compose 引擎、Python sidecar、数据库、第三方服务契约。
