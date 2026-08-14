# Tasks: fix-login-credential-capture-error

## 差异审计（基线 vs 现状）

- [x] 基线审计：`auth:open-login` 处理器（`apps/desktop/electron/ipc-handlers/account.js:172-173`）无条件把 `authViewManager.openLogin()` 的 resolve 值传给 `saveCapturedAccount`；`AuthViewManager.close()`/Esc/超时分别 resolve `{ cancelled: true }` / `{ timeout: true }` 控制信号（`auth-view-manager.js:246,273,374`）；渲染层 `Accounts.vue` 已预留 `result?.cancelled` 分支。Bug 复现链路完整，无已交付修复。

## 实现

- [ ] `auth:open-login` handler 拦截控制信号：`cancelled` → `{ code: 0, cancelled: true }`；`timeout` → `TIMEOUT_ERROR` + 超时文案；两者均不调用 `saveCapturedAccount`
  - 测试目标：`apps/desktop/electron/ipc-handlers/account.test.js` 新增「取消」「超时」两个用例，断言 `saveCapturedAccount` 未被调用
- [ ] `FirstRun.vue` 消费方识别 `cancelled`，取消时静默返回不提示「添加成功」
  - 测试目标：`apps/desktop/src/views/FirstRun.test.js` 新增取消用例
- [ ] 运行受影响测试：`account.test.js`（IPC）、`FirstRun.test.js`、`useAccountActions.test.js`、`Accounts.test.js`
- [ ] 双模型审查（antigravity + Claude），结果写入 `.ccg/tasks/fix-login-credential-capture-error/review.md`

## 归档

- [ ] `openspec validate` 通过
- [ ] 归档三同步：openspec archive + CCG task 归档 + learnings 记录
