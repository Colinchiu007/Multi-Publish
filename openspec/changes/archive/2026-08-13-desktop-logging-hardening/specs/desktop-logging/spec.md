## Purpose

定义 Multi-Publish 桌面应用日志契约：控制台与文件输出同源脱敏、敏感信息模式全量覆盖、按日文件保留策略（过期清理 + 超限滚动）、消息长度上限，保证日志既可用于排障又不泄露凭据、不无限增长。

## ADDED Requirements

### Requirement: 控制台与文件同源脱敏
桌面日志 SHALL 在控制台与文件两个出口输出相同的脱敏内容；任何敏感信息（Bearer/apiKey/authorization/sk-/Cookie/JWT/access_token/refresh_token/password/secret）SHALL NOT 以明文出现在任一出口。

#### Scenario: 控制台不泄露敏感原文
- **WHEN** 调用方记录含 `Bearer sk-xxx` / `apiKey` 的日志
- **THEN** 捕获的 console 输出不包含敏感原文，且与文件内容脱敏一致

#### Scenario: 扩展敏感模式脱敏
- **WHEN** 日志文本含 Cookie 值、JWT（eyJ 三段）、access_token/refresh_token/password 等
- **THEN** 文件与控制台输出均被脱敏

### Requirement: 按日保留与超限滚动
桌面日志 SHALL 按文件名日期清理超过保留天数（默认 30 天）的 `app-*.log`；单个日志文件超过大小上限（默认 500MB）时 SHALL 滚动到 `.1` 备份而非删除当日文件。

#### Scenario: 过期日志自动清理
- **WHEN** 日志目录存在早于保留天数的 `app-YYYY-MM-DD.log`
- **THEN** 该文件在日志初始化时被删除，其余保留

#### Scenario: 超限滚动不丢日志
- **WHEN** 当前日志文件大小超过上限
- **THEN** 文件被重命名为 `.1` 并从新文件继续写入（当日日志不整体丢失）

### Requirement: 消息长度上限
桌面日志 SHALL 对单条消息施加长度上限（默认 4096 字符），超长截断并标记，防止单行撑爆日志文件。

#### Scenario: 超长消息截断
- **WHEN** 调用方记录超过上限的消息
- **THEN** 落盘/控制台内容被截断且带截断标记
