## Context

prompt-engine v0.20 BYOK 已将需要 LLM 的优化请求切换为调用方自带密钥：图片 creative_level>3 或 video 域请求必须携带 llm，而 ops-center 双路评测默认 creative_level=8。当前 ops-center 已有统一的模型密钥解析和双路编排，只缺少把这份 LLM 配置沿调用链传到 /v1/optimize。

## Goals / Non-Goals

**Goals:**
- 让 dual prompt-eval 调用新引擎时携带合法的 llm 绑定和 caller。
- 复用已有模型密钥表/环境变量回退逻辑，缺 key 时在 ops-center 入口快速返回可操作的 400。
- 保留引擎客户端对旧调用方和免 LLM 请求的兼容性，并用回归测试锁定请求体契约。

**Non-Goals:**
- 不修改独立 prompt-engine 仓库或引擎端 provider 实现。
- 不改变图片生成模型、视觉评估模型或中英翻译服务的密钥选择逻辑。
- 不把 api_key 写入 engine_meta、日志或前端响应。

## Decisions

### D1: 在 router 解析一次，engine_ctx 透传

routers/prompt_eval.py 的 _llm_cfg() 继续作为 dual 入口的唯一 LLM 配置来源；返回配置同时携带引擎 provider 名。创建 run 时将 {provider, model, api_key, base_url} 放入 engine_ctx.llm，prompt_eval_service.create_run() 只负责透传，不重复读库或解密。

### D2: provider 映射对齐 prompt-engine 注册名

模型密钥表的 minimax-llm 是 ops-center 的用途标识，不是 prompt-engine provider 名；使用 minimax-llm -> minimax 映射。为未来扩展保留 sensenova-llm -> sensenova、deepseek -> deepseek，未知 provider 回退 openai_compat，与桌面端已有映射保持一致。

### D3: 客户端显式可选字段

engine_client.optimize() 增加可选 llm 与 caller 参数，仅在非空时加入 JSON payload。dual 调用显式传 caller=ops-center；未传 llm 的旧调用仍由引擎自身按 HTTP 422 fail-closed，客户端沿用现有 EngineUnavailableError。

### D4: 密钥边界

api_key 只存在于从 ops-center 到 prompt-engine 的内存请求体，既不写入 engine_meta，也不通过日志记录。引擎端 BYOK 工厂负责校验 provider/model/key；ops-center 只做存在性和来源映射校验。

## Risks / Trade-offs

- 旧版 prompt-engine 可能忽略新增字段，但不影响现有字段和免 LLM 路径；新引擎则能满足 creative_level=8 的必填约束。
- 未知 ops-center provider 映射到 openai_compat 可能在引擎端暴露不支持配置；这是 fail-closed 行为，避免错误地把 ops-center 用途名直接发送给引擎。
- 请求体包含 api_key 是 BYOK 协议要求；通过不落日志/不落库和现有 HTTPS/内网部署边界控制暴露面。
