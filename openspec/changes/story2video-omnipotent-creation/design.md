# Design: Story2Video 全能创作 — 更名 / 提示词翻译 / 分镜素材自选

## 1. 配置契约（story2videoTextConfig）

新增顶层 `creation` 段（与 `video` 段平行）：

```js
creation: {
  mode: 'auto' | 'manual',              // 默认 'auto'（全自动，现有流水线）
  materialMode: 'all-images' | 'video-image', // 默认 'all-images'；仅 mode=manual 生效
}
```

- normalizer（story2video-text-config.js）：`creation.mode` 枚举校验，非法拒绝（同 video.mode 语义）；`materialMode` 枚举校验；缺失按默认值。
- `stageOptions.generate_assets` 增加 `creationMode`、`manualMaterialMode`（扁平，与 videoMode 同风格）；`stageOptions.finalize_assets` 携带 `creationMode`。
- `_safeOptions` 白名单增加 `creationMode`、`manualMaterialMode`（项目持久化恢复用）。
- 前端 `s2vConfig` 增加 `creationMode: 'auto'`、`manualMaterialMode: 'all-images'`；`S2V_RESTORE_ENUM_OPTIONS` 增加两个枚举白名单；`lastOptions` 白名单保存。

## 2. 阶段流程（pipeline-engine / story2video-stages）

现有阶段：`split → domain_enrich → scene_context → optimize → select_video_scenes → generate_assets → compose → publish`

manual 模式（creationMode=manual）：
- `startOrchestrated` 在 run 创建后、autoAdvance 前，按 `params.story2videoTextConfig.creation.mode==='manual'` 在 `generate_assets` 与 `compose` 之间插入 `finalize_assets` 阶段（run.stages；stageDefs 静态定义但仅 manual 出现在运行阶段清单）。
- `generate_assets`（manual 分支）：
  - 每场景生成 **2 张图片**（同一优化提示词两次独立调用）。
  - `materialMode==='video-image'` 且场景在 video_plan（select_video_scenes 输出）useVideo=true：额外生成 **1 个视频**（同一提示词）。
  - **跳过 TTS**；产出 `assetManifest` 扩展为候选清单：`context.generate_assets = { candidates: [{ index, text, prompt, promptTranslation, candidates: [{ id, kind:'image'|'video', path, meta }] }], materialMode, selectedDefault }`。
  - 返回 `{ success:true, output, checkpoint:true, checkpointMeta:{ type:'scene_asset_selection', required:true } }` → run 进入 paused + checkpoint。
  - 候选路径存于 run 媒体目录（同现有 generate_assets 落盘位置；cleanupRunInputDir 在终态清理，检查点期间保留）。
- 新增 `finalize_assets`（type `story2video_finalize_assets`，auto 模式不运行）：
  - 读取 `context.generate_assets.candidates` + `context.scene_asset_selection.selections`（confirm IPC 写入）。
  - 校验每个场景有且仅有一个已选候选；生成所选场景的 TTS 音频（沿用现有 ttsItemTask 逻辑与并发调度）。
  - 组装最终 `assetManifest`（scenes 含 imagePath 或 videoPath + audioPath，与现状兼容），写回 `context.generate_assets`（保留 candidates 供诊断），compose 阶段无需改动。

## 3. 检查点与恢复

- 检查点暂停：`_autoAdvanceRun` 遇 checkpoint 暂停时，若 `checkpoint.type==='scene_asset_selection'`，调用 `runStateStore.savePaused(run)`（复用 `_write(run,'paused')`，快照新增 `checkpoint` 字段，version 保持 1 增量）。
- 新 IPC `pipeline:confirmSceneAssets(runId, selections)`：
  - 校验 run 存在、`run.status==='paused'`、`run.checkpoint?.type==='scene_asset_selection'`。
  - 校验 selections：每项 `{ index, candidateId }`；index 覆盖全部场景且不重复；candidateId 必须存在于该场景候选清单；非法 fail closed（`INVALID_SCENE_ASSET_SELECTION`）。
  - 写入 `context.scene_asset_selection = { selections, confirmedAt, uiLocale }`，然后调用 `advanceToNextCheckpoint(runId)` 继续（finalize_assets → compose → publish）。
- `resumeOrchestration` 扩展：快照 `status==='paused'` 且 `checkpoint?.type==='scene_asset_selection'` 时，按 currentStage 恢复为 paused（checkpoint 保留），返回 `{ success:true, runId, paused:true }`，前端进入选择面板继续。
- 前端恢复路径 `resumeHistoryItem`：成功且 `paused:true` → 进入选择面板（不自动 advance）。

## 4. IPC 与前端

- preload `publish.js`/`index.bundle.js`：新增 `pipelineConfirmSceneAssets(runId, selections)` → `ipcRenderer.invoke('pipeline:confirmSceneAssets', runId, selections)`。
- api/publisher.js：`pipelineConfirmSceneAssets`。
- CreateView：
  - 「视频增强」details 顶部新增「创作模式」radio（全自动/分镜素材自选）+ 成本提示（自选时）+「素材模式」radio（全部图片轮播/视频+图片轮播，仅自选时显示）+ 说明提示。
  - 提交 `story2videoTextConfig.creation`。
  - `updateOrchestrationStatus` 检测 `checkpoint.type==='scene_asset_selection'` → 显示 `SceneAssetSelection` 面板（从 `orchestrationContext.generate_assets.candidates` 读取，经 `story2videoCreateShareUrl` 生成缩略图 URL）。
  - 面板内每场景单选；默认：有视频候选 → 视频；纯图 → 第 1 张（seq 最小）。确认按钮 → `pipelineConfirmSceneAssets` → 轮询续跑。
  - 历史恢复：paused + scene_asset_selection 检查点 → 进入选择面板。
- ResultView 分段编辑：
  - 「画面提示词」textarea 下方：当 `getAppLocale() !== 'en'` 且 `segment.promptTranslation` 非空 → 只读展示 `segment.promptTranslation`（data-testid `segment-prompt-translation`）。
- 更名：i18n zh/en `pipelines.names/descriptions.story2video-compose`、`create.story2video.configurationTitle`、`story2video.access_denied`、`selectVideoScenesOff`；pipeline-labels 无硬编码（走 i18n）；E2E 断言文案更新。

## 5. 提示词翻译（promptTranslation）

- `optimize` 阶段完成后，若 `params.uiLocale`（renderer 提交当前 `getAppLocale()`，默认 'zh'）≠ 'en'：对每个场景的优化后提示词调用默认 LLM 批量翻译（同 select_video_scenes 的 generateWithDefault；每批并发 3，瞬态重试 1 次，fail-open：单场景失败置空不阻塞流水线）。
- 结果数组 `context.optimize.promptTranslations`（按 index 对齐）→ generate_assets 把对应项写入每场景 `promptTranslation` → 分段持久化（story2video-project-service `_persistComposeArtifacts` 的 segment 增加 `promptTranslation` 字段，≤20000 字符截断）。
- 兼容：旧项目无该字段 → ResultView 不显示翻译块。

## 6. 数据校验与安全

- normalizer 枚举白名单：`creation.mode ∈ {auto, manual}`、`creation.materialMode ∈ {all-images, video-image}`；非法抛错（同 video 语义）。
- confirm 校验如上；候选 id 防路径穿越（仅允许运行清单内已登记候选，不接收任意路径）。
- 新 IPC 参数 `selections` 必须为数组、纯 JSON（前端 cloneForIpc）。
- i18n 键补充后运行 locales 一致性测试。

## 7. 兼容与回滚

- 旧快照/旧配置无 creation 段 → 按 auto 处理，行为不变。
- 旧项目无 promptTranslation → 不显示翻译。
- auto 模式阶段清单不含 finalize_assets（运行快照 stages 动态生成，前端默认阶段表同步加 finalize_assets 占位以兼容 manual 快照）。
- 未配置视频生成器时 manual+video-image 的 video 场景按现有 select_video_scenes fail-closed 语义处理。

## 8. 测试

- normalizer：creation 枚举/默认/越界/旧配置兼容。
- story2video-stages：manual 候选生成（2 图 / 2图+1视频 / 同提示词）、跳过 TTS、checkpoint 输出；finalize_assets 选择校验 + TTS + 清单组装；auto 模式不插入 finalize_assets。
- pipeline-engine：manual 动态阶段插入；confirmSceneAssets 校验/推进；paused+scene_asset_selection 恢复。
- ipc-contract/preload：新 IPC 通道注册与序列化。
- i18n：zh/en 新键一致性；流水线名/文案断言。
- UI 组件测试：SceneAssetSelection 默认选中、单选、确认回调；ResultView 翻译块显示/隐藏；CreateView 创作模式 UI 联动。
- E2E（真实模型 key Profile）：全自动基线回归 + manual 全部图片轮播 2 图选择 → TTS → 合成完成；断言候选数、默认选中、确认后阶段推进。

## 9. 评审修订（Claude architect 评审 2026-08-12；antigravity 地区不可用已降级）

- **候选文件名冲突（Critical）**：asset-generator 按 `img_<index>.<ext>` 落盘，同 index 两次调用会互相覆盖。manual 候选生成后立即复制到独立候选路径 `assets/<runId>/candidates/scene_<sceneIndex>_<seq>.<ext>`（fs.copyFileSync），注册复制后路径；provider index 语义不变。
- **0 候选卡死（Critical）**：任一场景候选数为 0 时 generate_assets(manual) 直接失败（可读错误列出缺素材场景），不允许进入选择检查点。
- **翻译持久化（Critical）**：promptTranslations 存独立 context 键 `context.prompt_translations = { uiLocale, items:[{index,prompt,translation|null}] }`，不挂到 optimize 输出数组（JSON 往返/断点快照不丢）。
- **uiLocale 默认**：renderer 恒提交 `uiLocale: getAppLocale()`；引擎端缺失默认 'en'（不触发翻译 LLM 调用，防意外消耗）。
- **finalize_assets**：TTS 逐场景写 `context.finalize_assets.partialTts`（resume map），重入跳过已完成场景；TTS 完成后对最终 scenes 执行 alignScenes（字幕时间戳，同 generate_assets）。
- **confirm 并发/幂等**：校验 run 仍处于 paused + scene_asset_selection；写入后单次推进；推进前再查一次 run 状态，double-click 安全。
- **checkpoint 类型**：executor 返回 `checkpoint: 'scene_asset_selection'`（字符串），不依赖布尔。
- **resume 语义**：resumeOrchestration 对 paused + scene_asset_selection 快照恢复为 paused（保留 checkpoint、不删快照、不重跑 generate_assets）；confirm 成功后由 finalize_assets 阶段级 running checkpoint 覆盖；终态由 _finalizeRun 清理。
- **前端阶段表**：STORY2VIDEO_STAGE_NAMES（CreateView + create-view-utils）补充 `finalize_assets`（并顺带补上缺失的 `scene_context`）；pipeline-labels STAGES 增加对应 i18n key。
- **openHistory**：paused + scene_asset_selection 的历史项点击 → resumeHistoryItem（恢复后返回 paused）→ 进入选择面板。
- **manual+all-images**：忽略 videoMode（video_plan 视为空）；manual+video-image：沿用 videoMode 判定；videoMode=off → 全部 2 图。
- **费用提示**：manual 模式 2 图/场景（+视频场景 1 视频），消耗为全自动数倍；UI 强制提示（短文案先测）。
