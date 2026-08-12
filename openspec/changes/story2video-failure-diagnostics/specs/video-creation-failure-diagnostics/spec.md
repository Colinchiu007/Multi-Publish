## Purpose

Provides unified, structured diagnostics for video-creation pipeline failures — normalized classification, root-cause candidates, run-level telemetry, and best-effort environment snapshots — so failures can be explained, aggregated, and learned from without manual log archaeology.

## ADDED Requirements

### Requirement: 失败样本统一分类

系统 SHALL 对视频创作流水线的每次失败 run 产出结构化分类，包含 `stage`（阶段）、`failureType`（失败类型）、`severity`（严重度）、`recoverability`（可恢复性）。输入缺失、为空或无法识别时 SHALL fail-closed 归入 `unknown` 桶，保持输出结构稳定且不抛错，且不得影响 run 终态。

#### Scenario: 已知失败可分类

- **WHEN** 一次 run 在 compose 阶段以 ffmpeg 超时失败，且错误文本包含 `ETIMEDOUT` / `timed out` / `超时` 之一
- **THEN** 分类结果为 stage=compose、failureType=timeout、severity=blocker、recoverability=retryable，调用不抛错

#### Scenario: 未知失败归入 unknown 桶

- **WHEN** 分类器收到空输入、非对象或未知枚举值
- **THEN** 返回所有字段为 `unknown` 的稳定结构，不抛错、不丢弃调用

### Requirement: 根因候选映射

系统 SHALL 基于分类结果与错误文本产出候选根因列表，每项包含 `causeId`、`label`、`checks`、`advice`、`confidence`。未命中任何规则时 SHALL 返回通用建议候选（低置信度），不得编造具体根因。

#### Scenario: 命中根因规则

- **WHEN** 错误文本包含 `ECONNREFUSED` 且阶段为 split 或 optimize
- **THEN** 候选根因包含「Python sidecar 未运行或端口被占用」类条目，附带可执行 checks 与 advice

#### Scenario: 未命中给出通用建议

- **WHEN** 错误文本与错误码不匹配任何根因规则
- **THEN** 返回 `unknown` 候选（通用建议），confidence 为低值，不虚构具体原因

### Requirement: 环境快照 best-effort

系统 SHALL 在 run 结束时采集环境快照（内存、CPU、磁盘余量、ffmpeg/ffprobe 可解析性、sidecar 运行标志）。任一项采集失败 SHALL 以 `null` 占位；整体采集 SHALL 永不抛错，且不得改变 run 终态与既有字段。

#### Scenario: 采集单项失败

- **WHEN** 磁盘余量探测在目标平台不可用（如无 statfs 支持）或探测抛错
- **THEN** 该字段为 null，其余字段正常产出，run 终态不受影响

### Requirement: 诊断附加字段契约

系统 SHALL 在 run 终结（完成/失败/取消）时对 run 对象附加 `run.diagnostics`（分类 + 根因候选 + 环境快照），作为纯新增字段；SHALL 保持既有 IPC 返回契约 `{code, errorCode, message, messageParams}` 与历史/断点持久化逻辑不变；诊断输出 SHALL 采用字段白名单，不包含密钥、令牌、API Key 或明文凭据。

#### Scenario: 附加字段不影响既有行为

- **WHEN** 一次 run 完成或失败并生成 diagnostics
- **THEN** 既有字段（status/error/stages/context）与既有行为保持不变，仅新增 diagnostics 字段

#### Scenario: 诊断输出脱敏

- **WHEN** 错误对象携带 `errorParams` 或上下文包含敏感内容
- **THEN** diagnostics 不携带 `errorParams` 原文与敏感字段，仅保留白名单字段（错误码与截断错误文本）

### Requirement: 诊断样本可序列化

系统 SHALL 保证 diagnostics 为纯 JSON 原始对象（无循环引用、无函数、无 Symbol），可序列化落盘，供后续跨 run 聚合使用；跨 run 聚合统计不在本期范围内。

#### Scenario: 样本可落盘

- **WHEN** 对 run.diagnostics 执行 JSON.stringify
- **THEN** 输出为有效 JSON，且不包含凭据类字段
