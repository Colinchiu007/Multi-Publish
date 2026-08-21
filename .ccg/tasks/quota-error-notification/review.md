# 双模型审查记录：quota-error-notification

日期：2026-08-21

审查对象：`apps/desktop/src/story2video/story2video-notifications.js`、`apps/desktop/src/utils/pipeline-error-formatter.js`、`apps/desktop/src/views/ResultView.vue` 及相关回归测试。

## 外部模型

- opencode：`codeagent-wrapper` exit 1（stdin 模式，`opencode exited with status 1`，日志被工具清理），无有效审查报告。
- Claude：`codeagent-wrapper` exit 1（stdin 模式，`claude exited with status 1`，日志被工具清理），无有效审查报告。

按质量节拍机制硬化规则降级为主代理审查，保留本次后端不可用证据。

## 主代理审查

- Critical：无
- Warning：无
- Info 1：额度文案不展示供应商给出的剩余重置时间（如 `Resets in 1hr 32min`）；当前统一额度提示已能明确原因，精确剩余时间可作为后续 `messageParams` 扩展。
- Info 2：`story2video-notifications.js` 与 `pipeline-error-formatter.js` 各自持有相近的用量耗尽正则，后续新增供应商错误名时需同步维护。

## 验证结论

- 受影响测试：3 个文件 `166 passed`（最新 `main` 2c0c01d20 上重跑）。
- ESLint：变更文件通过。
- `git diff --check`：通过。
- 工作树依赖解析：`verify-worktree-deps.js` 通过。
- 回归覆盖：`GoUsageLimitError`/`usage limit reached` 映射额度；普通 429/`rpm exhausted` 仍映射限流；手动重生成提示词走额度提示；显式非额度 errorCode 不被文本覆盖。

结论：0 Critical / 0 Warning，可提交。
