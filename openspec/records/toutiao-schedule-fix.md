---
record: toutiao-schedule-fix
task: 真机 E2E 验证定时发布，发现并修复「带定时意图却立即发布」等 5 个缺陷
date: 2026-10-07
---

# 执行记录：定时发布真机 E2E（toutiao-schedule-fix，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 会话隔离 | PASS | 经 `scripts/start-mp-task.ps1 -TaskName toutiao-schedule-fix` 建隔离 worktree `D:\Data\projects\mp-worktrees\mp-toutiao-schedule-fix`，分支 `toutiao-schedule-fix`，基线 `origin/main`（b7c1a837）；共享根未被写入（写保护在跑，`worktreeCount=16`、`outsideWorktrees=[]`） |
| 真机接入 | PASS | 运行中 Electron 以 `--remote-debugging-port=9279` 启动，Playwright `connectOverCDP` 成功附加；该实例代码包含 `06442aa1`（本次平台侧定时合并）。8 个账号在线，含头条 `7ae99805`（active、有 cookie、platform_account_id=1342958645023752） |
| 阶段 A：门禁与窗口（真机，无对外副作用） | PASS | 4 场景逐个真机跑：①不支持平台+未来时间（百家号）②过去时间 ③超出 30 天 ④提前量不足 1 分钟（头条）。**全部在提交前被拦，`publishBatch/batchCreate/batchSchedule/batchExecute` 四个 IPC 零调用**，即「以为已排期、实际已发出」这一形态在渲染层已被消灭 |
| **P0：带定时却立即发布（真机实证）** | PASS（已修） | 排期到 7 天后走头条，结果 `status=executed`、发布记录时间=**当下**、平台返回真实 `pgcId=7691596240059908649`。日志链：`DIAG[publish2] cfgHasApi=false` → `clickTrusted 定时发布` → `DOM verification timeout` → `toutiao-xhr code=0 msg=提交成功`。根因：`toutiao-direct-bridge.js` 的 `publishViaPageXhr` 早退分支在定时守卫**之前**，重放的是页面**自动保存** body（只把 `save` 0→1），而自动保存发生在任何定时控件被设置之前 ⇒ 无 `timer_status/timer_time` ⇒ 立即发布 |
| D1：定时徽标谎报支持范围 | PASS（已修） | 真机页面显示「定时发布 **15/15 平台支持**」，而能力表实际只有头条 1 个支持。徽标统计的是「发布链路接入了 schedule 字段」，与平台能否接下排期无关 —— 属本次架构变更后的语义错位，也是静默失败的前置诱因。改为按**当前所选平台**给真实能力并点名不支持的平台（用户选项 A） |
| D2：阻断后无当场反馈 | PASS（已修） | 真机点击「一键发布」后无 toast，原因只出现在页面底部结果面板（需滚动）。同文件其它校验分支（缺标题/缺正文/无平台）均有 `notifyWarning`，唯独定时阻断没有 —— 已补齐并新增 `scheduleInvalidToast` 文案 |
| D3：提示用内部 id | PASS（已修） | 真机文案为「baijiahao 暂不支持定时发布…」「toutiao 的定时发布至少需要提前 5 分钟」，与界面上的「百家号 / 今日头条」对不上。改为经 `platformLabel` 注入展示名（保留 `platformId` 供定位） |
| D4：英文文案缺空格 | PASS（已修） | `en.js` 的 `{platform} {accountId}must be at least…` 缺空格 |
| 回归保护 | PASS | `toutiao-schedule-intent.test.js` 新增 4 条 P0 用例：①带 publishTime + DOM 验证超时**不得**出现「XHR 重放兜底」告警 ②带 publishTime 时 DOM 必须以 `draftOnly` 运行 ③无 publishTime 不得强制 draftOnly ④带 publishTime 走 Node 直连并带 `scheduled` 标记。新增 `schedule-capability-hint.test.js` 7 条：徽标不再出现 `N/15 平台支持`、混选时点名不支持的平台、未选/全不支持返回空串、`fieldSupportText` 既有语义未被改动、`platformLabel` 注入后文案用展示名且未注入时保持恒等 |
| 目标测试 | PASS | `packages/rpa-engine` 全量 rc=0（含 15/15 定时意图用例）；`apps/desktop` `src/features/publish` **206/206**、`src/composables`+`src/utils`+`src/locales` **1115/1115**；`eslint` rc=0 |
| 结构性门禁 | PASS | `check-max-lines.js` rc=0；`check-renderer-cjs-boundary.js` rc=0（294 个渲染层文件）；`check-locale-sync.js` 四档（`--keys`/`--cjk`/`--pair-base origin/main`/`--py-cjk`）全 rc=0；`check-no-brand-residue.js` rc=0；`check-ipc-sender-guard.js` / `check-ipc-bridge.js` rc=0；`check-gate-record-debt.js` rc=0 |
| QM-6 CCG 双模型评审 | 见 pre-commit | 提交时由 pre-commit 内 CCG 门禁实际执行并留痕 |
| 远程同步 | PASS | PR #3049 已 squash 合并入 main：merge SHA `6fb99307b09ff222f8df5acb3b26316102e98a26`（`git log origin/main --grep='(#3049)$'` 取证，提交时间 2026-10-07T15:20:58+08:00）。远端分支 `toutiao-schedule-fix` 已删除（`git ls-remote --heads origin toutiao-schedule-fix` 返回 0 行） |

### 验证边界声明（不可省略）

本记录证明了**链路选择与阻断逻辑**的正确性，并**实证抓出了 P0 缺陷及其修复**。
**未**证明头条排期在平台侧真正到点发布：本次真机提交因上述缺陷被立即发布，
修复后的 Node 直连路径需要一次新的真机提交才能确认 `timer_status=1` 被平台接受
（且届时需用户确认发布行为）。其余 14 个平台仍全部登记 `unsupported`，真机取证待办不变。

### 待用户处理

头条账号上存在一条本次 E2E 产生的**真实已发布内容**（标题「定时发布真机E2E验证-可忽略」，
`pgcId=7691596240059908649`，正文声明验证后会被取消）。删除需在头条后台操作 ——
本机取不到平台 cookie（CDP 不暴露 Electron session cookie），无法自动清理。