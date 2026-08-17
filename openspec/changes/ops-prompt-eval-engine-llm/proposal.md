## Why

prompt-engine 已升级 BYOK（PR #908 合并）：`POST /v1/optimize` 对“需要 LLM 的请求”（图片 `creative_level>3` 或 video 域）强制要求携带调用方 `llm` 绑定对象（`{provider, model, api_key, base_url}`），缺失/非法返回 **422 fail-closed**；引擎不再使用服务端 config 兜底 key。

ops-center 提示词评测「双路对比（engine 变体）」默认 `creative_level=8`（>3），调用引擎时**不携带 llm**——部署版连接同一套新引擎时 engine 变体全部 422 失败（“加载评测列表失败/生成失败”的直接根因之一），双路对比失去意义。

## What Changes

- **引擎客户端透传 llm/caller**：`prompt_eval_engine_client.optimize()` 新增 `llm`（BYOK 绑定）与 `caller`（产品标识 `ops-center`）参数，仅当 llm 非空时写入 payload——对旧引擎/免 LLM 路径保持后向兼容。
- **llm 绑定来源**：复用既有「模型密钥」`minimax-llm`（或 `OPS_PROMPT_EVAL_LLM_*` 环境变量回退）解析，把 ops-center provider 名映射为引擎 provider 注册名（`minimax-llm → minimax`，与桌面端 `engineProviderFor` 语义对齐）。
- **dual run 接入**：`create_run`（dual 分支）调用引擎时携带 llm 绑定与 caller；密钥缺失仍 fail-fast（400 可操作错误），不发起无 key 请求。

## Capabilities

### New Capabilities
（无——BYOK llm 传递是既有双路对比引擎调用的参数扩展）

### Modified Capabilities
- `prompt-eval-ops-workbench`: 引擎调用契约扩展为携带 `llm`/`caller`，llm 绑定来源与 provider 映射；保持 creative_level>3 时缺失 llm fail-closed 语义。

## Impact

- 代码：`ops-center/backend/services/prompt_eval_engine_client.py`（optimize 签名+payload）、`services/prompt_eval_contract.py`（provider→引擎注册名映射）、`routers/prompt_eval.py`（llm 绑定构造）、`services/prompt_eval_service.py`（create_run 透传）。
- 测试：`test_prompt_eval_engine_dual.py` 新增 client payload 断言（假引擎捕获请求体）、API dual 全链路 llm 断言、422 复现、provider 映射单测。
- 外部契约：`POST /v1/optimize` payload 按 LLMBind 契约新增 `llm`/`caller` 字段（引擎 PR #908 已定义）；旧版引擎忽略未知字段，兼容。
- 安全：`api_key` 仅在请求 payload（引擎 BYOK 契约），不落日志/engine_meta。
