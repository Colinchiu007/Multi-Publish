# Review — s2v-progress-sticky

## 需求
视频创作流水线启动后，进度信息固定在出现位置，不随滚动条滚动。

## 实现
.stages-timeline 内新增 .stages-timeline-sticky 容器（进度条 + 百分比 + 已用时 + 完成摘要）：
position: sticky; top: 0; z-index: 5；负 margin 抵消 timeline 内边距使贴顶时背景完整覆盖；
底部圆角 + 轻阴影分隔；阶段明细列表仍随内容滚动。

## 自查（六项）
- 异常处理：纯 CSS + 模板包裹，无异常面。
- 权限边界：无。
- 事务一致性：无。
- 边界值：仅运行/结束时渲染（原 v-if 不变）；orchestration-summary 可选；无运行态不渲染 sticky。
- 风格：复用 var(--bg)，兼容明暗主题。
- 硬编码：无。

## 测试
CreateView.test.js 117 passed（新增 sticky 头部存在 + 位于 stage-list 内断言）。
视觉回归：初始渲染外观不变（sticky 仅滚动时生效），CI visual-test 已跑。
