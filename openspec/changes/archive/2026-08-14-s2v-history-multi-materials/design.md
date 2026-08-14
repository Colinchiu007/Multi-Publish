# Design — 历史记录任务详情页多素材选择与再次合成

## Context

见 proposal.md「Why」。当前详情页（ResultView.vue）每个 segment 只有单图 `imagePath` + 可选 `videoPath`/`audioPath`；主进程 `Story2VideoProjectService` 负责持久化与清理（`referencedProjectFiles` 只引用单图单视频）；合成引擎 `compose()` 优先 `videoPath`、否则 `imagePath`（`audioPath` 必填）；流水线 manual 模式产出 candidates（2 图 + 可选 1 视频）但 finalize 只持久化用户选中的 1 个素材。

## Goals / Non-Goals

**Goals**
- 详情页每场景支持 3 个可选素材槽（图1/图2/视频），唯一选中态，点击即选。
- 【生成新图】【生成视频】按槽位规则生成/替换素材，不消耗 TTS 与 AI 视频额度。
- 【再次合成视频】用选定素材 + 既有 TTS/字幕/BGM 经既有 recompose 链路合成。
- manual 模式项目在详情页直接展示流水线已生成的全部候选（2 图 + 可选视频），无需重跑。
- 持久化/清理/回滚与既有机制一致（含 Windows 原子写与越界防护），旧项目零迁移。

**Non-Goals**
- 不修改流水线执行语义、compose 引擎、TTS/BGM 生成、Python sidecar。
- 不在详情页引入 AI 视频生成（不重复消耗视频额度；【生成视频】= 本地 ffmpeg 渲染）。
- 不做跨项目素材共享、不做槽位数量配置化（固定 2 图 + 1 视频）。

## Decisions

### D1: 数据模型 — `alternateImages` + `selectedMaterial`（无交换、槽位身份稳定）
- `segment.alternateImages: Array<{path, meta}>`，服务端强制长度 ≤ 1（图2 槽）。
- `segment.selectedMaterial: 'image1' | 'image2' | 'video'`（可选；缺失 = 遗留语义）。
- 槽位身份固定：图1 = `imagePath`，图2 = `alternateImages[0].path`，视频 = `videoPath`。**不做 swap**——选中只写 `selectedMaterial`，保证 UI 槽位身份稳定，替换规则（“图1未选中→替换图1”）可精确实现。
- 合成映射（`_scenesForCompose`，服务端）：`selectedMaterial === 'video'` 且有 `videoPath` → 仅传 `videoPath`；否则传选中图片（image1→`imagePath`，image2→`alternateImages[0].path`）且置空 `videoPath`；`selectedMaterial` 缺失 → 遗留语义（有 videoPath 用视频，否则 imagePath）。compose/renderSegment 引擎**零改动**。
- 替代方案（已排除）：swap 到 imagePath——会使图1/图2 身份漂移，替换规则与 UI 状态难以对齐；改 compose 引擎支持 useVideo 标志——扩大爆炸半径（引擎 + 其 1700+ 行测试）。

### D2: 持久化与清理纳入新字段
- `referencedProjectFiles` 增加 `alternateImages[].path`；`_persistComposeArtifacts` 透传 `alternateImages/selectedMaterial`。
- `saveRun` 富化：manual 模式从 `run.context.generate_assets.candidates` 恢复候选——选中图片之外的未选图片复制进项目目录作为 `alternateImages[0]`；未选中的视频候选复制为 `videoPath`（仅当流水线未选视频时）；按流水线选择设置 `selectedMaterial`。auto 模式无候选 → 不富化（字段缺省）。
- 清理：`_cleanupUnreferencedProjectFiles` 基于新 `referencedProjectFiles` 自动纳入备选图，无额外改动；删除备选图后 `_cleanupProjectFiles` 沿用现有“仅项目目录内普通文件”约束。
- 失败回滚沿用 `retrySegment` 既有模式（`attemptFiles` 集合 + 失败清理 + 状态回写）。

### D3: 生成语义
- **生成新图**（`generateSceneImage`）：`assetGenerator.generateImage(segment.prompt || segment.text, { index, style, image_provider, image_model, aspect_ratio, runId })`（与 retrySegment 相同参数）。槽位规则：
  1. 无 `alternateImages` → 新图写入图2 槽（不改变选中态）；
  2. 图2 槽已存在 → 替换**未选中**的那张：`selectedMaterial === 'image2'` → 替换图1（`imagePath`）；否则（image1/video/缺失）→ 替换图2。
  3. 不自动重渲染视频、不自动改选中态。
- **生成视频**（`generateSceneVideo`）：要求 `audioPath`（缺失 → 报错“该场景没有旁白音频，无法生成视频”）；以**当前选中图片**为画面（映射同 D1）调 `composeEngine.renderSegment` → 新 mp4 **替换** `videoPath` 槽；失败保留旧视频并清理本次产物；不自动选中视频。
- **再次合成视频**：新按钮复用 `story2video:recompose-project`（`recomposeProject` 内部经 `_scenesForCompose` 映射），无新 IPC。

### D4: IPC 契约（均 `story2video_write` + withSenderCheck + projectId/segmentId 白名单校验）
- `story2video:generate-scene-image` `{projectId, segmentId}` → `{code:0, data: project}`
- `story2video:generate-scene-video` `{projectId, segmentId}` → `{code:0, data: project}`
- `story2video:select-scene-material` `{projectId, segmentId, kind: 'image1'|'image2'|'video'}` → `{code:0, data: project}`（kind 非法 → VALIDATION_ERROR；槽不存在（如图2 无备选图）→ VALIDATION_ERROR）
- 同步：preload `publish.js`、`src/api/publisher.js`、`license-access-control.js`、`preload.test.js` 通道清单。

### D5: UI 布局（ResultView.vue，保持原有内容不变）
- 每 segment 新增「场景素材」区（置于原缩略图位置/上方）：
  - 3 个槽位卡：图1 / 图2 / 视频；缩略图（视频用 `<video preload="metadata">` 静音），选中槽显示高亮边框 + 「当前使用」徽标；点击槽位即选中（`select-scene-material`）；复用 `SceneAssetSelection` 的预览 modal 模式（`story2videoCreateShareUrl` 本地 URL + 放大预览）。
  - 槽位标题：图1「图片 1」、图2「图片 2」、视频「视频」；图2 空槽显示占位「未生成」；视频空槽显示占位「未生成」。
  - 按钮：【生成新图】【生成视频】置于素材区（busy 态文案「生成中...」），沿用现有 `segmentBusy` 防抖。
- 「分段编辑」区头部新增【再次合成视频】按钮（与既有【重新合成】并列，同一 IPC；文案区分：重新合成=按当前文字/素材合成；再次合成视频=使用当前选定的素材重新生成成片）。
- 布局：桌面端 3 槽位横向排布（每槽 ~96×128 与 SceneAssetSelection 一致），移动端（≤720px）换行纵向；无障碍：槽位为可聚焦 button/radio 语义 + aria-label，选中态 aria-pressed。
- 新文案全部走 locales zh/en 成对 + `STORY2VIDEO_NOTIFICATION_KEYS` 新增键（SCENE_IMAGE_GENERATED / SCENE_VIDEO_GENERATED / MATERIAL_SELECTED 等）；ResultView 既有硬编码中文属基线，**不**新增中文字面量。

### D6: 测试矩阵（映射到 spec 场景）
- 服务单测（`story2video-project-service.test.js`）：槽位规则 4 分支（1图补槽/2图替换图1/2图替换图2/视频选中时替换图1）、生成视频替换与失败保留、select 校验（非法 kind/空槽）、`_scenesForCompose` 三态映射、`saveRun` manual 富化（alternateImages/videoPath/selectedMaterial）、清理纳入备选图（删除段/替换后旧备选图被清、仍引用不清）、旧项目无字段兼容。
- IPC 测试（`ipc-handlers/story2video.test.js`）：3 个新通道参数校验 + 错误映射；`license-access-control.test.js` 通道权限；`preload.test.js` 通道存在。
- 组件测试（`ResultView.test.js`）：渲染 3 槽位与选中态、点击选中调用 IPC、生成按钮 busy 态、再次合成按钮调用 recompose。
- CI：`check-locale-sync` 覆盖新键 zh/en 成对。

## Risks / Trade-offs

- [备选图文件失控] → 服务端强制 `alternateImages.length ≤ 1`；清理逻辑自动回收；`MAX_PROJECTS` 与目录越界约束不变。
- [生成失败留下半成品] → 沿用 attemptFiles + 失败清理 + 状态回写 failed + 前端 toast；视频生成失败保留旧视频。
- [并发点击（双击）] → `segmentBusy` 前端防抖 + 服务端方法内无并发防护沿用 retrySegment 现状（IPC 串行 invoke）。
- [选中态与合成结果不一致（改了素材没合成）] → select 与 generate 均置 `dirty=true`（复用「有未合成修改」徽标），再次合成后置 false。
- [旧项目无 selectedMaterial 的语义漂移] → 显式缺失 = 遗留语义（video 优先），与当前 compose 行为一致，零迁移。
- [manual 项目候选文件在 run 临时目录，重启后丢失] → saveRun 时即复制进项目目录（`_copyRequired`），不依赖 run 上下文存活。

## Migration Plan

- 无数据迁移：新字段缺省即旧行为；旧项目打开详情页仅显示已有素材（图1/视频），可即时使用生成/选择能力。
- 回滚：分支回退即恢复旧代码；`alternateImages/selectedMaterial` 字段对旧版本读取无害（JSON 多余字段被忽略）。

## Open Questions

- 无（生成视频=本地渲染不消耗 AI 额度、再次合成=复用既有 recompose 链路，均已在 proposal 明确）。
