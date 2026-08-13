# shared-utils-logging Specification

## Purpose
定义 Multi-Publish 共享库同步日志契约：文件与控制台输出同源脱敏，日志路径与轮转上限可注入以便测试与运行时覆盖，API 与既有调用方保持向后兼容。
## Requirements
### Requirement: 文件与控制台同源脱敏
共享库日志 SHALL 对写入文件与控制台的内容应用相同的敏感信息脱敏；Bearer/apiKey/access_token/refresh_token/password/secret/authorization/cookie/sk-/通用 JWT SHALL NOT 以明文落盘或输出。

#### Scenario: 敏感信息落盘脱敏
- **WHEN** 调用方记录含 `Bearer sk-xxx` / `access_token=…` / Cookie / JWT 的日志
- **THEN** 日志文件与控制台输出均不包含敏感原文

### Requirement: 路径与轮转上限可注入
共享库日志 SHALL 提供 `setLogOptions`，允许注入日志文件路径、单文件大小上限与级别；默认行为（Electron userData / cwd logs、5MB 轮转 .1、LOG_LEVEL 环境变量）保持不变。

#### Scenario: 注入测试路径
- **WHEN** 测试通过 `setLogOptions({ file, maxSize })` 注入临时路径与上限
- **THEN** 日志写入注入路径，超限时轮转到 `.1`，默认路径不被写入

