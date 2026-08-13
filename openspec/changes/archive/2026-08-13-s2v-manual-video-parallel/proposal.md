---
id: s2v-manual-video-parallel
title: manual 模式视频候选生成与 auto 对齐（有界并行 + 图片并行启动）
status: proposed
created: 2026-08-13
---

# manual 模式视频候选生成并行化

## Why

分镜素材自选（creation.mode='manual'）的候选生成目前把 AI 视频候选放在一个串行 for 循环里（`story2video-stages.js` `buildManualSceneCandidates`），且必须等全部视频完成才开始图片候选；实测 2 个视频场景时纯视频阶段就耗时 11+ 分钟，用户等待期间无图片产出。全自动模式（auto）已于 2026-08-13 实现「视频有界并发 + 与图片/旁白并行启动」（PR #726），manual 模式未同步，导致两种创作模式体验割裂。

## What Changes

- **视频候选有界并行**：manual + video-image 的视频候选生成改为 `_mapWithConcurrency`，并发上限沿用 auto 同一套预算机制（provider `rate_per_minute` > 静态表 > 类别默认；请求值默认 2，受 `maxConcurrent` 收敛），逐场景仍保留提示词优化 + `withModelBudget` + `withAssetTransientRetry`。
- **图片候选与视频并行启动**：图片候选不再等待视频全部完成，两路 `Promise.all` 并行推进；进度（`context.assets_progress`）实时更新。
- **契约不变**：每场景 2 图（同场景 seq 0→1 顺序，防同 index 路径并发覆盖）、视频场景 2 图 + 1 视频候选、失败回退（视频失败场景仅 2 图）、候选清单结构、`scene_asset_selection` 检查点暂停、finalize_assets 流程均不变。

## Capabilities

- **Modified Capabilities**: `story2video-creation-mode`（候选素材生成 requirement：补充有界并行与图片并行启动语义）

## Impact

- 代码：`apps/desktop/electron/services/story2video-stages.js`（manual 分支与 `buildManualSceneCandidates`）
- 测试：`apps/desktop/electron/services/story2video-manual-assets.test.js`（新增并行/预算收敛/失败回退断言）
- 文档：`01-docs/PRD-video-creation.md`（manual 候选生成小节）、`CHANGELOG.md`
- 无 API/IPC/DB 变更；不影响 auto 路径行为
