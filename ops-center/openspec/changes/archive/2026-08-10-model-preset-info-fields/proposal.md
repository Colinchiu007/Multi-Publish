## Why

运营后台预设模型设置目前只有 Base URL/模型列表/默认模型文本输入/通用文档链接；缺少「获取模型ID URL、每分钟连接次数、5小时限额次数」等运营信息，默认模型 ID 需手填易错，多模态模型的技术文档 URL 没有按能力分栏。用户要求：增加更多信息项（允许为空、按类型校验）、默认模型 ID 改为下拉 +「获取模型」按钮拉取模型列表、多模态模型按 7 类能力显示技术文档 URL 输入框。

## What Changes

- model_presets 表/服务/API 新增字段：`models_url`（获取模型ID URL）、`rate_per_minute`（每分钟连接次数）、`limit_per_5h`（5小时限额次数）；端口URL 复用 `base_url` 语义（表单更名）。
- 校验扩展：URL 字段 http(s)、数字字段正整数可空、`default_model` 非空时必须 ∈ models 列表。
- 新端点 `POST /api/v1/model-presets/{id}/fetch-models`（admin-only）：从 models_url 拉取模型ID，SSRF 防护（禁重定向/超时/大小限制/私网解析防护/JSON 契约），成功后回写 models。
- 前端表单：默认模型 ID 下拉（选项来自 models）、「获取模型」按钮、限流字段、多模态 7 能力文档 URL 输入框（llm/image/video/tts/voice_clone/speech_recognition/vision）。

## Capabilities

### New Capabilities
- `ops-center/model-preset-info`: 预设模型的运营信息字段、获取模型ID、多模态分能力文档URL。

### Modified Capabilities
（无既有 spec）

## Impact

- backend/models.py、backend/services/model_preset_service.py、backend/routers/model_presets.py
- backend/tests/test_model_presets_api.py
- frontend/src/views/ModelPresets.vue、frontend/src/api/modelPresets.js
- docs/PRD.md、CHANGELOG
- 依赖：新增 httpx（或内置 http client）用于 fetch-models
