# 需求

推理模型（opencode-go / mimo-v2.5）慢响应可达 27~53s，PromptBridge HTTP 请求超时 60s 会提前掐断。将 HTTP `requestTimeout` 与 CLI fallback 超时统一放宽到 120s，与 prompt-engine provider 默认 timeout 对齐，配套推理空 content 修复。
