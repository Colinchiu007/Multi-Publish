# logging-contract Specification

## Purpose
TBD - created by archiving change logging-contract. Update Purpose after archive.
## Requirements
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
关键错误路径 SHALL 记录日志（经脱敏），不得静默：IPC 统一错误、主进程 unhandledRejection/uncaughtException、renderer 错误上报、API 5xx（error code+message+stack）、auth introspection/JWKS 失败、webhook 签名校验失败（hook id + 原因码）、retry 第 N 次/原因与熔断状态切换、entitlement 判定结果、Story2Video compose 的生命周期与 FFmpeg 阶段结果。

#### Scenario: 错误路径有日志出口
- **WHEN** 审查关键错误路径实现
- **THEN** 每条路径均有日志调用且经脱敏，合同文档列出证据索引

### Requirement: Story2Video 合成可诊断事件
Story2Video compose SHALL 以结构化 logger meta 记录 composeId 关联的 compose 生命周期、FFmpeg 启动/成功/失败/超时、输出缺失及分块拼接生命周期。长时间分块合并 SHALL 每 10 秒以 INFO 提供输出大小心跳，连续 30 秒无增长 SHALL 以 WARN 标记。事件 SHALL NOT 记录绝对路径、完整 FFmpeg 命令、prompt、凭据或未截断 stderr。

#### Scenario: 87% 长拼接可定位
- **WHEN** 用户报告 compose 停留在 concat 87%-89%
- **THEN** 日志可按 composeId 查询到当前 chunk 的 level/index、FFmpeg 启动状态、最近输出大小、心跳、最终成功/失败/超时结果

### Requirement: 禁止明文敏感与静默边界
日志 SHALL NOT 以明文记录 token/apiKey/password/cookie/JWT（源头不打印优先，redact 为最后防线）；已知静默区（remotion/story2video 引擎库、pre-Vue 入口失败、runSelfCheck 排队被拒观测盲区）SHALL 在合同文档中显式标注为文档化边界。

#### Scenario: 静默边界文档化
- **WHEN** 读取合同文档静默边界章节
- **THEN** 每个已知静默区均有边界说明与处理建议

