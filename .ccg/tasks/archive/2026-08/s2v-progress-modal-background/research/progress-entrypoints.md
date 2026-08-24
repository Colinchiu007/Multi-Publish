# 流水线进度展示入口盘点

## Files Found

- apps/desktop/src/views/CreateView.vue:828-1037 — 实时运行控制区与统一 progress modal。
- apps/desktop/src/views/video-creation/StageProgress.vue:1-240 — 共享阶段详情组件。
- apps/desktop/src/components/UiModal.vue:1-263 — variant="progress" modeless 弹窗。
- apps/desktop/src/views/CreateViewHistory.vue:1-500 — 内嵌历史摘要与恢复入口。
- apps/desktop/src/views/CreateHistory.vue:1-290 — 独立历史页，running 卡片每 5 秒刷新。
- apps/desktop/src/composables/usePipelineHistory.js:1-290 — 历史合并、stale-running 转 interrupted、轮询。
- apps/desktop/src/views/ResultView.vue:1-700,1323-1340 — 结果/编辑页轻量状态与媒体操作 progress。
- apps/desktop/src/composables/usePublishFlow.js:113-141,293-412 — 发布消息日志进度。
- apps/desktop/src/composables/useBatchPublish.js:84-121,359-587 — 批量发布任务进度。
- apps/desktop/src/api/publisher.js:126-127,303-320 — PipelineUpdate 与 pipeline API 边界。

## Dependencies

PipelineUpdate -> publisher.js:onPipelineUpdate -> CreateView.handlePipelinePush -> pipelineRunStatus/orchestrationStages/context -> UiModal(progress) -> StageProgress

pipelineHistory + story2videoListProjects -> usePipelineHistory/CreateHistory -> CreateViewHistory/CreateHistory 历史摘要；running 可返回 /create 查看实时详情。

## Patterns

### 实时运行详情

1. CreateView (CreateView.vue:938-1037)：pipelineProgressModalOpen 打开 UiModal variant="progress"；有 pipelineProgressStages 时挂载 StageProgress。编排流水线使用总进度、阶段数组、context、elapsed、summary；普通流水线在 !isOrchestratedPipeline 且 pipelineRunStatus.progress !== undefined 时显示基础百分比条 (963-970)。checkpoint、状态错误、不可关闭人工等待也在 modal 内展示 (998-1027)。
2. StageProgress (StageProgress.vue:86-117,137-175,221-230)：总进度 clamp 0..100；支持 completed/skipped/running/failed/waiting/paused/cancelled；优先结构化 progress，再 raw message，再按 split/optimize/assets/compose context 降级；阶段子进度优先 stage.progress.percent，compose 兼容 context.compose_progress。
3. 快速渲染/发布子流程 (CreateView.vue:913-916; usePublishFlow.js:352-374; useBatchPublish.js:359-480)：单一 Remotion 百分比条或平台/任务日志，保持专用反馈，不直接塞入 StageProgress。

### 历史摘要

1. CreateViewHistory.vue:98-170：running 只显示运行提示和继续按钮；paused/interrupted/failed 显示阶段、环境或错误；stages 仅渲染分段标签 (160-166)，不是实时详情。running 不进入结果/编辑详情 (约 440+)。
2. CreateHistory.vue:78-93,181-242,271-279：running 显示百分比，缺少后端总进度时按完成阶段数估算；30 分钟未更新的 running 转 interrupted；running/失败/取消/暂停/中断返回 /create，completed 才解析 context 路径进入结果页。
3. usePipelineHistory.js:65-126,151-190：合并项目与 run、排除已匹配 run、保留 failed、stale running 转 interrupted；轮询粒度低于 PipelineUpdate，不能替代实时事件源。

### 结果/编辑页

ResultView.vue:1-20,393-397,1323-1340：顶部仅显示 pipelineRunId && pipelineRunStatus === running 的轻量提示；底部显示 saving/recomposing；裁剪 progress 是媒体编辑进度。完整阶段详情应回到 CreateView 统一 modal，不应在结果页复制 StageProgress。

## Recommended Unification

- 所有当前仍执行的流水线统一进入 CreateView 的 UiModal variant="progress" + StageProgress，包括历史页点击 running/paused/interrupted 后的恢复场景。
- CreateViewHistory/CreateHistory 保留列表、状态、阶段标签、失败原因、stale/interrupted 解释与恢复入口，不复制完整实时详情。
- 快速渲染、批量发布、单段素材生成、ResultView 保存/重组/裁剪继续使用专用短反馈；只有具备 pipeline run/stages/context 契约的状态才进入统一弹窗。

## Risks

- CreateView 同时消费 push 与轮询，必须沿用 frontend spec 的 runId/目标快照守卫，防止取消、后台运行或切换后旧响应污染新 run。
- 历史 5 秒轮询不是实时源，可能落后或暂时移除已完成 run。
- CreateHistory 的阶段完成数估算与 StageProgress 的后端总进度不是同一精度，不能把历史估算值当实时值。
- stale-running 转 interrupted 是展示判定；恢复或控制前应重新读取 run，避免误伤真实后台任务。
- ResultView 状态粒度不足以自行组装 StageProgress，跨页复用必须明确 runId 与流水线类型。
- progress modal 是 modeless 且不注册 Escape；checkpoint 的 closeDisabled 必须按真实业务状态判断，不能只看 status === running。
- StageProgress 的 showTimeGuidance 必须默认关闭并由目标流水线门控，避免 Story2Video 专属文案泄漏。
- onProgress 同时服务发布/渲染流程，粗暴汇总会把平台发布日志污染流水线阶段列表。
