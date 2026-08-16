## Purpose
autonomous-loop 工作流的派发条件与最终状态语义：PR 派发依赖精确 `autonomous-loop` label；无 LLM API Key 时 `NEED_HUMAN` 属于「降级只读检查」以警告呈现，真实失败保持 fail-closed。

## ADDED Requirements

### Requirement: PR 派发依赖 autonomous-loop label
autonomous-loop 工作流 SHALL 仅在 `pull_request.types: [labeled]` 且 job 级 `github.event.label.name == 'autonomous-loop'` 精确匹配时执行 PR 检查；仓库 SHALL 存在名为 `autonomous-loop` 的 label，否则 PR 打标无法派发；PR 触发 SHALL 受 workflow `paths` 过滤限制（仅自主测试相关路径）。PR 运行 SHALL 保持只读凭据与 artifacts 输出契约（`contents: read`、`persist-credentials: false`、不自动提交）。

#### Scenario: 打标派发可用
- **WHEN** 仓库存在 `autonomous-loop` label 且维护者对满足 `paths` 过滤的 PR 打该 label
- **THEN** workflow 以 `pull_request` 事件执行只读自主检查并上传 artifacts

#### Scenario: label 缺失时 PR 不派发
- **WHEN** 仓库不存在 `autonomous-loop` label，或 PR 未被打该 label
- **THEN** workflow 不执行（历史 skipped 状态），且不消耗运行资源

### Requirement: 无 LLM key 时 NEED_HUMAN 降级为只读检查
当自主循环以非 0 退出、job 环境 `OPENAI_API_KEY` 为空、且最新 `autonomous-loop-report-*.json` 的 `finalStatus == "NEED_HUMAN"` 时，最终状态步骤 SHALL 输出 `::warning::` 注解（语义对齐 `agent-review-gate.js` 的 `PROMPT_REVIEW_REQUIRED`）并以退出码 0 结束，不得输出 `::error::` 或返回失败；注解 SHALL 说明原因（未配置 key，报告已上传待人工审阅）。报告目录 SHALL 可通过 `LOOP_REPORT_DIR` 覆盖，便于隔离测试。

#### Scenario: push 无 key 不再假红
- **WHEN** main push 触发自主循环且仓库未配置 `OPENAI_API_KEY`
- **THEN** 循环因无 LLM verdict 得到 `NEED_HUMAN`，最终状态输出 warning（说明需人工审阅报告）并以 0 结束

#### Scenario: PR 无 key（按设计 withheld）以只读检查呈现
- **WHEN** 打标 PR 触发自主循环（PR 事件按契约不注入 key）
- **THEN** 最终状态输出 warning 并以 0 结束，artifacts 供人工审阅

### Requirement: 真实失败保持 fail-closed
最终状态步骤 SHALL 在以下任一条件下输出 `::error::` 并退出 1：退出码缺失或非法；配置了 `OPENAI_API_KEY` 但 `finalStatus == "NEED_HUMAN"`（真实需要人工判断）；无 key 但最新报告 `finalStatus` 非 `NEED_HUMAN`（FAIL/MAX_ITERATIONS 等）；报告缺失或不可解析时 SHALL 回落到失败，不得静默放行。

#### Scenario: 有 key 时 NEED_HUMAN 保持失败
- **WHEN** 已配置 `OPENAI_API_KEY` 且循环以 `NEED_HUMAN` 结束（如 agent 判定需人工介入）
- **THEN** 最终状态输出 error 并退出 1

#### Scenario: 报告缺失回落失败
- **WHEN** 非 0 退出但未找到或无法解析 `autonomous-loop-report-*.json`
- **THEN** 最终状态输出 error 并退出 1，不因 key 缺失而放行

### Requirement: 契约测试锁定降级语义
`autonomous-loop-workflow.test.js` SHALL 覆盖最终状态步骤的降级四象限：无 key + NEED_HUMAN → 0/warning；有 key + NEED_HUMAN → 1；无 key + 非 NEED_HUMAN → 1；无报告 → 1；并保持既有退出码缺失/非法 → 1、仅显式 0 成功的用例。

#### Scenario: 测试锁定
- **WHEN** 契约测试以临时报告 fixture 与受控 `OPENAI_API_KEY` 执行最终状态脚本
- **THEN** 四象限与既有退出码用例全部按预期退出码通过
