# prompt-eval-ops-workbench Specification (delta: BYOK llm on engine optimize)

## Purpose

既有双路对比（engine 变体）调用 prompt-engine `/v1/optimize` 时使用默认 `creative_level=8`（>3），引擎 BYOK（PR #908）后该级别请求必须携带调用方 `llm` 绑定对象，否则 422 fail-closed。本 delta 规定 ops-center 在调用引擎时携带 llm/caller，llm 绑定来源与 provider 映射，并保持缺 key fail-fast、不静默降级。

## ADDED Requirements

### Requirement: 引擎调用携带 BYOK llm 绑定

双路对比（`compare_mode=dual`）创建 run 时，engine 变体调用 `POST {OPS_PROMPT_ENGINE_BASE_URL}/v1/optimize` SHALL 携带 `llm` 对象 `{provider, model, api_key, base_url}` 与 `caller`（`ops-center`）。`llm` 绑定 SHALL 来源于「模型密钥」表 `minimax-llm`（优先默认项），回退 `OPS_PROMPT_EVAL_LLM_BASE_URL/MODEL/API_KEY` 环境变量；ops-center provider 名 SHALL 映射为引擎 provider 注册名（`minimax-llm → minimax`，其余未注册名 → `openai_compat`，与桌面端 `engineProviderFor` 语义一致）。`api_key` SHALL 仅进入请求 payload，MUST NOT 写入日志或 `engine_meta`。

#### Scenario: dual 创建请求携带 llm
- **WHEN** 创建 `compare_mode=dual` 的 case 并触发 run 且 minimax-llm 密钥已配置
- **THEN** 引擎请求体包含 `llm.provider=minimax`、非空 `llm.model`/`llm.api_key`/`llm.base_url`，且 `caller=ops-center`

#### Scenario: 环境变量回退
- **WHEN** 模型密钥表无 minimax-llm 但配置了 `OPS_PROMPT_EVAL_LLM_*` 环境变量
- **THEN** llm 绑定由环境变量构造（provider 恒为 `minimax`），引擎请求仍携带 llm

### Requirement: 缺 llm 密钥 fail-fast 不退引擎请求

`compare_mode=dual` 创建 run 时若 llm 密钥缺失（表与环境变量均无），后台 SHALL 返回 400 可操作错误（提示在「模型密钥」添加 minimax-llm 或设置 `OPS_PROMPT_EVAL_LLM_API_KEY`），MUST NOT 发起不带 llm 的引擎请求（避免带空 key 请求上游返回误导性 422/502）。

#### Scenario: 未配置 llm 密钥
- **WHEN** dual run 且 minimax-llm 与 `OPS_PROMPT_EVAL_LLM_*` 均未配置
- **THEN** 返回 400 且不调用引擎；manual 变体不创建

### Requirement: 客户端向后兼容

`optimize()` 客户端 SHALL 仅在调用方显式传入 llm 时写入 payload；未传 llm（免 LLM 路径或旧引擎调用方）时 payload 与既有契约一致，不得强制注入。需要 LLM 的请求若因调用方缺 llm 而被引擎 422 拒绝，客户端 SHALL 按既有 `EngineUnavailableError`（HTTP >=400）fail-closed 语义显式报错。

#### Scenario: 免 LLM 路径不带 llm
- **WHEN** 调用方未传 llm（如 `creative_level<=3` 模板直出场景）
- **THEN** payload 不含 `llm` 字段，既有行为不变

#### Scenario: 引擎 422 显式失败
- **WHEN** 引擎因缺 llm/非法 llm 返回 422
- **THEN** 客户端抛出 `EngineUnavailableError`（错误信息含 HTTP 422），不静默降级到人工提示词
