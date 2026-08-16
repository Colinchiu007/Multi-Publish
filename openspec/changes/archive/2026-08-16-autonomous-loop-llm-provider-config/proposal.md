## Why

用户用例是冷门三方/中转站 LLM：脚本层（`packages/ai-autonomous-tester`）已支持 `LLM_BASE_URL`、`LLM_MODEL` 环境变量与 openai/anthropic 双协议（`run-autonomous-e2e.js:360-376`、`run-agent-judge.js:217-267`），但 `.github/workflows/autonomous-loop.yml` 写死 `LLM_PROVIDER: openai` 且不暴露 base URL / 模型名覆盖点。即使仓库在 `OPENAI_API_KEY` secret 填三方 key，runner 仍请求官方端点与默认模型名，中转站不可用。另：降级判定只看 `OPENAI_API_KEY`，Anthropic key 用户会被误判为「无 key」而降级。

## What Changes

- `workflow_dispatch` 新增三个输入：`llm_provider`（openai/anthropic，默认 openai）、`llm_base_url`（OpenAI 兼容端点，默认空=官方）、`llm_model`（模型名，默认空=协议默认）。
- job env 接线：`LLM_PROVIDER` / `LLM_BASE_URL` / `LLM_MODEL` = inputs 优先、secrets 兜底（`secrets.LLM_PROVIDER/LLM_BASE_URL/LLM_MODEL`）、最后默认值；新增 `ANTHROPIC_API_KEY` env（PR 事件仍不注入任何 secrets）。
- `Report final status` 降级条件收紧为「`OPENAI_API_KEY` 与 `ANTHROPIC_API_KEY` 同时为空」才降级，避免 anthropic 用户被误标绿。
- `.github/scripts/autonomous-loop-workflow.test.js`：新增中转站配置契约断言 + ANTHROPIC key 不降级用例（共 9 个测试）。
- 不修改 runner/脚本代码（脚本层已具备能力）；不改变 PR 只读凭据契约。

## Capabilities

### Modified Capabilities

- `ci-autonomous-loop`: LLM 供应商可配置契约（inputs/secrets 双通道接线）、降级条件收紧为无任何 LLM key。

## Impact

- `.github/workflows/autonomous-loop.yml`（inputs + env + 降级条件）
- `.github/scripts/autonomous-loop-workflow.test.js`（契约用例扩展）
- `openspec/specs/ci-autonomous-loop/spec.md`（新增 2 Requirement）
- 远端可选项：配置 `LLM_BASE_URL` / `LLM_MODEL` secrets（或 dispatch 时直接填 inputs）
- 行为保持：什么都不配时仍为 OpenAI 官方 `gpt-4o-mini`；PR 事件仍降级只读检查。
