# Review — autonomous-loop 像素子进程端口继承（2026-08-16）

## 结论
**通过（双模型后端降级，主代理自查补齐）**。无 Critical / Warning；2 条 Info 已评估不采纳（见下）。

## 审查过程
- antigravity：`Eligibility check failed: not available in your location`（区域不可用，与既往会话一致）。
- Claude CLI：两次 `claude exited with status 1`（wrapper 无输出、日志被清）——后端 CLI 侧异常。
- codex 后端：第一轮 exit 0 并核验关键契约事实（`apps/desktop/tests/visual-testing/test-runner.js:39` 默认 5174、`test:visual:pixel` 脚本、e2e 子进程调用点），报告正文未落入 stdout；第二轮进程 OOM（`memory allocation failed`）。
- 按机制硬化规则降级为主代理审查；真实行为验证见下。

## 主代理自查（基于本地实证，非仅静态）
- execSync `env` 语义实测：子进程收到 `TEST_URL=http://127.0.0.1:5173|TEST_PORT=5173|LLM_PROVIDER 继承` ✓。
- 本地真实验证：Vite(5173) + `run-pixel-tests.js`（TEST_URL 注入）→ 13/17 通过、4 个真实差异（含 diff 图），不再 17/17 秒挂 ✓。
- 调用点检索：`test:visual:pixel` 仅 e2e 视觉阶段一处（`run-autonomous-e2e.js:113`）；functional runner 为进程内 `url: TEST_URL` 不受影响 ✓。
- 回归测试：注入 execute 捕获子进程 env，断言 TEST_URL/TEST_PORT 与 TARGET_PORT 一致、原 env 保留；25/25（本包）+ 168/168（全量）+ `.github/scripts` 契约 17/17 全绿 ✓。
- `git diff --check`（随提交跑）与 OpenSpec `validate`（change valid）✓。

## Info（不采纳）
- I1：把默认端口常量提为单一配置源——本修复仅注入 env，5173/5174 双默认属两套独立工具默认值，后续如需统一可单开重构。
- I2：`agent-visual-judge.js` 空报告时 exit 1——端口修复后报告必有合法结果；空报告路径保留 hard fail 更安全，不改。

## CI 实证补充（同根因族）

- PR #902 CI（run 31948506408）QG Autonomous 仍 fail：`[COVERAGE] verdict: NEED_HUMAN, items: 0`（1 秒空报告）——Gate 9 只注入 `OPENAI_API_KEY`，未接线 `LLM_BASE_URL`/`LLM_MODEL`，中转站 key 打到官方 `api.openai.com`（`makeLlmFn` 默认端点）。
- 修复：quality-gate.yml Gate 9 step env 补齐两个 secret（与 OPENAI_API_KEY 同级）；workflow-contract.test.js 增加「三件套同现」断言；主代理自查 0C/0W，与像素修复同一 PR 提交。
