# logging-contract Specification

定义 Multi-Publish 日志体系统一合同：跨设施（桌面主进程 / shared-utils / api-publish-engine / Python / 容器）的 level 枚举、脱敏清单、字段格式、保留策略、强制日志点与静默边界，作为 `01-docs/LOGGING-CONTRACT.md` 与 `.ccg/spec/observability/index.md` 的契约化表述。

## ADDED Requirements

### Requirement: 脱敏模式同源
所有 JS 日志出口 SHALL 使用同一组 5 类脱敏模式（Bearer / 带引号键值 / 无引号键值 / sk- 前缀 / eyJ 通用 JWT），且三处内联实现（desktop logger、shared-utils logger、api-publish-engine log-redact）SHALL 保持同源一致；任何单边修改 SHALL 被契约测试拦截。

#### Scenario: 三处内联脱敏同源
- **WHEN** 契约测试读取 desktop / shared-utils / api-publish-engine 三处脱敏源码
- **THEN** 断言 5 类模式标记在每一处均存在且正则字面量一致

### Requirement: Level 枚举与默认级别
JS 设施 SHALL 使用 `DEBUG < INFO < WARN < ERROR` 四级；Python 设施 SHALL 使用 `DEBUG/INFO/WARNING/ERROR`。默认级别：桌面主进程 INFO、shared-utils debug、Python INFO。

#### Scenario: 默认级别一致
- **WHEN** 契约测试读取各设施默认级别定义
- **THEN** 与合同文档记载的默认级别一致

### Requirement: 保留策略
各设施 SHALL 遵循合同文档记载的保留策略：桌面按日文件 500MB 超限滚动 `.1` + 30 天保留 + 4096 单条截断；shared-utils 5MB 滚动 `.1`；Python loguru 3MB 轮转 / 15 天 / gz；Compose 容器 json-file 50m × 5。

#### Scenario: 保留常量与文档一致
- **WHEN** 契约测试读取各设施保留/截断常量与 `LOGGING-CONTRACT.md`
- **THEN** 常量数值与文档记载一致

### Requirement: 强制日志点
关键错误路径 SHALL 记录日志（经脱敏），不得静默：IPC 统一错误、主进程 unhandledRejection/uncaughtException、renderer 错误上报、API 5xx（error code+message+stack）、auth introspection/JWKS 失败、webhook 签名校验失败（hook id + 原因码）、retry 第 N 次/原因与熔断状态切换、entitlement 判定结果。

#### Scenario: 错误路径有日志出口
- **WHEN** 审查关键错误路径实现
- **THEN** 每条路径均有日志调用且经脱敏，合同文档列出证据索引

### Requirement: 禁止明文敏感与静默边界
日志 SHALL NOT 以明文记录 token/apiKey/password/cookie/JWT（源头不打印优先，redact 为最后防线）；已知静默区（remotion/story2video 引擎库、pre-Vue 入口失败、runSelfCheck 排队被拒观测盲区）SHALL 在合同文档中显式标注为文档化边界。

#### Scenario: 静默边界文档化
- **WHEN** 读取合同文档静默边界章节
- **THEN** 每个已知静默区均有边界说明与处理建议
