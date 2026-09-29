# fix-scheduled-publish-gaps — 设计

## 方案对比

### 缺陷 1：批量定时重启恢复

| 方案 | 说明 | 取舍 |
|------|------|------|
| A. 启动时遍历 scheduled 批次重臂（**采纳**） | `restoreScheduledBatches` 复用 `scheduleBatch` 的既有归一化（R40/NaN/过期立即发） | 零重复逻辑；catch-up 语义与单篇 `scheduler.restore` 一致；旁路容错不阻断启动 |
| B. 把批量排期迁到单篇 scheduler JSONL | 批量批次拆成 N 条 scheduled-tasks 条目 | 改动面大（数据迁移 + batch_jobs 语义重定义）；批量有批次级状态（done/completed 计数）无法平移 |
| C. 持久化定时器句柄 + 精确恢复 | 记录每个 timer 的到期时间，重启按差值重设 | 与 A 等价但多一层状态——scheduleBatch 重跑本身就是按 publishTime 重算 delay，无需额外持久化 |

**A 的关键决策**：`restoreScheduledBatches` 显式 ownerSubject 参数（身份模式由 phase3 传当前
登录用户）+ 内部 `scheduleBatch` 再经 `_requireOwnerSubject()` 解析——两处 owner 在恢复时点必然
一致（provider 读同一身份态）；若不一致，`getBatchJob` 返回 null → 该批次不计入恢复（fail-safe，
不跨租户派发）。

### 缺陷 2：发布历史定时模式标记

链路上有 4 个会丢字段的白名单/收窄点，必须全部打通：

```
scheduler.dispatch / BatchManager.scheduleBatch（标记源头）
  → TaskQueue._add（白名单构造 entry）      ← 丢点 1
  → task:success/task:failed 事件（entry 原样） 
  → phase4-events history.addRecord（显式字段） ← 丢点 2
  → TaskQueue.getPendingTasks/serialize（快照白名单） ← 丢点 3（崩溃恢复丢标记）
  → PublishHistory.publishModeValue（既有读取方，缺省 immediate）
```

- 标记值固定 `'scheduled'`（与渲染端 `publishModeValue` 的既有匹配集 `['scheduled','schedule','timed']` 对齐）。
- 立即发布**不写**该字段（`...(task.publishMode ? {...} : {})`），保持历史记录原样——渲染端缺省即
  immediate，无需写 `'immediate'` 占位。
- `api-publish-engine` 的 `publishMode`（api-then-dom / dom-only）是**同名不同域**的概念（投递方式），
  两者字段路径不冲突（历史记录 vs platforms.yaml），文档中已注明区分。

### 缺陷 3/4：日历取消与状态过滤

- 取消走 `notifyConfirm`（统一通知通道 D1 决策）而非直接 `ElMessageBox`——与 Accounts.vue 等
  既有视图同模式，测试可 mock。
- 状态过滤在 `getEventsForDate`（数据出口）而非模板（显示出口）做——日历网格的圆点
  （`day.events`）与详情面板共用同一数据源，出口过滤一次覆盖两处。
- 无 status 的历史 JSONL 数据保持显示（向后兼容）：早期数据无 status 字段，按 pending 对待。

### 缺陷 5：重复函数定义

- 删除死代码版（`Promise.all`）而非新版——新版（`allSettled` + 失败 ID 保留 + pending 计数）
  是 aa7e7cf0 的意图替换，commit message 明言「cancelPublish 使用 Promise.allSettled，保留失败
  任务 ID 供重试」。
- 结构锁用源码级正则（`/async function cancelPublish\s*\(/g`）而非行为测试——JS 函数声明后者
  覆盖前者，行为永远测的是新版；只有源码结构断言能防「替换式重构残留死代码」这一类问题。
- 路径解析用 `process.cwd()` 相对（仓库先例 ProfileMenu/PublishHistory 测试），jsdom 下
  `fileURLToPath(import.meta.url)` 会抛 "The URL must be of scheme file"（accounts-grid.source.test.js
  已注明此坑）。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| restoreScheduledBatches 在启动路径抛错阻断启动 | 旁路 try/catch（phase3 层）+ 逐批 try/catch（manager 层）双保险；测试覆盖两层 |
| publishMode 破坏既有历史读取方 | 加法字段 + 有值才写；`publishModeValue` 缺省 immediate；全量回归 |
| 日历过滤误伤历史无 status 数据 | `!status` 显式按 pending 对待；测试覆盖 |
| 取消按钮误触发（用户手滑） | notifyConfirm 确认弹窗 + cancellingId 防重 |
| locale 漏配（zh/en 不成对） | CI Gate 7 check-locale-sync 拦截；本次成对提交 |

## 与参考产品（蚁小二）的对照结论

参考产品采用**平台侧定时**：B站 `publish_time`（秒级时间戳，13 位毫秒除 1e3 / 10 位截断）、
微博 `schedule_timestamp` + `getXinlangweiboSchedulePostFrequency` 定时配额检查（无配额报
「已无定时发布次数，请前往新浪微博官方平台确认」）、一点号 `prePub` 预发布接口（失败报
「定时发布失败」）、且「定时发布不能存草稿」（pubType=0 && publishTime 直接拒绝）。

本项目维持**本地定时器**方案（理由见 proposal）；参考产品可复用的经验已吸收进 PRD §6.3.1
对照表与 §6.3.11 离线行为修正，平台侧定时作为未来增强方向记录（需逐平台配额/约束适配，
不在本次范围）。
