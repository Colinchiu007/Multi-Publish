# http-request-tracing Specification

## Purpose
定义 API 发布服务器请求级关联与结构化访问日志契约：每个请求拥有可关联的 requestId（响应头回显、错误日志携带），access log 以结构化 JSON 输出完整请求上下文，支撑生产排障与端到端追溯。
## Requirements
### Requirement: 请求级关联 ID
API 发布服务器 SHALL 为每个请求生成请求级关联 ID，将其回显到响应头 `x-request-id`，并在请求错误日志中携带该 ID；合法的客户端透传 `x-request-id` 头（字母/数字/`.`/`_`/`:`/`-`，长度 ≤64）可被采纳，否则服务器自生成。

#### Scenario: 请求响应回显 requestId
- **WHEN** 任意业务请求到达服务器并返回响应
- **THEN** 响应头包含 `x-request-id`，且该值与请求日志中的 requestId 一致

#### Scenario: 客户端透传合法 requestId
- **WHEN** 请求携带合法的 `x-request-id` 头
- **THEN** 服务器采纳该值作为关联 ID（不回退自生成）

#### Scenario: 非法透传被忽略
- **WHEN** 请求携带非法（超长/含非法字符）的 `x-request-id` 头
- **THEN** 服务器自生成关联 ID，不使用透传值

### Requirement: 结构化访问日志
访问日志 SHALL 以单行 JSON 结构化输出，字段至少包含：ts、method、path、status、durationMs、requestId、ip、userAgent；当响应为错误（4xx/5xx）时 SHALL 包含 errorCode（响应 error 码）。

#### Scenario: 正常请求结构化输出
- **WHEN** 一次请求完成并写入访问日志
- **THEN** 日志行为合法 JSON，且包含 ts/method/path/status/durationMs/requestId/ip/userAgent 字段

#### Scenario: 错误响应关联 errorCode
- **WHEN** 请求以 4xx/5xx 错误响应结束（响应含 error 码）
- **THEN** 访问日志行包含该 errorCode

### Requirement: 错误日志关联 requestId
服务器错误/告警日志 SHALL 携带当前请求的 requestId，使错误详情与 access log 可关联。

#### Scenario: 错误日志含 requestId
- **WHEN** 请求处理中出现错误并记录 error/warn 日志
- **THEN** 日志上下文包含该请求的 requestId

