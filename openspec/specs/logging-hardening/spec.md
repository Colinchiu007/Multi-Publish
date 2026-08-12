# logging-hardening Specification

## Purpose
定义 Multi-Publish 日志体系加固契约：敏感信息不得以明文进入任何日志出口，HTTP/鉴权/安全/重试路径的错误与事件必须可观测，覆盖 Python 发布器与 API 发布引擎的发布、服务、鉴权、webhook 与重试熔断链路。
## Requirements
### Requirement: 日志敏感信息脱敏
系统 SHALL 不得将敏感凭据（平台上传 token、签名 URL、API Key、Cookie、密码、授权/刷新 token 等）以明文写入任何日志出口（文件/控制台/stdout/stderr）；日志可包含非敏感的元信息（状态码、键名、过期时间、布尔结果）。

#### Scenario: 抖音上传授权日志
- **WHEN** douyin 发布器记录一次上传授权成功
- **THEN** 日志行 SHALL NOT 包含 token 值或签名上传 URL，且 MAY 包含非敏感元信息（状态码、键存在性、过期时间）

#### Scenario: 上传 token 泄漏回归防护
- **WHEN** 测试执行 douyin 上传授权路径并捕获日志输出
- **THEN** 捕获的日志中不包含 token 字段的明文值

### Requirement: HTTP 服务错误路径必须记录错误
API 发布服务器 SHALL 对每个因内部错误而返回 4xx/5xx 的请求记录错误日志（错误码 + 消息 + 可用堆栈，经脱敏），并且 SHALL NOT 静默吞掉异常。

#### Scenario: 内部错误返回 5xx
- **WHEN** 请求处理抛出异常且服务器返回 500/503 响应
- **THEN** 服务器以 error 级记录错误码、消息与堆栈（脱敏后）

#### Scenario: 空 catch 吞错
- **WHEN** 处理分支捕获异常但既不响应也不记录
- **THEN** 该异常 SHALL 被记录，不得存在静默吞错分支

### Requirement: 鉴权与安全事件必须记录
鉴权与 webhook 安全路径 SHALL 记录安全相关失败（鉴权提供方不可用、token 无效、introspection/JWKS 失败、entitlement 拒绝、webhook 验签失败、webhook 投递失败），且 SHALL NOT 记录 token 明文。

#### Scenario: 请求鉴权失败
- **WHEN** 请求鉴权失败（token 缺失/无效、提供方不可用、entitlement 拒绝）
- **THEN** 以 warn/error 级记录失败原因码与安全上下文（不含 token 值）

#### Scenario: webhook 验签或投递失败
- **WHEN** webhook 签名校验失败或投递失败
- **THEN** 记录 hook id/事件/原因码/目标 host（不含签名密钥等敏感值）

### Requirement: 重试与熔断事件可观测
重试中间件 SHALL 记录重试尝试与熔断状态迁移（open/half-open/close），并携带熔断键。

#### Scenario: 重试尝试
- **WHEN** 一次操作失败并进入重试
- **THEN** 日志记录尝试序号、失败原因与退避延迟

#### Scenario: 熔断状态迁移
- **WHEN** 熔断器状态迁移到 open / half-open / close
- **THEN** 日志记录熔断键与新状态

