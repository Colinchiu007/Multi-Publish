---
change: platform-side-schedule
status: implemented
created: 2026-10-07
branch: platform-side-schedule
---

# platform-side-schedule — 定时发布改为平台侧定时

## 起因

原实现是「本地定时器到点触发一次普通立即发布」。用户要求改为对标参考产品（4.0 逆向工程）的
「服务端下发任务 + 平台侧定时，由平台服务器到点发布」。

逆向核实结论（决定性证据）：

- `prePubTime` 在参考产品主进程 bundle 中出现 **86 次**，其中 **0 次**邻近任何本地延时原语
  （`setTimeout` / `Task.Delay` / `setInterval` / `sleep` / `Promise.race`）——它确实不做本地等待。
- 34 个 `*Worker` 类中 **27 个**走平台侧定时，**7 个不支持**（皮皮虾 / 搜狐视频 / 豆瓣 / 得物 /
  简书号 / WiFi万能钥匙 / 豆包）；这 7 个的 `prePubTime` 出现 0 次，即用户勾了定时、内容**立即发布**。
- 本仓 15 个平台与那 7 个「不支持」平台**零交集**，迁移路径成立。
- 平台侧时间字段形态多样：秒级（抖音 `timing`、B站 `dtime`、视频号 `effectiveTime`、知乎 `postTime`）、
  毫秒（快手 `publishTime`）、字符串（头条号 `YYYY-MM-DD HH:mm:ss`、微博图文 `YYYY-MM-DD HH:mm`）、
  表单开关（大鱼号 `is_timed_release` + `time_for_release`）、5 分钟取整（一点号 / 企鹅号）。

## 关键发现：本仓头条早已具备平台侧定时能力

`packages/rpa-engine/src/toutiao-direct-publish.js:74-75` 早已实现
`timer_status=1` + `timer_time`（`YYYY-MM-DD HH:mm`）并有契约测试；但唯一调用方
`toutiao-direct-bridge.js:36-39` 把时间**硬编码为「当前 +60 秒」**——平台定时能力此前被当作
「绕过 DOM 死锁的手段」，而不是用户可选的定时模式。

本次改造把它提升为真实的用户定时模式（去除 `+60s` 硬编码，改用调度器透传的 `publishTime`）。

## 架构变更

| 维度 | 旧（本地调度） | 新（平台侧定时） |
|------|--------------|----------------|
| 触发方 | 主进程 setTimeout 到点 → 任务队列 → 立即发布 | 创建即提交给平台 → 平台服务器到点发布 |
| 应用关闭 | 发不出去（错过即丢） | 照发 |
| 休眠/时钟跳变 | 本地定时器漂移 | 与本机无关 |
| 取消 | 本地原子取消 | 平台多无撤销接口 ⇒ 本地取消 ≠ 平台撤销 |
| 不支持平台 | 统一本地定时 | **必须显式阻断** |

### 新增模块

- `packages/shared-utils/src/platform-schedule-capability.js` — 逐平台能力三态（api / rpa / unsupported），
  未知平台 fail-closed；含 `validateScheduleCapabilityRegistry()` 自检。
- `packages/shared-utils/src/platform-schedule-time.js` — 按平台格式/单位产出提交值（显式注入时区偏移，
  不依赖运行环境 TZ）；`assertWithinPlatformWindow` 校验平台最小提前量/最大跨度。

### 调度器语义变更（`packages/shared-utils/src/scheduler.js`）

- `create()`：能力门禁**前置到落盘之前** → 落盘 `submitted` → 立即 `startDispatch` 携带 `publishTime`；
  **不再武装任何本地定时器**。
- 派发载荷新增 `publishTime`（`publisher-router.js` 的 `buildPublishArticle` 负责搬到 `article`）。
- `restore()`：只恢复 legacy `pending`（`submitted`/`dispatching` 绝不重放，否则平台侧出现重复排期）。
- `cancel()`：已提交平台（`executed`）与提交中（`dispatching`）**不可取消**。

## 实施中发现并修复的缺陷

| # | 缺陷 | 后果 |
|---|------|------|
| D1 | `submitted` 标记写盘失败只记 warn | 派发静默丢失，记录停在 `pending` 被 restore 当 legacy 本地任务派发 ⇒ **静默回落本地定时**（本变更要消灭的形态） |
| D2 | `cancel` 允许取消 in-flight（`dispatching`）提交 | 本地显示已取消、平台已排期照发 ⇒ 状态分裂 |
| R2 | `create()` 未用 `minLeadMinutes` / `maxHorizonDays` | 10 秒 / 365 天排期本地通过、平台必拒，用户无任何反馈 |
| R3 | `restore()` 的 `dispatching` 分支永不可达 | 死代码，且误导后来者以为「中断的提交会被重跑」 |
| R4 | owner 切换回退为 `pending` | `pending` 是 restore 的 legacy 本地任务桶 ⇒ 重开本地兜底后门 |

## 安全底线：绝不静默立即发布

参考产品对 7 个不支持平台「守卫不成立就跳过赋值 ⇒ 内容立即发布」，是最危险的静默失败形态。
本仓在四层同时阻断：能力注册表（未取证一律 unsupported）→ 渲染层校验（提交前拦截并说明原因）
→ 主进程 create（落盘前抛错，无记录残留）→ 三阶段失败反馈（`mark-submitted`/`claim-mismatch`/`enqueue`）。

## 取证纪律

判定「某平台支持平台侧定时」需登录该平台确认，属真机取证范畴。本表**不猜测**：未经取证的平台一律
`unsupported`。当前只有头条可用 —— 宁可功能少，不可静默发错。

## 测试

- `packages/shared-utils/src/__tests__/scheduler.test.js` 重写为平台侧语义（49/49）。
- 新增 `platform-schedule-capability.test.js`（13）、`platform-schedule-time.test.js`（10）、
  `scheduler-platform-side.test.js`（10）。
- `apps/desktop/src/features/publish/publish-contract.test.js` 新增能力门禁 7 例（46/46）。
- shared-utils 全量 621/621 通过。