## Purpose

定义 `agnes-image` 适配器输出格式契约：`response_format` 必须经请求体 `extra_body` 传递（顶层会被网关拒绝）；`b64_json` 模式 Base64 直出，避免二次 URL 下载；缺失 `b64_json` 必须 fail closed。

## ADDED Requirements

### Requirement: response_format 必须放在 extra_body 内传递

`agnes-image` 适配器生成请求 SHALL 将输出格式参数置于 `extra_body.response_format`（url / b64_json），请求体顶层 SHALL NOT 携带 `response_format`（官方文档：顶层字段会被 litellm 网关以 UnsupportedParamsError 拒绝）。

#### Scenario: b64_json 模式请求体

- **WHEN** 调用方传入 `response_format: 'b64_json'`
- **THEN** 请求体含 `extra_body.response_format='b64_json'`，且顶层无 `response_format` 字段

#### Scenario: 默认 url 模式请求体

- **WHEN** 调用方未传 `response_format`（默认 url）
- **THEN** 请求体含 `extra_body.response_format='url'`，且顶层无 `response_format` 字段

### Requirement: b64_json 模式返回 Base64 直出

`response_format='b64_json'` 时 SHALL 返回 `{ images: [{ b64_json }], model, format: 'b64_json' }`；响应数据缺失 `b64_json` SHALL 抛 ProviderError（fail closed），不得回退 url 或执行下载。

#### Scenario: 正常返回

- **WHEN** 网关返回 `data[0].b64_json`
- **THEN** 适配器返回 Base64 直出结果，`format` 为 `b64_json`

#### Scenario: 缺失 b64_json

- **WHEN** 网关返回 `data[0].url` 而调用方请求 `b64_json`
- **THEN** 适配器抛 ProviderError（Missing b64_json in response），不执行任何下载
