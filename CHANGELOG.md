# [未发布] fix(queue): 频控等待任务（_delayed）纳入可观测与持久化——修批量发布队列饿死（queue-delayed-observability，2026-10-06）

### 起因：多平台批量发布 21 个任务只跑了 5 个
- ha-b 图文批次（3 草稿 × 7 平台）实测：21 个发布任务只有 5 个真正执行，
  其余「入队了却既无历史也不派发」，而 `queue:status` 报 `pending=0 running=0`
  —— 看起来队列已排空，实际有任务卡住，排障完全无从下手。

### 根因：观测与持久化双双漏掉 `_delayed`
频控未到窗口时，任务被移出 `_queue` 放进 `_delayed`，靠 `setTimeout` 到点重入队
（`task-queue.js:526-535`）。而两个视图都只统计 `_queue` / `_running`：

| 位置 | 修复前 | 后果 |
| --- | --- | --- |
| `getStatus().pending` | 只数 `_queue` | 观测盲区，误判队列已空 |
| `serialize()` | 只导出 `_queue`/`_running` | 进程重启/崩溃后这批任务**永久丢失** |

`clearPending()` 早已正确遍历 `_delayed` —— 作者知此容器，只是两个视图未对齐，
且没有任何交叉断言能发现这种不一致。

### 修复（三处闭环）
- `getStatus()`：`pending = _queue + _delayed`，并单列 `delayed` 便于 UI
  区分「排队中」与「等频控窗口中」
- `serialize()`：新增 `delayed` 段，频控等待任务进持久化快照
- `deserialize()`：消费 `delayed` 段回 `_queue`，由频控检查重新判定该等还是该发
  （频控窗口本身持久化，重启后重新计时 = 原语义跨进程延续，而非丢任务）

### 逃逸分析与回归保护
既有 48 例队列测试 + 频控守卫集成测试，**无一条断言 `_delayed` 的可观测性**。
新增 `task-queue-delayed-observability.test.js`（4 例），TDD 先红后绿：先实测
`getStatus().pending` 返回 0 而非 1、`clearPending` 不清 delayed，再修实现。
队列全量 **48/48** 通过。

### 遗留
- 修复**尚未经真实 E2E 复跑验证**（需重跑 ha-b 批次确认成功率提升才闭环）
- bilibili 图文必失败（video-path 校验对图文不适用）、douyin 状态自相矛盾、tencent_video 零成功

---
# [未发布] fix(accounts+publish): 修应用启动即崩（wechat_mp/baijiahao 隐藏窗口原生崩溃）+ API 直连轨补 session 分区 cookie 回退（e2e-hot-topics-crash-and-cookie，2026-10-06）