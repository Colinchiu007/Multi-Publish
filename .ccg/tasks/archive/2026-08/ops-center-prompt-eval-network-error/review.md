# 复盘：提示词评测页「加载评测列表失败：Network Error」（2026-08-15）

## 现象
运营后台 → 提示词评测 → 进入页面报「加载评测列表失败：Network Error」。

## 根因（第一性）
该文案来自 `PromptEvalWorkbench.vue loadCases()` 的 catch：`e?.response?.data?.detail || e.message`。
axios 传输层失败（无 HTTP 响应）时 `e.response` 为空、`e.message === "Network Error"`，界面直接展示裸 "Network Error"。

证据链（真实浏览器 + 真实后端/DB 验证）：
1. 双服务在线：登录 200；`GET /api/v1/prompt-eval/cases?limit=50` 200、`/providers` 200，页面零报错。
2. 仅后端离线（vite 代理在线）：代理返回 500 空响应 → 界面显示「Request failed with status code 500」，不是 Network Error。
3. 前端 dev server 离线（旧 tab 未刷新，SPA 内存态继续运行）：`GET /api/v1/prompt-eval/cases` 触发 `net::ERR_CONNECTION_REFUSED` → axios「Network Error」→ 界面「加载评测列表失败：Network Error」（与用户报错一字不差）。
4. 后端 `list_cases` 为纯 DB 查询（routers/prompt_eval.py:144-147 → services/prompt_eval_service.py:173-179），不调外部引擎；DB 表结构完整（含 PR #822 新增列）。

结论：不是 prompt-eval 业务代码 Bug，而是「开发栈（vite/uvicorn）未同时在线 / 旧 tab 未刷新」的运行态问题 + 前端错误文案不可操作。

## 逃逸分析
- 单测/集成/E2E：现有 vitest 只覆盖 http 客户端 token/401 行为，无错误文案契约测试；错误文案属 UI 层，未被任何测试断言。
- 审查：此前审查聚焦后端契约与逻辑，未把「传输层失败文案」纳入必检项。

## 系统性漏洞
ops-center 前端把 axios 原始 message 直接拼进用户可见文案，传输层失败（ERR_NETWORK）会展示裸 "Network Error"，无任何自助排查线索。

## 修复
- `apiErrorMessage(e, fallback)`（api/http.js）：仅 ERR_NETWORK/Network Error 映射为「无法连接后端服务（Network Error）：请确认 ops-center 后端已启动（uvicorn main:app --port 8010），然后刷新页面重试」；HTTP 错误仍优先展示后端 detail；超时/取消保留原 message；空错误回退 fallback。
- `PromptEvalWorkbench.vue`：全部 catch 改用 `apiErrorMessage`（10 处）。
- 回归测试：`tests/api-error-message.test.js`（5 例）。

## 验证
- vitest：3 文件 16 用例全绿（新增 5 例）。
- vite build：exit 0。
- 真实浏览器复现：双服务在线零报错；停 vite 后点刷新 → 显示「加载评测列表失败：无法连接后端服务（Network Error）：请确认 ops-center 后端已启动…」。
- 后端 pytest 无需改动（未触碰后端）。

## 用户侧立即解法
同时启动后端与前端：`cd ops-center/backend && python -m uvicorn main:app --port 8010` + `cd ops-center/frontend && npm run dev`，然后刷新页面。

## 交付状态（终）
- **PR #827 已合并**（squash `acd90961`，2026-08-15 02:02 UTC），16+ 项 CI 全绿（QG 全项 / 双平台 build / electron-tests / 单元测试+Lint / 文档同步）。
- 期间 origin/main 两次推进（PR #822/#831 等并发合入），仅 CHANGELOG/quality-gates 顶部条目冲突，均已 rebase 解决并保留双方记录。
- 已归档至 `.ccg/tasks/archive/2026-08/ops-center-prompt-eval-network-error`；远端分支与本地 worktree 清理完成。