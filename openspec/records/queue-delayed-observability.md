---
record: queue-delayed-observability
task: 频控等待任务（_delayed）纳入可观测与持久化——修多平台批量发布队列饿死
date: 2026-10-06
sync_status: PASS
---

## 本次执行记录：队列饿死修复（queue-delayed-observability，2026-10-06）

| 门禁 | 状态 | 证据 |
|------|------|------|
| 变更类型与隔离 | PASS | 运行时代码变更 ⇒ 隔离 worktree `D:/Data/projects/mp-worktrees/mp-queue-delayed`，裸分支 `queue-delayed-observability`；共享主目录保持 main |
| 第一性原因（QM-5 ①） | PASS | 非并发、非超时：频控未到窗口时任务被移出 `_queue` 放进 `_delayed`（`task-queue.js:526-535` 靠 setTimeout 到点重入队），而 `getStatus()` 的 pending 只数 `_queue`、`serialize()` 只导出 `_queue`/`_running` ⇒ 观测与持久化**双双漏掉** `_delayed`。实测现象完全吻合：`pending=0 running=0` 却无人被派发 |
| 逃逸分析（QM-5 ②） | PASS | 既有 `task-queue.test.js` 48 例 + `task-queue-guard-integration` 覆盖频控守卫，但**无一条断言 `_delayed` 的可观测性**。`clearPending()`（:420-438）已正确遍历 `_delayed` ⇒ 作者知此容器，只是 `getStatus`/`serialize` 两个视图未对齐，且无交叉断言 |
| 系统性漏洞定位 | PASS | 同一份数据两个视图不一致（`clearPending` 看 `_delayed`、`getStatus`/`serialize` 不看）；且 `_delayed` 靠 `unref()` 定时器推进，进程重启即失联 —— 观测盲区 + 持久化缺口叠加成「静默消失」 |
| 修复 + 回归保护（QM-5 ④） | PASS | 三处闭环：`getStatus()` 的 pending = `_queue` + `_delayed` 并单列 `delayed`；`serialize()` 新增 `delayed` 段；`deserialize()` 消费该段回 `_queue` 由频控检查重新判定。TDD：新用例先 RED（实测 pending 返回 0 而非 1、clearPending 不清 delayed）后转绿 4/4；队列全量 48/48 |
| 防止再次发生（QM-5 ⑤） | PASS | 新增 `task-queue-delayed-observability.test.js` 4 例钉住三条不变量：等待中任务计入 pending、进入 serialize 快照、窗口到期可派发；`clearPending` 覆盖 delayed。修既有精确相等断言时在注释写明原因（快照结构变更，用例意图未变） |
| 行尾与 diff 对账 | PASS | 改 1 个源文件 + 2 个测试文件，三处改动语义互为闭环，无孤立修改 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面；改的是队列状态视图与持久化 |
| 远程同步 | PASS | PR #2993 已 squash 合并，merge SHA `fa8ea3cb72ab4f0618398b3ba9f782d2b4e2a614`，2026-10-07T09:11:47+08:00。取证 `git log origin/main --grep='(#2993)$' --format=%H|%cI`；`git ls-remote --heads origin queue-delayed-observability` 返回 0 行，证远端分支已删 |

### E2E 实证（修复前的失败现场，非单测替代）

ha-b 图文批次：3 草稿 × 7 平台 = 21 任务，仅 5 个成功（wechat_mp / kuaishou ×2 / toutiao / baijiahao）。
- draft1 的 `task_2`(baijiahao)、`task_8`(tencent_video) 入队后**从未被派发**，且无历史记录
- draft2/3 入队时 `pending=0, running=0` —— 与本根因完全一致

### 遗留（不假装已闭合）

- **修复尚未经真实 E2E 复跑验证**：需重跑 ha-b 批次，确认 21 任务的实际成功率提升，才算闭环。
- **bilibili 图文必失败**：`第(1)个视频可能上传过程出现问题`（video-path 校验对图文不适用）。
- **douyin 状态自相矛盾**：`status=success` 但 `error="publish timeout"`。
- **tencent_video 全程 0 成功**，未取证。
- **残余崩溃**：`accounts:list` 阶段读分区 Cookie 时偶发原生崩溃，与队列无关。