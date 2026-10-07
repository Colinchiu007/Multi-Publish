---
record: bilibili-audit-buckets
task: B 站发布后回查由「只查 status=pubed」改为按端点自报的 data.class 分桶扇出，并把命中桶的真实 state 带进结果与日志
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（合并后按 git log origin/main --grep='(#NNNN)$' 回填，并整段删除本 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：B 站回查分桶查询（bilibili-audit-buckets，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（`apps/desktop/electron/services/`）⇒ 隔离 worktree `D:/Data/projects/mp-worktrees/mp-bilibili-audit-buckets`，裸分支 `bilibili-audit-buckets`，base `cbce32541`。建区以产物实证（`git worktree list` 出现该路径 + `rev-parse` 分支名），未采信入口 rc。共享根保持 main clean |
| 第一性原因（QM-5 ①） | PASS | `BILIBILI_LIST_URL` 写死 `status=pubed`（`bilibili-audit-check.js:24`），列表只有这一跳 ⇒ 审核中的稿件根本不在该桶，走的是与「稿件不存在」**同一个** `not-in-list` 出口。引入点＝#2927 的取证实现（当时按「本机只观测到 pubed 桶」如实落地，非 Bug，是取证边界） |
| 逃逸分析（QM-5 ②） | PASS | 单元层：`bilibili-audit-check.test.js` 对「未命中」只断言 `not-in-list` 一个出口，夹具里没有 `class` 非零形态 ⇒「按桶区分」这一整类行为在测试里**不可表示**。集成层：#3043 的装配锁驱动的是通用链与终态分派，未覆盖 B 站分桶。真机层：B 站投稿此前产不出 postId（#2968 已修）。分类＝**测试场景缺失 + 审查盲区**（把「查不到」当成单一事实，未追问「查的是哪个桶」） |
| 实测依据（2026-10-07 只读复测） | PASS | 用应用自己的账号分区（`persist:account-ca681b37`）开标签、在同源页面上下文里 `fetch(...,{credentials:'include'})`，经 CDP 读回。`status=pubed` 30977 字节/7 条；`not_pubed`、`is_pubing` 各 1076 字节/`count:0`/无 `arc_audits`；未知哨兵值与 `pubed` 逐字节同形 ⇒ `status` 是**真过滤**，桶名词表由 `data.class` 自己回报。全程 GET，未发布/未删除/未修改任何稿件 |
| 修复 + 回归保护（QM-5 ④） | PASS | 主桶命中即停；未命中时只对 `data.class` 计数 > 0 的其他桶补查（常见路径仍 1 次列表请求）；新增 `in-review-bucket`/`in-not-pubed-bucket`/`bucketsProbed`/`classCounts` 出口，并把命中桶的 `state`/`primary_state`/`state_desc` 原样带出。`publish-monitor` 的 `poll-progress` 同步携带这些字段。测试 28 例（A1–A13 + 既有 T1–T15）全绿 |
| 红线（不得外推） | PASS | ⛔ `not_pubed` 命中**绝不**映射成 `rejected`/`deny`（桶名中文语义未实测）；⛔ `published` 只能由主桶命中产出。两条各由 A3/A3b 正向锁住，并由 M7、M8 两次独立变异证明锁在跑 |
| 跨模块真实现契约锁 | PASS | A13 注入**真** `@multi-publish/shared-utils/src/publish-audit-status` 的 `buildAuditPatch`/`mapMonitorStatusToAuditStatus`（不 mock），逐个断言四种无定论出口都产出 `null` 补丁；并先锁 `pending → null` 本身，对方改口径时该条先红。变异 M8（not_pubed 改判 rejected）实测打红 A3+A3b+A13 三条 |
| 防止再次发生（QM-5 ⑤） | PASS | ①`docs/PRD-BILIBILI-AUDIT-BUCKET-QUERY-2026-10-07.md` 落全部实测数字与判据；②`bilibili-audit-check.js` 头注释新增第 4 条硬口径（桶名词表来自响应、扇出目的不是下结论而是分事实）；③上游取证文档追加 2026-10-07 附录，纠正「`-302` 是端点行为」的归因 |
| 消费者并集 | PASS | `git grep` 反查两个被改模块的全部测试消费者并集全跑：`bilibili-audit-check` / `publish-monitor` / `publish-audit-requery` / `bootstrap` / `phase1-context` ⇒ 5 files 121 tests 全绿（不是只跑 diff 里出现的测试文件） |
| 变异反证 | PASS | 八条逐个实跑变红，每条收尾断言源文件与备份**逐字节相同**：M1 摘扇出⇒A2,A3,A5,A8,A11；M2 摘主桶 published 判据⇒T5,T7；M3 无条件扇出⇒A4,A2,A12；M4 日志不带 bucket/state⇒A11；M5 withStatusParam 退化为追加⇒A2,A3,A9,A11；M6 摘桶键形态白名单⇒A12；M7 非主桶也产出 published⇒A3,A3b；M8 not_pubed 改判 rejected⇒A3,A3b,A13 |
| 安全（第三方输入进 URL） | PASS | 桶键来自 `data.class`，进 URL 前过 `/^[A-Za-z_][A-Za-z0-9_]{0,31}$/` 形态白名单，不合规即跳过该桶（不发起请求）。A12 用 `a#x=1`/`b&c`/含空格/40 字符四种坏键断言「只发了主桶那一跳」且 URL 里 `status=` 只出现一次 |
| 行尾与 diff 对账 | PASS | `git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件完全相同**（6 文件：125/20、267/0、18/6、136/0、36/0、38/0）⇒ 无幽灵行、行尾未被统一重写。删除数归因：`bilibili-audit-check.js` 的 20 行＝被 `fetchArchiveList`/`findEntry` 取代的原内联判据块；`publish-monitor.js` 的 6 行＝JSDoc 一行与 `poll-progress` 原单行日志。取证文档为**纯追加 36 行、0 删除**。生成的 `.ccg/review/buckets-runtime.diff` 已 `git restore --staged` 撤出，不随提交进仓 |
| 接线棘轮 | PASS | 未新增测试**文件**（在既有 `bilibili-audit-check.test.js` 内加 describe），由 `apps/desktop/vitest.config.js` 既有 include 收集；实跑日志该文件 28 例 > 0 |
| QM-1 打包 | PASS | `pnpm run build:vue && electron-builder --dir` 实跑 `BUILD_DIR_RC=0`（electron 43.7.7 / win32-x64，asar integrity 已更新）。产物内容判据走 `@electron/asar` 的 `extractFile` API（不用整树 `extract`，避免历史「字节挂到别的文件名」陷阱）：两个被改模块在 asar 内与源文件**逐字节相同**（8399/6436），`BILIBILI_BUCKET_REASONS`/`withStatusParam`/`stateDesc: result.stateDesc` 三个新符号均在产物中出现；`listPackage` 全清单内 `.test.js` 计数 0 ⇒ 测试未进 asar。启动实测：隔离 userData 拉起 `Multi-Publish.exe`，`ALIVE_AFTER_10S=True`，stderr 无 `Failed to load platform config` / `ENOTDIR.*app.asar` / `PluginLoader.*mkdir failed`；出现的两条 `许可证权限不足` 与一条 HotKeys 注册失败属空 profile 无许可证 + 既有问题，与本改动无因果路径（本改动只碰发布回查与日志字段） |
| QM-4 视觉 | N/A | 零 UI 文件改动（`git diff --name-only` 仅 2 个主进程服务 + 1 个测试 + 1 个文档） |
| QM-6 CCG 双模型外部评审 | 进行中 | 触发条件命中（改主进程服务）。**前端轴已回**：`opencode run --model opencode/ling-3.1-flash-free` ⇒ Critical 0 / Warning 1 / Info 8，产物 `.ccg/review/findings-frontend.md`。配置里的 frontend primary `claude` 本机对长任务静默空转（既有事实），按替代通道收窄任务书执行。**后端轴首次尝试卡死**：`codeagent-wrapper --backend codex` 停在 `Reading additional input from stdin...` 永不产出（未提供 stdin），已 kill 并改走 `opencode/nemotron-3-ultra-free`。逐条处置见下节 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin bilibili-audit-buckets` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### QM-6 前端轴逐条处置（Critical 0 / Warning 1 / Info 8）

评审者独立跑了两份测试（36 passed 当时口径）并追读了 `phase4-events` → `publish-audit-status` → `logger` 全链路，正面确认了「无重复实现 / 桶结论不落库 / 传输层注入贯通」三条。逐条：

| 项 | 判定 | 处置 |
| --- | --- | --- |
| W1 `withStatusParam` 导出但形态校验只在调用点 | **接受** | 校验落进函数边界：非法 status 直接抛 `BILIBILI_BUCKET_KEY_INVALID`。理由认同——导出面把安全契约降级成「调用方自律」，下一个调用方即可绕过。新增 A14 锁（含 `''`/`null`/`#`/`&`/空格/超长六种坏输入） |
| I1 `in-review-bucket` 是语义映射，读者会当成「审核中」结论 | **接受** | 把「存在性证据 ≠ 状态结论」写进 `BILIBILI_BUCKET_REASONS` 自己的注释（原先只在文件头与 PRD 里） |
| I2 `monitor-timeout` 不带 bucket/state | **接受** | 超时正是最需要一行定场的时刻；补 `lastBucket`/`lastState`/`lastStateDesc`/`lastBucketsProbed`，新增 A17 |
| I3 `probed.push` 在 await 之后 ⇒ error 出口无 `bucketsProbed` | **接受** | 记账移到发请求之前，catch 出口带上 `bucketsProbed`；新增 A16 |
| I4 兜底 reason `in-bucket:<key>` 与模块 kebab 形态不一致 | **接受** | 改为 `in-<key>-bucket`；新增 A15c |
| I5 `state`/`primaryState` 裸透传，`undefined` 被 logger 丢键 | **接受（已自行核实）** | 实测 `logger.js:242-248` 只收 string/number/boolean ⇒ 统一 `?? ''`，日志 schema 不再时有时无 |
| I6 正则改 URL 与仓库 `URLSearchParams` 惯例分叉 | **不改（认同其判断）** | 评审者自己标注「偏离是合理的、无需改动」：扇出请求须与取证请求逐字节同形（除 status） |
| I7 扇出无上限，探桶数随端点 `class` 键数线性增长 | **接受** | 加 `MAX_BUCKET_PROBES = 3`，且**截断必须出声**（`bucketsTruncated` 进结果与日志）；新增 A15/A15b（未超限不得谎报截断） |
| I8 `checkPublishStatus` JSDoc 未登记新参；`classCounts` 无消费方 | **接受** | 补完整 JSDoc；`classCounts` 进 `poll-progress` 日志（桶计数本身就是「为什么没扇出」的现场） |

**修评审意见时自己踩到的一条（值得留，因为它伪装成「测试变红」而不是「我写坏了」）**：把 `const probed = []` 留在 `try` 内、却在 `catch` 里引用它 ⇒ 每次抛错路径先撞 `ReferenceError: probed is not defined`，把「无定论」变成**裸抛**。症状是 `publish-monitor.test.js` 的 T3 报 `expected 'error' to be 'timeout'` —— 看起来像 monitor 的终态逻辑坏了，实际是服务函数在 catch 里二次抛错、被 monitor 的外层 catch 接走。修法：`probed` 声明提到 `try` 之外。教训：**给 catch 加可观测性时，必须确认它自己要读的变量在 catch 作用域里可见**，否则新加的「归因」本身就是新的错误源。

### 门禁口径的一条实况（不顺手改，只登记）

`check-max-lines.js` 的 `EXCLUDE = [..., 'tests', 'test', '__tests__', ...]` 判据是 `rel.includes(x)`，而 `rel` 是**整条相对路径**——于是任何文件名里带 `test` 的文件（含本 PR 的 `bilibili-audit-check.test.js`，现 571 行）都被结构性排除在 500 行门禁之外。本次「PASS（超限 98 = 挂账 98）」因此**不代表**该测试文件行数合规。不在本 PR 顺手收紧：改判据会一次性把大量既有测试文件判为新增超限，属独立变更（且 `EXCLUDE` 与 `scripts/check-debt-budget.js` 有字面量防漂移用例）。


### 遗留（不假装已闭合）

1. **`not_pubed` / `is_pubing` 桶内的真实 `state` 取值仍未观测** —— 本账号当前 `class={pubed:7,not_pubed:0,is_pubing:0}`，两桶皆空。本改动只是把「能观测到的通道」建起来（扇出 + 日志带字段），没有凭空造出取值。`AUDIT_REQUERY_VERIFIED_PLATFORMS` 因此**仍不含 bilibili**。
2. **那一次投稿仍未花** —— 投稿前实测确认：经应用发布链**做不到「仅自己可见」**。证据：`publish-capabilities.json` 的 bilibili 条目只有 `titleMode`/`limits`（无 `visibility` 字段），实测 `mapVisibilitySemantic('bilibili','private') === null`；`publisher-router.js` 的 bilibili 分支只解析 `category`/`copyright`；RPA 选择器表内 `privacy` 0 命中。⇒ 投稿必然是公开稿件，需用户重新确认方式（B 站在稿件层确有 `is_only_self` 字段，但本仓无任何写入路径）。
3. **`bilibili` 的 `publishMode` 是 `api-then-dom`** ⇒ 走 API 轨时可能根本不产生「浏览器落点 URL」，取证 ① 需先确认实际走哪条轨。
4. **CHANGELOG 收口挪进合并后的 docs-only 回填 PR**（共享件惯例，避免并发撞车）。
5. 其他平台的分桶类比**未做**：微博/抖音/知乎各自列表协议形状未取证，不得照抄 B 站桶模型。
