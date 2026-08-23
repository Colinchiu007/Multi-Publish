# Review: 视频流水线进度弹窗与后台运行（s2v-progress-modal-background）

## 双模型外部审查

### opencode reviewer（wrapper session ses_fd307aea7ffebaEAJ3dsiA3DGk）

- CRITICAL: 无。
- MAJOR: 非编排流水线首次 `pipelineStatus` 失败后 `pollTimer` 不建立，任务静默失联。
  - 状态：已修复。`startPipeline` 取得稳定 `startedRunId` 后，只要未进入终态或状态未知即建立 3s 轮询；新增回归 `普通流水线首次状态拉取失败时仍建立轮询，后续 tick 可恢复进度弹窗（C1 回归）`。
- MINOR: i18n fallback 未统一走 `translateWithLocaleFallback`；`mergePipelineStages` 按 key 匹配忽略 index；`historyRunId` 相同 runId 会折叠。
  - 状态：`progressTitle` 已改为 `(ctx) => ctx.named('name') + ...` 并补 `{name}` 字面量回归；merge key 与历史折叠为既有低风险实现，记录为 Info，不扩大本轮范围。
- INFO: 推荐为归一化/合并/检查点 helper 补单测；z-index 设计已视觉验证（overlay 100 < action bar 110）；素材检查点仅取消出口已确认与设计一致。

### Claude reviewer（wrapper session 423d3889-2613-48d5-b8af-244429f949cc）

- CRITICAL C1: 非编排流水线首次状态拉取失败后轮询永不建立。
  - 状态：已修复（同上），回归测试见 `CreateView.test.js`。
- WARNING W1: 进度弹窗打开即聚焦“关闭=后台化”按钮，键盘用户按 Enter 可能误触发后台脱离。
  - 状态：已修复。`UiModal.focusProgressDialog` 对 progress variant 不再抢占焦点；`UiModal.test.js` 新增“打开进度弹窗不夺走外部按钮焦点”断言。
- WARNING W2: 终态 push 无 context 时使用旧轮询缓存收尾，可能误报缺少预览。
  - 状态：已修复。终态收尾只信任本次快照携带的 context，否则先 `updateOrchestrationStatus()` 拉全量；新增回归 `终态推送没有携带新 context 时不使用旧缓存收尾，而是拉取全量状态（W2 回归）`。
- INFO I1/I2/I3/I4/I6/I7: 已评审。I3（非编排双进度条）已修复：普通流水线有 stages 时只显示 `StageProgress`，仅无 stages 时才显示 `pipeline-progress-basic`；其余作为文档化边界/后续优化记录。

## 本地主代理复核

- 对 UiModal 关闭策略、detach 重置、`hasManualPipelineCheckpoint` / `hasLegacyPipelineCheckpointEvidence`、runId/request/action generation、普通流水线 identity 边界逐 file:line 复核。
- 定向 Vitest：283 passed（UiModal + StageProgress + CreateView）。
- 浏览器交互验证：桌面 1440x900 与窄屏 390x844，遮罩/Escape 不关闭、右上关闭/后台按钮恢复新建态并显示指定提示、人工检查点关闭 disabled、action bar z 100/110 可点击、弹窗标题实际渲染“故事讲述 进度”。
- 未发现未修复的 Critical / Major。
