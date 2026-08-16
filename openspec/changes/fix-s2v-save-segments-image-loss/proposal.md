# fix-s2v-save-segments-image-loss — Proposal

## Why

「视频创作-历史记录」结果页点击【保存分段】后，页面所有分段图片/素材槽/视频槽全部消失（实测用户复现）。根因：`ResultView.vue` 的 `saveSegments()` 成功后用主进程 IPC 返回的落库数据整体替换 `this.segments`，而主进程返回的分段只含持久化字段（`imagePath` 等），**不含渲染端运行时派生的 `imageUrl / alternateImageUrls / videoUrl`**；替换后没有像重试/重新生成/选素材等其它媒体变更路径那样调用 `refreshSegmentImageUrls()` 重新解析本地媒体 URL，模板 `v-if="segment.imageUrl"` 全部落空 → 图片消失。主进程数据与图片文件本身未丢，纯渲染端状态缺陷。

## 差异审计（基线 vs 现状，2026-08-16）

- R1 渲染端：`apps/desktop/src/views/ResultView.vue:1115-1118` `saveSegments()` 替换 `this.segments` 后缺 `refreshSegmentImageUrls()`——未交付，待办。
- R3 同类缺陷：`ResultView.vue:1163-1188` `replaceSegmentAudio()` 同样以 IPC 返回整体替换分段且无 URL 重建——未交付，待办。
- R2 回归保护：`ResultView.test.js:949/975` 保存分段用例 mock `segments: []`，被长度守卫跳过替换分支，无「返回含 imagePath 分段 → 保存后 imageUrl 仍可解析」真实数据路径——未交付，待办。

## What Changes

- **R1（修复）**：`saveSegments()` 成功后（无论返回分段是否为空）调用 `await this.refreshSegmentImageUrls()`，与 `retrySegment`/`regenerateSceneImage`/`regenerateSceneAudio`/`regenerateScenePrompt`/`selectSceneMaterial` 既有模式一致；`refreshSegmentImageUrls` 对缺 `imagePath` 分段跳过、单段解析失败仅置空该段（fail-closed 粒度不变）。
- **R3（同类修复）**：`replaceSegmentAudio()` 替换分段后同样调用 `refreshSegmentImageUrls()`，避免旁白替换后图片/素材槽消失。
- **R2（回归保护）**：`ResultView.test.js` 新增用例——保存分段返回含 `imagePath` 的非空 segments → `story2videoCreateShareUrl` 以 imagePath 被调用、`segments[0].imageUrl` 非空；保存返回空 segments → 保留当前分段且图片 URL 仍有效；旁白替换后图片不消失。

## Capabilities

- **Modified**: `story2video-history-scene-prompt-persistence` — 新增 Requirement：保存分段/编辑落库后渲染端必须重新解析媒体 URL。

## Impact

- `apps/desktop/src/views/ResultView.vue`（saveSegments + replaceSegmentAudio）
- `apps/desktop/src/views/ResultView.test.js`（回归用例）
- 纯渲染端改动：不涉及主进程存储、IPC 契约、图片文件清理；不触发 QM-1（electron 主进程）打包门禁，走 vitest + CI。
