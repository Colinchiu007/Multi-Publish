---
record: verify-scheduled-publish
task: 验证定时发布功能是否正常实现和完整（涵盖所有操作与流程），有问题就修复，并对标参考产品 4.0 逆向工程的实现方式
date: 2026-10-06
---

# 执行记录：定时发布全链路验证与修复（verify-scheduled-publish，2026-10-06）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 会话隔离 / worktree 声明 | PASS | 隔离 worktree `mp-verify-scheduled-publish` 建在 D 盘托管根（`D:\Data\projects\mp-worktrees\`），分支 `verify-scheduled-publish`，worktree 内提交；共享根 `D:\Data\projects\mulpub` 始终停留 `main` 且未被写入任何文件 |
| 入口脚本偏离说明（QM-5 留痕） | PASS（带偏离） | 标准入口 `scripts/start-mp-task.ps1 -TaskName verify-scheduled-publish` 首跑被 `mp-worktree-health.ps1` rc=1 拦下，根因是**其他并发会话遗留物**（共享根 4 项未提交改动 + 3 个越界 worktree）。处置：① 用户确认后将唯一有保留价值的一份 `docs/frontend-remediation-plan-2026-10-06.md`（与 origin/main 内容不同、当天 11:16 修改）以 `git stash push --include-untracked` 保全至 `stash@{0}`，其余 3 项由并发会话自行清理；② 共享根恢复 clean 后用 `MP_ALLOWED_WORKTREES` 环境变量**临时登记**（不落盘注册表、不触碰他人 worktree）3 个越界 worktree，入口建成。**注**：用户原批准的「保全到独立分支并提交」物理上不可行——`scripts/hooks/pre-commit:36` 对共享根非 main 分支硬拦截，`scripts/hooks/post-checkout:46` 拒绝带脏改动自动恢复，故改用钩子自身给出的 stash 路径 |
| 根因分析（QM-5 逃逸链） | PASS | P0 缺陷逃逸链：单测层（`scheduler.test.js` 的 cancel 用例**存在**但只断言 `code===0` 与调用参数，从不断言返回 data）→ 集成层（`build-preload.test.js` 只比对 API 路径集合，不看语义）→ 审查层（无人核对 handler 是否丢弃业务层返回值）→ 流程层（无「handler 必须透传业务层布尔」的契约锁）。根因定位到 `ipc-handlers/scheduler.js:37-39` 无条件返回 `data:true` |
| 数据校验（QM-5 内嵌） | PASS | 渲染端 5 项（格式/未来/30 天上限/平台必填/同账号 5 分钟）逐项落到 `publish-schedule-contract.js`，主进程二次校验（platform 非空、article 是对象、publishTime 有效未来时间）；新增「取消成功/没取消掉/真正失败」三态 IPC 契约（PRD §6.3.8）；新增 JSONL 终态保留策略（30 天 / 200 条 / pending 永不裁剪，PRD §6.3.10） |
| 修复 + 回归保护（QM-5 汇总） | PASS | 7 项缺陷全部 TDD 先红后绿：shared-utils scheduler 新增 12 例（剪枝 4 + rearm 4 + 派发失败通知 4）、`resume-guard.test.js` 8 例、ipc-handlers scheduler 2 例、`Calendar.test.js` 10 例（派发失败 3 + 批量取消 6 + data=false 文案 1）、`publish-capabilities.test.js` 2 例（注册表 note 防漂移 + publisher 实证锁）。**新增 `*.test.js` 均被 workflow 显式接线**（desktop vitest include 含 `electron/bootstrap/**` 与 `src/**`；shared-utils 全量纳入） |
| 回归 diff 分析 | PASS | 首次桌面端全量 13960 例中 **4 例失败**（`build-preload` / `observability-messagekey` / desktop `scheduler` 契约锁）→ 定位为「新增 preload API 键 + 新增 `rearm` + 新增 notify 键」引起的结构锁未同步，逐一同步后复跑 13957/13957 零失败；重基（rebase origin/main）后再验 192/192（usePublishFlow + useBatchPublish + Calendar，含与上游自动合并部分） |
| QM-1 打包 / QM-4 视觉 | PASS / PASS | QM-1：`vite build` rc=0 → `electron-builder --win --dir` rc=0（asar 145889 KB / exe 220201 KB）；asar 清单 6 项全 PASS；打包产物内 `resume-guard` 可 require（导出 `createResumeGuard`）、`scheduler` 实例 API 含 `rearm`；启动 8 秒存活且 **stderr 长度 0**。QM-4：改动为既有设计系统内的文本/按钮复用（日历批次行 + 失败 toast + hint 加长），无新布局/配色/字号，由 `Calendar.test.js` 10 例覆盖渲染与交互分支 |
| QM-6 CCG 双模型外部评审 | PASS | pre-commit 内 CCG 门禁三次提交均全过（`[CCG] 门禁已执行：5 项通过` / `2 项通过`），含决策层 DUAL 判定与深度审查记录落盘 `.ccg/reviews/` |
| 远程同步 | PASS | PR #2985 已 squash 合并：merge SHA `da94f55c35fec5107543401121426120161a0d54`（2026-10-06T20:36:34+08:00）；远端分支 `verify-scheduled-publish` 已删（`git ls-remote --heads origin verify-scheduled-publish` 返回 0 行） |

### 缺陷清单与根因（2026-10-06 全链路验证）

| # | 级别 | 缺陷 | 根因 | 修复 |
|---|------|------|------|------|
| 1 | **P0** | 取消失败被谎报成功，且使 `scheduleTargets` 回滚失败判定永假 → **到点仍会发布的幽灵排期** | `scheduler:cancel` 无条件返回 `data:true`，丢弃 `cancel()` 的布尔返回值 | 如实回传布尔；日历区分「无法取消（可能已发布/已取消）」与「失败，请重试」两套文案 |
| 2 | P1 | `scheduled-tasks.jsonl` 无界增长 + 每次状态迁移 O(n) 全量读-改-写（累计 O(n²)） | 终态记录永不清理 | 终态保留策略（30 天 / 200 条），`create()` 后旁路剪枝，`pending`/`dispatching` 永不裁剪，非法 JSON 行原样保留 |
| 3 | P1 | 休眠 / 时钟跳变后定时器不重算（可迟到数小时） | 墙钟目标一次性换算相对延时；`restore()` 见 `isTaskTracked` 即跳过 | 新增 `scheduler.rearm()`（幂等）+ `electron/bootstrap/resume-guard.js` 监听 `powerMonitor` 的 `resume`（60s 短睡阈值，失败仅记 WARN） |
| 4 | P1 | 派发失败零用户可见性（只写日志、不进历史、不重试） | `dispatch` catch 分支仅 `logger.error` | `onDispatchFailed` 依赖注入 → `scheduler:dispatch-failed` → preload → 日历实时错误提示 + 刷新；认领失败(`claim`)与入队失败(`enqueue`)分别标注 |
| 5 | P1 | 批量排期取消仅会话内可做（离开发布页即无法取消） | `scheduledBatchId` 是内存态；日历只渲染 `scheduler:*` 任务 | 日历接入既有 `batchList`/`batchCancel` 桥接补持久入口；批次事件时间取最早一篇 `publishTime`，整批立即发布不渲染 |
| 6 | P2 | 5 条校验提示硬编码中文（en 用户见中文） | `publish-contract.js` 内中文字面量 | 结构化 `{ reason, params }` + `translate` 注入，文案入 locales zh/en；未注入时经 i18n 全局实例兜底查表 |
| 7 | P2 | 30 天上限 / 同账号 5 分钟间隔只在被拒时告知 | hint 仅「留空 = 立即发布」 | hint 改为 `scheduleHintWithLimits`，限制值复用 `PUBLISH_CONTRACT_LIMITS` 单一真源 |

### 附带纠正：注册表 note 与实现不符（防再漂移）

`publish-capabilities.json` 的 `schedule.note` 曾把参考产品的做法写成本项目实现
（「平台原生定时：抖音 timing、快手 publishTime、B站 dtime」）。实测 `electron/publishers`
对 `prePubTime|dtime|timing[:=]` **零命中**——本项目 publisher 不消费平台侧定时参数，
所有平台的定时统一由本地 scheduler 到点后走普通立即发布链路。

由此得出的推论已写入 PRD §6.3.14.5：**定时对平台完全不可见**，平台到点只会收到一次普通的
立即发布请求，因此各平台定时行为的差异**只可能来自 publisher 自身**（登录态/验证码/风控/内容限制），
**不可能来自「该平台是否支持定时」**。已加两条结构锁防止再漂移。

### 验证边界声明（重要，不可省略）

- 本记录及上述修复证明的是**调度机制**在所有平台可用：
  `apps/desktop` 全量 13957/13957、`packages/shared-utils` 588 例全绿、QM-1 打包通过。
- 本记录**未**证明任一平台的**真机定时发布**（无任何平台账号的真机端到端证据）。
  该验证已独立立项：`openspec/changes/real-machine-scheduled-publish-verification`
  （15 平台分批矩阵 + 每平台 A/B/C 三段证据判据 + 7 个边界场景 + 前置条件：
  各平台登录态由用户提供，且每次真实对外发布前需人工确认）。