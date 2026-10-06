---
record: platform-side-schedule
task: 把定时发布从「本地定时器到点触发立即发布」改为「创建时把排期提交给平台、由平台服务器到点发布」，并对不支持的平台显式阻断
date: 2026-10-07
sync_status: PENDING
sync_reason: PR 尚未合并，无法取证 merge SHA
sync_backfill_owner: 本任务作者（合并后的回填 PR）
---

# 执行记录：平台侧定时架构变更（platform-side-schedule，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 会话隔离 | PASS | 隔离 worktree `mp-platform-side-schedule` 建在 D 盘托管根（`D:\Data\projects\mp-worktrees\`），分支 `platform-side-schedule`；共享根未被写入。`verify-worktree-deps.js` OK，11 个 workspace 链接解析到本 worktree |
| 逆向取证 | PASS | 参考产品 `prePubTime` 出现 **86 次，其中 0 次邻近任何本地延时原语**（setTimeout / Task.Delay / setInterval / sleep / Promise.race）⇒ 纯平台侧排期；34 个 `*Worker` 中 27 个 >0、7 个 ==0 ⇒ 不支持平台确切名单；本仓 15 平台与那 7 个**零交集** |
| 关键发现 | PASS | 本仓头条直连**早已实现**平台侧定时字段（`timer_status=1` + `timer_time`，`YYYY-MM-DD HH:mm`，有契约测试），但唯一调用方把时间硬编码为「当前 +60 秒」——能力被当作绕过 DOM 死锁的 workaround，本次提升为真实定时模式 |
| 数据校验（QM-5 内嵌） | PASS | 创建前置校验（`platform-schedule-create.js`）：入参类型 → 平台能力门禁 → 平台窗口（最小提前量/最大跨度），**阻断发生在落盘之前**（`fs.existsSync` 为 false，无记录残留）；渲染层 `validateScheduleEntries` 同步门禁，提交前拦截并给出具体平台与原因 |
| 修复 + 回归保护（QM-5 汇总） | PASS | 新增测试：`platform-schedule-capability` 13 例、`platform-schedule-time` 10 例、`platform-schedule-create` 13 例、`scheduler-platform-side` 10 例；重写 `scheduler.test.js` 为平台侧语义（49 例）；`publish-contract.test.js` 新增能力门禁 7 例。全部先红后绿 |
| 批量排期对齐（补漏） | PASS | 首轮实现**遗漏**了 `batch-manager.js`：批量排期仍走本地 `setTimeout`、且**无能力门禁** —— 即批量路径会对不支持的平台静默到点立即发布，正是本变更要消灭的形态。已补：能力门禁前置 + 平台窗口校验 + 立即提交携带 `publishTime`，并删除已成死代码的本地定时器分支；`batch-manager.test.js` 按平台侧语义重写（21 例）。相关 3 文件联跑 **110/110** |
| 实施中发现的缺陷 | PASS | D1 `submitted` 标记写失败只 warn ⇒ 静默回落本地定时；D2 `cancel` 允许取消 in-flight ⇒ 平台/本地状态分裂；R2 未校验平台窗口；R3 `restore` 死代码；R4 owner 切换回退 `pending` ⇒ 重开本地兜底后门；**R5 批量排期未做能力门禁**（首轮遗漏，批量路径会静默立即发布）。**六个全部修复** |
| 目标测试 | PASS | `packages/shared-utils` 全量 **621/621**；`scheduler.test.js` 49/49；`platform-schedule-*` 36/36；`publish-contract.test.js` 46/46；定时相关 composable + 视图（5 文件）**216/216**。`apps/desktop` 全量由 CI 执行 |
| locale 配对（Gate 7） | PASS | `check-locale-sync.js --keys` PASS；`--cjk` PASS（无新增硬编码中文）。zh/en 成对新增 `schedulePlatformUnsupported`、`scheduleTooSoon` |
| 品牌残留 | PASS | `check-no-brand-residue.js` PASS（6960 tracked 文件） |
| 结构性门禁 | PASS | `check-max-lines.js` PASS（`scheduler.js` 拆出 `platform-schedule-create.js` 后为 494 行）；`check-ipc-sender-guard.js` / `check-ipc-bridge.js` PASS；`check-gate-record-debt.js` OK（记录文件登记字段无残留） |
| 行尾 / 编码对账 | PASS | `git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` **完全一致** |
| QM-1 打包 | PASS | `build:vue`（vite build）rc=0 → `electron-builder --win --dir` rc=0。asar 清单 6 项全 PASS（shared-utils scheduler / desktop scheduler service / ipc-handlers scheduler / batch-manager / preload bundle 全部在内）；打包产物内 `resume-guard` 可 require（导出 `createResumeGuard`）、`scheduler` 实例 API 含 `rearm`；**启动 8 秒存活且 stderr 长度 = 0** |
| QM-4 视觉 | PASS | 本轮渲染层改动为既有设计系统内的提示文案与门禁提示，无新布局/配色/字号；由 `publish-contract.test.js` 7 例能力门禁用例覆盖 |
| QM-6 CCG 双模型评审 | 见 pre-commit | 提交时由 pre-commit 内 CCG 门禁实际执行并留痕 |
| 记忆沉淀 | PASS | EverOS：`atomic_fact-2026-10-07-platform-side-schedule.md`（6 条：邻近原语计数法 / 竞品不支持平台的反教材 / 已有能力被当 workaround / 语义切换的测试迁移纪律 / 共享 fixture 默认值的影响面 / 时区必须显式注入） |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 取 merge SHA，并删掉本文件 frontmatter 的 `sync_*` 三字段 |

### 验证边界声明（不可省略）

本变更证明了**架构与调度链路**的正确性（能力门禁、时间格式、提交编排、失败反馈、恢复/取消边界），
**未**证明任一平台真机定时发布。判定「某平台支持平台侧定时」必须登录该平台确认其发布页/接口确有此能力，
属真机取证范畴 —— 本表**不猜测**，未经取证的 14 个平台一律登记 `unsupported` 并在提交前阻断。
**当前仅 toutiao 可用**，这是刻意的安全取舍：宁可功能少，不可静默发错。

### 后续接入流程（PRD §6.3.15.7）

登录平台确认支持 → 能力表改 `api`/`rpa` 并填齐字段 → publisher 装配该平台定时字段 → 真机验证三段证据。