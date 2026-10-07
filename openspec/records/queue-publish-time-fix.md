---
record: queue-publish-time-fix
task: 修 R14——任务队列丢弃平台侧定时的核心字段 publishTime，导致「以为已排期、实际已发出」
date: 2026-10-07
sync_status: PENDING
sync_reason: PR 尚未合并，无法取证 merge SHA
sync_backfill_owner: 本任务作者（合并后的回填 PR）
---

# 执行记录：任务队列 publishTime 丢失（R14，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 会话隔离 | PASS | 隔离 worktree `D:\Data\projects\mp-worktrees\mp-toutiao-queue-fix`，分支 `fix-queue-publish-time`，基线 `origin/main`（db51cc16）。共享根未被写入（`start-mp-task.ps1` 因**别的会话在共享根留有未解决的合并冲突**（`01-docs/learnings.md` 处于 `UU`）而健康检查拒绝创建 worktree —— 该冲突不属本任务，未触碰；改用 `git worktree add`（只写 `.git`，不碰共享根工作树）建立隔离目录） |
| 上一轮修复的真机复验 | **失败（定位到根因）** | 用含 P0 修复（`6fb99307`）的代码重跑真机定时发布：排期 30 天后，日志仍为 `DIAG[publish2] … draftOnly=false` + `toutiao-xhr code=0 提交成功 pgcId=7691596034497135167`。我新增的 `带定时意图：…强制走 Node 直连` 告警**完全未出现** ⇒ `publishToutiao` 里 `Boolean(article.publishTime)` 为 false ⇒ 排期时间在进入发布器前就丢了 |
| 根因（R14） | PASS | `packages/shared-utils/src/task-queue.js` **四处**手抄字段清单，`publishTime` 一处都没有：①`_add`（入队构造）②`getPendingTasks()`（待派发快照）③`serialize().running` ④`serialize().delayed`。字段在**入队瞬间**即被丢弃。下游全链路读 undefined：`executor → publisher.publish(task) → buildPublishArticle`（`publishTime: task?.publishTime \|\| null`）`→ rpaViewManager.publish → publishToutiao`。而 `publishMode:'scheduled'` 在清单里活着 ⇒ 发布历史显示「定时发布」——**标记在、时间没了**，正是「以为已排期、实际已发出」的完整成因 |
| 为什么既有测试全绿 | PASS | 既有测试都从「publisher 收到什么」这一层断言，而 `publishTime` 在更上游的队列边界就没了；且没有任何用例断言「调度器交给队列的字段 == 队列交给 publisher 的字段」 |
| 修法 | PASS | ①`_add` 补 `publishTime`（运行时完整条目，仍显式构造）；②新增 `task-projection.js`，把**三处持久化快照**（待派发 / running / delayed）的字段取舍收敛为唯一实现 `projectTask()`，`publishMode` 与 `publishTime` 在其中成对声明并注释成因。今后新增任务字段只改一处，杜绝第四份手抄 |
| R15：取消入口误导（复核后**不是**逻辑缺陷） | PASS | 真机点「取消任务」得到 `{code:0,data:false,message:'定时任务无法取消（可能已发布或已取消）'}`。复核结论：**逻辑是对的** —— 平台侧定时创建 `submitted→dispatching→executed` 瞬时完成，取消确实总失败，但头条无撤销接口，本地改判 cancelled 只会制造「以为取消成功、平台照发」；既有契约锁（`__tests__/scheduler.test.js`「cancel 对已提交平台的任务返回 false」）正是这条设计决定，**不推翻**。要修的是**文案**：改为如实告知「该排期已提交给平台，本应用无法撤销（平台未提供撤销接口）。请到对应平台的『定时/草稿管理』中撤销」，并顺手在 `scheduler.js` 留注释标明 `executed` 是**刻意**不可取消、指向该修法与契约锁，避免下一次真机复验再误判 |
| 修复生效的真机证据 | PASS | 排期 30 天后重跑，日志链：`draftOnly=true` → `saving draft...` → `draft-only done saved=true` → `带定时意图：DOM 仅存草稿、跳过 XHR 重放，强制走 Node 直连提交排期` → `toutiao-direct status=200 code=7050 msg=提交失败` → `定时直连失败，不允许回退到立即发布路径: API_REJECTED:7050` → `Executor Publish failed`。**内容未被立即发布**（pgcId=0），平台拒绝即如实失败 —— fail-closed 生效，这正是本次改造的目标形态 |
| 遗留发现（不在本 PR 修） | 待跟进 | ①头条对「30 天后」的排期返回 `code=7050`，而能力表里 `maxHorizonDays: 30` 是**我们自己设的假设值**（注释写「与渲染端 maxScheduleDays 对齐」），未经真机验证 —— 需按平台实测上限收窄。②发布页结果面板在平台提交失败时仍显示「✓ 发布成功 / 定时任务已创建」，与实际提交结果不符（同 #3038 小红书假成功同类），需单独立项。③短窗口（+2h）复验被任务队列的频率限制守卫挡住（`delayed:2`），未实际执行 |
| 回归保护 | PASS | 新增 `packages/shared-utils/tests/task-queue-publish-time.test.js` 5 条：①入队后 entry 仍带 publishTime ②publishMode 与 publishTime 必须成对（只保前者即事故形态）③立即发布时两者皆 null（区分「没排期」与「排期被丢」）④执行器收到的 task 仍带 publishTime ⑤反证：源码字面量里 `_add` 与 `task-projection.js` 都必须同时出现 `publishMode` 与 `publishTime` |
| 目标测试 | PASS | task-queue 系列 **53/53**（含既有 `task-queue.test.js` 的 publishMode 透传锁）；`packages/shared-utils` 全量 **742/742**（39 文件，10 skipped），较上一轮 642 新增用例 |
| 结构性门禁 | PASS | `check-max-lines.js` rc=0；`check-renderer-cjs-boundary.js` rc=0；`check-no-brand-residue.js` rc=0；`check-gate-record-debt.js` rc=0；`check-locale-sync.js --keys` / `--cjk` 全 rc=0 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 取 merge SHA，并删掉本文件 frontmatter 的 `sync_*` 三字段 |

### 验证边界声明（不可省略）

本记录证明了**队列边界不再丢字段**（742/742 含反证锁），且**上一轮 P0 修复确实因为字段丢失而无法生效**（真机日志 `draftOnly=false` 为证）。

**未**证明头条排期在平台侧真正到点发布：修复后仍需一次新的真机提交确认 `timer_status=1` 被平台接受。
本轮为定位根因已产生**第二条**真实已发布内容（标题「定时发布复验-修复后」，
`pgcId=7691596034497135167`）—— 它是「修复被上游丢字段架空」的直接证据，需用户在头条后台删除。
其余 14 平台仍全部登记 `unsupported`，真机取证待办不变。