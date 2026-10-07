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
| 消费者并集 | PASS | `git grep` 反查两个被改模块的全部测试消费者并集全跑：`bilibili-audit-check` / `publish-monitor` / `publish-audit-requery` / `bootstrap` / `phase1-context` ⇒ **5 files 132 tests 全绿（rebase 到 `db51cc163` 之后复跑）**。不是只跑 diff 里出现的测试文件 |
| 变异反证 | PASS | **十二条**逐个实跑变红，每条收尾断言源文件与备份**逐字节相同**（`ALL_RESTORED=true`），且每条都归因到具体测试名（第一轮反证的名称解析被 ANSI 干扰恒为空，已修并重跑——「红了但说不出谁红的」不构成反证记录）：M1 摘扇出⇒A2+A3+A5+A8+A11+A13+A15+A15c+A16+A17+A20；M2 摘主桶 published 判据⇒T5+T7+A13+A18；M3 无条件扇出⇒A4+A2+A12+A16+A17；M4 日志不带 bucket/state⇒A11；M5 withStatusParam 退化⇒A2+A3+A9+A11+A13+A15c+A17+A19；M6 摘桶键形态白名单⇒A20；M7 非主桶也产出 published⇒A3+A3b+A13+A15c；M8 not_pubed 改判 rejected⇒A3+A3b+A13；**M9 published 判据退回「调用方指定的桶」⇒仅 A18 红**；**M10 重复 status 只替换首个⇒仅 A19 红**；**M11 不报 bucketsSkipped⇒仅 A20 红**；**M12 扇出上限失效⇒仅 A15 红**（后四条即本轮新增守卫，各被自己的新测试独占抓住） |
| 全量测试 | PASS（base 已标注） | `vitest run electron` 全量实跑：`Test Files 1 failed \| 464 passed \| 1 skipped (466)`、`Tests 1 failed \| 8813 passed \| 1 skipped (8815)`。**跑在 base `cbce32541` + 本分支两个提交上（rebase 前）**；rebase 到 `db51cc163` 后未重跑全量，改由 CI 的 QG Unit Tests 覆盖最终 head。唯一红＝既有 `electron/services/feedback.test.js` 的 Windows `fs.symlinkSync` EPERM（本机权限态，已登记的已知项；本 PR 未触碰 feedback/logger 任何路径）。**注意 `FULL_RC=1` 而 harness 通知报 "exit code 0"**——后台任务通知的 rc 不可信，判据一律读日志里的 `Tests ... failed` 行 |
| 安全（第三方输入进 URL） | PASS | 桶键来自 `data.class`，进 URL 前过 `/^[A-Za-z_][A-Za-z0-9_]{0,31}$/` 形态白名单，不合规即跳过该桶（不发起请求）。A12 用 `a#x=1`/`b&c`/含空格/40 字符四种坏键断言「只发了主桶那一跳」且 URL 里 `status=` 只出现一次 |
| 行尾与 diff 对账 | PASS | `git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件完全相同**（6 文件：125/20、267/0、18/6、136/0、36/0、38/0）⇒ 无幽灵行、行尾未被统一重写。删除数归因：`bilibili-audit-check.js` 的 20 行＝被 `fetchArchiveList`/`findEntry` 取代的原内联判据块；`publish-monitor.js` 的 6 行＝JSDoc 一行与 `poll-progress` 原单行日志。取证文档为**纯追加 36 行、0 删除**。生成的 `.ccg/review/buckets-runtime.diff` 已 `git restore --staged` 撤出，不随提交进仓 |
| 接线棘轮 | PASS | 未新增测试**文件**（在既有 `bilibili-audit-check.test.js` 内加 describe），由 `apps/desktop/vitest.config.js` 既有 include 收集；实跑日志该文件 28 例 > 0 |
| QM-1 打包 | PASS（base 已标注） | 跑在**第二轮提交 `d855dfd89`（rebase 前）** 上：`pnpm run build:vue && electron-builder --dir` ⇒ `BUILD_DIR_RC=0`（electron 43.7.7 / win32-x64，asar integrity 已更新）。产物内容判据走 `@electron/asar` 的 `extractFile` API（不用整树 `extract`，避免历史「字节挂到别的文件名」陷阱）：两个被改模块在 asar 内与源文件**逐字节相同**（10280 / 7955），`BILIBILI_BUCKET_REASONS`/`withStatusParam`/`stateDesc: result.stateDesc` 三个新符号均在产物中出现；`listPackage` 全清单内 `.test.js` 计数 0 ⇒ 测试未进 asar。启动实测：隔离 userData 拉起 `Multi-Publish.exe`，`ALIVE_AFTER_10S=True`，AGENTS.md 三条禁用标记（`Failed to load platform config` / `ENOTDIR.*app.asar` / `PluginLoader.*mkdir failed`）计数 **0**。<br>**如实列出观测到的其它错误行**（均与本改动无因果路径，且属 smoke 环境所致）：`PythonBridge Failed to start: spawn python ENOENT`（smoke 脚本未设 `MP_PYTHON`）、两条 `许可证权限不足，无法调用 setShellMode/setSidebarWidth`（空 profile 无许可证，按设计）、一条 `HotKeys Failed to register CmdOrCtrl+Comma`（既有问题）。**rebase 到 `db51cc163` 后未重打包** —— 上游 11 个提交经 `git log -- <paths>` 证实**未触碰这两个模块**，且复核 asar 内两文件与 rebase 后源文件仍 `identical=true`；但产物整体（renderer bundle 等）对应的是 rebase 前的树，最终 head 的打包由 CI 覆盖 |
| QM-4 视觉 | N/A | 零 UI 文件改动（`git diff --name-only` 仅 2 个主进程服务 + 1 个测试 + 1 个文档） |
| QM-6 CCG 双模型外部评审 | PASS（走替代通道，偏差如实登记） | 触发条件命中（改主进程服务）。两轴均已回并逐条处置，见下两节。前端轴 `opencode run --model opencode/ling-3.1-flash-free` ⇒ Critical 0 / Warning 1 / Info 8（`.ccg/review/findings-frontend.md`，已入库留证）；后端轴 `opencode/nemotron-3-ultra-free` ⇒ Critical 4 / Warning 6 / Info 10（`.ccg/review/findings-backend.md`）。**偏差**：配置里的两个 primary（`codex` / `claude`）本轮都不可用——`codeagent-wrapper --backend codex` 停在 `Reading additional input from stdin...` 永久挂起（第 4 种死法，已 kill），`claude` 前几轮已定性为长任务静默空转；两轴同经 `opencode` 一个 harness ⇒ 跨家族独立性打折。复现原通道：`~/.claude/.ccg/config.toml` 的 `[routing]` + `codeagent-wrapper --backend <primary> --lite` |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin bilibili-audit-buckets` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### QM-6 后端轴逐条处置（Critical 4 / Warning 6 / Info 10）

通道偏差：配置里的 backend primary `codex` 本轮**第 4 种死法**——`codeagent-wrapper` 停在
`Reading additional input from stdin...` 永久挂起（未喂 stdin，零产出，`Session-ID` 照发，看起来像"在跑"）。
按产物判活 ⇒ `TaskStop` 后改走 `opencode run --model opencode/nemotron-3-ultra-free`。
第一次宽任务书 `[504] Upstream idle timeout exceeded` 零产出；收窄成「四问封闭清单 + 每题 ≤3 行 + 不要复述代码」后落盘。

**按既有纪律：severity 标签一律核正文 + 自己复量后才处置，不按标签执行。**

| 项 | 判定 | 依据与处置 |
| --- | --- | --- |
| C1 `published` 判据取的是「调用方指定的桶」而非「已发布桶」常量 | **成立，接受** | 生产调用图里 `pollUrl` 恒为 `CHECK_URLS.bilibili`（status=pubed），故**当前不可达**；但不变量确实被写弱了——把 `listUrl` 指到 `not_pubed` 就能让未发布桶里的 `state=0` 判成上线，正是本切片立项要防的那类语义漂移。改为 `primaryBucket === BILIBILI_PRIMARY_BUCKET && isObservedOnline(...)`，新增 A18 |
| C2 `withStatusParam` 对已含重复 `status` 的 URL 只替换首个 ⇒ 产出两个 `status` 键 | **成立，接受** | 属实：原 `replace` 无 `/g`。重复键的服务端取值未定义＝「请求发出去了但条件没生效」的同族形态。改为「首个改写、其余整段删除」，新增 A19（并断言其余参数与相对顺序不被吃掉） |
| C3 `publish-monitor.js:70-73` 的 `failed` 分支永不可达 | **成立但不属本 PR** | 实测确认 `checkPublishStatus` 两条路径都不产出 `failed`（bilibili 只出 published/pending/error，通用路径出 statusMap 键/unknown/error）。该分支**在我这次改动之前就存在**且未被本 diff 触碰 ⇒ 不在本 PR 顺手删（AGENTS.md：bug fix 不连带清理）。登记为后续项 |
| C4 终态判断里混着 bilibili 永不产出的 `reviewed`/`rejected` | **不成立（评审者自己也承认）** | 复量：通用路径的 `statusMap` **确实**会返回 `reviewed`/`rejected`（其他平台走这条），所以那不是死代码、也不是误用风险，是共用出口的正常形态。评审正文亦写「虽 bilibili 不走此分支」。⇒ 属重构建议，不改 |
| W5 形态白名单可能静默丢弃合法新桶键 | **成立，接受** | 症状会把「该扇出而未扇出」伪装成 `not-in-list`，与本项目反复踩到的「静默过滤 = 不可归因」同形。改为被拒键记进 `bucketsSkipped` 并进日志，新增 A20 |
| W6 `Object.keys` 插入序决定探测优先级，未来可能先探低优先桶 | **不改** | 纯假设未来 API 变更；当前实测词表只有 2 个非主桶且都在上限内。为假想需求引入 `BUCKET_PRIORITY` 数组属过度设计 |
| W7 `nav-not-established` 出口不带 `bucketsProbed` | **不改** | 该出口一条列表请求都没发，补 `[]` 与不补在日志里同为空串，零信息增量 |
| W8 通用路径缺 `primaryState` 键 | **不改** | 通用路径不产出任何 B 站专属字段，为其补 `null` 是给不存在的消费者建列（同 AGENTS.md「不得为无人消费的字段建死列」） |
| W9 `normalizeClassCounts` 短路顺序隐患 | **不改** | 评审者自己核完写「安全」，建议只是加注释；现有注释已说明判据 |
| W10 通用平台解析过宽（`includes` 关键词易误判） | **不属本 PR** | 属通用回退层的既有形态，本 diff 未触碰。登记为后续项 |
| I11 `MAX_BUCKET_PROBES=3` 与 PRD「最坏 3 次」不符 | **成立，接受** | 我写的规格与我自己写的常量确实差一格（主桶 1 + 补查 3 = 4）。改常量为 2 与实测词表（2 个非主桶）和规格逐字对齐，新增 M12 反证 |
| I12–I20 | 确认类 | 其中 I16/I17/I18/I19 是对本轮 catch 作用域修复、truncated 先算后探、非主桶状态字段原样透传、timeout 末轮上下文的正面确认 |

**后端轴独立命中的两条（自审与前端轴都没看到）**：C1（不变量写成「调用方指定的桶」而非语义常量）与 C2（重复 query 键）。
两条各自配一条变异反证（M9/M10）并实测**只有对应新测试变红**——即新守卫确实被跑过，不是记录性断言。

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
6. **`publish-monitor.js` 的 `failed` 分支不可达**（QM-6 后端轴 C3，已复量确认）：`checkPublishStatus` 两条路径都不产出 `failed`，该分支自本 PR 之前即死。本 PR 未触碰，按「bug fix 不连带清理」留待独立变更。
7. **通用回退层解析过宽**（QM-6 后端轴 W10）：`data?.data?.list || data?.items || [data?.data]` 加 `includes` 关键词匹配，`status:'published_draft'` 这类值会命中 `published`；且 `status:'unknown'` 出口在 monitor 侧被当 pending 继续重试。属通用层既有形态，与本 diff 无关，另案处理。
