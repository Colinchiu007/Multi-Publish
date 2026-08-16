## MODIFIED Requirements

### Requirement: 无 LLM key 时 NEED_HUMAN 降级为只读检查
当自主循环以非 0 退出、job 环境 `OPENAI_API_KEY` 与 `ANTHROPIC_API_KEY` **同时为空**、且最新 `autonomous-loop-report-*.json` 的 `finalStatus == "NEED_HUMAN"` 时，最终状态步骤 SHALL 输出 `::warning::` 注解（语义对齐 `agent-review-gate.js` 的 `PROMPT_REVIEW_REQUIRED`）并以退出码 0 结束，不得输出 `::error::` 或返回失败；注解 SHALL 说明原因（未配置 key，报告已上传待人工审阅）。报告目录 SHALL 可通过 `LOOP_REPORT_DIR` 覆盖，便于隔离测试。配置了任一 LLM key（`OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY`）时 SHALL NOT 触发降级。

#### Scenario: push 无 key 不再假红
- **WHEN** main push 触发自主循环且仓库未配置任何 LLM key
- **THEN** 循环因无 LLM verdict 得到 `NEED_HUMAN`，最终状态输出 warning（说明需人工审阅报告）并以 0 结束

#### Scenario: PR 无 key（按设计 withheld）以只读检查呈现
- **WHEN** 打标 PR 触发自主循环（PR 事件按契约不注入 key）
- **THEN** 最终状态输出 warning 并以 0 结束，artifacts 供人工审阅

#### Scenario: 仅配置 ANTHROPIC key 不降级
- **WHEN** 已配置 `ANTHROPIC_API_KEY`（`OPENAI_API_KEY` 为空）且循环以 `NEED_HUMAN` 结束
- **THEN** 最终状态输出 error 并退出 1，不得按无 key 降级放行

### Requirement: 真实失败保持 fail-closed
最终状态步骤 SHALL 在以下任一条件下输出 `::error::` 并退出 1：退出码缺失或非法；配置了任一 LLM key（`OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY`）但 `finalStatus == "NEED_HUMAN"`（真实需要人工判断）；无 key 但最新报告 `finalStatus` 非 `NEED_HUMAN`（FAIL/MAX_ITERATIONS 等）；报告缺失或不可解析时 SHALL 回落到失败，不得静默放行。

#### Scenario: 有 key 时 NEED_HUMAN 保持失败
- **WHEN** 已配置任一 LLM key 且循环以 `NEED_HUMAN` 结束（如 agent 判定需人工介入）
- **THEN** 最终状态输出 error 并退出 1

#### Scenario: 报告缺失回落失败
- **WHEN** 非 0 退出但未找到或无法解析 `autonomous-loop-report-*.json`
- **THEN** 最终状态输出 error 并退出 1，不因 key 缺失而放行

### Requirement: 契约测试锁定降级语义
`autonomous-loop-workflow.test.js` SHALL 覆盖最终状态步骤的降级分类：无任何 key + NEED_HUMAN → 0/warning；有 key（含仅 ANTHROPIC key）+ NEED_HUMAN → 1；无 key + 非 NEED_HUMAN → 1；无报告 → 1；并保持既有退出码缺失/非法 → 1、仅显式 0 成功的用例。SHALL 额外断言 workflow_dispatch 暴露 `llm_provider` / `llm_base_url` / `llm_model` 输入，且 `LLM_PROVIDER` / `LLM_BASE_URL` / `LLM_MODEL` / `ANTHROPIC_API_KEY` env 按输入与事件类型契约接线。

#### Scenario: 测试锁定
- **WHEN** 契约测试以临时报告 fixture 与受控 LLM key 环境执行最终状态脚本
- **THEN** 降级分类与配置断言用例全部按预期退出码/输出通过

## ADDED Requirements

### Requirement: LLM 供应商、端点与模型可配置
workflow_dispatch SHALL 暴露 `llm_provider`（选项 openai/anthropic，默认 openai）、`llm_base_url`（OpenAI 兼容端点，默认空=官方）、`llm_model`（模型名，默认空=协议默认）三个输入。job env `LLM_PROVIDER`、`LLM_BASE_URL`、`LLM_MODEL` SHALL 以 inputs 优先、同名词 secrets 兜底、内置默认值收尾的方式注入。`ANTHROPIC_API_KEY` SHALL 与 `OPENAI_API_KEY` 同样受事件类型约束（PR 事件不注入任何 secrets）。脚本层（`run-autonomous-e2e.js` / `run-agent-judge.js`）SHALL 保持对 `LLM_BASE_URL` / `LLM_MODEL` 的既有支持，本契约不得引入脚本改动。

#### Scenario: 中转站 dispatch 输入覆盖
- **WHEN** 维护者以 `workflow_dispatch` 触发并填写三方中转站的 `llm_base_url` 与 `llm_model`，且 `OPENAI_API_KEY` secret 填三方 key
- **THEN** runner 以该端点与模型名调用真实 LLM 判定，而非降级只读检查

#### Scenario: secrets 兜底自动触发
- **WHEN** main push 触发且仓库配置了 `LLM_BASE_URL` / `LLM_MODEL` secrets（inputs 为空）
- **THEN** env 回落 secrets 指向三方端点/模型，官方默认仅在所有输入与 secrets 均缺失时生效
