# Tasks: autonomous-loop visual vision judge

> 基线差异审计（retrospective）：本轮全部为「已交付」项（本分支未合并 diff + 测试全绿），无待办。证据见 proposal.md「基线 vs 现状差异审计」。

## 实现（全部 [x] 已交付）
- [x] llmFn 结构化输入 + OpenAI image_url / Anthropic image source 双协议
  - 证据：`packages/ai-autonomous-tester/scripts/run-autonomous-e2e.js`（normalizeLlmInput/buildOpenAIContent/buildAnthropicContent/makeLlmFn）+ `tests/autonomous-e2e-result.test.js`
- [x] AgentVisualJudge vision 内联 + 降级链（视觉→文本→need_review fail-closed）
  - 证据：`packages/ai-autonomous-tester/src/agent/agent-visual-judge.js` + `tests/agent-visual-judge.test.js`（4 新用例）
- [x] 单图 3MB 体积护栏（MAX_IMAGE_BYTES）
  - 证据：`agent-visual-judge.js` encodeImage + 超限用例（Buffer.alloc(MAX_IMAGE_BYTES+1) 不内联）
- [x] 接线修复：runOrchestratorLoop 把 llmFn 注入 TestOrchestrator → analyzer.visualJudge 非空
  - 证据：`scripts/run-autonomous-e2e.js` + `src/orchestrator.js` + `tests/orchestrator-integration.test.js` Scenario 6
- [x] AIAnalyzer needReview 分组 + NEED_HUMAN 优先路由 + FAILED-only 视觉成本护栏
  - 证据：`src/ai-analyzer.js` + `tests/ai-analyzer.test.js`（5 新用例）
- [x] workflow llm_vision 输入 + LLM_VISION 布尔语义（去 `|| ''` 陷阱）
  - 证据：`.github/workflows/autonomous-loop.yml` + `.github/scripts/autonomous-loop-workflow.test.js`（字面断言 + 语义用例 + `|| ''` 守卫）
- [x] 全量测试：包 189/189 + workflow 合同 10/10
  - 命令：`node --test packages/ai-autonomous-tester/tests/*.test.js .github/scripts/autonomous-loop-workflow.test.js`

## 审查（双模型）
- [x] Claude reviewer 完成（`/tmp/vision-review-claude.txt`）：2 Critical（C1 布尔陷阱、C2 接线死穴）+ 3 Warning（W1 fail-open、W2 成本放大、W3 体积护栏）+ Info，全部已修复
- [x] antigravity 不可用（地域资格拒绝，Eligibility check failed，日志 `/tmp/vision-review-antigravity.txt`）→ 按降级通道主代理直审 + 单模型 Claude

## 交付
- [x] PR 提交待合入（本 change 保持 active，合入后 apply + archive 三同步）
