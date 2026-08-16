## Why

两个确定性 CI 问题：① PR 事件从未真正派发 autonomous-loop——workflow 要求 `pull_request` 事件打上精确 `autonomous-loop` label（job 级 `github.event.label.name == 'autonomous-loop'`），但仓库从未创建该 label，历史 7 条 PR run 全部 skipped；② main push 触发的自主循环 100% 失败——`OPENAI_API_KEY` secret 未配置，runner 无 key → llmFn=null → requirements 审计走 prompt 包模式 → `decide()` 必然返回 `NEED_HUMAN` → orchestrator 终止 → 退出码 1 → `Report final status` 输出 `::error::Autonomous loop FAILED`。这是配置缺失导致的必然失败，不是测试真失败，且 PR 事件按设计主动 withheld key 后同样必然失败。

## What Changes

- 创建 `autonomous-loop` label（远端仓库设置，含中文说明），使 PR 打标派发流程可用；触发仍为 `types: [labeled]` + 精确 label 匹配（PR #342 只读契约保持不变）。
- `.github/workflows/autonomous-loop.yml` 的 `Report final status` 步骤：当 `LOOP_EXIT != 0`、`OPENAI_API_KEY` 未配置、且最新 `autonomous-loop-report-*.json` 的 `finalStatus == "NEED_HUMAN"` 时，输出 `::warning::`（语义对齐 `agent-review-gate.js` 的 `PROMPT_REVIEW_REQUIRED`）并以退出码 0 结束；其余场景（有 key 的 NEED_HUMAN、非 NEED_HUMAN 失败、报告缺失/损坏、退出码缺失/非法）保持失败。
- `.github/scripts/autonomous-loop-workflow.test.js`：新增降级分类契约用例（无 key+NEED_HUMAN→0、有 key+NEED_HUMAN→1、无 key+非 NEED_HUMAN→1），保留既有退出码用例。
- 不改 runner 退出码契约（`agent-review-gate.js` 消费 0/1，改动会破坏 quality-gate 绿路径）；不改 PR 触发为 opened/synchronize（避免每 PR 触发 30 分钟 Windows job 的成本与契约变化，作为后续可选）。

## Capabilities

### New Capabilities

- `ci-autonomous-loop`: autonomous-loop 派发条件、无 LLM key 时的降级报告语义、真实失败 fail-closed、契约测试锁定。

### Modified Capabilities

（无既有 spec 的 Requirement 变化）

## Impact

- `.github/workflows/autonomous-loop.yml`（仅 `Report final status` 步骤）
- `.github/scripts/autonomous-loop-workflow.test.js`（契约用例扩展）
- 远端仓库 label：`autonomous-loop`（可逆，`gh label delete`）
- 不涉及 apps/packages 运行时代码；不改变 PR #342 的只读凭据/artifact 契约；`OPENAI_API_KEY` 配置仍为「正路」，本次使缺失配置时不再假红、并给出明确可操作警告。
