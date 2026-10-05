# QM-6 外部评审原文与处置：P2-6a 发布统计终态口径（2026-10-03）

> 被审对象：分支 `publish-stats-success-truth` / PR #2807（`fix(publish): P2-6a 发布统计按 status 定终态`）
> 评审包：`.qm6/code.diff`（vs merge-base 的三个代码文件）+ `.qm6/prd.md`（本切片 PRD 全文）
> 通道与偏差：`codeagent-wrapper` 的 **两条原路由均不可用**（实测 `Test-NetConnection 127.0.0.1 -Port 15721 -InformationLevel Quiet` = **False**，即 CC Switch 代理未运行；codex 轴此前报 502 `/v1/responses`、claude 轴报 ECONNREFUSED）。因此按已记录的替代通道跑 `opencode run -m opencode/<model>`，两轴选**不同底模**：
> - 后端轴 `opencode/nemotron-3-ultra-free`
> - 前端/集成轴 `opencode/longcat-2.5-preview-free`
> 偏差声明：产出确为外部模型独立给出，但两轴同经 opencode 一个 harness，**跨家族独立性打折**，不得记作「codex + claude 双模型 PASS」。
> 回收判据用「findings 是否真落盘/日志是否有全文」，不用 CLI 的 rc（`opencode` 端点不可用时也返回 rc=0）。本次后端轴 **rc=0 但文件 JSON 不合法**（多一个闭合括号），内容完整故按原文抢救；只看「rc=0 + 文件存在」会漏掉格式失效这件事。

## 一、后端轴（6 条：1 Critical / 2 Warning / 3 Info，原文要点）

| # | 严重度 | 定位 | 结论 | 处置 |
|---|---|---|---|---|
| B1 | **Critical** | `publish-history.test.js` 结构锁 | 锁只做字面量匹配 `r.success !== false`：改个变量名（`record.success`）、换成 `!=` / `=== true`、或倒写成 `!.success` **都能整条绕过，锁不变红** | **已修**：改为按语义形态禁（两条正则：`.success [!=]== (true|false)` 与 `!.success`）。反证两次实跑：注入改名变体 ⇒ 红并点名「按顶层 success 字段做布尔比较」；注入 `!record.success` ⇒ 红并点名「取反判存在」；随后 `git checkout HEAD --` 还原并回读残留 0 |
| B2 | Warning | `getStats` | `perPlatform` 各桶之和恒等于 `total`，但 `daily` 之和 ≤ `total`（缺 `timestamp` 或窗口外不进 daily），三者不恒等；趋势柱会比顶层矮而用户无感 | **判定成立、不改代码**：这是 PRD §三 第 9/10 行刻意保留的原行为。已在 §九 补一条，把「趋势图少画一部分记录」这个可见后果写明（评审亦判「非缺陷」） |
| B3 | Warning | 界面/口径 | `unclassified` 不展示但计入 `total` ⇒ 用户看到「成功+失败 ≠ 共发布」会误读；建议在成功率旁注明分母 | **部分采纳**：加文案会漂视觉基线（需 CI 同源基线流程），不在本刀改；已在 PR 描述与 PRD §九 第 4 条显式登记这条用户可见不自洽，并补一条**投影边界**（`Home.vue:340` 的手写白名单不含该键，将来要在 Home 显示必须先改那行） |
| B4 | Info | `classifyPublishStatus` | 穷尽性核验：`null` / 缺字段 / 空串 / 数字 / 对象 / 大小写变体全部落 `unclassified`，且不可能返回第四个值 | 无需修改（与 PRD §三 表 1-7 一致；已作为 §三 的复核结论引用） |
| B5 | Info | diff 范围 | 消费者代码不在 diff 内，无法判前端是否仍按 `total` 理解 `successRate` | 按提问约定如实记「diff 内不可见」，改由本 PRD §五 的实测消费面承担（2026-10-03 收口时复跑：**4 文件 95 passed** = `publish-history` 24 + `ipc-handlers/publish` 33 + `Dashboard` 13 + `Home` 25；此前记录的 94 是加接线棘轮**之前**的数，已被本条替换） |
| B6 | Info | 读盘失败路径 | 无处把「读盘失败/缺字段」折叠成确定结论；坏行由 `readRecords` 逐行 try/catch 跳过 | 无需修改；记为「本刀未引入新的静默折叠」 |

## 二、前端/集成轴（3 Warning / 2 Info，原文要点）

| # | 严重度 | 定位 | 结论 | 处置 |
|---|---|---|---|---|
| F1 | Warning | 结构锁覆盖面 | 锁只读被改文件，故「终态判据只有一份」**只在单文件内成立**；`packages/shared-utils/src/publish-history.js` 里还留着同一判据（实测 3 处，`:115/124/142`），当前零引用 ⇒ 下一个消费者拷走错判据时锁不会红。建议要么扩成全仓扫描，要么在锁注释里声明覆盖边界 | **已修（取更强的一档）**：新增接线棘轮用例「孤儿孪生实现不得被任何源码接线」（`git grep` + 排除 markdown 与孪生本体与本测试文件）。**该棘轮第一次写出来是恒绿的**：vitest 的 cwd 是 `apps/desktop`，而我给的 pathspec `apps packages scripts` 是相对 cwd 解析 ⇒ 指向不存在的 `apps/desktop/apps…`，`git grep` 返回 rc=1 被「无命中」分支吞掉。修法：先 `git rev-parse --show-toplevel` 取真实根再 `-C`，并加两条失明自检（根非空 + 孪生文件必须存在）。反证：把探针 `git add` 成真实接线者 ⇒ 精确变红并点名该文件；移除后 24 passed |
| F2 | Warning | 日志字段 | 缺「读了哪个文件」与「`readRecords` 是否有条数上限」，排障时无法判断 `total` 是否被截断 | **不采纳（已核）**：直读 `readRecords` 源码，无 `slice` / `limit` / `max` 任何上限形态 ⇒ 「total 被截断」这一维不存在；文件路径由 owner 唯一决定（单 profile 单路径），已在 §九 记为不采纳并附理由 |
| F3 | Warning | 显示项 | 标签文字（「失败」「成功率」「共发布」）语义仍准确**不需要改**；缺 `unclassified` 展示导致可见不自洽 | 与 B3 同源，同一处置。两轴**独立**指向同一格不自洽，是本次最有价值的交叉信号 |
| F4 | Info | 词汇 | `unclassified` 与登录态的 `unverified` 近义（同义多词）；`concluded` 只是局部变量，风险低 | 不在本刀统一。按评审建议保留 `unclassified`（终态分类语义更准），差异留给词汇表登记 |
| F5 | Info | 弱锁标注 | 「全无定论时成功率为 0」这条**不能**区分两种分母实现（都得 0）；PRD §三 第 12 条已自行承认并标为已知弱锁，分母语义由 L2 兜底 | 无需修改；本条是对"已知弱锁是否被恰当标注"的正向确认 |

## 三、两轴共同命中的地方（值得单独记一笔）

后端轴 B3 与前端轴 F3 是**同一件事的两次独立表述**：第三类被如实分开之后，界面上「成功 + 失败 ≠ 共发布」成了新的困惑源，而本期不展示它。
两个不同底模互不通气地指向同一格，说明这不是我为了收尾而挑的软目标。当前处置是「登记 + PR 描述显式告知」，**真正的收口需要一次带新文案与 CI 同源基线的界面切片**（已登记 §九 第 4 条，属 P2-6 后续）。

## 四、评审者越界写盘核查

两轴跑完各自 `git status --porcelain` 核对：后端轴只写了它被指定的那一个 findings 文件；前端轴日志亦自报仅创建 `.qm6/findings-frontend.json`。收口时 `.qm6/` 整目录删除（评审原文已迁入本文件入库，不留临时目录）。

## 五、评审原文逐字留证（非转述）

> 落盘理由：上文各表是我的**处置**，属声明；下面两坨是评审者的**原文**，属证据。
> 本文件写完后删除 `.qm6/` 临时目录，原文只在这一处存活 —— 否则下一次会话读到的就只有我的转述。
> 注：`findings-backend.json` 由该轴直出时 JSON **不合法**（多一个闭合括号），已按现场字节原样保留，未做修复；
> 需要机读时先剥掉尾部多余括号。这正是「CLI rc=0 不等于跑成功」的现场样本。

### 后端轴（opencode/nemotron-3-ultra-free）—— 原文逐字（`.qm6/findings-backend.json`，3721 字节）

```json
{"axis":"backend","findings":[{"severity":"Info","loc":"publish-history.js:38-43 (classifyPublishStatus)","symptom":"分类函数对所有输入（null record、缺 status、空串、数字、对象、大小写变体）均返回 'unclassified'，且仅返回三值之一，符合 PRD §三 表 1-7 行。无输入能导致返回第四个值。","fix":"现状符合预期，无需修改。"},{"severity":"Info","loc":"code.diff (全文)","symptom":"diff 仅包含 publish.js、publish-history.js、publish-history.test.js 三个文件，未出现 Dashboard.vue / Home.vue 变更。","fix":"diff 内不可见消费者代码，无法判断前端是否仍按 total 理解 successRate。建议单独审查消费面。"},{"severity":"Warning","loc":"publish-history.js:45-122 (getStats)","symptom":"perPlatform 总和恒等于 overall.total（每条记录恰进一桶），但 daily 总和 ≤ overall.total（缺 timestamp 或窗口外的记录不进 daily）。三者相加不恒等于 total，且 daily 缺失部分在界面无提示。","fix":"此为 PRD §三 第 9、10 行明确设计（按原行为保留），非缺陷。但需注意：趋势柱用 daily.total 会比顶层 total 矮，用户无感知。"},{"severity":"Critical","loc":"publish-history.test.js:221-235 (结构锁)","symptom":"结构锁仅做字面量匹配 `codeOnly.includes('r.success !== false')`，变量名改为 `record`、写成 `!.success` 或用 `!=` 均能绕过，锁不变红。","fix":"改为 AST 级检查（如 eslint rule），或至少用正则 `/\\.success\\s*!==\\s*false/` 兼容变量名变化；并增补 `!.success`、`!= false` 等变体到否决清单。"},{"severity":"Warning","loc":"PRD §七 / Dashboard.vue:88-92 / Home.vue:340 (消费面，diff 不可见)","symptom":"unclassified 不在任何界面展示（PRD §九 第 4 条确认），但 total 仍包含它。用户会看到：共发布=100、成功=45、失败=10、成功率=82%（45/55），45 条 unclassified 完全不可见，易误读为 success+failed=total。","fix":"最小修法：在成功率旁加注「分母=成功+失败」或展示 unclassified 计数；完整修法需新文案+像素基线流程（§七 已说明）。"},{"severity":"Info","loc":"publish-history.js:38-43, 79-100","symptom":"读盘失败由 readRecords 逐行 try/catch 吸收（坏行跳过）；缺 status/record=null 进 classifyPublishStatus 走 record&&record.status 短路返回 undefined ⇒ unclassified。无处把「读盘失败/缺字段」折叠为 success 或 failed。","fix":"现状符合预期，无需修改。"}],"checked":[{"q":1,"verdict":"classifyPublishStatus 对所有边界输入（null/undefined/空串/数字/对象/大小写变体）均返回 unclassified，且仅返回三值之一，穷尽且互斥，符合 PRD §三 表 1-7 行。"},{"q":2,"verdict":"diff 内不可见 Dashboard.vue / Home.vue 相关行，无法判断消费者是否仍按 total 理解 successRate。"},{"q":3,"verdict":"perPlatform 总和恒等 overall.total；daily 总和 ≤ overall.total（缺 timestamp 或窗口外记录不进 daily）。三者相加不恒等 total，系 PRD 明确保留的原行为，非缺陷。"},{"q":4,"verdict":"结构锁仅字面量匹配 'r.success !== false'，改变量名为 record、写成 !.success 或 != false 均可绕过。锁不能抓住等价变体。"},{"q":5,"verdict":"存在用户可见误导：unclassified 不展示，但 total 包含它；成功率分母改为 success+failed，界面无任何说明。用户会把 success+failed 当成 total 的全集。"},{"q":6,"verdict":"无处把读盘失败/缺字段折叠为确定结论。readRecords 跳过坏行，classifyPublishStatus 对 null/缺字段一律返回 unclassified。"}]
```

### 前端/集成轴（opencode/longcat-2.5-preview-free）—— 原文逐字（`.qm6/findings-frontend.json`，4975 字节）

```json
{
  "axis": "frontend",
  "findings": [
    {
      "severity": "Warning",
      "loc": "publish-history.test.js L5 结构锁（code.diff 行 221-235）+ PRD §九 第 5 条",
      "symptom": "结构锁只读 apps/desktop/electron/services/publish-history.js 并断言 classifyPublishStatus 出现 2 次，但全仓存在第二份实现 packages/shared-utils/src/publish-history.js（含错误判据 r.success !== false，PRD §九 第 5 条已登记为零引用孤儿）。锁不覆盖它，「唯一实现」声明只在被改文件内成立，下一个消费者若拷走孤儿文件里的错判据，这条锁不会变红。",
      "fix": "把锁扩展为全仓扫描（git grep -l \"r.success !== false\" 应为空），或在锁注释里显式声明「本锁只覆盖 X 文件，Y 孤儿由 §九 第 5 条单独跟踪」，避免读者误以为全仓只有一份判据。"
    },
    {
      "severity": "Warning",
      "loc": "ipc-handlers/publish.js dashboard:stats 日志（code.diff 行 12）",
      "symptom": "日志打印了 owner/total/success/failed/unclassified/rate，但缺「读了哪个文件」与「readRecords 是否有条数上限」。排障「看板数字为什么和用户看到的不一致」时，无法判断 total 是否被 limit 截断、是否读对了 owner 的文件。",
      "fix": "日志补 file=<basename> 与 limit=<readRecords 上限或 none>；readRecords 是否有 limit 在 diff 内不可见，需人工核对后决定是否在日志里显式声明。"
    },
    {
      "severity": "Warning",
      "loc": "PRD §七 显示项表 + §九 第 4 条",
      "symptom": "新增第三类后，界面「成功 X / 失败 Y / 共发布 Z」会出现 X+Y≠Z（差值是 unclassified），用户会困惑。标签文字本身（「失败」「成功率」「共发布」）语义仍准确，不需要改，但缺 unclassified 展示导致用户可见不自洽。",
      "fix": "标签文字判定「不需要改」；但需在 PR 描述里显式告知用户「成功+失败可能不等于共发布，差值是无定论记录」，或确认 §九 第 4 条的残余登记足以覆盖此用户可见不自洽。"
    },
    {
      "severity": "Info",
      "loc": "publish-history.js classifyPublishStatus 返回 'unclassified'（code.diff 行 42）",
      "symptom": "与登录态三态的 unverified（未确认）近义，形成同义多词；concluded 是局部变量名未导出，风险低。",
      "fix": "统一不是本刀范围；若未来统一，建议保留 unclassified（终态分类语义更准），把登录态 unverified 视为不同语境，在词汇表登记二者差异即可。"
    },
    {
      "severity": "Info",
      "loc": "publish-history.test.js 「全无定论时成功率不得显示 100%」（code.diff 行 196-201）",
      "symptom": "该断言不能区分「分母用 concluded」与「分母用 total」（两者都得 0），PRD §三 第 12 条已明确承认并标注为已知弱锁，分母语义由 L2 锁（1/1=100 而非 1/4=25）兜底。",
      "fix": "无需改；弱锁被恰当标注且有 L2 兜底，符合「已知弱锁」处理规范。"
    }
  ],
  "checked": [
    {
      "q": 1,
      "verdict": "diff 内可见的 IPC handler 层原样透传（return { code: 0, data: stats }），不丢键。渲染层 store 与组件 props 的字段白名单在 diff 内不可见，需人工核对 IPC 与 store 的字段白名单。PRD §五称消费面用展开运算符（不丢键）、Home 只取子集（正常读取），但 diff 内无法证实。"
    },
    {
      "q": 2,
      "verdict": "存在第二份实现：packages/shared-utils/src/publish-history.js 含同一个 r.success !== false 判据（PRD §九 第 5 条已登记为零引用孤儿）。结构锁只覆盖被改文件，不覆盖孤儿，守的是「被改文件内不出现第二份判据」而非「全仓唯一」。"
    },
    {
      "q": 3,
      "verdict": "unclassified 与登录态 unverified 近义，形成同义多词；concluded 是局部变量名未导出，风险低。统一不是本刀范围。"
    },
    {
      "q": 4,
      "verdict": "未发现「只断言调用过某函数」或「把新语义钉成契约却没有负控」的测试。那条「全无定论时成功率为 0」的弱锁已被 PRD §三 第 12 条明确标注为已知弱锁，且有 L2 锁兜底分母语义，处理恰当。"
    },
    {
      "q": 5,
      "verdict": "日志覆盖了分类结果（total/success/failed/unclassified/rate）与 owner，但缺文件路径与记录条数上限信息；readRecords 是否有 limit 在 diff 内不可见，需人工核对。"
    },
    {
      "q": 6,
      "verdict": "标签文字（「失败」「成功率」「共发布」）语义仍准确，不需要改。但新增第三类后界面缺 unclassified 展示，用户会看到 X+Y≠Z 的不自洽；PRD §九 第 4 条已登记为残余限制（展示需新文案与新像素基线）。"
    }
  ]
}
```
