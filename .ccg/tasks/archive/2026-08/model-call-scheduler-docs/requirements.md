# requirements.md — 模型 API 调用并发/排队/限流机制文档补充

## 需求（用户原话要点）
1. 核验：模型调用是否按「每个模型对应的每分钟限额调用次数」处理并发和排队；限额由运营后台设置/修改，未设置时降级到数据库默认值。
2. 核验：此前实现的并发调用与排队机制是否按此逻辑实现。
3. 更新记忆。
4. 推送 github，合并分支。
5. 相关更新内容补充进 PRD 和相关文档（尽量详细：数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字）。
6. 应用质量节拍。

## 核验结论
- 是。预算链：运营后台 model_presets（DB）→ catalog → 桌面 model_providers.config（DB）→ 桌面 DB 预设种子 PRESET_RATE_LIMITS 回填 → 静态表 PROVIDER_LIMITS → 类别默认 DEFAULT_LIMITS。
- 是。ApiUsageGovernor + model-call-scheduler 实现有界并发/排队/429 自适应/5h 窗口/重入保护。
- 详见 review 与交付记录。

## 交付物
- 01-docs/PRD.md：§7.1.8.1、§7.4.4.3、§7.4.4.4、§7.4.4.5
- 01-docs/product-manual.md：§3.5 模型设置、§3.6 运营后台同步
- openspec/specs/story2video/model-call-scheduler/spec.md：+2 Requirement（排队时序预算、预算来源与数据库默认值降级）
- ops-center/docs/PRD.md：§12A.10.4 未配置降级链路
- CHANGELOG.md：新增条目 + 清理冲突残留
- .quality-gates.md：本次执行记录
