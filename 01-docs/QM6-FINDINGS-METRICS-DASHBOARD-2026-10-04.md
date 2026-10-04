# QM-6 双模型评审记录：P2-6c 作品互动回流看板（publish-metrics-dashboard，2026-10-04）

评审对象：分支 `publish-metrics-dashboard` 相对 `origin/main` 的实现 diff。
任务书：`.qm6/brief-backend.md`（8 问）、`.qm6/brief-frontend.md`（收窄 4 问版）、`.qm6/brief-frontend-full.md`（原始 8 问版）。
结论原文（逐字入库，未改写）：

| 文件 | 通道 | 模型 | 条数 |
| --- | --- | --- | --- |
| `01-docs/QM6-FINDINGS-METRICS-DASHBOARD-BACKEND.json` | **主通道** `codeagent-wrapper --backend codex` | codex | 9（FB1–FB9） |
| `01-docs/QM6-FINDINGS-METRICS-DASHBOARD-BACKEND-FALLBACK.json` | 替代通道 | `opencode/nemotron-3-ultra-free` | 8（FB1–FB8） |
| `01-docs/QM6-FINDINGS-METRICS-DASHBOARD-FRONTEND.json` | 替代通道（主通道 claude 三次全败） | `opencode/longcat-2.5-preview-free` | 4（FF1–FF4） |

**评审基准要绑 SHA**：两路后端评审跑在 `fd392e88b`（合并 origin/main 之后、QM-6 修复之前）的工作树上，
因此它们看到的"最新值/截断排序/私有 getOwnerSubject"都是**修复前**的形态；codex 还在证据里注明
「工作区当前已有未提交的 toEpochMs 修复，HEAD 评审对象仍不含」。本节的处置即针对该基准。

---

## 一、通道经过（含主通道可用性实测）

| 轴 | 主通道 | 实跑结果 | 最终产出通道 | 判据 |
| --- | --- | --- | --- | --- |
| 后端 | `codeagent-wrapper --backend codex` | attempt 1 停在 `Reading additional input from stdin...`（非交互 stdin 下不返回，被我停掉；其 `codex.exe` 子进程成为孤儿，未强杀以免误伤并发会话同名进程）；attempt 2 **成功**（约 35 分钟后落盘 9 条，`WRAP_RC=0`），期间日志出现过 `failed to parse function arguments: missing field 'cmd'` 但不收敛于失败 | **主通道 codex**（+ 替代通道 nemotron 并行跑出一份，用作交叉验证） | findings 文件真落盘且可 JSON.parse；不看 CLI 退出码 |
| 前端 | `codeagent-wrapper --backend claude` | **3 次全败**（首次 + 按 QM-6「最多重试 2 次、间隔 5 秒」的两轮），每次 `claude completed without agent_message output` + `WRAP_RC=1`，无 findings | 替代通道 `opencode/longcat-2.5-preview-free` | 首次跑 600s 后 stdout 字节冻结在 15030、零新增观测（60s 心跳就是为了让"零观测"出声）→ 判为长生成停滞；任务书从 8 问收窄到 4 问后重跑，`EXIT … findings_landed=true findings_parseable=true` |

**独立性口径如实写**：后端是 **codex（主通道）+ nemotron（替代通道）两个 harness 两个底模**；前端只有 longcat 一个底模（主通道 claude 三次不可用），因此前端轴不满足「双模型独立」，仅有「非自审的外部模型评审」这一层——该缺口在质量记录里按偏差登记，不以本地自审冒充。

**交叉验证的实际价值**：FB1（时刻字典序）、FB2（回落×首份口径）、FB4（截断保留最旧）、FB5（三份 getOwnerSubject）由 codex 与 nemotron **各自独立提出**，方向一致而侧重不同（nemotron 举的例子方向还是错的，见下表）——这类重合是本仓坚持跑外部模型的理由。FB6/FB7/FB8 三条**只有 codex 命中**，且都是我自己测试体系的盲区（mock 替真实链路撒谎），价值最高。


---

## 二、逐条处置

### 已修（后端轴）

| # | 严重度 | 判定 | 处置 | 回归证据 |
| --- | --- | --- | --- | --- |
| FB1 | Critical | **采纳（但其举例方向是错的）** | 评审给的例子称字典序 `'1728000000000' > '2026-10-04T…Z'`，实测 V8 里 `'1' < '2'`，方向相反；**但它担心的东西是真的**：字典序对 epoch 串、带时区偏移的串都会排错序/分错桶。改为「先解析成时刻再比」：新增 `toEpochMs()`（`Date.parse` 优先，10/13 位纯数字串按 epoch 秒/毫秒补，不可解析 → NaN 走 V3 undated 分支），最新值与日增分桶一律用解析后的时刻；分桶键由 `captured_at` 前 10 位改为 **UTC 日**（`2026-10-03T08:00:00+08:00` 的真实 UTC 日是 10-03 之前的 10-03 00:00Z 一侧，不再靠字符串形状） | T27（epoch 串与 ISO 混排取真实最新）、T28（带偏移按 UTC 日分桶）、T30（入参倒序仍算出同样结果） |
| FB4 | Warning（实际后果比 Critical 更近） | **采纳** | 「不按计划窗口过滤、一次取全部快照」的排序原本是 `tracked_content_id ASC, captured_at ASC` + LIMIT。评审指出：一旦命中上限，保留的是「ID 较小那批作品的**最旧**快照」，聚合层「取最新一份」就会拿旧值 ⇒ 总量静默偏低，而界面只报 `truncated=true`，看不出成因。改为 `captured_at DESC, rowid DESC`（截断丢的必须是**最旧**的），并把 `rowid` 取出来交给聚合层做同值并列的确定性判据 | T17d（上限=1 时必须拿到 `d-new`，`total=3`、`truncated=true`）、T30 |
| FB8 | Info | **采纳** | 重复主键行（迁移/手工插入）原先「第一行的 platform 代表该 id 的全部快照」，平台分布会静默错位。改为整行跳过并新增计数 `duplicateTrackedRows` | T31 |
| FB2 | Warning | **采纳其要求的"明确假设 + 补测"，不采纳"加重置检测"** | 评审给的算例结论是「总增量 18 与真实新增一致」，也就是它自己验算了当前口径不重复计数；它真正指出的是**计数器重置**（归零后重新计）场景无法被差分区分。本切片不引入重置猜测逻辑（`diff < -prev*0.5` 视为重置这种阈值就是凭空造判据），改为：把「口径假设累计计数单调不减，回落仅作平台侧删除/修正，`retreats` 计数供人工排查」写进 PRD §三 V7，并补它点名的缺失场景测试 | T29（10 → 4 → 12 序列：日增 10/0/8、总量 12、retreats=1） |
| FB5 | Warning | **采纳，本 PR 内收敛** | 原先新增 `resolveIpcOwnerSubject` 却留着 `publish.js`、`account.js` 两份同逻辑私有实现（三分口径）。已把两处改为转发唯一实现，并补 `owner-subject-single-source.test.js`（三态真值表行为测 + 「两个调用点不得再自带 `identityService.getState()` 判定」的接线锁） | 新测试文件；`electron/ipc-handlers` 目录全量随大套件跑 |

### 按证据拒绝 / 不改（后端轴）

| # | 严重度 | 判定与证据 |
| --- | --- | --- |
| FB3 | Critical | **拒绝，理由：它把「同一桶」当成了「必须同一 SQL」。** 逐字比对两处实现：`_ownerPredicate` 的 legacy 分支只在**身份服务缺席**（`ownerSubject === undefined`，即 legacy 模式）时生效；一旦有真实 sub，两侧都只做精确相等匹配 ⇒ **不存在跨用户泄露**，也不存在「同一身份下两卡互相打脸」。`''` 与 `undefined` 的差别只影响 legacy 模式下「未署名数据要不要显示」：看板侧选择显示（否则用户会看到 0，正是 P2-6b 记过的"存量被当成不存在"错法），发布历史侧选择隐藏。这是**方向不同的两个问题**（一个读侧展示、一个写侧归属），不是同一个决定的两份拷贝。评审建议的"新增 `isLegacyOwnerSubject` 统一纯函数 + 迁移规范 `''`→NULL"要动 publish-history 的既有语义与迁移，风险面大于它本切片能承担的范围，已登记为后续项（PRD §十 第 6 条）。 |
| FB6 | Critical | **拒绝，后果不成立。** 评审称未登录用户会看到「权益不足」误导文案。实际渲染路径：`license-access-control` 的 `denied()` 返回 `{code:-3, errorCode:'AUTH_REQUIRED'}`，而面板判据用的是唯一实现 `isAuthGateResult()`（`src/utils/auth-gate.js`），命中后渲染的是**本地文案 `dashboard.metrics.loginRequired` =「登录后查看你的作品互动数据」**，服务端 message 根本没进界面（组件测试「未登录（AUTH_REQUIRED）→ 引导登录，绝不渲染一排 0」实跑通过）。它建议的「把 `performance:overview` 加进 PUBLIC_CHANNELS」恰恰会造成它自己在 FB3 反对的那种分裂：同页「累计发布」用的 `dashboard:stats` **不在** PUBLIC_CHANNELS，把互动通道单独放开会让两块数据在登录门禁上口径不同。 |
| FB7 | Info | **部分不实，按实测纠偏。** 评审称 `performance-loop-store-overview.test.js`「因测试基础设施问题（`<<` 语法错误）未跑通」，并称 `performance-overview.test.js 28 passed`。实测：该 store 文件在本轮改动前跑过 6 passed，改动后连同新增 T17d 跑过 7 passed；聚合文件改动前 18 passed、改动后 23 passed（新增 T27–T31）。不存在它描述的语法错误——**这条是评审模型自己没跑起来却当成了代码问题**。它提的两个「补测」点（T14 snapshot 侧健康度、T24 空态互斥）本已存在：`PerformanceFlowPanel.test.js` 的空态与未登录用例逐条断言互斥（`expect(find(...empty)).toBe(false)`），健康度计数由 `performance-overview.test.js` T14/T14b 覆盖。 |

### 前端轴

| # | 严重度 | 判定 | 处置 |
| --- | --- | --- | --- |
| FF1 | Warning | **采纳** | 同页确实有两个易混的数字：上方卡片是账号级 `sync:cached`，面板是作品级 `performance_snapshot`。改为「账号总阅读 / 账号总评论 / 账号总粉丝」（顺手把原先写死在模板里的中文标签 `总阅读` 收进 locale，符合 Gate 7 口径），面板侧保留「总播放/总点赞…」并由面板副标题声明「来自发布后自动回采的作品级数据」 |
| FF2 | Info | **确认，无需修改** | 评审独立读到并确认了我刚补的 error 出口（`status === 'error' && !overview` → 显示失败文案），即"首次取数失败只剩一张带标题的空卡"这一静默无出口问题已闭合（该修复来自前端轴任务书第 2 问的自我核对，此条为外部复核） |
| FF3 | Warning | **采纳** | `dashboard.metrics.interactions` 确实是死键（zh/en 都定义、`src` 下零使用）→ 两侧同时删除，不保留"以后可能用"的键 |
| FF4 | Warning | **采纳** | `defineExpose({ reload })` 无生产消费者（只有测试调用），页面靠 `reloadToken` prop 驱动 → 删除 expose，测试改为 `setProps({ reloadToken })`，避免给下一个会话留一条"以为存在外部调用方"的误导 |

---

## 三、门禁结论

> ⚠️ 编号冲突提醒：codex 与 nemotron 都把自己的发现编号为 FB1…FBn，**同号不同内容**。
> 下表「来源」列区分两者，避免后来者拿 nemotron 的 FB6 去对照 codex 的 FB6。

### codex 独有的三条（价值最高，全部命中我自己测试体系的盲区）

| # | 严重度 | 判定与证据 | 处置 |
| --- | --- | --- | --- |
| codex-FB6 | **Critical** | **采纳。** 我原来的 T26 直接 mock window.electronAPI.performanceOverview 返回 {code:-3, errorCode:AUTH_REQUIRED} 信封；而真实链路里 electron/preload/access-control.js 对非 public 方法在 **invoke 之前** 就 throw LicensePermissionError，invokeWithFallback 不捕获异常 ⇒ 未登录走的是 reject 分支，isAuthGateResult 永远判不到，登录门禁在真实渲染路径上失效。这是「夹具替真实路径撒谎」的又一落点（AGENTS.md「契约夹具不得替对方剥壳」同族）。 | ① src/utils/auth-gate.js 新增 isAuthGateError(error)（判 name===LicensePermissionError 与 code===-3 两个契约字段，不判文案），面板 catch 分流到登录态；② 测试**不再手搓错误对象**：用生产同一个 createDynamicAccessApi 配 public 权限档造出真错误再喂给组件；③ 反证 M17 实测变红 |
| codex-FB7 | Warning | **采纳。** store 两个查询的 catch 把失败吞成空行，handler 于是返回 code:0 + hasData:false ⇒ 用户看到「从未发布」。我原先的 T20 只 mock store 函数主动 throw，覆盖不到真实 SQL 失败。 | 本机实测包装层对「表不存在」**根本不抛错**（prepare() 正常返回、get() 给 undefined），所以只加 catch 是无效修复；改为读侧显式探测 sqlite_master 表在位 + 返回 error 字段，handler 据此回 REQUEST_ERROR；T17e 用真库真 ALTER TABLE … RENAME 制造故障，M16 反证变红 |
| codex-FB8 | Info | **采纳，并纠我自己的过度声明。** 健康度块原先在「有数据」分支内，unsupported/failed 且零快照时只剩一句「尚未回采」，归因看不见；而我 PRD T24 写的「四种空态互斥」实际只实现了两种。 | 健康度块移出数据分支、恒随面板在场；补 T24 第四态用例（全 unsupported 时空态 + unsupported 计数 + 覆盖率 0 同时可见） |
| codex-FB9 | Info | **确认其结论并据此改文**：codex 对 T1–T26 接线情况的核对与我自评一致（缺口即 FB7/FB8 两处 + 未跑真实 preload 路径），并要求把 FB1/FB4 的追加判据纳入矩阵。 | PRD §八 已写入 T27–T31、T17e、T20c 与第二轮反证 M11–M17；新增判据 V14（读侧失败必须出声）/ V15（门禁两种形态） |

### 两路后端共同命中的条目

codex 与 nemotron **各自独立**提出：FB1（时刻字典序）、FB2（回落 × 首份口径）、FB4（截断保留最旧批次）、FB5（三份 getOwnerSubject）。四者全部采纳并修复（详见 §二 表）。

两处必须写下来的分歧：

1. nemotron 在 FB1 给的例子**方向是错的**（它称字典序下 epoch 串会赢；实测首字符 1 小于 2，epoch 串会输）。**按风险种类处置、不按它的例子处置**——修完后用双向测试把方向钉死（T27 两半）。
2. nemotron-FB7 声称 performance-loop-store-overview.test.js「因语法错误未跑通」，实测该文件与其新增用例全部跑过（6→8 passed）。**评审模型自己没跑起来不等于代码坏了**，这类论断一律以本仓实跑为准。

nemotron-FB3、nemotron-FB6 两条 Critical 按逐字证据拒绝，理由见 §二。

### 汇总

- **Critical 闭合情况**：codex-FB6 已修；nemotron-FB1 已修；nemotron-FB3 / nemotron-FB6 按证据拒绝并写明理由；未有一条 Critical 被静默丢弃。
- 后端合计 **17 条**（codex 9 + nemotron 8，其中 5 条主题重合）：采纳并修复 12、按证据拒绝 3、确认类 2。
- 前端 4 条全部采纳/确认（FF1/FF3/FF4 修，FF2 为复核确认）。
- 反证合计 **17 条**（首轮 10 + 修复段 7）全部实测变红并逐条归因。其中两条首轮 GREEN_UNEXPECTED 反向暴露了我自己的问题：M11 是**测试只测单方向**（把 epoch 判成「不可解析」也能通过）⇒ T27 改为双向都测；M17 是**多条款判定只摘一条**（name 与 code 冗余，摘一条仍命中）⇒ 变异改为整体 no-op。这两条修正来自跑反证，不是来自看代码。
- 修完跑的是「消费者并集」：以 git diff --name-only 的被改模块反查测试消费者（git grep -l），因 publish.js / account.js 被改，整个 electron/ipc-handlers 目录并入验证面；实测数字见 .quality-gates.md 本次记录。
