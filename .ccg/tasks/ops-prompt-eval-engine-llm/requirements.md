# ops-center prompt-eval BYOK LLM 透传

## 根因

prompt-engine BYOK 版本要求图片 creative_level > 3 的 /v1/optimize 请求携带 llm 绑定。ops-center 双路提示词评测默认 creative_level=8，原调用未传该字段，因此部署版连接新引擎时返回 HTTP 422。

## 范围

- 将模型密钥或 OPS_PROMPT_EVAL_LLM_* 回退配置转换为 prompt-engine 的 llm 对象。
- dual run 透传 llm 与 caller=ops-center。
- 保持旧客户端调用的 positional http 参数兼容。
- 缺少 LLM 配置时在 ops-center 返回 400，不向引擎发送空密钥请求。
- api_key 不进入 engine_meta、日志或 API 响应。

## 验收

- 双路真实 HTTP 请求体包含 provider=minimax、model、base_url、api_key 和 caller。
- 已保存 minimax-llm 密钥优先于环境变量。
- 422 继续按 EngineUnavailableError fail-closed。
- 定向双路与相关 PromptEval API 测试通过。
