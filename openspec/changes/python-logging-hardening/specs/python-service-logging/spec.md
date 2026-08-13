## Purpose

定义 Multi-Publish Python 服务日志契约：标准库/uvicorn 日志统一汇入 loguru 按日文件，HTTP 请求以结构化日志输出（含可关联的 requestId），INFO 级请求日志走 stdout 以保持 sidecar 级别语义正确。

## ADDED Requirements

### Requirement: 标准库日志汇入 loguru
Python 服务 SHALL 将标准库 logging（含 uvicorn/fastapi）记录路由到 loguru，使其进入按日轮转文件，而非仅 stderr。

#### Scenario: uvicorn 日志进入 loguru 文件
- **WHEN** uvicorn/fastapi 通过标准库 logging 产生日志
- **THEN** 该记录 SHALL 经 InterceptHandler 进入 loguru 全局按日文件

### Requirement: 结构化请求日志
Python 服务 SHALL 为每个 HTTP 请求输出结构化请求日志，字段至少包含 method、path、status、duration_ms、request_id；SHALL 关闭 uvicorn 默认 access log 以避免重复。

#### Scenario: 请求完成输出结构化日志
- **WHEN** 一个 HTTP 请求处理完成
- **THEN** 输出一条含 method/path/status/duration_ms/request_id 的 INFO 请求日志

### Requirement: requestId 透传与回显
Python 服务 SHALL 采用请求头 `x-request-id`（白名单 `[A-Za-z0-9._:-]`，≤64）作为 request_id，缺失/非法时自生成；响应头 SHALL 回显 `x-request-id`。

#### Scenario: 合法透传被采纳
- **WHEN** 请求携带合法 `x-request-id` 头
- **THEN** 请求日志 request_id 与响应头 `x-request-id` 均等于透传值

#### Scenario: 缺失时自生成并回显
- **WHEN** 请求未携带 `x-request-id`
- **THEN** 服务自生成 request_id，响应头回显且与请求日志一致

### Requirement: INFO 请求日志走 stdout
访问/请求类 INFO 日志 SHALL 输出到 stdout（而非 stderr），stderr 仅承载 WARNING+，以匹配 Electron sidecar 的 stdout→info / stderr→warn 级别语义。

#### Scenario: 请求日志不误标 WARN
- **WHEN** 请求日志被 Electron sidecar 捕获
- **THEN** 该行出现在 stdout 通道（被映射为 info 级）
