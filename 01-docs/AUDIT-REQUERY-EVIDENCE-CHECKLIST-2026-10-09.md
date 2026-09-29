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

> 核对方法（无需真机）：
> `node -e "const r=require('./apps/desktop/electron/services/publish-audit-requery');console.log(r.AUDIT_REQUERY_VERIFIED_PLATFORMS, r.AUDIT_REQUERY_CANDIDATE_PLATFORMS)"`
