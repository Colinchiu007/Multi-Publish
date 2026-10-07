# B 站审核回查取证（2026-10-05，真实已登录账号，**全程只读**）

> 落位说明：本文放 `docs/`（doc-gate 的代码 PR 白名单只认 `docs/**`、`openspec/**`、`.ccg/**`、根 `*.md`，`01-docs/*.md` 不算），`01-docs/AUDIT-REQUERY-EVIDENCE-CHECKLIST-2026-10-09.md` §九 保留指针。

- 关联：`01-docs/AUDIT-REQUERY-EVIDENCE-CHECKLIST-2026-10-09.md` §二 #3、§三 模板、§四 改动清单、§七/§八（前两轮只读取证）
- 取证方式：本机应用（分支 `xhs-audit-evidence`，worktree `mp-xhs-audit-evidence`）以真实 profile 启动，用账号标签的原生分区（`persist:account-ca681b37`）打开 B 站创作中心，**在该页面上下文里对平台自己的接口做只读 `GET`（`credentials: include`）**；经 CDP（`--remote-debugging-port`，端口由 worktree 路径派生）驱动与读回。
- **没有发布、没有删除、没有修改任何一条稿件**；没有解密 `credential-store`，凭证只由应用自己的分区会话携带。
- 取证时刻：2026-10-05T08:46:15Z ～ 08:50:34Z；账号类型：个人 UP 主（`mid=3747542357510297`，`isLogin=true`），本机 `accounts.json` 侧 `status=active`。

---

## 一、三项证据（§一 的判据）逐条现场

### ① 端点 URL（方法 + 路径 + 必要 query）

```
GET https://member.bilibili.com/x/web/archives?status=pubed&pn=1&ps=20&platform=web
```

实测 HTTP 200 / `code:0`。**注意 host 是 `member.bilibili.com`（创作中心），不是 `api.bilibili.com`**：本仓现写的 `publish-monitor.js:19` 是 `https://api.bilibili.com/x/web-interface/archive/space`，实测该形状未被任何已发布稿件命中 ⇒ 通用层对它做的 `axios.get(url,{params:{id:postId}})` 不可能拿到结论（这正是 §一② 预言的「监控只能一路 pending 到 timeout」）。

必要 query（实测语义）：

| 参数 | 取值 | 证据 |
| --- | --- | --- |
| `status` | `pubed`（已发布）；`not_pubed` / `is_pubing` 为真过滤 | `status=not_pubed` → `page.count=0` 且**无** `arc_audits`；`status=is_pubing` 同上 |
| `pn` / `ps` | 分页；页码越界时 `count` 仍为总数、但**不返回** `arc_audits` | `pn=9999` → `code:0, count:6, arc_audits: 缺失` |
| `platform` | `web` | 去掉后仍 `code:0`（见反例） |

### ② 参数名与取值来源（用什么字段匹配目标作品）

- **`mid` 的来源**：`GET https://api.bilibili.com/x/web-interface/nav` → `data.mid = 3747542357510297`、`data.isLogin = true`。这是创作中心列表类接口对「谁的稿件」的隐式主体（本接口不显式收 `mid`，由 cookie 会话决定；但同一族的 `/x/web/data/article`、`/x/web/data/fan` 显式带 `mid=<上面的值>`，实测由页面自己发出）。
- **作品匹配字段**：`Archive.bvid`（形如 `BV1y1ht6PEfM`）与 `Archive.aid`（形如 `117319246288101`，注意是 **15 位整数**，JS 里按数字返回，比较必须 `String()` 归一）。
- **我们这一侧的 id 从哪来**：`rpa-publish-id-extract.js:44` 的 `extractPublishIdFromUrl` 只认 query 里的 `PUBLISH_ID_KEYS` 与路径段 `(post|article|media|content|clue|work)`，**不认 B 站的 `/video/BV…` 形状** ⇒ 单靠 URL 抽取拿不到 `bvid`。这是「字段恒空」的同族断链，必须在发布回传侧显式落 `bvid`（本取证不覆盖该项，属后续改动）。

### ③ 鉴权方式

Cookie 会话（账号分区内的 B 站登录态）即可，**无需签名、无需 wbi/w-token、无需 OAuth**：在同源页面上下文里 `fetch(url, {credentials:'include'})` 直接 200/`code:0`。跨站调用需带 `Referer: https://member.bilibili.com/`（本次探针带上了；未做「去掉 Referer」的对照组，因此**不能断言** Referer 是必需的——这一格留给后续实测）。

---

## 二、响应容器形状（决定解析器写在哪）

```
{ code: 0, message: "OK", ttl: 1, data: {
    class:        { pubed: 6, not_pubed: 0, is_pubing: 0 },
    apply_count:  { neglected: 0, pending: 0, processed: 0, expired: 0 },
    type:         [ { tid, name, count }, ... ]        // 分区计数
    archives:     {}                                   // ⚠ 实测为**空对象**
    arc_audits:   [ { Archive: {...}, Videos, stat, state_panel, problem_detail, cid_list, open_appeal, appeal, ... }, ... ]
    page:         { pn, ps, count }
    tip / rich_tip / play_type / show_process_detail / have_cross_arc
} }
```

**列表条目在 `data.arc_audits[]`，每项是 `{Archive: …, Videos: …, stat: …, …}`**；`data.archives` 只是空对象。任何按「`data.archives` 数组」写的解析器都会恒得 0 条——这条是本次取证最容易踩空的地方，必须写进实现注释。

`Archive` 上与本判据有关的字段（实测现场，节选）：

| 字段 | 实测值 | 用途 |
| --- | --- | --- |
| `state` | `0` | 状态码（本账号 6 篇全为 0） |
| `state_desc` | `"开放浏览"` | 人读状态 |
| `primary_state` | `0` | 主分区状态 |
| `reject_reason` / `reject_reason_id` | `""` / `0` | 拒绝原因（本账号全为空） |
| `online_time` | `0` | ⚠ **已上线的稿件这里也是 0** ⇒ 不得用 `online_time` 判「是否上线」 |
| `duration` / `tid` / `tag` / `title` / `cover` | 有值 | 展示用 |

---

## 三、反例实测（§7.2 第 4 项：证明「查不到」不会被误判成「已上线」）

| 场景 | 请求 | 实测结果 | 对实现的硬约束 |
| --- | --- | --- | --- |
| **传错 `status`** | `status=zzz_not_a_status` | HTTP 200、`code:0`、`count:6`、`arc_audits` 5 条 | ⛔ 「HTTP 200 + code 0」**不是**「查询条件生效」的证据；未知 status 被静默忽略并返回默认列表。判据只能落在**能否按 bvid/aid 命中目标条目**上 |
| 分页越界 | `pn=9999` | `code:0`、`count:6`、**无** `arc_audits` | 空结果与「稿件不存在」同形 ⇒ 命中失败必须产出**无定论**，不得产出 `published`，也不得产出 `withdrawn` |
| 空桶 | `status=not_pubed` / `is_pubing` | `code:0`、`count:0`、无 `arc_audits` | 同上 |
| 少参数 | 去掉 `platform=web` | `code:0`、`count:6` | 端点不会因少参数报错 ⇒ 「请求成功」对判据无信息量 |

---

## 四、仍未观测（不许外推，保持「无定论」）

1. **`state` 的「审核中」与「审核不通过」取值**：本账号 6 篇稿件全部 `state=0 / state_desc="开放浏览"`，非零取值**本机无现场**（既没有审核中的稿件，也没有被拒稿件）。因此 `AUDIT_STATUSES` 的 `inAudit` / `deny` / `transferFail` 三态在 B 站上**没有实测映射依据**，实现里凡遇到未观测的 `state` 一律产出**无定论**（不改写真源，符合 AGENTS.md「登录态/审核态只被正负证据改写」同族纪律）。
2. **非零 `state` 下 `reject_reason` / `problem_detail` 的填充形态**：未观测。
3. **Referer 是否为必需**：未做对照组。
4. **我们发布回传里能否拿到 `bvid`**：见 §一②，当前 URL 抽取器覆盖不到 `/video/BV…` 形状，属发布侧待办，不是本取证的结论。
5. **`AUDIT_REQUERY_VERIFIED_PLATFORMS` 是否可加入 bilibili**：**本次仍不加**。§四 验收要求「录制的真实响应片段覆盖 published / inAudit / deny / 无定论四类」与「真机发布 → 历史列表审核徽标变化」，本次只拿到 published 一类与「无定论」的反例形态；把平台提前写进 verified 就是拿「已上线能判对」冒充「四类状态都已知」，正是本清单立项要防的那类假声明。
6. **实现期实测补一条硬约束**：状态判据禁止隐式转换——`Number(null)===0`、`Number("")===0` 会把「字段缺失」判成「已上线」。回归 T5 当场抓到（夹具喂 `state=null` 时旧写法判成 `published`）。现口径：`typeof state === "number"` 且落在实测观测集合内，且 `primary_state === 0`。

---

## 五、本轮据取证落地的改动（只改证据支持的部分）

1. `publish-monitor.js`：`CHECK_URLS.bilibili` 由**虚构端点**改为取证到的真实端点，并新增 B 站专用分支（先 `nav` **验证会话有效**——实现只校验 `mid` 存在、不使用其值，主体由 Cookie 会话决定；再取列表，按 `bvid`/`aid` 命中，`state=0 且 primary_state=0` → `published`；命中不到 / 未知 state / 缺 `arc_audits` → `pending`＝无定论，不改写真源）。
2. 解析器**必须读 `data.arc_audits[]`**，`data.archives` 为空对象已实测。
3. 单测夹具用本文件第二节的**真实响应片段**（已脱敏：只保留字段名与本机账号自有值）；另配「未观测 state 不得产出结论」「传错 status 不得被当成生效」两条反例。
4. 候选表 ↔ `CHECK_URLS` 键集的 parity 锁不受影响（bilibili 本来就在候选表里）。
5. `AUDIT_REQUERY_VERIFIED_PLATFORMS` **保持不含 bilibili**，待补齐 §四 的 1、2 两项（需要一次真实投稿才能观测审核中/被拒态）——这是「需用户授权的外部写操作」，与本轮只读取证分属两个决定。

---

## 六、2026-10-07 只读复测附录（同机同账号，仍全程只读）

复测动机不是怀疑本文结论，而是**投稿前必须先确认「投了稿能不能被现在的实现观测到」**。结论：观测不到，原因在 §一① 那条 URL 里。

### 6.1 本文的三条核心结论全部复现

| 项 | 10-05 | 10-07 复测 |
| --- | --- | --- |
| 端点与容器 | `member.bilibili.com/x/web/archives` → `data.arc_audits[]` | 同 |
| `data.archives` | 空对象 | 空对象（`typeof` 非 array） |
| `status` 是真过滤 | `not_pubed`/`is_pubing` → `count:0` 且无 `arc_audits` | **复现**：两者各 1076 字节 / `count:0` / 字段缺席 |
| 未知 `status` 静默回落 | `status=zzz_not_a_status` → 返回默认列表 | **复现并加强**：哨兵值与 `status=pubed` **逐字节同形**（30977 字节、同 7 条） |
| 已上线取值 | `state=0 / primary_state=0 / "开放浏览"` | **复现**：7 篇全部同值 |

⇒ 桶名词表不必猜：它就是响应自己回报的 `data.class` 的三个键 `pubed` / `not_pubed` / `is_pubing`。这条直接催生了 `docs/PRD-BILIBILI-AUDIT-BUCKET-QUERY-2026-10-07.md`。

### 6.2 纠正本文一处归因（不是结论错，是原因写错了）

本文 §取证方式 一节记录的 `code:-302 风控拦截` 曾被我自己在别处转述成「该端点会风控」。10-07 用**同账号、同端点**在应用自己的分区内同源 `fetch` 稳定拿到 `code:0` ⇒ **`-302` 是站外 node/axios 客户端的产物，不是端点行为**。

口径改为：判 B 站创作中心接口能不能读，必须先说明「从哪个运行时读」。站外裸 HTTP 的失败**不构成**「该端点不可用」的证据，反之应用内成功也不构成「站外可用」的证据 —— 两者是两个被测对象。

### 6.3 §四.1 仍未闭合，且原因变了

`class={"pubed":7,"not_pubed":0,"is_pubing":0}` ⇒ 本账号当前没有任何审核中/被拒稿件，非零 `state` 取值**依旧本机无现场**。已发布数 6→7（期间有过一次发布，那篇同样 `state=0`，对本项无影响）。

但 10-07 新增一条更硬的判定：**即使投稿，现实现也观测不到** —— 轮询 URL 写死 `status=pubed`，审核中的稿件不在该桶，只会得到与「稿件不存在」同形的 `not-in-list`。所以「先补分桶查询、再花投稿授权」是顺序依赖，不是两件事。

### 6.4 顺带实测到、但不属本文范围的两项

- `Archive` 字段集含 **`is_only_self`** ⇒ B 站在稿件层建模了「仅自己可见」。但本仓对 bilibili **没有任何可见性写入路径**：`publish-capabilities.json` 的 bilibili 条目只有 `titleMode`/`limits`，实测 `mapVisibilitySemantic('bilibili','private') === null`；`publisher-router.js` 的 bilibili 分支只解析 `category`/`copyright`；RPA 选择器表内 `privacy` 0 命中。⇒ **经应用发布链投稿必然是公开的**，这条是投稿方式的前置事实。
- `config/platforms.yaml` 里 bilibili 是 `publishMode: api-then-dom` ⇒ 走 API 轨时可能根本不产生「浏览器落点 URL」。

### 6.5 后续（同日稍晚，2026-10-07）：投稿已发生，§四.1 的「审核中」那一格已填

本文 §四.1 与 §五.5 都写着「需要一次真实投稿才能观测审核中/被拒态」。**该投稿已于 2026-10-07 执行**（用户授权「要发，接受公开」），结果落在
`docs/audit-requery-evidence-bilibili-2026-10-07.md`，要点：

- **「审核中」的 `state` 不是单一值**：同一次投稿的 20 秒窗口内先后实测到 `-30` 与 `-1`，两者 `state_desc` 均为 `"审核中"`，且 `primary_state` 与 `state` 同值 ⇒ 任何 `state === 固定值` 的写法都会漏。本文 §四.1 那句「非零取值本机无现场」**自该文档起失效**，但作为当时的历史事实保留、不改写。
- **「审核不通过」仍无现场**（该账号 20 秒内过审，`not_pubed` 始终为 0）⇒ §四.1 的这一半**继续成立**，`AUDIT_REQUERY_VERIFIED_PLATFORMS` 仍不含 bilibili。
- 投稿落点 URL 实测为 `https://www.bilibili.com/video/BV<id>`（路径段承载），且 `mode:"api"` ⇒ §2.3 关于「API 轨可能不产生浏览器落点」的担忧部分兑现：本次确实没走浏览器导航，DOM/RPA 轨的落点**仍未观测**。
- 第 3 轮轮询实测到 `class.pubed` 已变 8 而 `pubed` 列表仍查不到该稿件（约 10 秒窗口）⇒ 本文 §三 那条「不得拿 `page.count`/`class` 计数当命中证据」的硬约束**由推测升级为有现场支撑**。
- 另跑出一条与本清单同族的 P0 断链（回查结论写不回发布历史，键错配），详见该文档 §四。

