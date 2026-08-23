# s2v-publish-skip-jump — 需求与改动说明

## 用户反馈（2026-08-21）

1. 视频创作流水线未勾选任何发布平台时，「发布」阶段在流水线进度状态中显示「已完成」。
   期望改为提示「未选发布，跳过」，把「未选择平台」与「真实发布成功」明确区分。
2. 启动流水线后执行完，运行停止但没有跳转到视频预览（视频详情页）；以前是正常的。
   期望流水线执行完成后自动进入结果页。

## 根因

- Bug 1（引擎状态语义）：`PipelineEngine._advanceRun()` 只认 `completed`，StageExecutor 发布
  阶段未选平台返回 `output.skipped=true` 后仍被推进为 `completed`，阶段快照/历史/进度板因此显示
  「已完成」。
- Bug 2（完成即跳转回归）：`feat: auto-background video pipeline runs (#1019)` 后
  `runOrchestrationInBackground()` 完全脱离 runId（reset 后清空、不轮询），因此 run 在后台结束后
  创作页不再监听到终态，也就无法自动进入结果页。

## 改动清单（对照）

- `apps/desktop/electron/services/pipeline-engine.js`
  - `_advanceRun(run, opts)` 支持 `opts.skipped`：跳过阶段以 `skipped`/`skippedAt` 收尾，而不是伪造 `completed`。
  - `advance()` / `executeStage()` / `advanceToNextCheckpoint()` / `_autoAdvanceRun()` 在可判定跳过处传给 `_isStageSkipped()`。
  - `_calcProgress()` 把 `skipped` 阶段也算作已完成，保证完成态进度 100%。
- `apps/desktop/src/views/video-creation/StageProgress.vue`
  - 新增 `skipped` 状态渲染：class、图标、状态文案；发布阶段显示「未选发布，跳过」。
- `apps/desktop/src/styles/stage-progress.css` / `history-panel.css`
  - 新增 `skipped` 灰度样式。
- `apps/desktop/src/views/CreateViewHistory.vue` / `CreateHistory.vue`
  - 历史卡片阶段 chip 对 `skipped` 正确归类与计数（完成态进度不缩水）。
- `apps/desktop/src/i18n/pipeline-labels.js` + locales zh/en
  - 新增 `skipped` 状态映射与文案（`pipelines.statuses.skipped`、`stageProgress.statusSkipped`、`stageProgress.publishSkipped`、`create.history.statuses.skipped`）。
- `apps/desktop/src/views/CreateView.vue`
  - `runOrchestrationInBackground()` 保留 runId 并开启 `s2vBackgroundTracking` 完成监听
    （不重写可见进度）；新增 `startBackgroundCompletionWatch()` / `checkBackgroundRunCompletion()`；
    `handlePipelinePush` 后台态只消费终态事件；run 完成自动进入结果页（`/create/result`），
    失败/取消停止监听并刷新历史。
- `01-docs/PRD-video-creation.md`
  - 补充「未选发布，跳过」与完成跳转两条合同，版本号 v1.9 → v1.10，新增 2026-08-21 修订行。

## 回归保护

- 引擎：`pipeline-engine.test.js` 新增“发布未选平台 → 阶段 `skipped`、run `completed`、进度 100”。
- 前端：`StageProgress.test.js` 新增 skipped 渲染；`CreateView.test.js` 更新自动后台断言并新增
  后台完成自动跳转结果页用例。
