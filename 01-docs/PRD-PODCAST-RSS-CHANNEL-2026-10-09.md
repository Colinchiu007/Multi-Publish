# PRD：播客 RSS 频道发布（自动覆盖小宇宙收录）（podcast-rss-channel）

- 日期：2026-10-09
- 状态：v1.0（文档刀；共享引擎已实现，渲染层/IPC 为规划）
- 前置材料：`01-docs/INVESTIGATE-XIAOYUZHOU-PODCAST-2026-10-09.md`（调研报告，含 D1/D2/D3 三个架构决策的全部分析）
- 配套：`docs/adr/0008-podcast-rss-is-protocol-channel-not-platform.md`、`openspec/changes/podcast-rss-channel/`
- 单一真源：校验/生成引擎 `packages/shared-utils/src/podcast-rss.js`（CJS）与分发端目录 `packages/shared-utils/src/podcast-endpoints.json`（CJS `podcast-endpoints.js` / ESM `podcast-endpoints.browser.js` 双版本消费同一份 JSON）。**本文档所有字段、上限、校验码、常量逐项与该实现对齐**；契约夹具即 `packages/shared-utils/src/__tests__/podcast-rss.test.js`（25 例）与 `podcast-endpoints.test.js`（8 例）。

---

## 一、目标用户与核心价值

**目标用户**：用 mulpub 做内容生产的自媒体运营者，其中一部分人的内容形态是**播客（音频）**，希望"一键发布"覆盖小宇宙等播客端。

**核心价值**：把"发布到小宇宙"这个用户心智，落成一条**合规、稳定、全自动**的通道——mulpub 生成并维护一个标准的 Podcast RSS（iTunes RSS 2.0）频道，**首次收录在小宇宙 App 内人工提交一次 RSS 地址，此后每期新单集只需在 mulpub"发布"（= 向自家 feed 追加 `<item>` 并更新文件），由聚合端定时抓取自动出现**，同一份 feed 可同时分发到 Apple Podcasts、Spotify 等全部 RSS 型播客端（"一份 feed 多投"）。

**语义前提（必须写进所有相关界面文案的心智）**：小宇宙、Apple Podcasts、Spotify 是 **RSS 聚合端**，不是内容托管端；"发布到播客端"不存在逐期站内动作，它是**开放协议驱动的分发**。调研报告结论：小宇宙无官方开放平台/发布 API（官网仅主播后台，主播后台功能面为运营互动，无音频上传单集入口）。

## 二、非目标（明确不做什么）

1. **不做逆向写接口**。现证据只覆盖小宇宙读接口（验证码 token 的私有 API），写接口未发现；即便发现也属未授权访问、违反平台 ToS，账号与合规风险高（对齐本项目"聚合外部 API 先过判据再展示"的既有红线）。**明确排除。**
2. **不做主播后台 RPA**。主播后台不能发布单集，RPA 无法实现主流程；运营互动类自动化（公告/投票/改节目信息）价值低、页面改版脆弱性高，不进 MVP。
3. **不把 RSS 分发端登记为"可登录/可逐期发布的平台"**（D2/D3 决策）。分发端目录（`podcast-endpoints.json`）**不参与** `PLATFORM_LOGIN_URLS` / `PLATFORM_AUTH_HOSTS` / 会话 Cookie 标记 / 凭证采集 / `publish-capabilities.json` 的 titleMode 判定；`publishMode` 三态（`api-only|api-then-dom|dom-only`）**不新增 `rss` 第四态**——该闸回答的是"走 API 轨还是 DOM 轨、失败是否回退"，RSS 是另一种通道种类，硬塞会被 `rpa-view-manager.js` 的 `mode != null ? mode !== 'dom-only' : ...` 静默归入 API 轨（详见 ADR-0008 与调研报告 §九）。
4. **不进 MVP 的代托管**（D1 决策）。mulpub 自有桶代托管（形态 C）把产品定位改写成"播客托管服务商"，继承全部存储/带宽/审核/退出运维负担，且与既有免费托管生态正面竞争、毛利薄；仅满足 §四 P2 三前置条件后才启动。
5. **不实现音频处理**。转码、降噪、音量归一等音频后期能力不在本 PRD 范围；mulpub 只消费成品音频文件/外链。

## 三、托管形态分期（D1 决策落表)

| 分期 | 形态 | 状态 | 说明 |
| --- | --- | --- | --- |
| **P0（必答）** | A. 用户自带音频外链（零托管） | **已实现（2026-10-09 三刀落地：共享引擎 → 主进程持久化/IPC → 渲染层页面）** | mulpub 只做"外链 → RSS 生成/更新/自检"，不碰存储。零成本、零合规负担；自检工具（enclosure 可达、字段合规、XML 有效）对所有后续形态复用 |
| **P1（推荐落地形态）** | B. 用户自有 OSS/COS 直传，mulpub 代传代管 URL | **规则层已实现（2026-10-09，`apps/desktop/electron/services/podcast-hosting-upload.js` + 34 例回归锁）；主进程/IPC/渲染层接线未实现** | 已落地的是纯函数口径：托管配置资格判定（`validateHosting`，缺字段 fail-closed）、`object_key` 派生（禁止标题与路径穿越进公网 URL）、公网 URL 拼接（不得拼出 `bucket.bucket`）、OSS V1 待签串与签名头（**返回值不得含凭证**）、STS 形态的引擎 `uv` 形状、单对象 `putObject`（出站一律经注入 `httpClient`）。不接引擎分片上传链的原因见该文件头注（用户长期 AK 无 `securityToken`，签不出 `x-oss-security-token`）。仍未实现：托管配置落盘与加密（凭证入 credential-store 同源加密）、`podcast:hosting:*` IPC 通道、渲染层「选择本地文件 → 直传回填外链」入口 |
| **P2（条件后置）** | C. mulpub 代托管（自有桶，Pro 增值） | **规划，未启动** | 启动前置三条件，缺一不做：①能收费（绑 entitlement 配额：存储 GB + 抓取流量，定价覆盖云账单）；②可审核（机审 + 举报下架流程）；③可退出（用户 churn 后 feed 归属与迁移导出，避免断供把已收录账号打死） |

## 四、功能列表（P0/P1/P2，每项带可验证验收标准）

### P0 —— RSS 通道 MVP（形态 A）

| # | 功能 | 验收标准（可验证） |
| --- | --- | --- |
| F1 | 频道配置（表单 + 持久化） | 保存后重启应用数据不丢；必填缺失/超长/枚举非法时逐项显示 §六 校验码对应提示且定位到字段；合法频道可保存 |
| F2 | 单集管理（增删改 + 列表） | 新增/编辑/删除单集持久化；列表按 pubDate 倒序（与 feed 顺序一致）；同 guid（或无 guid 时同音频地址）重复保存**不产生第二条记录**（原地更新，见 §八.4 幂等） |
| F3 | feed 生成（`buildFeed`） | 校验不过 → 抛 `PODCAST_FEED_INVALID` 并携带 issues，**不产出/不覆盖 feed 文件**；校验通过 → 生成含 itunes/content 命名空间声明的 XML，单集按 pubDate 倒序、`<enclosure url/length/type>` 三属性齐全、时长为 `MM:SS`/`HH:MM:SS` 两档格式；产物可被 `parseFeed` 解析回同构字段（往返锁） |
| F4 | feed 自检（`verifyFeed`） | 无网络时（未注入 headImpl）仍可做结构检查（XML 声明/itunes 命名空间/单集数），且**引擎自身零出站请求**；注入 headImpl 后逐条 enclosure 产出 `ok/reason/status` 明细；不可达、类型不符、长度不符分别报 `ENCLOSURE_UNREACHABLE` / `ENCLOSURE_TYPE_MISMATCH` / `ENCLOSURE_LENGTH_MISMATCH` |
| F5 | 分发端目录与首次提交指引 | 目录固定含 `xiaoyuzhou`、`apple_podcasts`、`spotify` 三端（`ENDPOINT_ORDER` 精确等于该顺序）；小宇宙卡片显示「需在 App 内人工提交」「首次人工审核 1~7 天」「此后逐期零操作」；每个条目带 `verifiedAt` 取证日期与 `steps` 非空步骤列表；「复制 RSS 地址」一键复制 feed 公网地址；web 端提交链接绑定前必须过 `podcastEndpointHref()`（共享 https 判据） |
| F6 | 平台契约面隔离（防回归） | `podcast-endpoints.test.js` 断言：分发端 id 不出现在 `PLATFORM_LOGIN_URLS`/`PLATFORM_NAMES`/`PLATFORM_PUBLISH_META`/`PLATFORM_SESSION_COOKIE_MARKERS`/`PLATFORM_AUTH_HOSTS`；`PLATFORM_NAMES` 与 `PLATFORM_PUBLISH_META` 平台数保持 **15** 不变 |

### P1 —— 用户自有 OSS/COS 直传（形态 B：规则层已实现，服务/IPC/UI 接线未实现）

| # | 功能 | 验收标准 |
| --- | --- | --- |
| F7 | 托管配置（用户 AK/bucket/endpoint/前缀） | 凭证落 credential-store（AES-256-GCM），日志与错误消息不出现 AK/Secret 明文；AK 必填校验缺失时 fail-closed 提示 |
| F8 | 单集音频直传 | 本地音频文件选择后自动分片上传，成功后把公网 URL 回填该单集（`resolvedAudioUrl` 语义，见 §五.2），失败的单集不写 URL、状态如实报错；上传成功前该单集不得进入"可生成 feed"状态 |
| F9 | 外链失效预警 | 定期（或手动触发）对全部单集 enclosure 跑 `verifyFeed`，出现 `ENCLOSURE_UNREACHABLE` 时在界面点名具体单集 |

> **F7–F9 实现状态（2026-10-09）**：F7/F8 的**判定与签名口径**已在规则层落地并有回归锁（`podcast-hosting-upload.test.js`，34 例），F7 的"凭证落 credential-store + AES-256-GCM"与 F8 的"服务编排 + 回填 `resolvedAudioUrl` + UI 入口"**仍未实现**；F9 已被 P0 的 `podcast:feed:verify` 部分满足（手动触发出 `checks[]` 明细，含逐条 reason），**定期自动复检未实现**。另记一条与 F8 原文的口径偏差：长期 AK 形态走**单对象 PUT**（`putObject`）而非"自动分片上传"，只有用户给出 `securityToken`（STS 形态）时才改走引擎 `ossUploader` 的分片链——原因见 `podcast-hosting-upload.js` 头注（引擎签法固定拼 `x-oss-security-token`）。

### P2 —— 代托管（形态 C，规划，未启动）

仅当 §三 三前置条件全部闭合后另立 PRD；本文档不展开设计。

## 五、数据模型

> 字段名、默认值、上限与 `podcast-rss.js` 逐项对齐。引擎为纯函数、不落盘：下表是「消费方（主进程服务/IPC）持久化的频道/单集对象」的契约形状。

### 5.1 引擎常量（单一真源，消费方禁止另抄一份数值）

| 常量 | 值 | 语义 |
| --- | --- | --- |
| `TITLE_MAX` | 255 | 频道/单集标题上限（字符数，按 `String.length`） |
| `SUMMARY_MAX` | 4000 | 频道简介/单集简介上限 |
| `SUBTITLE_MAX` | 120 | 频道/单集副标题上限 |
| `DURATION_MAX_SEC` | 86400（24h） | 单集时长整数秒上限 |
| `ITEMS_MAX` | 1000 | feed 单集数上限 |
| `COVER_MIN_PX` / `COVER_MAX_PX` | 1400 / 3000 | 封面边长区间（正方形） |
| `EXPLICIT_VALUES` | `yes` / `no` / `clean` | 分级枚举（频道与单集共用） |
| `EPISODE_TYPE_VALUES` | `full` / `trailer` / `bonus` | 单集类型枚举 |
| `EPISODE_FEED_TYPE_VALUES` | `episodic` / `serial` | 频道 feed 类型枚举 |
| `AUDIO_MIME_VALUES` | `audio/mpeg` `audio/mp4` `audio/x-m4a` `audio/aac` `audio/ogg` `audio/wav` | 单集 MIME 白名单（显式声明时校验） |
| `LANGUAGE_RE` | `/^[a-z]{2}(-[A-Z]{2})?$/` | 语言形如 `zh-CN` / `en-US`（裸 `zh` 亦合法） |
| `EMAIL_RE` | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | 所有者邮箱格式 |
| `ITUNES_CATEGORIES` | 18 个顶级分类（The Arts、Business、Comedy、Education、Fiction、Government、Health & Fitness、History、Kids & Family、Leisure、Music、News Politics、Religion & Spirituality、Science、Society Culture、Sports、Technology、True Crime）及各子分类 | 分类白名单；字符串形如「顶级/子级」最多两级（顶级名按该表逐字，其中 `News Politics`、`Society Culture` 为本实现顶级键的既成写法） |

### 5.2 频道字段表

| 字段 | 类型 | 必填 | 上限/规格 | 语义 | feed 落点（buildFeed） |
| --- | --- | --- | --- | --- | --- |
| `title` | string | ✅ | ≤255 | 节目名 | `<title>`（转义） |
| `description` | string | ✅ | ≤4000 | 频道简介 | `<description>` |
| `subtitle` | string | — | ≤120 | 副标题（可选，非空才产出） | `<itunes:subtitle>` |
| `language` | string | — | 默认 `zh-CN`；`LANGUAGE_RE` | 语言 | `<language>` |
| `coverUrl` | string | ✅ | https 绝对地址（协议判据见 §六.0） | 频道封面（正方形 1400~3000px） | `<itunes:image href>` 与 `<image><url>` |
| `coverSize` | string | 条件必填 | 形如 `3000x3000`（`[xX]` 与空格均可），必须正方形且边长在 1400~3000 | 封面尺寸声明，供校验 | 不进 feed，仅校验面 |
| `link` | string | — | 非空时必须 https 绝对地址 | 节目站点 | `<link>`；缺省时按 `link → siteUrl → 'https://example.com/'` 兜底链取第一个合法 https 值（**兜底占位是引擎既有行为**，界面应引导用户填真实站点） |
| `siteUrl` | string | — | 校验层**不校验**该字段；仅在 `link` 缺席时由构建层按其 https 值兜底 | 站点备用字段 | 见 `link` |
| `author` | string | ✅ | 非空（代码无长度上限，如实按实现） | 作者/主播名 | `<itunes:author>` |
| `ownerName` | string | — | — | 所有者显示名 | `<itunes:owner><itunes:name>`，缺省回落 `author` |
| `ownerEmail` | string | ✅ | `EMAIL_RE` | 所有者邮箱（聚合端联系用；会**公开**出现在 feed 中，界面须提示隐私含义） | `<itunes:email>` |
| `explicit` | enum | — | `yes/no/clean`；构建默认 `no` | 频道分级 | `<itunes:explicit>` |
| `feedType` | enum | — | `episodic/serial`；默认 `episodic` | 节目叙事型别 | `<itunes:type>` |
| `categoryId` | string | ✅ | 「顶级」或「顶级/子级」，最多两级，白名单 `ITUNES_CATEGORIES` | 播客分类 | `<itunes:category text>` 嵌套两级或单级 |

### 5.3 单集字段表

| 字段 | 类型 | 必填 | 上限/规格 | 语义 | feed 落点（buildItem） |
| --- | --- | --- | --- | --- | --- |
| `title` | string | ✅ | ≤255 | 单集标题 | `<title>` |
| `description` | string | — | ≤4000 | 节目简介/show notes 纯文本 | `<description>` |
| `subtitle` | string | — | ≤120 | 单集副标题（非空才产出） | `<itunes:subtitle>` |
| `htmlContent` | string | — | 校验层**不设限**（按实现如实） | show notes 富文本（写入前仍整体转义） | `<content:encoded>` |
| `audioUrl` | string | 三选一 | https 绝对地址 | 用户自带外链（P0 形态 A） | `<enclosure url>` |
| `resolvedAudioUrl` | string | 三选一 | https 绝对地址 | 托管直传回填的解析后 URL（P1 形态 B 落点；优先级低于 `audioUrl`，见 §六.3 enclosure 解析序） | `<enclosure url>` |
| `localFilePath` | string | 三选一 | 本机路径 | 仅本地文件、托管未配置时的诊断线索（**永远不会进 feed**，只用于产出 `EPISODE_HOSTING_NOT_CONFIGURED` 引导） | 不产出 |
| `durationSec` | integer | ✅ | 1~86400 | 音频时长（秒） | `<itunes:duration>`，格式 `MM:SS`（不足一小时）/`HH:MM:SS` |
| `sizeBytes` | integer | ✅ | ≥1 正整数 | enclosure `length` 声明（聚合端断点续传与缓存依据） | `<enclosure length>`；缺失即 `EPISODE_SIZE_REQUIRED` |
| `mime` | enum | — | `AUDIO_MIME_VALUES`；未显式声明时按音频 URL **pathname 扩展名**派生（`.m4a/.aac/.ogg/.wav/.mp4` 对应类型，其余/无法解析一律 `audio/mpeg`；URL 查询串不参与派生） | 音频类型 | `<enclosure type>` |
| `guid` | string | — | ≤500 字符 | 全局唯一标识（幂等/判重主键，§八.4） | `<guid isPermaLink="false">`；缺省= enclosure URL |
| `pubDate` | date/string | — | 可被 `new Date()` 解析；缺省=构建时刻 | 发布时间（排序键） | `<pubDate>` RFC-2822 GMT |
| `number` | integer | — | ≥1 | 期号 | `<itunes:episode>` |
| `season` | integer | — | ≥1 | 季号 | `<itunes:season>` |
| `coverUrl` | string | — | 非空时必须 https 绝对地址 | 单集封面 | `<itunes:image href>` |
| `explicit` | enum | — | `yes/no/clean` | 单集分级 | `<itunes:explicit>` |
| `episodeType` | enum | — | `full/trailer/bonus` | 单集类型 | `<itunes:episodeType>` |

列表级约束：单集数 ≥1（否则 `EPISODES_EMPTY`）、≤1000（`EPISODES_TOO_MANY`）；判重键 `trim(guid || audioUrl || resolvedAudioUrl)` 非空且唯一（重复 `EPISODE_DUPLICATE`）；构建序按 `pubDate` 倒序，频道级 `<pubDate>` 取最新一期。

## 六、数据校验（引擎校验码全量表）

### 6.0 协议判据（所有 URL 字段共用）

`isHttpsUrl()` = 先过共享协议白名单 `safeHttpUrl`（`packages/shared-utils/src/safe-http-url.js`，禁止第二份 `/^https?:/`），再要求解析后 `protocol === 'https:'`。即：`http://`、`//host`（协议相对）、`example.com`（缺协议）、`javascript:` 一律拒绝。**理由**：聚合端普遍要求 https 源；且外链是渲染层可点击锚点的上游，协议白名单只在一处实现。

### 6.1 fail-closed 语义

- `buildFeed()` 先跑 `validateFeed(频道+单集列表)`，**任一 issue 即抛异常** `err.code = 'PODCAST_FEED_INVALID'`，`err.issues` 携带全量校验码列表；**不产出任何文件**。禁止产出"看似成功但平台不收录"的 feed。
- `validateChannel` / `validateEpisode` / `validateEpisodeList` / `validateFeed` 单独调用时不抛错，返回 `{ok, issues}`——**保存草稿**走这个非阻断口径（允许半成品持久化），**生成 feed** 走 fail-closed 口径。
- `verifyFeed()` 属**自检/运维**口径：不阻断生成（feed 已是产物），逐 enclosure 输出 `checks[]`（`{url, ok, reason, status}`）。引擎自身不发网络请求，`headImpl` 由消费方注入；未注入时只做结构检查、`checks` 为空数组。

### 6.2 校验码表——频道（全部阻断生成 feed）

| 码名 | 触发条件（按实现逐字） | 用户提示建议（引擎中文原文为 zh 底稿） | 前端展示位置 | 阻断生成 |
| --- | --- | --- | --- | --- |
| `CHANNEL_MISSING` | 频道对象不存在/非对象 | 频道配置缺失 | 页面顶部错误条 | ✅ |
| `CHANNEL_TITLE_REQUIRED` | `title` 去空白后为空 | 频道标题不能为空 | 字段内联 | ✅ |
| `CHANNEL_TITLE_TOO_LONG` | `title` > 255 | 频道标题不得超过 255 字符 | 字段内联 | ✅ |
| `CHANNEL_DESC_REQUIRED` | `description` 为空 | 频道简介不能为空 | 字段内联 | ✅ |
| `CHANNEL_DESC_TOO_LONG` | `description` > 4000 | 频道简介不得超过 4000 字符 | 字段内联 | ✅ |
| `CHANNEL_SUBTITLE_TOO_LONG` | `subtitle` > 120 | 副标题不得超过 120 字符 | 字段内联 | ✅ |
| `CHANNEL_LANGUAGE_INVALID` | 不匹配 `LANGUAGE_RE` | 语言需形如 zh-CN / en-US | 字段内联 | ✅ |
| `CHANNEL_COVER_REQUIRED` | `coverUrl` 缺失 | 封面地址不能为空 | 字段内联 | ✅ |
| `CHANNEL_COVER_NOT_HTTPS` | `coverUrl` 非 https 绝对地址 | 封面必须是 https 绝对地址 | 字段内联 | ✅ |
| `CHANNEL_COVER_SIZE_UNKNOWN` | 封面合法但 `coverSize` 无法解析成 WxH | 封面尺寸需形如 3000x3000 以便校验 | 字段内联 | ✅ |
| `CHANNEL_COVER_NOT_SQUARE` | 宽高不等 | 封面必须为正方形 | 字段内联 | ✅ |
| `CHANNEL_COVER_SIZE_OUT_OF_RANGE` | 边长 <1400 或 >3000 | 封面边长须在 1400~3000 之间 | 字段内联 | ✅ |
| `CHANNEL_LINK_NOT_HTTPS` | `link` 非空且非 https 绝对地址 | 站点地址必须是 https 绝对地址 | 字段内联 | ✅ |
| `CHANNEL_AUTHOR_REQUIRED` | `author` 为空 | 作者/主播名不能为空 | 字段内联 | ✅ |
| `CHANNEL_OWNER_EMAIL_INVALID` | `ownerEmail` 不匹配 `EMAIL_RE` | 所有者邮箱格式非法 | 字段内联 | ✅ |
| `CHANNEL_EXPLICIT_INVALID` | 非空且 ∉ `yes/no/clean` | 分级取值须为 yes/no/clean | 字段内联 | ✅ |
| `CHANNEL_FEED_TYPE_INVALID` | 非空且 ∉ `episodic/serial` | feed 类型取值须为 episodic/serial | 字段内联 | ✅ |
| `CHANNEL_CATEGORY_REQUIRED` | `categoryId` 为空 | 播客分类不能为空 | 字段内联 | ✅ |
| `CHANNEL_CATEGORY_UNKNOWN` | 顶级名不在 `ITUNES_CATEGORIES` | 未知顶级分类「{top}」 | 字段内联 | ✅ |
| `CHANNEL_SUBCATEGORY_UNKNOWN` | 子级不在该顶级子表 | 「{top}」下不存在子分类「{sub}」 | 字段内联 | ✅ |
| `CHANNEL_CATEGORY_TOO_DEEP` | 「顶级/子级/」之后还有第三级 | 分类最多两级 | 字段内联 | ✅ |

### 6.3 校验码表——单集（全部阻断生成 feed）

enclosure 解析序（`resolveEnclosure`）：`audioUrl` → `resolvedAudioUrl` → `localFilePath`（有则报托管未配置）→ 都没有报必填缺失。

| 码名 | 触发条件 | 用户提示建议 | 前端展示位置 | 阻断生成 |
| --- | --- | --- | --- | --- |
| `EPISODE_MISSING` | 单集对象不存在/非对象 | 单集数据缺失 | 该单集行/顶部错误条 | ✅ |
| `EPISODE_TITLE_REQUIRED` / `EPISODE_TITLE_TOO_LONG` | 标题空 / >255 | 单集标题不能为空 / 不得超过 255 字符 | 字段内联 | ✅ |
| `EPISODE_DESC_TOO_LONG` | 简介 > 4000 | 节目简介不得超过 4000 字符 | 字段内联 | ✅ |
| `EPISODE_SUBTITLE_TOO_LONG` | 副标题 > 120 | 副标题不得超过 120 字符 | 字段内联 | ✅ |
| `EPISODE_AUDIO_REQUIRED` | 三个 URL/路径字段全空 | 请填写音频外链地址 | 字段内联 | ✅ |
| `EPISODE_AUDIO_NOT_HTTPS` | `audioUrl`/`resolvedAudioUrl` 存在但非 https | 音频必须是 https 绝对地址 | 字段内联 | ✅ |
| `EPISODE_HOSTING_NOT_CONFIGURED` | 仅有 `localFilePath`、无外链 | 仅有本地文件，须先配置托管直传或填写外链 | 字段内联 + 引导跳转托管配置区块 | ✅ |
| `EPISODE_DURATION_INVALID` | 非整数秒 / <1 / >86400 | 时长须为 1~86400 的整数秒 | 字段内联 | ✅ |
| `EPISODE_SIZE_REQUIRED` | `sizeBytes` 缺失 | enclosure 必须声明 length（字节数） | 字段内联 | ✅ |
| `EPISODE_SIZE_INVALID` | `sizeBytes` 非正整数 | 字节数须为正整数 | 字段内联 | ✅ |
| `EPISODE_EXPLICIT_INVALID` | 分级 ∉ 枚举 | 分级取值须为 yes/no/clean | 字段内联 | ✅ |
| `EPISODE_TYPE_INVALID` | 类型 ∉ `full/trailer/bonus` | 类型取值须为 full/trailer/bonus | 字段内联 | ✅ |
| `EPISODE_PUBDATE_INVALID` | `pubDate` 无法解析 | 发布时间无法解析 | 字段内联 | ✅ |
| `EPISODE_COVER_NOT_HTTPS` | 单集封面非 https | 单集封面必须是 https 绝对地址 | 字段内联 | ✅ |
| `EPISODE_MIME_INVALID` | 显式 `mime` ∉ 白名单 | 音频 MIME 须为白名单六值 | 字段内联 | ✅ |
| `EPISODE_GUID_TOO_LONG` | `guid` > 500 | guid 不得超过 500 字符 | 字段内联 | ✅ |
| `EPISODE_NUMBER_INVALID` / `EPISODE_SEASON_INVALID` | 期号/季号非正整数 | 期号须为正整数 / 季号须为正整数 | 字段内联 | ✅ |
| `EPISODES_EMPTY` | 单集列表空 | feed 至少需要一个单集 | 单集区块空态 | ✅ |
| `EPISODES_TOO_MANY` | 单集数 > 1000 | 单集数不得超过 1000 | 单集区块顶部 | ✅ |
| `EPISODE_DUPLICATE` | 判重键 `trim(guid||audioUrl||resolvedAudioUrl)` 非空且重复 | 存在重复的 guid/音频地址 | 冲突单集行 | ✅ |

### 6.4 校验码表——feed 自检（verifyFeed，不阻断生成、属运维预警）

| 码名 | 触发条件 | 用户提示建议 | 前端展示位置 | 阻断生成 |
| --- | --- | --- | --- | --- |
| `FEED_NO_ITEMS` | 解析后 `<item>` 数为 0 | feed 中没有任何单集 | 自检结果面板 | ❌（产物级检查） |
| `FEED_MISSING_ITUNES_NS` | XML 缺 `xmlns:itunes=` | 缺少 itunes 命名空间 | 自检结果面板 | ❌ |
| `FEED_MISSING_XML_DECL` | 前 64 字符不以 XML 声明开头（允许 BOM 前缀） | 缺少 XML 声明 | 自检结果面板 | ❌ |
| `ENCLOSURE_MISSING` | 某 `<item>` 无 enclosure 元素 | 存在没有 enclosure 的单集 | 逐条明细 | ❌ |
| `ENCLOSURE_NOT_HTTPS` | enclosure url 非 https | 存在非 https 的 enclosure | 逐条明细 | ❌ |
| `ENCLOSURE_UNREACHABLE` | head 状态码非整数（含网络异常→status null）或 ≥400 | 有 enclosure 不可达（含状态码） | 逐条明细 + 单集行标红 | ❌ |
| `ENCLOSURE_TYPE_MISMATCH` | 响应 `contentType` 既非 `audio/*` 也非 `application/octet-stream` | enclosure 指向的资源不是音频 | 逐条明细 | ❌ |
| `ENCLOSURE_LENGTH_MISMATCH` | 声明 length 与响应 `contentLength` 数值不等 | 声明的 length 与实际字节数不一致 | 逐条明细 | ❌ |
| `DURATION_MISSING` | enclosure 可达且类型/长度均吻合，但该 item 无时长（`buildFeed` 产物必有时长，此码主要面向**导入的外部 feed**） | 单集缺少时长 | 逐条明细 | ❌ |

注：`ENCLOSURE_UNREACHABLE` 的既有实现消息按**逐个不可达条目各追加一条**（消息内计数固定写 1），界面汇总显示时以 `checks[]` 明细为准，不重复渲染同一句。

## 七、流程

### 7.1 首次接入时序（文字版）

```
[用户/mulpub]                                        [小宇宙等聚合端]
1 配频道（F1）→ 2 加单集（F2，外链或托管回填 URL）
3 生成 feed（F3：校验 fail-closed → 落盘 feed.xml，见 §八.2）
4 使 feed 公网可达（用户自行把 feed.xml 部署到 https 可访问位置；
   对每条 enclosure 跑自检 F4：可达、类型、length 一致）
5 首次收录——人工、一次性：在小宇宙 App「我的 → 播客投稿/创建节目」
   粘贴 mulpub 提供的 RSS 地址提交
                         └─→ [人工审核收录，通常 1~7 天，期间不得变更 feed 地址]
6 聚合端定时抓取 RSS → 频道与全部单集出现在小宇宙
7 此后逐期：mulpub「发布单集」= 追加 <item> 并重建 feed（§7.2）
                         └─→ 聚合端下一轮抓取自动出现新单集（小时级延迟）
     （Apple Podcasts / Spotify 用同一 RSS 地址在各自网页端提交一次，见分发端目录）
```

- 步骤 5 **无 web 表单证据**（调研结论），产品上不承诺代提交，只做"提交指引 + 一键复制 RSS 地址"。
- 分发端目录（`podcast-endpoints.json`）逐端承载：提交方式（`submitChannel: app|web`）、提交入口（web 端 `submitUrl`，app 端为 null）、`requiresManualFirstSubmit: true`、审核时效 `timing`、步骤 `steps`、取证日期 `verifiedAt`（界面须显示"以对方后台当日实况为准"）。

### 7.2 「单集发布 = 追加 item 并更新 feed」的判定与验收口径

- **动作定义**：向频道追加一条合法单集 → 校验通过 → 重建全量 feed（物理实现是**整体覆盖**——`buildFeed` 输出完整 XML，逻辑语义才是"追加"）。
- **验收主判据 = "RSS 生效"**：重建后的 feed 文件中出现该 `<item>`（guid 命中），且 `verifyFeed` 对该条 enclosure 判 `ok:true`。这是可控、可自动化的部分。
- **小宇宙侧展示 = 人工核对项**：聚合端抓取存在小时级延迟、且首收录含人工审核（1~7 天），**不得**把"小宇宙页面出现新单集"做成自动化验收断言；界面如实提示延迟量级（目录 `timing` 字段）。
- **失败定义**：校验不过（抛 `PODCAST_FEED_INVALID`，feed 未变更）或自检发现 enclosure 不可达（feed 已更新但需修复外链）——两者分开提示，前者"未发布"，后者"已发布但有集在聚合端侧会缺失，请修复外链后重新自检"。

## 八、功能逻辑

### 8.1 IPC 合同表

> **状态：已实现（2026-10-09 主进程刀）**，下表即运行中的合同；唯一权威实现同步见 `apps/desktop/electron/ipc-handlers/podcast.js` 文件头「通道合同」。命名沿用既有 `域:对象:动作` 风格（如 `account:check-login`）。**响应信封为 `{ code, data }`，成功恒 `code: 0`**；失败为 `{ code: EC.*, message, issues? }`（`EC` 取自 `electron/core/error-codes`），校验类失败必须携带 `issues[]`（元素形状即引擎 `{code, field, message}`），**不回传用户未发布的标题原文、音频地址查询串与 xml 正文**。渲染层参数为纯 JSON（IPC 序列化约束，响应式对象先 `JSON.parse(JSON.stringify())` 脱壳）。入参同时接受「对象本体」与 `{ <key>: 对象 }` 两种载荷形状（`unwrapObject` 只判形状，字段校验唯一实现在引擎）。

| 通道 | 请求 | 成功响应 | 错误/失败 |
| --- | --- | --- | --- |
| `podcast:channel:get` | 无参 | `{code:0, data:{channel}}`（未配置时 `channel:null`） | 读盘失败 `{code:EC.REQUEST_ERROR, message}`；存储损坏 `PODCAST_STORE_CORRUPT` |
| `podcast:channel:save` | 频道对象（或 `{channel:{…}}`） | `{code:0, data:{channel}}`（允许半成品，非 fail-closed） | 字段级 `{code:EC.VALIDATION_ERROR, message, issues}`（口径= `validateChannel`） |
| `podcast:episode:list` | 无参 | `{code:0, data:{episodes}}`（按 pubDate 倒序，与 feed 一致；总数由渲染层取 `episodes.length`） | 同上读盘/损坏码 |
| `podcast:episode:save` | 单集对象（可含 guid） | `{code:0, data:{episode}}`；命中既有判重键=**原地更新**（保留原创建时间） | `{code:EC.VALIDATION_ERROR, message, issues}`（口径= `validateEpisode`；判重冲突按 `EPISODE_DUPLICATE`） |
| `podcast:episode:remove` | `{guid}` | `{code:0, data:{removed}}` | guid 缺失 → `{code:EC.NOT_FOUND, message}` |
| `podcast:feed:build` | 无参（以已保存频道+列表为源） | `{code:0, data:{path, itemCount, bytes}}`；**校验不过不得写文件** | `{code:EC.VALIDATION_ERROR, message, issues}`（引擎原样透传 `err.issues`，`code:'PODCAST_FEED_INVALID'` 在 issues 内） |
| `podcast:feed:verify` | 无参（或 `{xml?}` 校验外部 feed） | `{code:0, data:{issues, checks, itemCount}}`（`headImpl` 由调用方显式注入；结构检查始终做、可达检查仅在注入时做） | 网络异常**不是** IPC 错误：逐条落 `checks[].reason='ENCLOSURE_UNREACHABLE'` |
| `podcast:endpoints:list` | 无参 | `{code:0, data:{endpoints}}`（`listPodcastEndpoints()` 原样，目录顺序即 `['xiaoyuzhou','apple_podcasts','spotify']`；提交链接渲染前走 `podcastEndpointHref()`） | `{code:EC.REQUEST_ERROR, message}` |

### 8.2 feed 文件落盘位置与覆盖策略（已实现，2026-10-09 主进程刀）

- 落盘位置：`<userData>/podcast/` 下三份文件——`channel.json`（频道，单频道不设 channelId 子目录）、`episodes.json`（单集列表）、`feed.xml`（构建产物）；引擎为纯函数不落盘，写文件由主进程 `podcast-channel-service.js` 负责（目录常量与文件名由 `module.exports.PODCAST_FILES` 单点导出，消费方禁止另抄路径）。
- **覆盖策略**：每次 `podcast:feed:build` 校验通过后**整体覆盖**写入（逻辑"追加 item"= 全量重建）；写入采用临时文件 + 原子 rename（对齐本仓 Windows 原子替换门禁：仅 `EPERM/EACCES/EBUSY` 有界退避重试，其余原样抛出）。
- 校验不过：不产出、不覆盖、保留上一版 feed 并在返回值里透传 `issues`。
- feed 是**要公网可达的产物**：mulpub 是桌面应用，落盘文件本身不公网可达——产品路径为 P0 引导用户把 feed 部署到可访问处（或由 P1 直传一并上传 feed.xml，具体机制属 P1 设计，见开放问题 O3）。

### 8.3 渲染层数据流

- 页面状态唯一承载 `src/composables/usePodcastChannel.js`（组合式函数；本仓未用 Pinia 承载该页状态，与既有页面组合式先例保持一致）：频道、单集列表、自检结果、目录四类状态一处持有，页面组件只做渲染与事件转发；分发端目录**不新建第二份文案**——渲染端经该 composable import `podcast-endpoints.browser.js`（ESM 孪生，读同一 JSON），parity 由测试锁。
- `submitUrl`/`docUrl` 等一切外部 URL 绑定 `<a :href>` 前必须过共享协议判据（`podcastEndpointHref` / `safeHttpUrl`），`target="_blank"` 必带 `rel="noopener"`。

### 8.4 幂等语义（同内容重复保存不产生重复单集）

- **判重键 = `guid`；无 guid 时退化为音频地址（`audioUrl || resolvedAudioUrl`）**，与引擎 `EPISODE_DUPLICATE` 的键完全同式（`trim` 后非空）。
- 保存层：命中既有键 → **原地更新该条**（保留原创建时间），不新增行——因此"同一集误点两次保存"与"直传重传同文件回填同 URL"都不产生重复 item。
- 引擎层兜底：任何绕过保存层的写入路径（如导入外部 feed）在生成 feed 时仍会被 `EPISODE_DUPLICATE` fail-closed 拦截。
- guid 缺省时 feed 中以 enclosure URL 作 `<guid>` 输出（`isPermaLink="false"`）——外链即幂等标识，符合"同 URL 同内容"直觉。

### 8.5 与既有发布面的边界（负面合同）

- 不进入 `config/platforms.yaml` 平台段、不进入 DOM RPA `platform-selectors`、不进入 api-publish-engine 平台适配器注册表、不进入 `publish-capabilities.json`（15 平台完整性断言不变）。
- `publishMode` 三态值域保持不变（唯一真源 `packages/api-publish-engine/src/publish/core/publish-mode.js` 的 `MODES`）；任何 `rss` 裸值写进 yaml 属配置错误，**实际收口点在路由决策**：`api-router.decideRoute` 先经 `normalizeMode` 归一，非法值抛 `/unknown publishMode/` fail-closed（`config-loader` 侧不另加第二份枚举校验，避免口径分裂）。回归锁：`packages/api-publish-engine/test/publish-mode-config.test.js`「ADR-0008 正交闸」describe——断言 `MODES` 值域恰为三态、`normalizeMode('rss')` 与 `decideRoute({mode:'rss'})` 均抛错、`platforms.yaml` 键集不含任何分发端 id。
- 发布历史/发布进度事件：P0 不接入 `publish:progress` 相位枚举（feed 生成是本地动作，非平台任务）；是否把"feed 更新成功/失败"接入终态属实现刀架构评审事项（若接入，`PHASE_ENUM`/`TERMINAL_PHASES` 三处同步为既有纪律）。

## 九、交互逻辑

页面「播客频道」三区块（已实现，2026-10-09 渲染层刀；下述为规范，实现偏差见 §9.1）：

**A. 频道配置区**：表单字段=§5.2；【保存】随时可用（半成品允许，字段内联显示 §6.2 issues）；封面尺寸输入框旁实时显示校验结果（正方形/1400~3000/无法解析三态）；`ownerEmail` 字段下固定提示「该邮箱会公开出现在 RSS 中」。

**B. 单集列表区**：倒序列表（期号/标题/时长/体积/发布日期/外链状态徽标）；【添加单集】打开表单：音频来源二选一「粘贴外链 / 选择本地文件（P0 提示需先有外链，P1 走直传）」；外链失焦即做 https 协议判据预检；【保存】走 `podcast:episode:save`（幂等语义）；【删除】需确认弹窗；体积人类可读（KB/MB/GB，渲染层格式化，`sizeBytes` 原值持久化）；时长 `HH:MM:SS`/`MM:SS`（与引擎 `formatDuration` 同口径，禁止第二份实现）。

**C. RSS 输出与分发端指引区**：
- 【生成/更新 feed】：进行中按钮 loading；失败 → 面板顶部错误条 + issues 逐条列表，**每条可点击定位到 A/B 区对应字段**；成功 → 显示单集数与生成时刻。
- 【自检 feed】：进度按 enclosure 逐条出 `checks[]` 明细（可达 ✓/状态码/类型不符/长度不符）；网络异常按"本轮无结论（不可达）"如实显示，不重试冒充成功。
- 【复制 RSS 地址】：复制 feed 公网地址；feed 尚未部署公网可达时按钮禁用并提示原因（不得复制一个不可达地址冒充成功）。
- **提交指引卡片**（每分发端一张，按 `ENDPOINT_ORDER`）：端名、提交方式徽标（App 内 / 网页）、`requiresManualFirstSubmit:true` → 固定文案「首次收录需人工提交，mulpub 无法代提交」、`timing` 审核时效原文、`steps` 步骤逐条编号展示、web 端提供过判据的提交入口链接、`verifiedAt` + 「以对方后台当日实况为准」。
- 未配置托管（存在仅 `localFilePath` 的单集）：生成 feed 会被 `EPISODE_HOSTING_NOT_CONFIGURED` 拦截 → 界面把该单集标红并给出两条引导路径「填写音频外链」/「配置对象存储直传（P1，即将上线）」。
- 取消：feed 生成与自检为本地/短网络动作，不提供取消按钮，按钮置灰防重复点击即可；删除单集/清空频道等破坏性动作必须确认弹窗。

### 9.1 实现偏差（2026-10-09 渲染层刀实测，逐条如实记录）

| 规范条目 | 实现现状 | 处置 |
| --- | --- | --- |
| A 区封面尺寸输入框旁「实时」显示正方形/1400~3000/无法解析三态 | 只有输入框与占位提示（`podcast-field-cover-size`），三态判定只在保存/生成 feed 时经 `validateChannel` 以 issues 形式回显，无输入即时提示 | 保留为 P1 体验项；不改判定口径（判定仍只有引擎一份） |
| C 区 issues「每条可点击定位到 A/B 区对应字段」 | issues 以纯文本列表渲染（`podcast-issue`），不可点击 | 保留为 P1 体验项 |
| C 区【复制 RSS 地址】复制公网地址、未部署时禁用 | 按钮复制的是**本地 feed 文件路径**（`podcast-feed-copy` → `onCopyFeedPath`），失败时 `podcast.publish.copyFailed` 提示；无「公网地址」概念 | 与 O3（feed 公网可达机制属 P1）一致：P0 无公网地址可复制，故复制本地路径而非禁用一个空按钮；文案已按「复制路径」写，不冒充「RSS 地址」 |
| B 区【删除】需确认弹窗 | 行内二次确认（`podcast-episode-delete-confirm-text` + yes/no 两个按钮），非模态弹窗 | 等价满足「破坏性动作必须确认」；不接入浮层挂起合同（`overlay view suspension`）正是因为不是模态浮层 |
| 音频来源「选择本地文件」入口 | P0 仅提供外链输入；本地文件与直传入口未渲染 | 与 §四 P0 范围一致，非偏差 |

其余条目（半成品可保存、字段内联 issues、`ownerEmail` 公开提示、倒序列表、时长/体积格式化、自检 `checks[]` 明细、提交指引卡片按 `ENDPOINT_ORDER` 与 `requiresManualFirstSubmit`/`timing`/`steps`/`verifiedAt` 展示、生成中按钮禁用防重复点击）均已按规范落地。

## 十、显示项

| 界面元素 | 显示内容 | 格式/规则 |
| --- | --- | --- |
| 单集时长 | `durationSec` 格式化 | `formatDuration` 口径：不足一小时 `MM:SS`（如 `05:30`），≥一小时 `HH:MM:SS`（如 `01:02:03`）——与 feed 内 `<itunes:duration>` 逐字一致 |
| 单集体积 | `sizeBytes` | 渲染层人类可读（`B/KB/MB/GB` 一档，保留 1 位小数）；存储与校验一律原值整数 |
| 发布日期 | `pubDate` | 界面本地化日期 `YYYY-MM-DD HH:mm`；feed 内为 RFC-2822 GMT（`toRfc2822`）——两形态同源一字段，界面不得反向把本地化串当数据存 |
| 外链状态徽标 | 最近一次自检结果 | 可达（绿）/ 不可达含状态码（红）/ 类型不符（红）/ 长度不符（黄）/ 未自检（灰） |
| 封面校验结果 | `coverSize` 解析态 | 「3000×3000 ✓」/「非正方形 ✗」/「边长须在 1400~3000」/「无法解析尺寸」 |
| 单集计数 | `total` / `ITEMS_MAX` | `n / 1000`；达上限时【添加】禁用并说明 |
| feed 生成时刻 | `lastBuildDate` | 界面本地化；feed 内 GMT |
| 分发端卡片 | `name/submitChannel/timing/steps/verifiedAt` | `submitUrl` 仅 web 端显示为链接（过 `podcastEndpointHref`）；app 端显示「在小宇宙 App 内操作」；`evidence` 为内部取证字段，默认不整段外显（可折叠"收录依据"） |
| 空态 | 无单集 / 自检无结果 | 如实文案：「还没有单集——feed 至少需要 1 期才能生成」/「尚未自检」；**不得硬凑**目录内容或示例数据填充列表 |

## 十一、提示文字（locales `podcast` 命名空间，zh/en 成对）

> 键名风格对齐既有 locales（顶层 `podcast: {}`，camelCase 子键；先例 `publish:`/`settings:`）。渲染层非 locales 文件禁止新增中文字面量（CJK 基线扫描）；校验类 issue 的 zh 文案以引擎 `issue.message` 为底稿（shared-utils 属数据层中文，PLATFORM_NAMES 先例），en 侧由渲染层按 `podcast.errors.<CODE>` 映射——**下表 code 行即为错误映射的单一清单**，新增码必须成对补键。

### 11.1 界面 chrome（表单标签/占位/按钮/状态）

| key | zh | en |
| --- | --- | --- |
| podcast.page.title | 播客频道 | Podcast Channel |
| podcast.page.subtitle | 生成 Podcast RSS，一次提交收录、此后每期自动同步 | Generate a Podcast RSS feed — submit once for inclusion, every episode syncs automatically after |
| podcast.channel.section | 频道设置 | Channel Settings |
| podcast.channel.title | 节目名称 | Show Title |
| podcast.channel.titlePlaceholder | 不超过 255 个字符 | Up to 255 characters |
| podcast.channel.description | 节目简介 | Description |
| podcast.channel.subtitle | 副标题 | Subtitle |
| podcast.channel.language | 语言 | Language |
| podcast.channel.coverUrl | 封面地址 | Cover URL |
| podcast.channel.coverSize | 封面尺寸 | Cover Size |
| podcast.channel.coverSizeHint | 正方形，边长 1400~3000 像素，形如 3000x3000 | Square, 1400–3000 px per side, e.g. 3000x3000 |
| podcast.channel.link | 节目站点（可选） | Website (optional) |
| podcast.channel.author | 作者/主播 | Author |
| podcast.channel.ownerName | 所有者名称 | Owner Name |
| podcast.channel.ownerEmail | 所有者邮箱 | Owner Email |
| podcast.channel.ownerEmailPrivacy | 该邮箱会公开出现在 RSS 中 | This email is published in the RSS feed |
| podcast.channel.explicit | 内容分级 | Explicit Rating |
| podcast.channel.feedType | 节目类型 | Feed Type |
| podcast.channel.category | 播客分类 | Podcast Category |
| podcast.channel.save | 保存频道 | Save Channel |
| podcast.channel.saved | 频道已保存 | Channel saved |
| podcast.episode.section | 单集 | Episodes |
| podcast.episode.add | 添加单集 | Add Episode |
| podcast.episode.title | 单集标题 | Episode Title |
| podcast.episode.audioUrl | 音频外链 | Audio URL |
| podcast.episode.audioUrlPlaceholder | https 开头的音频绝对地址 | Absolute https audio URL |
| podcast.episode.localFile | 本地音频文件 | Local Audio File |
| podcast.episode.duration | 时长 | Duration |
| podcast.episode.size | 体积 | Size |
| podcast.episode.pubDate | 发布时间 | Publish Date |
| podcast.episode.number | 期号 | Episode No. |
| podcast.episode.season | 季号 | Season No. |
| podcast.episode.episodeType | 单集类型 | Episode Type |
| podcast.episode.mime | 音频格式 | Audio MIME |
| podcast.episode.guid | 唯一标识（可留空，默认用音频地址） | GUID (optional, defaults to audio URL) |
| podcast.episode.save | 保存单集 | Save Episode |
| podcast.episode.saved | 单集已保存 | Episode saved |
| podcast.episode.updated | 已更新同标识的既有单集 | Existing episode with same identifier updated in place |
| podcast.episode.delete | 删除单集 | Delete Episode |
| podcast.episode.deleteConfirm | 删除后 feed 将在下次生成时移除该集，已收录端会保留历史缓存。确认删除？ | The feed will drop this item on next build; aggregators may keep cached copies. Delete? |
| podcast.feed.section | RSS 输出 | RSS Output |
| podcast.feed.build | 生成 / 更新 feed | Build / Update Feed |
| podcast.feed.building | 正在生成… | Building… |
| podcast.feed.built | feed 已生成（{count} 期） | Feed built ({count} episodes) |
| podcast.feed.buildFailed | 未生成：存在 {count} 项校验问题 | Not generated: {count} validation issues |
| podcast.feed.verify | 自检 feed | Verify Feed |
| podcast.feed.verifying | 自检中… | Verifying… |
| podcast.feed.verifyOk | 自检通过：{count} 个音频全部可达 | Verification passed: all {count} enclosures reachable |
| podcast.feed.verifyFailed | {count} 个 enclosure 异常，聚合端可能缺集 | {count} enclosure problems; episodes may be missing on aggregators |
| podcast.feed.copyUrl | 复制 RSS 地址 | Copy RSS URL |
| podcast.feed.copied | RSS 地址已复制 | RSS URL copied |
| podcast.feed.notDeployed | feed 尚未公网可达，无法复制有效地址 | Feed is not publicly reachable yet; no valid URL to copy |
| podcast.feed.emptyEpisodes | 还没有单集——feed 至少需要 1 期才能生成 | No episodes yet — a feed needs at least 1 episode |
| podcast.feed.countLimit | 单集数已达上限 1000 | Episode limit of 1000 reached |
| podcast.endpoint.section | 分发端提交指引 | Distribution Endpoint Guides |
| podcast.endpoint.appNote | 首次收录需人工提交，mulpub 无法代提交 | First inclusion requires manual submission; mulpub cannot submit for you |
| podcast.endpoint.manual | 需一次性人工提交 | One-time manual submission required |
| podcast.endpoint.timing | 审核与同步时效 | Review & Sync Timing |
| podcast.endpoint.steps | 提交步骤 | Submission Steps |
| podcast.endpoint.openSubmit | 打开发布端 | Open Distributor |
| podcast.endpoint.verifiedAt | 收录情况取证于 {date}，以对方后台当日实况为准 | Verified on {date}; subject to the distributor's current UI |
| podcast.endpoint.submitApp | 请在 {name} App 内操作 | Submit inside the {name} app |
| podcast.hosting.guideTitle | 需要稳定的音频外链 | You need a stable audio URL |
| podcast.hosting.guideP0 | 为每集填写已有外链 | Provide an existing URL for each episode |
| podcast.hosting.guideP1 | 对象存储直传（规划中，即将上线） | Upload to your own object storage (planned) |
| podcast.error.issueAnchor | 查看具体校验问题 | See detailed validation issues |

### 11.2 校验错误映射（`podcast.errors.<CODE>`；zh 列即引擎原文）

| key | zh（引擎原文） | en |
| --- | --- | --- |
| podcast.errors.CHANNEL_MISSING | 频道配置缺失 | Channel configuration missing |
| podcast.errors.CHANNEL_TITLE_REQUIRED | 频道标题不能为空 | Show title is required |
| podcast.errors.CHANNEL_TITLE_TOO_LONG | 频道标题不得超过 255 字符 | Show title must be ≤ 255 characters |
| podcast.errors.CHANNEL_DESC_REQUIRED | 频道简介不能为空 | Description is required |
| podcast.errors.CHANNEL_DESC_TOO_LONG | 频道简介不得超过 4000 字符 | Description must be ≤ 4000 characters |
| podcast.errors.CHANNEL_SUBTITLE_TOO_LONG | 副标题不得超过 120 字符 | Subtitle must be ≤ 120 characters |
| podcast.errors.CHANNEL_LANGUAGE_INVALID | 语言需形如 zh-CN / en-US | Language must look like zh-CN / en-US |
| podcast.errors.CHANNEL_COVER_REQUIRED | 封面地址不能为空 | Cover URL is required |
| podcast.errors.CHANNEL_COVER_NOT_HTTPS | 封面必须是 https 绝对地址 | Cover must be an absolute https URL |
| podcast.errors.CHANNEL_COVER_SIZE_UNKNOWN | 封面尺寸需形如 3000x3000 以便校验 | Cover size must be declared like 3000x3000 |
| podcast.errors.CHANNEL_COVER_NOT_SQUARE | 封面必须为正方形 | Cover must be square |
| podcast.errors.CHANNEL_COVER_SIZE_OUT_OF_RANGE | 封面边长须在 1400~3000 之间 | Cover side must be 1400–3000 px |
| podcast.errors.CHANNEL_LINK_NOT_HTTPS | 站点地址必须是 https 绝对地址 | Website must be an absolute https URL |
| podcast.errors.CHANNEL_AUTHOR_REQUIRED | 作者/主播名不能为空 | Author is required |
| podcast.errors.CHANNEL_OWNER_EMAIL_INVALID | 所有者邮箱格式非法 | Invalid owner email format |
| podcast.errors.CHANNEL_EXPLICIT_INVALID | 分级取值须为 yes/no/clean | Rating must be yes/no/clean |
| podcast.errors.CHANNEL_FEED_TYPE_INVALID | feed 类型取值须为 episodic/serial | Feed type must be episodic/serial |
| podcast.errors.CHANNEL_CATEGORY_REQUIRED | 播客分类不能为空 | Category is required |
| podcast.errors.CHANNEL_CATEGORY_UNKNOWN | 未知顶级分类「{top}」 | Unknown top-level category "{top}" |
| podcast.errors.CHANNEL_SUBCATEGORY_UNKNOWN | 「{top}」下不存在子分类「{sub}」 | Subcategory "{sub}" does not exist under "{top}" |
| podcast.errors.CHANNEL_CATEGORY_TOO_DEEP | 分类最多两级 | Categories allow at most two levels |
| podcast.errors.EPISODE_MISSING | 单集数据缺失 | Episode data missing |
| podcast.errors.EPISODE_TITLE_REQUIRED | 单集标题不能为空 | Episode title is required |
| podcast.errors.EPISODE_TITLE_TOO_LONG | 单集标题不得超过 255 字符 | Episode title must be ≤ 255 characters |
| podcast.errors.EPISODE_DESC_TOO_LONG | 节目简介不得超过 4000 字符 | Episode description must be ≤ 4000 characters |
| podcast.errors.EPISODE_SUBTITLE_TOO_LONG | 副标题不得超过 120 字符 | Episode subtitle must be ≤ 120 characters |
| podcast.errors.EPISODE_AUDIO_REQUIRED | 音频地址不能为空（音频必须是 https 绝对地址；仅有本地文件时须先配置托管直传） | Audio URL is required |
| podcast.errors.EPISODE_AUDIO_NOT_HTTPS | 音频必须是 https 绝对地址；仅有本地文件时须先配置托管直传 | Audio must be an absolute https URL |
| podcast.errors.EPISODE_HOSTING_NOT_CONFIGURED | 仅有本地文件，须先配置托管直传 | Only a local file exists; configure object-storage upload first |
| podcast.errors.EPISODE_DURATION_INVALID | 时长须为 1~86400 的整数秒 | Duration must be an integer of 1–86400 seconds |
| podcast.errors.EPISODE_SIZE_REQUIRED | enclosure 必须声明 length（字节数） | Enclosure must declare byte length |
| podcast.errors.EPISODE_SIZE_INVALID | 字节数须为正整数 | Byte length must be a positive integer |
| podcast.errors.EPISODE_EXPLICIT_INVALID | 分级取值须为 yes/no/clean | Rating must be yes/no/clean |
| podcast.errors.EPISODE_TYPE_INVALID | 类型取值须为 full/trailer/bonus | Type must be full/trailer/bonus |
| podcast.errors.EPISODE_PUBDATE_INVALID | 发布时间无法解析 | Unparseable publish date |
| podcast.errors.EPISODE_COVER_NOT_HTTPS | 单集封面必须是 https 绝对地址 | Episode cover must be an absolute https URL |
| podcast.errors.EPISODE_MIME_INVALID | 音频 MIME 须为 audio/mpeg/audio/mp4/audio/x-m4a/audio/aac/audio/ogg/audio/wav | Audio MIME not in whitelist |
| podcast.errors.EPISODE_GUID_TOO_LONG | guid 不得超过 500 字符 | GUID must be ≤ 500 characters |
| podcast.errors.EPISODE_NUMBER_INVALID | 期号须为正整数 | Episode number must be a positive integer |
| podcast.errors.EPISODE_SEASON_INVALID | 季号须为正整数 | Season must be a positive integer |
| podcast.errors.EPISODES_EMPTY | feed 至少需要一个单集 | A feed needs at least one episode |
| podcast.errors.EPISODES_TOO_MANY | 单集数不得超过 1000 | At most 1000 episodes per feed |
| podcast.errors.EPISODE_DUPLICATE | 存在重复的 guid/音频地址 | Duplicate GUID / audio URL found |
| podcast.errors.PODCAST_FEED_INVALID | 校验未通过，feed 未生成 | Validation failed; feed not generated |
| podcast.errors.FEED_NO_ITEMS | feed 中没有任何单集 | Feed contains no items |
| podcast.errors.FEED_MISSING_ITUNES_NS | 缺少 itunes 命名空间 | itunes namespace missing |
| podcast.errors.FEED_MISSING_XML_DECL | 缺少 XML 声明 | XML declaration missing |
| podcast.errors.ENCLOSURE_MISSING | 存在没有 enclosure 的单集 | An item has no enclosure |
| podcast.errors.ENCLOSURE_NOT_HTTPS | 存在非 https 的 enclosure | A non-https enclosure found |
| podcast.errors.ENCLOSURE_UNREACHABLE | 有 enclosure 不可达（状态 {status}） | Enclosure unreachable (status {status}) |
| podcast.errors.ENCLOSURE_TYPE_MISMATCH | enclosure 指向的资源不是音频 | Enclosure is not an audio resource |
| podcast.errors.ENCLOSURE_LENGTH_MISMATCH | 声明的 length 与实际字节数不一致 | Declared length mismatches actual bytes |
| podcast.errors.DURATION_MISSING | 单集缺少时长 | Episode duration missing |

## 十二、验收标准（整体验收）

1. **引擎**：`podcast-rss.test.js`（25 例）+ `podcast-endpoints.test.js`（8 例）全绿；校验码表（§六）与测试断言逐码对齐，新增码必须同时出现在两侧。
2. **首次收录闭环（人工核对项）**：按 §7.1 时序走一遍——生成的 feed 通过外部校验（可被聚合端解析）；小宇宙 App 提交入口按指引可达；审核期内不改 feed 地址。
3. **逐期自动同步**：追加单集 → 重建 feed → 轮询自家 feed 出现新 item（主判据）；小宇宙侧小时级出现（人工核对，不作为自动化断言）。
4. **负面验收**：任一必填缺失/协议非法/枚举非法 ⇒ 生成失败且不产出文件；重复 guid ⇒ 保存层原地更新、引擎层 duplicate 拦截；分发端 id 出现在任一平台契约面 ⇒ `podcast-endpoints.test.js` 变红。
5. **文案验收**：§十一 locales 键 zh/en 成对提交（CI Gate 7）；渲染层非 locales 文件中文字面量零新增（CJK 基线扫描）；界面不出现竞品品牌名（Gate 12）。

## 十三、非功能需求

- **性能**：feed 构建为**纯本地**内存操作（排序 O(n log n)，上限 1000 集），目标 < 1s；自检逐 enclosure 串行 HEAD（`headImpl` 由消费方注入，建议实现刀加并发上限与单请求硬超时，超时语义="本轮无结论"，不得把超时当可达或不可达的定论）。
- **隐私**：日志**不得记录**未发布草稿的单集标题原文与音频 URL 的查询串（先例：标题助理门禁日志只记计数与长度）；`verifyFeed` 只读 `status/contentType/contentLength`，不抓取响应体；所有者邮箱进 feed 是 Podcast 协议要求，界面必须提前告知（§九.A）。
- **网络**：引擎零出站（`headImpl` 注入点唯一）；无网络时生成/保存/指引全部可用（首收录指引为纯文案）。
- **可访问性/稳定**：分发端目录的 `verifiedAt` 必须随界面展示——收录流程属外部事实，改版后须重新取证（目录 JSON comment 已写明）。

## 十四、风险与开放问题

| # | 风险/问题 | 说明与缓解 |
| --- | --- | --- |
| R1 | 聚合端缓存音频导致托管带宽暴露 | 调研 §8.0：聚合端收录时会把音频**一次性拉取回流**到自家 CDN，用户播放通常走聚合端缓存源，带宽暴露主要是一次性量级、不是播放量持续乘法。前提若变（客户端直拉原始 URL 的比例上升），形态 B/C 的成本模型需重估 |
| R2 | 外链失效 → 小宇宙侧缺集 | feed 更新后抓取失败即该集在聚合端缺失且不可补推体验。缓解 = `verifyFeed` 自检 + P1 定期巡检（F9）+ 发布窗口内保持外链稳定 |
| R3 | 双实现漂移 | **已闭合（2026-10-09 主进程刀）**：`packages/api-publish-engine/src/podcast/feed-schema.js` 早期草稿（校验码集与 shared-utils 有漂移：多 `CHANNEL_COVER_INVALID/CHANNEL_LINK_INVALID`、少 `EPISODE_SIZE_REQUIRED/CHANNEL_CATEGORY_TOO_DEEP/feedType/subtitle` 族、MIME 派生兜底值不同）已从源码树移出，仓库内零引用，**单一真源 = `packages/shared-utils/src/podcast-rss.js`**。草稿留档 `%TEMP%/podcast-feed-schema-divergent-draft.js` 可恢复（本机缺 `mavis-trash` CLI，`scripts/safe-delete.js` 按设计拒绝删除，故走「可逆移出」而非删）。残留监控：若有人把草稿搬回，漂移以「两侧校验码集不一致」在构建期暴露而非静默通过（`podcast-endpoints.test.js` / `publish-mode-config.test.js` 只认真源侧口径） |
| R4 | 审核时效不可控 | 小宇宙首次收录 1~7 天人工审核、聚合端抓取小时级延迟，均非产品可承诺 SLA；文案一律引用目录 `timing` 并带 `verifiedAt`（"以对方后台当日实况为准"） |
| R5 | feed 公网部署路径 | 桌面应用落盘的 feed.xml 本身不公网可达（§8.2）；P0 依赖用户自行部署或已有托管商 feed 中转，**体验断点**。开放问题 O3：P1 直传是否连带上传 feed.xml 到用户桶固定 key（推荐方向，属实现设计） |
| O1 | 多频道支持 | 引擎不限制；P0 产品决策先做单频道（`channelId='default'`）。多频道时 feed 落盘目录与指引卡片归属需重新设计 |
| O2 | 收录状态观测（各端页面轮询） | 涉及新增第三方读取面，按既有红线届时先过相关性/合规判据，不进 P0/P1 |
| O6 | `link` 缺省兜底占位 `https://example.com/` | 引擎既有行为；RSS 2.0 的 channel `<link>` 必填导致必须兜底，界面应强烈引导用户填写真实站点（校验已允许留空，属有意宽松） |

## 十五、实现状态对照（事实表）

| 组件 | 状态 |
| --- | --- |
| `packages/shared-utils/src/podcast-rss.js`（引擎） | ✅ 已实现（未跟踪文件，随本 PR 首次入库） |
| `packages/shared-utils/src/podcast-endpoints.{json,js,browser.js}`（目录 + 双版本） | ✅ 已实现 |
| `podcast-rss.test.js` 25 例 + `podcast-endpoints.test.js` 8 例 | ✅ 已实现，本机实跑 33 passed（2026-10-09） |
| 主进程服务 / IPC handlers（§8.1） | ✅ 已实现并接线（2026-10-09）：`electron/services/podcast-channel-service.js`（`channel.json`/`episodes.json`/`feed.xml` 三份、原子替换 + Windows 有界退避、损坏即 `PODCAST_STORE_CORRUPT` fail-closed）+ `electron/ipc-handlers/podcast.js`（8 通道，**字面量**注册以让 `ipc-contract.test.js` 看得见）+ `electron/preload/podcast.js`（`electronAPI.podcast`，已在 `preload/index.js` 与两个 bundle 暴露）。**唯一未接**：`headImpl` 的主进程 `net` 版 HEAD provider —— 缺省不注入即跳过网络检查（生产零真实出站，日志标 `head=off`），接线属 F9 巡检刀 |
| 渲染层页面 / 状态 / locales `podcast` 命名空间（§九~§十一） | ✅ 已实现（2026-10-09）：`src/views/PodcastChannelView.vue`（三区块）+ `src/composables/usePodcastChannel.js` + 路由/侧边菜单/`useTabDocumentTitle` 注册 + zh/en **成对** locale。**偏差声明**：状态用域组合式 `usePodcastChannel` 而非 §九原写的 `stores/podcast.js`（本页单页自持、无跨页共享，与仓内同类页口径一致）；表单↔引擎键名（`category`+`subCategory` ↔ `categoryId`）的唯一映射点是模块级 `channelFormToPayload`/`channelPayloadToForm`，由 `usePodcastChannel-contract.test.js` 证明其承重 |
| 视觉回归登记（QM-4） | ❌ **本刀未做，且不可在同刀闭合**：像素基线只能取 CI artifact（AGENTS QM-4 第 7 条），登记与首张基线必须同次发生。侧边菜单新增条目会改变所有含侧栏视图的全页像素，若 `QG Visual` 变红，正解是按同一次 run 的 CI 渲染重建受影响基线，**不得**提阈值 |
| OSS/COS 直传（P1 F7~F9） | 🟡 **规则层已实现、尚未接线**：`electron/services/podcast-hosting-upload.js`（托管配置资格 fail-closed、`object_key` 派生禁标题/禁穿越、公网 URL 拼接、OSS V1 待签串结构断言、签名头不外泄凭证、MIME 复用共享实现）+ 34 例锁；除自身测试外无消费者，上传动作与回填 `resolvedAudioUrl` 属 P1 刀（tasks §7） |
| 代托管（P2） | ❌ 规划，未启动（三前置条件见 §三） |
| `api-publish-engine/src/podcast/feed-schema.js` 草稿 | ✅ 已从源码树移出（R3 闭合，见上表 R3 行；仓库内零引用） |
