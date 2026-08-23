## Why

2026-08-21 的前台跟踪合同恢复了启动后的进度观察，但进度仍嵌在长配置页面中，且此前因“自动后台运行”改造移除了用户需要的【后台运行】入口。用户无法在保留底部操作条的同时收起进度信息，也无法明确区分“关闭进度窗口”和“取消任务”。

## What Changes

- 将视频创作流水线运行进度从启动页正文迁移到统一的进度弹窗。
- 进度弹窗完整复用总进度、阶段列表、阶段详情、子进度、时间说明、模型警告和 BGM 提示；素材选择检查点保留在弹窗内的可操作区域。
- 为运行中的编排流水线恢复【后台运行】按钮；点击按钮或右上角关闭按钮均只停止 renderer 跟踪、关闭弹窗、恢复新建态，不取消主进程 run。
- 进度弹窗禁止遮罩点击和 ESC 关闭，只允许右上角关闭；关闭保留缩小缩放离场动效。
- 调整弹窗层级与布局，使底部固定操作条继续可点击。
- 普通非编排流水线使用同一进度视觉壳和安全生命周期清理，但不新增未经后端支持的按 run 控制或恢复契约。
- 同步中英文 locale、Story2Video 页面 PRD、视频创作 PRD、设计/架构说明、CHANGELOG、learnings 和 OpenSpec/CCG 记录。

## Capabilities

### New Capabilities

- pipeline-progress-modal: 统一视频流水线进度弹窗的内容、关闭策略、尺寸、层级和响应式行为。

### Modified Capabilities

- s2v-pipeline-always-background: 修改运行中编排流水线的前台观察与显式后台脱离行为，保留主进程后台执行和并发占用合同。
- story2video-page-ux: 修改流水线启动页运行态的进度承载方式与底部操作条交互。

## Impact

- Renderer：CreateView.vue、UiModal.vue、StageProgress.vue 及对应 CSS/测试。
- i18n：apps/desktop/src/locales/zh.js、en.js 成对新增/修订文案。
- 产品文档：01-docs/PRD.md、PRD-video-creation.md、PRD-S2V-PIPELINE-PAGE-UX.md、DESIGN.md 或视频架构文档、CHANGELOG.md、learnings.md。
- 不新增 Electron IPC、数据库字段或第三方依赖；普通流水线 run identity 缺口单独记录为后续优化项。
