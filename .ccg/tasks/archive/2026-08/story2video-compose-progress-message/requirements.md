# Story2Video 合成分块进度消息展示

## 门禁结论

- 变更类型：UI/UX Bug 修复。
- 变更规模：中等，涉及 renderer 组件、回归测试、OpenSpec 与产品文档。
- 风险：中等，修改运行中阶段详情的展示优先级，但不改变流水线执行、合成算法或进度数值。
- 路由：质量节拍 QM-5、TDD、双模型分析与审查、视觉回归、PR/CI。

## 基线与真实待办

- 已交付：PR #839 已让 compose 引擎在分块拼接完成后上报 `percent`、`message`，并记录 `merge_l{level}_chunk_{n} created`。
- 待交付：`CreateView.vue` 与 `StageProgress.vue` 的 compose 兼容分支消费合法非空 `compose_progress.message`。
- 兼容：无 message、空白 message 或历史快照继续按 `phase`/`percent` 使用本地化回退文案。
- 不做：不改变 FFmpeg 编码、转场、分块算法、实际耗时或 87→89 的百分比区间。

## QM-5

1. 第一性原因：renderer compose 分支由 `3a94fb541` / `99cbddd2` 引入时只建模 phase/percent；后续 `01baec4c2` 只为通用 `stage.progress.message` 增加优先级，未覆盖 legacy `context.compose_progress.message`。
2. 逃逸分析：单元测试只覆盖无 message 的 percent 回退；CreateView 集成测试也只断言片段文案与宽度；无 E2E/视觉断言按块 message，代码审查聚焦进度条存在性，故未拦截。
3. 系统性漏洞：legacy context 降级路径与统一 `stage.progress` 路径的展示优先级未形成共同合同，且缺少 message/空白 message 的成对回归用例。
4. 修复与保护：两处 compose 分支优先返回 trimmed 非空 message；新增 StageProgress 单测与 CreateView 集成测试，保留旧快照回退测试。
5. 预防措施：更新 PRD、OpenSpec 和进度反馈分析/计划文档，明确优先级与“只改善反馈、不提速”的边界。

## 验收标准

- concat 分块事件到达后，阶段详情显示 `正在拼接视频片段（分块 k/N）`，同时进度条继续按 87→89 推进。
- `stage.summary` 与 `stage.progress.message` 的既有优先级不回归。
- 历史快照无 message 或 message 为空白时继续显示本地化 phase/percent 文案。
- 中文/英文 locale 文件无需新增键，renderer 不新增中文字符串字面量。
- 定向测试、locale/CJK 门禁、视觉回归与双模型审查通过。
