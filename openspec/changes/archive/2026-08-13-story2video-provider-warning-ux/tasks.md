# Tasks: story2video-provider-warning-ux

## 差异审计（基线 vs 现状）

- 已交付：模型服务异常检测（provider-anomaly，commit d0a59fc2）—— 横幅展示、bus 快照、阈值。
- 待办：① providerWarnings 按运行归属过滤；② 横幅 X 关闭按钮；③ 新运行/取消/切换流水线时重置状态。
- 待确认：无。

## Implementation Tasks

- [x] 主进程：`ProviderAnomalyBus.snapshotSince(sinceIso)` 按时间边界过滤（含边界）；非法边界回退全量快照
  - 测试：`apps/desktop/electron/services/provider-anomaly.test.js`（snapshotSince 边界/未来/数值/非法回退 4 例）
- [x] 主进程：`pipeline:getRunContext` 以运行 `createdAt` 为边界调用 `snapshotSince`
  - 测试：`apps/desktop/electron/ipc-handlers/pipeline.test.js`（按 createdAt 调用、旧异常不附加、无 createdAt 回退、空警告省略字段）
- [x] 渲染进程：横幅 X 关闭按钮 + `dismissedProviderWarnings` 状态；`startPipeline`/`cancelPipeline`/`selectPipeline` 重置
  - 测试：`apps/desktop/src/views/CreateView.test.js`（关闭隐藏、新运行重置、切换流水线重置、取消重置、轮询清空旧警告）
- [x] 样式：`.provider-warning-banner-close`（color-mix 主题色 hover）
- [x] 门禁：受影响单测 218 全绿 + `vite build` 通过
- [x] 双模型审查（claude + codex 降级替代 antigravity）并修复 W1/采纳 filter-first 加固
- [x] PR 合并与远程状态核对（PR #702 merged 49ea4dd7，2026-08-13）
- [x] 三同步归档：openspec archive + CCG task 归档 + learnings 追加
