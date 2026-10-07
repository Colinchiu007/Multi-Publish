---
record: m5-reporterror-async
task: 修复 reportError 在 logError 的 Promise 异步拒绝时既不上报也不回退控制台，错误彻底丢失
date: 2026-10-07
---

## 本次执行记录：reportError 异步失败兜底不可达（M-5，m5-reporterror-async，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码变更 ⇒ 必须隔离 worktree。全程在 `D:\Data\projects\mp-worktrees\mp-m5-reporterror`、裸分支 `m5-reporterror-async`，基线 `d1214fa1`；共享主工作区未写入 |
| 第一性原因（QM-5 ①） | PASS | `apps/desktop/src/utils/report-error.js`：`api.logError(...)` 走 `ipcRenderer.invoke`，**返回 Promise**；但外层 `try/catch` 只能兜**同步**抛错。Promise 的**异步拒绝**直接逃出去变成 `unhandledrejection`。同时 `:16` 的早退 `return` 让 `:21` 的 `console.error` 兜底在这种失败下**永远不可达** —— 错误既没进主进程日志、也没进控制台，**彻底丢失**。两条判据（未处理 Promise 拒绝 / console 兜底不可达）同源 |
| 逃逸分析（QM-5 ②） | PASS | ①单测层：既有 `report-error.test.js` 三条用例全部用 `logError: vi.fn()` —— **同步返回 undefined**，从未构造过 thenable。故 try/catch 的能力边界从未被测到。②集成层：`logError` 失败的唯一真实场景是主进程未注册 `logs:error` 处理器或 IPC 通道断开，仓内无覆盖。③评审层：`try { api.logError(...) } catch {}` 的外形极像"已经处理过异常"，审阅者不会去看 `logError` 的返回类型 |
| 修复 + 回归保护（QM-5 ④） | PASS | 修复：抽出 `toConsole` 兜底函数，对 `logError` 的返回值判定 `typeof ret.catch === 'function'` 后挂 `ret.catch(toConsole)`。回归锁：既有测试文件补 3 条用例（共 6 条）。**TDD 红灯先行**：修复前跑新用例，报 `expected 0 to be greater than 0`（console 一个字都没收到）。**反证已做**：撤掉 `ret.catch(toConsole)` ⇒ 转红；恢复 ⇒ 6/6 绿 |
| 防止再次发生（QM-5 ⑤） | PASS | 三条新用例各锁一层：①异步拒绝必须回退 console（并断言参数原样透传）；②不得逃成 `unhandledrejection`；③**正常 resolve 时不得写 console** —— 第三条防的是"为了让 ① 过而给成功路径也加 catch"这种反向劣化，避免把每次成功上报都变成一行控制台噪音 |
| 行尾与 diff 对账 | PASS | 两口径 numstat 一致：`report-error.js` 15/4、`report-error.test.js` 见提交。无 CRLF 噪声 |
| 接线棘轮 | PASS | 未新增测试文件（补在既有 `report-error.test.js` 内），`vitest.config.js` 的 `include` 已含 `src/**/*.test.{js,ts}`，无需改 workflow |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行面：改动是渲染层一个 22 行的纯函数，无 `electron/` 与 `packages/rpa-engine/` 改动 |
| QM-6 CCG 双模型外部评审 | 未能执行 | 见「遗留」 |
| 消费方回归 | PASS | `report-error.test.js` + 既有消费方 `useExpiredAccountsBanner.test.js`（mock 掉 reportError 的那条）合计 **11/11 通过** |
| 远程同步 | PASS | PR #3029 于 2026-10-07 12:57:14 +08:00 squash 合并，merge SHA `257fc3bede43365f7d4d80d43fc7871a14c3bc64`，origin/main 已核验；`git ls-remote --heads origin m5-reporterror-async` 返回 0 行，远端分支已删 |

### 一条被我推翻的旧判断（此前记录在案，此处更正）

本条目在被领起时，工作笔记里写的是「**M-4（reportError 的 Promise 拒绝）确认无法在 vitest 覆盖，需 Electron 主进程环境**」。

**该判断是错的**，两条反证：

1. `src/utils/report-error.test.js` 早已存在且有 3 条用例，它就是用
   `globalThis.window.electronAPI = { logError }` 这个 mock 在 vitest 里测的 ——
   **不需要真实主进程**。
2. 实测证明缺陷可以在纯 vitest 下复现：把 `logError` 换成
   `vi.fn().mockRejectedValue(...)`，修复前用例稳定报
   `expected 0 to be greater than 0`。

顺带说明编号：本条目对应审查报告正文的 **M-5**（`reportError` 未处理 Promise 拒绝）。
工作会话里沿用的「M-3 / M-4 / M-5」标签与报告正文的 M 编号**错位两位**
（会话 M-3 = 报告 M-4、会话 M-4 = 报告 M-5、会话 M-5 = 报告 M-3）。跨会话引用时应以
报告正文编号为准。

### 遗留（不假装已闭合）

- **QM-6 CCG 双模型外部评审未能执行**：与 #3012 同因 —— `codeagent-wrapper` 只有
  `codex`/`gemini`/`claude` 三个后端，`opencode` 不在其中，且 `codex`（PATH 相对路径
  执行被拒）、`gemini`（未安装）、`claude`（exit 1）实测均失败。
- **只覆盖了 Promise 拒绝，未覆盖 thenable 以外的异步形态**：当前判据是
  `typeof ret.catch === 'function'`，覆盖 `Promise` 与标准 thenable。若将来 preload 侧
  返回的是需要 `await` 才有语义的 exotic thenable，行为可能不同（但那也不会退化成
  unhandledrejection，因为已挂了 catch）。
- **`reportError` 的其他 6 处消费方未逐一回归**：本次只跑了直接相关的
  `useExpiredAccountsBanner.test.js`；`main.js`（全局 error / unhandledrejection 监听）、
  `router/index.js`、`ReferenceFinder.vue`、`UpgradeModal.vue`、`TemplatePicker.vue`、
  `HomeGreeting.vue` 的完整回归交由 CI 全量套件承担（本次改的是纯函数内部实现，
  对外签名与调用方式均未变）。