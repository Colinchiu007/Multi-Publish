# B 站审核回查「分桶查询」切片 PRD（2026-10-07）

- 关联实现：`apps/desktop/electron/services/bilibili-audit-check.js`、`apps/desktop/electron/services/publish-monitor.js`
- 上游取证唯一真源：`docs/audit-requery-evidence-bilibili-2026-10-05.md`（索引在 `01-docs/AUDIT-REQUERY-EVIDENCE-CHECKLIST-2026-10-09.md` §九）
- 本轮新增只读复测：本文 §二（2026-10-07，同机同账号，全程只读，未发布/未删除/未修改任何稿件）
- 变更类型：运行时代码（`apps/desktop/electron/`）⇒ 隔离 worktree `mp-bilibili-audit-buckets` + PR + QM-1

---

## 一、问题：只查一个桶，使「审核中」与「稿件不存在」在实现里不可区分

`BILIBILI_LIST_URL` 写死了 `status=pubed`（`bilibili-audit-check.js:24`），而 `checkBilibiliAuditStatus` 只有这一跳列表请求（`:79`）。于是：

- 一条**正在审核**的稿件根本不在 `pubed` 桶里 ⇒ 循环走完 ⇒ `return { status:'pending', reason:'not-in-list' }`（`:100`）。
- 一条**确实不存在**的稿件走的是**同一个出口、同一个 reason**。

后果分两层：

1. **排障层**：`publish-monitor.js:83` 的 `poll-progress` 日志只带 `reason`。运维读到 `not-in-list` 时，无法知道「稿件在审核中，等就行」还是「发布根本没成功，去查发布链」。这两者的处置方向相反。
2. **取证层（本切片的直接动机）**：上游取证 §四.1 记录「审核中/不通过的 `state` 取值本机无现场」，并判定需要一次真实投稿才能观测。但**即使投了稿，当前实现也观测不到** —— 投稿后稿件落在 `is_pubing` 桶，而实现永远只查 `pubed`，因此那条真机 `state` 值根本不会被读到，只会得到第 11 次 `not-in-list` 然后 `monitor-timeout`。

⇒ **不先补分桶查询，那一次投稿授权就是白花的。** 这是本切片排在投稿之前的全部理由（2026-10-07 经用户确认的顺序决定）。

---

## 二、实测证据（2026-10-07，只读复测）

方法与 10-05 一致且已验证有效：本机应用以共享 profile 启动，用 `pageManager.createNewTabPage({accountId:'ca681b37', platform:'bilibili', url:...})` 开一个走**账号原生分区**（`persist:account-ca681b37`）的标签，在该页面上下文里对平台自己的接口做同源 `fetch(url,{credentials:'include'})`，经 CDP 读回。全程 GET。

### 2.1 `status` 是**真过滤**，且桶名词表由端点自己回报

| 请求 `status=` | HTTP | `code` | `page.count` | 响应字节 | `arc_audits` |
| --- | --- | --- | --- | --- | --- |
| `pubed` | 200 | 0 | 7 | 30977 | 7 条 |
| `not_pubed` | 200 | 0 | **0** | **1076** | 字段缺席 |
| `is_pubing` | 200 | 0 | **0** | **1076** | 字段缺席 |
| `zzz_sentinel_no_such_bucket` | 200 | 0 | 7 | 30977 | 7 条（与 `pubed` 同形） |

同一响应里的 `data.class` = `{"pubed":7,"not_pubed":0,"is_pubing":0}` —— 即**桶名词表是端点自己回报的**，不是我们猜的。

三条由此确立的口径：

1. `status` **生效**（`not_pubed`/`is_pubing` 返回不同的、明显更小的空桶响应），与 10-05 §三 的实测一致。
2. 未知值**静默回落**到 `pubed` 列表（哨兵值与 `pubed` 逐字节同形）⇒ 再次证明「HTTP 200 + `code:0`」对判据**零信息量**，10-05 §三 那条硬约束继续成立。
3. 我们**不需要猜桶名**：`data.class` 的键集就是权威词表。这决定了 §三 的设计（扇出判据取自带响应，不取自常量表）。

### 2.2 「审核中/不通过」仍无本机现场

`class.not_pubed=0`、`class.is_pubing=0` ⇒ 本账号当前**没有**任何审核中或被拒稿件。7 篇已发布稿件的 `Archive` 全部是 `state=0 / primary_state=0 / state_desc="开放浏览"`：

```
BV187pF63EtD:0/0:开放浏览  BV1y1ht6PEfM:0/0:开放浏览  BV1YNh46kE8T:0/0:开放浏览
BV1DxhW6hEwZ:0/0:开放浏览  BV1MahW6tE36:0/0:开放浏览  BV1iLhW6uEkn:0/0:开放浏览
BV1itYH6uEHu:0/0:开放浏览
```

⇒ 上游取证 §四.1 的「非零取值本机无现场」**继续成立**，本切片**不**新增任何 state 取值映射。已发布数从 10-05 的 6 变为 7，说明期间有过一次发布，但那篇同样是 `state=0`（已过审），对 §四.1 无影响。

### 2.3 顺带实测到的两项（不驱动本切片，仅登记）

- `Archive` 字段集含 **`is_only_self`** ⇒ B 站在稿件层确实建模了「仅自己可见」。但本仓**没有**任何写入路径：`publish-capabilities.json` 的 bilibili 条目只有 `titleMode`/`limits`（无 `visibility` 字段），实测 `mapVisibilitySemantic('bilibili','private') === null`；`publisher-router.js` 的 bilibili 分支只解析 `category`/`copyright`；RPA 选择器表无隐私控件（`privacy` 在 `rpa*`/`publishers/`/`rpa-engine` 内 0 命中）。⇒ **经应用发布链投稿必然是公开的**，这是投稿方式的前置事实，不是本切片的改动范围。
- 10-05 那次「`code:-302` 风控」是**站外 node 客户端**的产物，不是端点行为：同账号在应用分区内同源 fetch 稳定 `code:0`。该归因纠正写入取证文档附录。

---

## 三、设计

### 3.1 扇出判据取自带响应，不取自常量表

一跳 `pubed` 列表请求的响应里**已经有** `data.class`。因此：

1. 先查调用方给定的列表 URL（默认 `status=pubed`），按 `bvid`/`aid` 命中 ⇒ 命中即停，**不多发一个请求**。
2. 未命中时，读**同一份响应**的 `data.class`，只对**计数 > 0 的其他桶**补查。
3. `data.class` 缺失/非对象 ⇒ 不扇出（保持既有行为），产出 `reason:'not-in-list'` 并如实带 `bucketsProbed`。

这样常见路径（本账号现状：只有 `pubed` 非零）**仍是 1 次列表请求**，最坏 3 次。轮询预算 `POLL_INTERVAL=10s × MAX_RETRIES=12` 下的最坏请求数从 12 → 36，且只在「账号确有审核中/被拒稿件」时发生 —— 那正是需要这个信息的时刻。

**为什么不用「无条件查三个桶」**：对创作中心接口做恒 3 倍请求是给风控送量，而收益在 `class` 全零时严格为 0。判据已经在同一份响应里免费给到，没有理由不用。

### 3.2 出口 reason 词表（新增 3 项，全部仍是无定论）

| 情形 | `status` | `reason` | 附带字段 |
| --- | --- | --- | --- |
| `pubed` 桶命中且 `state` 落在实测已上线集合 | `published` | — | `raw` |
| 任一桶命中但 `state` 未观测 | `pending` | `state-unobserved` | `bucket`、`state`、`primaryState`、`stateDesc` |
| 命中 `is_pubing` 桶（非 pubed 桶） | `pending` | `in-review-bucket` | 同上 + `classCounts` |
| 命中 `not_pubed` 桶 | `pending` | `in-not-pubed-bucket` | 同上 |
| 所有已探测桶都未命中 | `pending` | `not-in-list` | `bucketsProbed`、`classCounts` |
| 信封非 `code:0` / 缺 `arc_audits` / nav 未建立 / 无凭证 / 无 postId | `pending` | 既有四项不变 | — |
| 抛错 | `error` | — | `message` |

`in-review-bucket` 是**「稿件存在且不在已发布桶」的正向证据**，不是「审核中」的状态结论 —— 桶名的中文语义（`not_pubed` 到底是「审核未通过」还是「未发布」）**未实测**，因此：

- ⛔ **禁止**把 `not_pubed` 命中映射成 `rejected`/`deny`/`transferFail`。这是本切片唯一的红线，由测试正向锁住。
- 落桶信息只进 `reason` 与日志，**不改写**任何真源状态（AGENTS.md「登录态/审核态只被正负证据改写」同族纪律）。

### 3.3 让「那一次投稿」真的能取到 ②

`publish-monitor.js` 的 `poll-progress` 与 `monitor-timeout` 日志现在只带 `reason`。本切片把结果对象上已有的 `bucket`/`state`/`primaryState`/`stateDesc` 一并带入这两条日志。

这是「投稿前先改代码」的实质理由：投稿后那条稿件会落进 `is_pubing`，届时日志里出现的就是**平台真实回报的 `state` 数值**，而不是第 12 次 `not-in-list`。取证文档 §四.1 由此才有可能被真实观测填掉。

### 3.4 端点 URL 的桶替换

新增单一实现 `withStatusParam(url, status)`：替换既有 `status` 查询参数，无该参数则追加；其余 query 与参数顺序原样保留。⛔ 不得新增第二份 URL 拼接。

两条由评审补上的边界（都属于「函数自己的合同」，不是调用方的自律）：

- **形态校验落在函数自身**：`status` 不过 `BUCKET_KEY_SHAPE` 即抛 `BILIBILI_BUCKET_KEY_INVALID`。本函数是 `module.exports` 导出的公开原语，若校验只在调用点执行，下一个调用方就能整条绕过白名单把任意串拼进 URL。
- **重复 `status` 必须收敂到恰好一个**：`replace` 不带 `/g` 时，对 `?status=a&status=b` 只改首个 ⇒ 产出两个同名键，而「服务端取哪个」未定义，正是本模块反复教育过的「请求发出去了但条件没生效」。口径：首个改写为目标值，其余整段删除。

### 3.5 扇出有硬上限，且截断必须出声

`MAX_BUCKET_PROBES = 2`，与实测词表（端点只回报 `not_pubed` / `is_pubing` 两个非主桶）以及 §3.1 的「最坏 3 次」逐字对齐。

为什么要有这个常量：桶表由**端点回报**，没有上限就等于把放大面交给对方决定，而本仓对「给创作中心接口送量」高度敏感。
为什么不能静默截断：截断一旦发生，`not-in-list` 的含义就从「都不在」悄悄变成「前 N 个不在」——那是不可归因的。
因此 `bucketsTruncated` 随结果返回并进日志，且**判据先算完再探测**（边探边判会把上限退化成软提示）。

### 3.6 被形态白名单拒掉的桶键也要出声

计数为正但键名不合形态 ⇒ 跳过该桶，但键名记进 `bucketsSkipped` 并进日志。否则「端点哪天回报一个新形态的桶名」会表现为**该扇出而没扇出**，症状与「稿件不存在」逐字同形，排障时无法区分。

### 3.7 `published` 的判据是语义常量，不是「调用方指定的那个桶」

`primaryBucket` 由 URL 解析而来，它可以是任意值；而「已发布」这件事只可能由 `pubed` 桶证明。
两者必须分开：`published` 的产出条件是 `primaryBucket === BILIBILI_PRIMARY_BUCKET && isObservedOnline(archive)`。
写成「主桶命中即 published」在现有调用图里等价（`CHECK_URLS.bilibili` 恒为 `pubed`），但那是**靠调用方不出错来维持的不变量** —— 一旦有人把 `listUrl` 指到 `not_pubed`，未发布桶里的 `state=0` 就会被判成上线。

---

## 四、验收标准

> 编号与 `apps/desktop/electron/services/bilibili-audit-check.test.js` 的用例名**逐一对应**（本仓吃过「spec 与测试各写一套编号，于是『A12 已实现』在两份文档里指两件不同的事」的亏，故此处按测试实际 ID 落）。

| ID | 判据 |
| --- | --- |
| A1 | `pubed` 命中且 `state=0/primary_state=0` ⇒ `published`，且列表请求**恰好 1 次**（不多扇出） |
| A2 | `class.is_pubing>0` 且稿件在该桶 ⇒ `pending` + `reason:'in-review-bucket'`，并把该桶回报的 `state`/`primary_state`/`state_desc` **原样带出** |
| A3 | `class.not_pubed>0` 且稿件在该桶 ⇒ `pending` + `reason:'in-not-pubed-bucket'`；**断言既不是 `rejected` 也不是 `published`、且不带 `raw`**（红线） |
| A3b | `published` 只能由主桶命中产出；非主桶里 `state=0/primary_state=0` 也不算上线（矛盾形态不得下正向结论） |
| A4 | 其他桶计数为 0 且未命中 ⇒ **不扇出**（列表请求恰好 1 次），`reason:'not-in-list'` |
| A5 | 未命中但 `class` 回报某桶非零、补查后该桶内没有目标 ⇒ `not-in-list`，`bucketsProbed` 如实含实际探过的桶，`classCounts` 带出 |
| A6 | `data.class` 缺失 ⇒ 不扇出，行为与改动前一致（向后兼容既有夹具） |
| A7 | 信封非 `code:0` / `arc_audits` 缺席 / nav 未建立 / 无 cookies / 无 postId ⇒ 五个既有 `pending` 出口逐条不变（回归，不得被扇出逻辑改写） |
| A8 | 传输层抛错 ⇒ `error`，扇出中途抛错也不得产出任何正向结论 |
| A9 | `withStatusParam`：替换既有 `status`、追加缺失的 `status`、保留其余参数与顺序、不产生重复 `status` 键 |
| A11 | `poll-progress` 日志携带 `bucket`/`state`/`primaryState`/`stateDesc`/`bucketsProbed`/`classCounts`/`bucketsTruncated`，且 `monitor-timeout` 携带 `lastReason` |
| A17 | `monitor-timeout` 一行定场：携带 `lastBucket`/`lastState`/`lastStateDesc`/`lastBucketsProbed`（超时正是最需要现场的时刻，只带 reason 就要回头翻 poll 历史行） |
| A12 | 桶键来自第三方响应且要进 URL ⇒ 含 `#`/`&`/空格/超长的键一律不得成为请求目标（只发主桶那一跳，URL 内 `status=` 只出现一次） |
| A13 | 跨模块**真实现**契约锁：四种无定论出口经真 `buildAuditPatch` 一律产出 `null`；并先锁 `mapMonitorStatusToAuditStatus('pending') === null` 本身，对方改口径时该条先红 |
| A14 | `withStatusParam` **自身**拒绝非法 status（`''`/`null`/`#`/`&`/空格/超长）⇒ 抛 `BILIBILI_BUCKET_KEY_INVALID`；形态校验落在导出的函数边界上，不得只落在调用点 |
| A15 | 补查桶数封顶 `MAX_BUCKET_PROBES`，超限时 `bucketsTruncated === true` 且该事实进日志；A15b 未超限时**不得谎报**截断；A15c 未知桶键命中 ⇒ reason 为 `in-<key>-bucket`（与模块其余 reason 同一 kebab 形态） |
| A16 | 扇出中途抛错 ⇒ `error` 出口仍带 `bucketsProbed`，可归因到「第几跳挂的」 |

**编号说明**：无 A10 —— 「命中即停」由 A1 的请求计数断言（`seen` 恰为 `['pubed']`）承担，未另立一条，避免同一判据两处编号。装配锁（`CHECK_URLS.bilibili` 与 `BILIBILI_LIST_URL` 同一引用、`pollUrl` 透传确实改变请求目标）由既有 **T12 / T13 / T15** 承担，本切片不重复登记。

## 五、逃逸分析（QM-5 第 2–3 步）

- **为什么现有测试没拦住**：`bilibili-audit-check.test.js`（211 行）对「未命中」只断言 `not-in-list` 一个出口，夹具里没有 `class` 非零的形态 ⇒ 「按桶区分」这一整类行为在测试里**根本不可表示**。这是「mock 对所有输入返回同一份数据 ⇒ 对按输入区分类缺陷结构性免疫」的同族（AGENTS.md「兜底/回退类选址」条已记过一次）。
- **为什么单测全绿仍可坏**：本切片必须同时补 `publish-monitor` 侧的日志出口锁（A11），否则服务层分桶了、日志层仍只打 `reason`，取证现场照样拿不到 `state` —— 那正是本切片的唯一目的。
- **系统性漏洞分类**：测试场景缺失（无 `class` 非零夹具）+ 审查盲区（写实现时把「查不到」当单一事实，未追问「查的是哪个桶」）。

## 六、范围外（不许顺手做）

1. 投稿本身（另一次授权，且 §2.3 已证「经应用发布必然公开」，需单独决定）。
2. `not_pubed` 的中文语义取证 ⇒ 只能由真机现场填，不得由命名推断。
3. bilibili 可见性/`is_only_self` 写入面（属发布能力面，需注册表 + 三处同步，另案）。
4. `AUDIT_REQUERY_VERIFIED_PLATFORMS` 是否加入 bilibili —— 仍**不加**，验收要求（published/inAudit/deny/无定论四类）本切片只推进到「inAudit/deny 有机会被观测」，没有观测到。
5. 其他平台的分桶（微博/抖音/知乎各自的列表协议形状未取证，不得类比推广）。
