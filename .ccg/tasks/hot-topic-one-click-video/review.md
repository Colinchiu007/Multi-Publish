# 双模型审查报告 — hot-topic-one-click-video

审查时间：2026-09-12
审查范围：git diff ccb857d9..HEAD（13 文件 +983 行）

## 审查执行情况

- **Claude（claude backend）**：完成，产出 3 Critical + 6 Major + 7 Minor 分级报告（session ade1a736）。
- **opencode（opencode backend）**：失败——wrapper 以 stdin 传递完整 diff 时触发 Windows 命令行长度限制（"filename or extension is too long"）。按子代理降级规则，由主代理直接执行修复并复核。

## Claude Critical（3 项，全部已修复）

1. **pipelineCancel() 无 runId 定向取消** → 新增 PipelineEngine.cancelRun(runId) + IPC pipeline:cancel-run + preload/API pipelineCancelRun；HotTopics cancelGenVideo 改用定向取消。回归：pipeline-engine.test.js cancelRun 用例。
2. **mergeGenStages 无终态守卫（乱序推送可把 completed 降级回 running）** → 加 GEN_VIDEO_TERMINAL_STAGE_STATUSES 集合守卫。回归：mergeGenStages 不降级用例。
3. **genVideoElapsedMs 用 Date.now 无响应式依赖（已用时间永远不更新）** → 加 1s tick 定时器驱动重算，stopGenVideoTracking/onUnmounted 清理。回归：运行中用例断言 elapsed 语义。

## Claude Major（6 项，全部已修复）

1. retryGenVideo 缺 genVideoBusy 守卫 → 入口补 busy=true。
2. handleGenVideoClose 后台运行状态分裂（busy=false 可重复发起）→ 引入 background phase，busy 保持 true。
3. storeGetSetting 多余 raw.data ?? raw 解包 → 直接用返回值。
4. 流水线启动失败分支 no-op 循环 → 删除。
5. 缺取消/后台运行测试 → 补 4 个用例（改写取消/运行取消/后台守卫/终态不降级）。
6. s2v-config-snapshot 默认值漂移风险 → 注释锚定 CreateView 源行号（接受，CI grep 校验列为后续可选）。

## Claude Minor（择要处理）

- JSON.parse(JSON.stringify(params)) 双重拷贝 → 已移除（buildStory2VideoTextConfigFromSnapshot 内部已深拷贝）。
- initGenVideoStages 补 id/progress 字段与 StageProgress key 契约一致 → 已修。
- videoPath 缺失错误文案不准确 → 接受（沿用 genVideoPipelineFailed，因该场景极罕见且历史记录可查；专属 key 列为后续优化）。
- 标题 30 字截断宽度差异 → 接受（960px 弹窗可容纳，CSS ellipsis 已有）。

## 修复后验证

- HotTopics.test.js 16/16 passed（含 4 个审查新增回归）
- pipeline-engine.test.js 69/69 passed（含 cancelRun 新用例）
- pipeline IPC + ipc-contract 71/71 passed
- publisher.test.js 236/236 passed
- locale-sync --pair-base/--cjk/--keys 全 PASS
- vite build 通过
