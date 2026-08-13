---
id: s2v-manual-video-parallel
title: manual 模式视频候选生成并行化 - 设计
status: proposed
created: 2026-08-13
---

# 设计：manual 候选生成并行化

## 现状（基线）

`apps/desktop/electron/services/story2video-stages.js`：

- `generate_assets` executor（~line 1719）内已定义 `resolveBudgetConcurrency(type, providerId, requested)`：provider 预算（config `rate_per_minute` > 静态表 > 类别默认）→ `maxConcurrent`，返回 `max(1, min(requested, maxConcurrent))`。auto 路径用它计算 image/tts/video 并发。
- manual 分支（line 1767-1773）调 `buildManualSceneCandidates(ctx)`，ctx 只传 `imageConcurrency`，未传 video 并发。
- `buildManualSceneCandidates`（line 562-855）：视频候选用 `for (const index of videoSceneIndexes) { await ... }` 严格串行（line 605-667），随后才并行生成图片（line 751-760）→ 「视频全完成 → 才出图」。
- auto 视频路径（line 1821-1922）：`requestedVideoConcurrency = firstDefined(params.videoConcurrency, stage.options?.videoConcurrency, 2)` → `videoConcurrency = resolveBudgetConcurrency('video', videoGenerator.providerId, requested)` → `_mapWithConcurrency(videoSceneIndexes, videoConcurrency, itemTask)`，item 内 `withModelBudget` + `withAssetTransientRetry` + prompt 优化 + 失败回退。

## 变更

### 1. executor manual 分支：计算并传递 video 并发

manual 分支在调 `buildManualSceneCandidates` 前：

```js
const requestedVideoConcurrency = firstDefined(params.videoConcurrency, stage.options?.videoConcurrency, 2)
const videoConcurrency = videoGenerator
  ? resolveBudgetConcurrency('video', videoGenerator.providerId, requestedVideoConcurrency)
  : 1
log.info('Story2VideoStages', 'video generation concurrency=' + videoConcurrency +
  ' (requested=' + requestedVideoConcurrency + ', scenes=' + videoSceneSet.size + ')')
```

并将 `videoConcurrency` 加入 ctx（`buildManualSceneCandidates` 解构参数列表）。

### 2. buildManualSceneCandidates：视频并行 + 与图片并行启动

- 视频段：`for` 循环替换为 `_mapWithConcurrency(videoSceneIndexes, videoConcurrency, videoItemTask)`；`videoItemTask` 保留原循环体逻辑：resume 复用（manual 无 audioPath，仅 videoPath 存在时复用）、prompt 优化、`withModelBudget` + `withAssetTransientRetry(generateSceneVideo)`、失败回退（`videoResults.set(index, {success:false,...})`）、`videosDone += 1; writeAssetsProgress()`。
- 图片段：抽取为独立 `imagePromise`（`_mapWithConcurrency(imageTargets, imageConcurrency, item => 2 图顺序生成)`，同场景 seq 0→1 顺序保持）。
- 汇合：`const [videoOutcomes, imageOutcome] = await Promise.all([videoPromise, imagePromise])`。
- 候选清单组装、content-policy 优先失败、failedScenes 判定、`scene_asset_selection` 检查点与返回结构不变。

### 3. 并发安全核对

- 视频写 `os.tmpdir()/story2video/videoscenes/<runId>/scene_video_<index>.mp4`（index 隔离）；候选复制到 `candidates/scene_<i>_2.mp4`（index 隔离）→ 无同路径并发写。
- 图片写 `assets/<runId>/img_<index>.jpg` + 候选复制 `candidates/scene_<i>_<seq>.jpg`；同场景内 seq 0→1 保持顺序，不同场景 index 不同 → 无覆盖。
- `videosDone/imagesDone` 计数器在单线程 JS 中安全，`writeAssetsProgress` 每次更新 context。

### 4. 不变量

- 视频失败回退：该场景候选仅 2 图（原语义）。
- `manualMaterialMode='all-images'`：`effectiveVideoSceneSet = new Set()` → 无视频任务，行为不变。
- auto 路径零改动。

## 测试策略

在 `story2video-manual-assets.test.js` 增加：

1. video-image + 2 视频场景：mock `generateSceneVideo`（经 manager.callAdapter）用可控 promise + gate，断言最大 in-flight = 2（视频并行），且图片生成在视频完成前已启动（图片与视频并行）。
2. 预算收敛：provider 预算 maxConcurrent=1（mock manager.getProvider 返回 `{config:{rate_per_minute:1}}`）→ 断言最大 in-flight = 1，两个视频均成功。
3. 视频失败回退：一个视频失败 → 该场景候选仍 2 图（无 video 候选）、checkpoint 正常、流水线不中断。
4. 契约回归：all-images 2 图、跳过 TTS、`scene_asset_selection` checkpoint、finalize_assets 与 pipeline-engine 集成用例保持通过。

## 验收

- `npx vitest run services/story2video-manual-assets.test.js services/story2video-stages.test.js` 全绿。
- manual 模式单测覆盖：并行（in-flight=2）、预算收敛（in-flight=1）、失败回退、契约不变。
