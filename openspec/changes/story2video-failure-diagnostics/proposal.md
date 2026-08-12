## Why

Story2Video / 视频创作流水线失败时，用户和开发者只能看到「阶段失败 + 一条截断 message」：错误码分散（`USER_ERROR_CODES`、各 stage 自定义 `errorCode`、`{code:-1}`、`EC.*` 并存），没有阶段级结构化遥测、没有环境快照、没有跨运行聚合。每次事故都要人工翻日志 + learnings 复盘，归因慢、不可复现、无法区分「慢性问题 vs 偶发抖动」。目标：把分散的失败信号收敛为统一诊断层——采集、归一化、根因关联、展示建议、自愈触发与沉淀闭环。

## What Changes

新增能力，不修改既有对外行为（IPC 返回契约 `{code, errorCode, message, messageParams}` 保持不变；pipeline-engine 仅**附加**新字段）：

- 新增统一诊断码 taxonomy：阶段 × 失败类型 × 严重度 × 可恢复性，未知输入 fail-closed 归入 `unknown` 桶，绝不抛错。
- 新增「错误 → 候选根因」映射表：每个候选含 `causeId / label / checks / advice / confidence`；未命中给通用建议，不编造根因。
- 新增 run 级结构化诊断摘要：`buildRunDiagnostics(run, envSnapshot)` 纯函数，产出 stage 明细 + 失败分类 + 环境快照；在 `PipelineEngine._finalizeRun` 附加 `run.diagnostics`（additive，仅加字段，不改变既有终态/历史/断点逻辑）。
- 新增环境快照采集 `captureEnvSnapshot`：os 内存/CPU/uptime、输出目录所在盘剩余空间、sidecar 运行标志、ffmpeg/ffprobe 可解析性；best-effort，任何单项失败 → `null`，整体永不抛错。
- 失败样本存储 schema 预留（本期仅定义结构与写入 `run.diagnostics`，跨 run 聚合与 UI 展示在后续任务）。

## Capabilities

### New Capabilities

- `video-creation-failure-diagnostics`: 视频创作失败诊断——统一诊断码分类、根因候选映射、结构化 run 遥测与环境快照（本期：分类/映射/采集/附加字段；聚合与 UI 展示为后续增量）。

### Modified Capabilities

无。本期不修改既有 spec 行为（不改变任何既有 Requirement）；`pipeline-engine` 变更仅为附加字段，属实现细节。

## Impact

- 新增 `apps/desktop/electron/services/diagnostics/{taxonomy.js, root-cause-map.js, run-diagnostics.js}` 及同名测试。
- 修改 `apps/desktop/electron/services/pipeline-engine.js`：`_finalizeRun` 附加 `run.diagnostics`（additive）。
- 不触碰 IPC 返回契约、renderer、preload；无新第三方依赖。
- 受影响测试：`pipeline-engine.test.js`（附加字段回归）、新增 diagnostics 单测。
