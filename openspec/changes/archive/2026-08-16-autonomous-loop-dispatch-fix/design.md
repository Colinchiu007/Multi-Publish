## Design

### 背景链路（证据）

- 触发：`.github/workflows/autonomous-loop.yml:42-44` `pull_request.types: [labeled]` + `:58` job `if: github.event.label.name == 'autonomous-loop'`；远端 `gh label list` 无该 label → PR 打任何 label 都不派发。
- 失败链：`gh secret list` 仅 `GITEE_TOKEN` → job env `OPENAI_API_KEY` 为空（workflow `:66`）→ `packages/ai-autonomous-tester/scripts/run-autonomous-e2e.js:358-361` `makeLlmFn` 返回 null → requirements runner 走 prompt 包 → `src/ai-analyzer.js:199-210` `decide()` 步骤 0 直接返回 `NEED_HUMAN` → `src/orchestrator.js:88-90` `_buildReport("NEED_HUMAN")` → runner `:429` 退出码 1 → workflow `Report final status`（`:137-151`）任何非 0 都 `::error::` + exit 1。

### 方案选型

| 方案 | 说明 | 结论 |
|------|------|------|
| A. 配置 `OPENAI_API_KEY` secret | 正路，但需要用户提供密钥值，本次无法落地 | 记录为后续动作 |
| B. runner 增加新退出码区分 NEED_HUMAN | 会破坏 `agent-review-gate.js`（`auditExitCode` 仅接受 0/1，其余判 `INFRA_ERROR`）与 quality-gate 绿路径 | 否决 |
| C. 在 workflow `Report final status` 读报告 JSON 分类（本方案） | 镜像既有 `agent-review-gate.js:95-97` 的 `PROMPT_REVIEW_REQUIRED` 语义；runner 契约零改动；分类逻辑可用契约测试覆盖 | 采纳 |

### 降级判定（全部条件满足才降级）

1. `LOOP_EXIT` 非 0（且能解析）；
2. `OPENAI_API_KEY` 为空（job env 已按事件类型注入：PR 恒空、push 读 secret，缺失亦空）；
3. 最新 `autonomous-loop-report-*.json` 可解析且 `finalStatus == "NEED_HUMAN"`。

满足 → `::warning::` + exit 0；否则维持原 `::error::` + exit 1。报告读取路径可通过 `LOOP_REPORT_DIR` 覆盖（默认 `apps/desktop/tests/visual-testing/reports`），使契约测试可在隔离临时目录验证而不受本地残留报告影响。

### 测试策略

- 契约测试（`node --test`，Gate 3 已有入口）：用临时目录中的报告 fixture 覆盖四象限——无 key+NEED_HUMAN→0、有 key+NEED_HUMAN→1、无 key+非 NEED_HUMAN→1、无报告→1；既有 `[undefined/'invalid'/'2'/'0']` 用例保持。
- `agent-review-gate.test.js` 全量回归，确认 gate 语义未受影响。
- `openspec validate` + `scripts/openspec-sync-check.js` 校验规格一致性。
