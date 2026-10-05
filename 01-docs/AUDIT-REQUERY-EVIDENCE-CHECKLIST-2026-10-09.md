# 平台端点取证清单 — 审核回查与平台草稿列表

> **用途**：把「候选」平台提升为**已验证**（`verified`）所需的证据清单与验收步骤。本清单同时服务两项待办：
> ① **P0-1 审核回查**（`apps/desktop/electron/services/publish-audit-requery.js` 的 `AUDIT_REQUERY_VERIFIED_PLATFORMS`）；
> ② **P1-3 平台草稿列表**（平台草稿箱回取编辑）。
>
> **为什么需要本清单**：当前所有平台的回查端点都是**形状未验证**的候选（`publish-monitor.CHECK_URLS` 里是通用 `GET ?id=<postId>` 形态），与各平台真实接口并不一致。代码已按诚实分级标注（`verified` 显式为空的理由见 PRD-PUBLISH-PAGE-OPTIMIZATION §四 P0-1 第二切片），但**「为什么不能用」与「怎样才算能用」必须写在纸面上**，否则下一个会话只会重复发现「端点不对」。
>
> **一句话判据**：平台进入 `verified` 名单，必须同时具备**三项证据**——① 端点 URL；② 该端点匹配作品所需的**参数名与取值来源**；③ 鉴权方式（cookie 名 / 签名 / OAuth）。

---

## 一、提升为 verified 的三项证据（缺一不可）

| # | 证据 | 反例（当前候选表的实际缺口） |
| --- | --- | --- |
| 1 | **端点 URL**（方法 + 路径，含必要的 query 结构） | 头条 `mp.toutiao.com/profile_v4/graphic/publishing` 其实是一个**HTML 页面**，不是 JSON 接口——对它做 `axios.get` 再解析 `data.data.list` 永远拿不到列表 |
| 2 | **参数名与取值来源**（用什么字段匹配目标作品） | 通用候选表传 `params: { id: postId }`，但 B站 `archive/space` 要 **`mid`（用户 ID）**、微博 `ajax/statuses/mymblog` 要 **`uid`**——传 `id` 等于查不到（返回整表或空表），监控只能一路 `pending` 到 timeout |
| 3 | **鉴权方式** | 抖音 `aweme/v1/list/` 是**需签名的 POST**（参数在 body）；YouTube Data API 要 **OAuth access token**，不是 cookie；快手状态查询是 `cp.kuaishou.com/graphql` 的 **POST**（已按诚实跳过处理） |

**未同时具备三项时，该平台必须留在 `candidate`（或 `unsupported`），不得写入 `verified`。**

---

## 二、逐平台取证清单

> 「当前候选」一列是仓库现存的**未验证猜测**（供排障定位，不代表可用）；「需要的证据」是提升为 verified 的验收项。

### 1. 抖音（douyin）— 优先级最高

| 项 | 内容 |
| --- | --- |
| 当前候选（未验证） | `GET https://creator.douyin.com/aweme/v1/list/` + `params: { id: postId }` |
| 已知问题 | 真实接口是**需签名的 POST**（与发布链同一套 `clientSign`）；且列表按 `aweme_id` 匹配而非 `id` |
| 需要的证据 | ① 端点与请求体结构；② 匹配字段 `aweme_id` 的取值来源（发布链回传的 `postId` 是否即 `aweme_id`）；③ 签名材料（复用引擎既有 `clientSign`） |
| 参考产品已取证的口径（**待本仓真机复核**） | 列表回查以 `aweme_id` 匹配；`status_value == 144` → 审核拒绝；存在 `timer` 字段 → 待发布（定时未到） |
| 通过判据 | 用真实账号发布一条 → 立即回查应得到 `inAudit`（或 `published`）；发布一条会被拒的内容 → 回查得到 `deny` |

### 2. 快手（kuaishou）— 现已 `unsupported`（诚实跳过）

| 项 | 内容 |
| --- | --- |
| 状态 | `publish-monitor` 已显式移除其通用 GET 轮询（协议形状错误必然报错），待专用 POST 查询实现补回 |
| 已知问题 | 状态查询是 `cp.kuaishou.com/graphql` 的 **POST**；且监控 cookies 曾取自任务（恒空，第二切片已修凭证来源） |
| 需要的证据 | ① graphql 端点 + query 文本；② 作品匹配字段；③ 鉴权（cookie `kuaishou.web.cp.api_ph` 已在发布链使用，可作为起点） |
| 参考产品已取证的口径（**待复核**） | 列表反查以 `photoStatus` 判定：`photoStatus == 1` 属「未公开（notPublic）」口径（发布默认 1） |
| 通过判据 | 发布一条 → 回查能区分 `published` / `inAudit` / `notPublic` |

### 3. B 站（bilibili）

| 项 | 内容 |
| --- | --- |
| 当前候选（未验证） | `GET https://api.bilibili.com/x/web-interface/archive/space` + `params: { id: postId }` |
| 已知问题 | 该端点按 **`mid`（用户 ID）** 拉某用户的投稿列表，不按作品 ID 查；正确做法是取 `mid` 后拉列表再按 `bvid`/`aid` 匹配 |
| 需要的证据 | ① `mid` 的来源（账号信息或 `/x/web-interface/nav`）；② 列表项里标识作品的字段名；③ 鉴权（cookie `SESSDATA`，通常已具备） |
| 通过判据 | 回查能区分 `published` / `inAudit` / `deny`（驳回） |

### 4. 知乎（zhihu）

| 项 | 内容 |
| --- | --- |
| 当前候选（未验证） | `GET https://www.zhihu.com/api/v4/articles` + `params: { id: postId }` |
| 已知问题 | 该端点返回**当前登录用户自己的文章列表**（无 `id` 过滤参数）；需拉列表后按文章 id 匹配 |
| 需要的证据 | ① 分页参数与列表项 id 字段；② 状态字段名（审核中/已发布）；③ 鉴权（cookie `z_c0`） |
| 通过判据 | 发布一篇 → 回查得到 `inAudit`/`published`；被拒内容得到 `deny` |

### 5. 微博（weibo）

| 项 | 内容 |
| --- | --- |
| 当前候选（未验证） | `GET https://weibo.com/ajax/statuses/mymblog` + `params: { id: postId }` |
| 已知问题 | 该端点按 **`uid`** 拉某用户的微博列表；需拉列表后按 `mid`/`id` 匹配 |
| 需要的证据 | ① `uid` 来源（账号信息或 `config` 接口）；② 列表项标识字段；③ 鉴权（cookie `SUB`） |
| 通过判据 | 回查能区分 `published` / `inAudit` / `deny`（含「仅自己可见」不被误判为已公开） |

### 6. 小红书（xiaohongshu）

| 项 | 内容 |
| --- | --- |
| 当前候选（未验证） | `GET https://creator.xiaohongshu.com/api/content/list` + `params: { id: postId }` |
| 已知问题 | 创作者中心接口通常需要额外的签名头与 `x-s` 类参数；`id` 过滤未必成立 |
| 需要的证据 | ① 端点 + 请求头（签名）；② 列表项标识字段；③ 鉴权方式 |
| 通过判据 | 回查能区分 `published` / `inAudit` / `deny` |

### 7. 今日头条（toutiao）

| 项 | 内容 |
| --- | --- |
| 当前候选（未验证） | `GET https://mp.toutiao.com/profile_v4/graphic/publishing` |
| 已知问题 | **这不是 JSON 接口而是 HTML 页面**（见上表反例 1） |
| 需要的证据 | ① 真正的作品列表 JSON 端点；② 列表项标识字段；③ 鉴权（cookie） |
| 通过判据 | 回查能区分 `published` / `inAudit` / `deny` |

### 8. YouTube

| 项 | 内容 |
| --- | --- |
| 当前候选（未验证） | `GET https://www.googleapis.com/youtube/v3/videos` + `params: { id: postId }` |
| 已知问题 | 需 **OAuth access token**（不是 cookie）；且 `videos.list` 的 `part=status` 才含 `uploadStatus`/`privacyStatus`/`rejectionReason` |
| 需要的证据 | ① OAuth token 来源（现有账号体系是否持有 refresh token）；② `part` 参数与响应字段映射；③ `rejectionReason` → `deny` 的映射表 |
| 通过判据 | 回查能区分 `published` / `inAudit` / `deny`（含 `rejectionReason`） |

---

## 三、取证记录模板（每个平台一份，随 PR 提交）

```
### <平台> 审核回查取证（<日期>，<取证账号类型>）

- 端点：<METHOD> <URL>（参数：<name>=<来源>）
- 鉴权：<cookie 名 / 签名方案 / OAuth scope>
- 响应片段：<脱敏后的关键字段 JSON，必须含状态字段与作品标识字段>
- 状态映射：<平台状态值> → <本仓 auditStatus>
  - published ← <平台值>
  - inAudit   ← <平台值>
  - deny      ← <平台值>
  - 无定论（不得映射）：<列出平台可能返回但语义不明的值>
- 通过判据实测：<发布 → 回查得到 X；被拒内容 → 回查得到 Y>
- 反例实测：<刻意传错参数/无凭证时的表现，证明不会误判为 published>
```

**纪律**：
- 响应片段必须**脱敏**（不得出现 cookie/token/手机号/真实昵称）。
- 映射表必须包含「**无定论**」一栏——平台可能返回语义不明的中间值，它们**不得**映射为任何审核状态（第一切片的单向证据规则要求：无定论不写库）。
- 必须做一次**反例**（传错参数或无凭证）并记录表现，证明该端点不会把「查不到」误判成「已上线」。

---

## 四、证据齐备后的代码改动（三处，缺一不可）

1. `apps/desktop/electron/services/publish-audit-requery.js`
   - 把平台加入 `AUDIT_REQUERY_VERIFIED_PLATFORMS`（`candidate` 表**不要**同时保留——parity 测试会红，这是刻意的：一个平台只应属于一档）。
2. `apps/desktop/electron/services/publish-monitor.js`
   - 用取证到的**真实请求形状**替换该平台的 `CHECK_URLS` 条目与轮询实现（POST/签名/OAuth 需在 `checkPublishStatus` 里分支处理，不能再套通用 GET）。
   - 候选表与 `CHECK_URLS` 的键集由 `publish-audit-requery.test.js` 的 parity 锁约束：**新增端点必须同步登记候选**，从端点表删除则必须从候选表删除。
3. `packages/shared-utils/src/publish-audit-status.js`（仅在需要新状态时）
   - 若平台返回的结论超出既有 7 态（如参考产品的 `notSuitableForPublicity` / `customWithdrawn`），按「枚举裁剪」纪律增补，并同步 `publish-audit-status.browser.js` 孪生 + parity 测试。

### 验收（每平台）

- [ ] 单测：`checkPublishStatus` 用**录制的真实响应片段**（脱敏 fixture）覆盖 published / inAudit / deny / 无定论四类
- [ ] 单测：凭证缺失时该平台仍走 `no-cookies` 分支（不发起请求）
- [ ] 反例：传错参数/无凭证，断言不产生任何 `auditStatus` 写入（保持原记录不变）
- [ ] 真机：真实账号发布 → 观察历史列表审核徽标由「无徽标」变为对应状态
- [ ] PRD：把该平台从「候选」移入「已验证」，并写明取证日期与账号类型

---

## 五、与 P1-3（平台草稿列表）的关系

平台草稿列表需要**同一类证据**（端点 + 参数 + 鉴权），且多数平台的草稿列表与作品列表是**同一端点家族**（例如抖音创作者中心、B站创作中心的列表接口往往同时含草稿与已发布项）。

**建议**：一次取证同时记录两项用途——列表项里若含 `draft` 类状态，可直接复用于 P1-3 的「平台草稿箱回取」，避免为同一端点做两轮真机取证。

---

## 六、当前状态与最近一次核对

| 项 | 状态 |
| --- | --- |
| `AUDIT_REQUERY_VERIFIED_PLATFORMS` | **空**（本仓尚无任何平台的审核回查真机证据） |
| `AUDIT_REQUERY_CANDIDATE_PLATFORMS` | 7 平台（weibo / douyin / bilibili / zhihu / xiaohongshu / toutiao / youtube），与 `publish-monitor.CHECK_URLS` 键集由 parity 锁约束 |
| 快手 | `unsupported`（协议形状不符，已诚实跳过，待专用 POST 实现） |
| 凭证来源 | 已修复（第二切片）：任务自带为空时从 Electron auth 分区只读补齐；拿不到则不发起轮询 |
| 无定论处理 | 已由第一切片的单向证据规则保证：平台未给出明确结论时**不写任何字节** |
| 鉴权 / uid 取值来源（证据③与部分①） | **已证**：见 §七（当日活体日志 + `http-login-checker.js` 生产实现）——但 `verified` 名单仍为空，缺的是**作品状态端点形状与 postId 映射**，不是登录鉴权 |

> 核对方法（无需真机）：
> `node -e "const r=require('./apps/desktop/electron/services/publish-audit-requery');console.log(r.AUDIT_REQUERY_VERIFIED_PLATFORMS, r.AUDIT_REQUERY_CANDIDATE_PLATFORMS)"`
---

## 七、本机现场取证（2026-10-03，**只读**：能证什么、不能证什么）

> 取证方式：**只读** —— 不发起任何出站请求、不触碰真实账号。证据只有两处：① 当日活体日志（另一会话在跑的 dev 实例，
> `shared-user-data/logs/app-2026-10-03.log`）② 仓库里**已在生产路径上跑着**的登录态检测代码 `http-login-checker.js`。
> 目的：把「未知」收窄成「已知缺哪一块」，避免下一个会话再从零发现「端点不对」。
>
> **读数的时效与口径**（本节数字是一次实测，坐标 `2026-10-03T04:38Z`，命令随附可重跑）：
> ① 该日志**正在被别的会话写入**，计数只增不减 ⇒ 下表绝对数字是**下界**不是定值，复跑必然更大；
> ② 文件名按**本地日期**命名、行内时间戳是 **UTC**，本次覆盖 `2026-10-02T16:00:02Z` 起；
> ③ `grep CHECK_LOGIN_SUCCESS` 的裸串匹配会**吃掉** `CHECK_LOGIN_SUCCESS_HTTP_API`（后者是前者的扩展名），
>    实测全量 342 = plain 190 + HTTP_API 152 ⇒ 「190」是**相减后的差值**，不是独立计数；复核必须按同口径减。

### 7.1 已证（有出处，可复核）

| 平台 | 已证内容 | 出处 |
| --- | --- | --- |
| 全部 | **cookie 鉴权 JSON 通道可用**：`LoginMonitor result <平台>:<账号> valid=true -> active` 共 **203 条**、`valid=false` **0 条**，覆盖 **7 个平台**（bilibili / douyin / kuaishou / toutiao / wechat_mp / xiaohongshu / zhihu）**各 29 轮** —— 即同一批凭证被连续 29 次判为有效，不是单次巧合；另有 `CHECK_LOGIN_SUCCESS`(plain) 190、`CHECK_LOGIN_SUCCESS_HTTP_API` 152、`CHECK_LOGIN_COOKIE_EXPIRED` 27 | `app-2026-10-03.log`（复核命令见 §7.1.1；命令含管道符，写进单元格会把该行切成 7 段） |
| B 站 | **清单第二节要求的「`mid` 的来源」这一格已证**：`mid` 取自 `GET https://api.bilibili.com/x/web-interface/nav` 的 `data.data.mid`（有效判定 `:184`、`platformAccountId: String(u.mid)` 投影 `:189`），`code === -101` 判明确未登录，且**cookie 必须含 `bili_jct`**（`:178` 的 `precheck`，缺失即判失效）⇒ 证据③（鉴权）与 bilibili 的证据①（参数取值来源）都有生产实现背书 | `apps/desktop/electron/publishers/http-login-checker.js:172`（注释）、`:174`（url）、`:178`、`:184`、`:189` |
| 抖音 | uid 字段名已证为 **`uid` / `user_id`**（不是 `id`），端点 `GET https://creator.douyin.com/aweme/v1/creator/pc/user/info/` 用已存 cookie 即返回 JSON；`platformAccountId` 的投影就是 `uid` 优先、缺则取 `user_id`（`:84`）；且平台把 **`status_code === 8` 定义为明确未登录**（`:77`），其余码/缺字段/结构变更一律 `return undefined`（`:80`）⇒ 与「无定论不得写库」的既有纪律天然对齐 | 同文件 `:66`（url）、`:76`（有效判定）、`:77`（8=明确未登录）、`:80`（其余无定论）、`:84`（uid 投影） |
| 头条 | **创作者后台存在可用的 JSON 网关 `mp/agw/*`**：**`GET`** `https://mp.toutiao.com/mp/agw/media/get_media_info` 用已存 cookie 返回 `{code:0,data:{user:{…}}}`（有效判定在 `:95`：`code === 0` 且 `data.user` 下要有 `id` 或 `user_id` 之一；`platformAccountId` 的投影在 `:102`）；而候选表里的 `profile_v4/graphic/publishing` 是 **HTML 页面** —— 实测该日志里 `mp.toutiao.com/profile_v4/graphic/publish` 出现 **52 次且全部是导航目标**（Referer/路由），不是 JSON 调用 ⇒ 头条的回查端点应往 `/mp/agw/*` 找，而不是继续猜 `profile_v4/*` | 同文件 `:16`（注释写明 GET）、`:88`（url）、`:95`、`:102`；`headers.Referer` 本身就是 `profile_v4/graphic/publish`（`:90`），正是「页面 ≠ 端点」的现场证据 |

#### 7.1.1 复核命令（逐条可重跑，均在仓库根执行）

```bash
LOG=shared-user-data/logs/app-2026-10-03.log   # 该文件由另一会话的 dev 实例持续写入

# ① 每平台有效/无效计数（预期：7 个平台各 29 轮 valid=true，valid=false 为 0）
grep -ao 'LoginMonitor result [a-z_]*:[0-9a-f]* valid=true'  "$LOG" | sed -E 's/.*result ([a-z_]*):.*/\1/' | sort | uniq -c
grep -ao 'LoginMonitor result [a-z_]*:[0-9a-f]* valid=false' "$LOG" | wc -l

# ② 三个 code 计数。注意口径：裸串 CHECK_LOGIN_SUCCESS 会吃掉 _HTTP_API 那一档，
#    所以「190」必须是全量减 HTTP_API 的差值，不能直接当作独立计数。
grep -ao 'CHECK_LOGIN_SUCCESS' "$LOG" | wc -l            # 全量（实测 342）
grep -ao 'CHECK_LOGIN_SUCCESS_HTTP_API' "$LOG" | wc -l   # 其中走 HTTP 网关（实测 152）
grep -ao 'CHECK_LOGIN_COOKIE_EXPIRED' "$LOG" | wc -l     # 明确失效（实测 27）

# ③ profile_v4 只作为导航目标/Referer 出现，不是 JSON 端点（实测 52 次）
grep -ao 'mp.toutiao.com/profile_v4/graphic/publish' "$LOG" | wc -l
```

### 7.2 仍未证（且**本机没有现场**，不得从 7.1 外推）

1. **作品状态端点的请求形状**（方法 + 路径 + query/body 结构）：7.1 证的是「当前登录账号是谁」的端点，
   不是「某一条作品的审核状态」的端点 —— 两者同域不同路径，**从 user/info 通不能推出 list 通**；
2. **`postId` 与平台作品标识的对应关系**（抖音 `aweme_id` / B 站 `bvid`·`aid` / 知乎文章 id）：
   当日日志里 `aweme_id`、`bvid`、`postId` 三个字段名的出现次数均为 **0** ⇒ 本机没有可用的发布回传现场；
3. **状态值 → `auditStatus` 的映射表**（含模板强制要求的「无定论」栏）；
4. **反例实测**（故意传错参数 / 无凭证时的表现），用来证明「查不到」不会被误判成「已上线」。

第 2–4 项的前置动作是**用真实账号发一条内容再回查**，属于对第三方平台写数据的外部可见动作，
**必须经用户明确同意**才可执行。账号本身是登录着的（7.1 已证），所以阻塞点只剩这一个决定。
最小侵入建议：选一个测试账号，发一条**仅自己可见 / 可立即删除**的短内容，
并只用一次回查取响应形状（不落库、不改历史），取证后即删。

### 7.3 本轮不改代码的理由

`AUDIT_REQUERY_VERIFIED_PLATFORMS` 保持 **空**。7.1 抬高的是「鉴权 + 参数取值来源」这两格的可信度，
而 §一 的判据是**三项证据缺一不可**，其中「作品状态端点形状」与「映射表」一项都没拿到；
把平台提前写进 `verified` 就是拿「账号信息端点能通」冒充「作品端点形状已知」，
正是本清单立项要防的那类假声明。

## 八、第二次离线取证（2026-10-05，仍**只读**，不发起任何出站请求、不触碰真实账号）

§七 之后又跑了一次覆盖面更大的离线扫描，问的是「本机历史里到底有没有作品端点的现场」。

- 扫描域：本机两处 userData 的全部 `*.log` —— `C:\Users\to_co\AppData\Roaming\@multi-publish\desktop\logs` 与 `D:\tmp\Multi-Publish-debug-profile\logs`，**实读 52 个文件 / 13,852,392 字节**（脚本先打印实读文件数与字节数，再报命中数；否则「0 命中」无法区分「没有」与「没扫」）。
- 结果：`archive/space` / `aweme/v1` / `ajax/statuses/mymblog` / `creator/v2` / `web-a-api` / `api/xq/insight` / `bvid` / `aweme_id` / `post_id` / `postId` / `auditStatus` / `audit` / `review` / `draft` / `publishing` **各 0 命中**；`mp.toutiao.com` 仅 1 命中，且是登录检测的**导航 URL**（`checkLoginStatus: start toutiao url=https://mp.toutiao.com/`），不是 JSON 端点。
- 严格形态复检（`(^|[^A-Za-z])"(aid|bvid|aweme_id|video_id|note_id|item_id)"?\s*[:=]`，用它是为了避免把 `said`/`paid` 这类词算成命中）：3 命中，全部是视频号 `channels.weixin.qq.com/…notification_list?_aid=<uuid>` 里的 **`_aid` 应用实例标识**，语义上不是作品 id ⇒ 作品标识符在本机历史日志里仍是 0 现场。
- 结论与 §7.3 同：`AUDIT_REQUERY_VERIFIED_PLATFORMS` 保持**空**。这次扫描把「本机没有发布回传现场」从"当日一份日志没看到"升级为"52 份 / 13.8 MB 全量未见"，但**它仍然不能替代真机取证**：证据①（作品状态端点请求形状）与③（状态值→`auditStatus` 映射表）只能来自真实回传或真实创作者中心的现场抓包，而这两者的前置动作是向真实账号发一条内容——属外部可见写操作，须经用户授权。
