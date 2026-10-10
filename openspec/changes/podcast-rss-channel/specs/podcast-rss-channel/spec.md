# podcast-rss-channel (delta: podcast-rss-channel)

## ADDED Requirements

### Requirement: Podcast RSS 生成 fail-closed

`packages/shared-utils/src/podcast-rss.js` 的 `buildFeed()` SHALL 先执行频道+单集全量校验；存在任一 issue 时 MUST 抛出 `err.code='PODCAST_FEED_INVALID'` 并携带 `err.issues`（元素形状 `{code, field, message}`），且 MUST NOT 产出或覆盖任何 feed 文件。保存草稿口径（`validateChannel`/`validateEpisode` 返回 `{ok, issues}` 不抛错）与生成口径（fail-closed）MUST 分离，MUST NOT 混用。校验通过时输出 MUST 含 XML 声明、`xmlns:itunes` 与 `xmlns:content` 命名空间、按 `pubDate` 倒序的 `<item>` 列表（最新在前），时长格式 MUST 为 `formatDuration` 两档口径（不足一小时 `MM:SS`，否则 `HH:MM:SS`）。

#### Scenario: 非法单集不产出文件
- **WHEN** 以 `durationSec` 为 null 的单集调用 `buildFeed`
- **THEN** 抛出 `code='PODCAST_FEED_INVALID'` 且 `issues` 精确等于 `['EPISODE_DURATION_INVALID']` 对应项；无任何文件写入发生

#### Scenario: 产物可解析回同构字段
- **WHEN** `buildFeed` 产物交给 `parseFeed`
- **THEN** `audioUrl/sizeBytes/mime/durationSec/coverUrl` 与输入逐字段一致（往返锁）

### Requirement: 字段校验口径单一真源

频道与单集的字段上限、枚举、正则与封面尺寸规则 SHALL 由 `podcast-rss.js` 单一持有（`TITLE_MAX=255`、`SUMMARY_MAX=4000`、`SUBTITLE_MAX=120`、`DURATION_MAX_SEC=86400`、`ITEMS_MAX=1000`、封面正方形且边长 `COVER_MIN_PX=1400`~`COVER_MAX_PX=3000`、`EXPLICIT_VALUES=yes/no/clean`、`EPISODE_TYPE_VALUES=full/trailer/bonus`、`EPISODE_FEED_TYPE_VALUES=episodic/serial`、`AUDIO_MIME_VALUES` 六值白名单、`LANGUAGE_RE`、`EMAIL_RE`、`ITUNES_CATEGORIES` 白名单最多两级）。所有 URL 字段 MUST 复用共享协议判据 `safe-http-url` 并收紧为 https-only；消费方 MUST NOT 新增第二份协议正则。分类校验 MUST 产出可区分的码：必填缺失 / 未知顶级 / 未知子级 / 超过两级。

#### Scenario: 空频道精确码数组
- **WHEN** `validateChannel({})`
- **THEN** issues 码按序精确等于 `CHANNEL_TITLE_REQUIRED, CHANNEL_DESC_REQUIRED, CHANNEL_COVER_REQUIRED, CHANNEL_AUTHOR_REQUIRED, CHANNEL_OWNER_EMAIL_INVALID, CHANNEL_CATEGORY_REQUIRED`

#### Scenario: 协议判据拒绝非 https
- **WHEN** 单集 `audioUrl` 为 `http://`、`//host/x`、`a.com/x` 或 `javascript:` 形态
- **THEN** 产出 `EPISODE_AUDIO_NOT_HTTPS`，不得进入 feed

### Requirement: 单集 enclosure 三态解析与托管引导

单集音频 SHALL 按 `audioUrl → resolvedAudioUrl → localFilePath` 顺序解析 enclosure：前两者存在但非 https 产出 `EPISODE_AUDIO_NOT_HTTPS`；仅有 `localFilePath`（P1 直传回填前的中间态）MUST 产出 `EPISODE_HOSTING_NOT_CONFIGURED`（fail-closed 引导配置托管或填外链，而非静默使用本地路径）；三者全空 MUST 产出 `EPISODE_AUDIO_REQUIRED`。`sizeBytes` MUST 存在且为正整数（缺失即 `EPISODE_SIZE_REQUIRED`，因 enclosure `length` 是聚合端断点续传与缓存依据）。MIME 未显式声明时 MUST 按音频 URL pathname 扩展名派生且查询串不参与派生，无法识别时回落 `audio/mpeg`。

#### Scenario: 仅本地文件时报托管未配置
- **WHEN** 单集只有 `localFilePath: 'D:/a.mp3'` 且无任何外链字段
- **THEN** issues 含 `EPISODE_HOSTING_NOT_CONFIGURED`；`buildFeed` 拒绝生成

### Requirement: 单集判重幂等

feed 校验 SHALL 以 `trim(guid || audioUrl || resolvedAudioUrl)` 非空值为判重键，重复即产出 `EPISODE_DUPLICATE`。`guid` 缺省时输出 MUST 以 enclosure URL 作 `<guid isPermaLink="false">`；消费保存层 MUST 以同一判重键做「命中即原地更新」（同内容重复保存不产生第二条单集），使引擎层与保存层的幂等语义同式。

#### Scenario: 同 guid 重复保存不产生第二条
- **WHEN** 保存层收到与既有单集判重键相同的新单集
- **THEN** 原地更新既有记录（保留原创建时间），列表与 feed 中该键只出现一次

### Requirement: 分发端目录不进入平台登记契约面

播客分发端目录 SHALL 由 `packages/shared-utils/src/podcast-endpoints.json` 单一持有（CJS `podcast-endpoints.js` 与 ESM `podcast-endpoints.browser.js` 双版本消费同一份 JSON，parity 测试锁定导出集合与内容逐字同构）；`ENDPOINT_ORDER` MUST 为 `['xiaoyuzhou','apple_podcasts','spotify']`。分发端 id MUST NOT 出现在 `PLATFORM_LOGIN_URLS`、`PLATFORM_NAMES`、`PLATFORM_PUBLISH_META`、`PLATFORM_SESSION_COOKIE_MARKERS`、`PLATFORM_AUTH_HOSTS` 任一表中（`PLATFORM_NAMES` 与 `PLATFORM_PUBLISH_META` 平台数 MUST 保持 15）。目录条目 MUST 携带 `requiresManualFirstSubmit`、`timing`、非空 `steps`、`verifiedAt`（ISO 日期）与 `evidence`（取证依据），界面引用时 MUST 展示取证日期并声明「以对方后台当日实况为准」。

#### Scenario: 分发端 id 出现在平台表即红
- **WHEN** 任一分发端 id 被登记进平台登录 URL 表或发布能力注册表
- **THEN** `podcast-endpoints.test.js` 隔离断言变红（CI 拦截）

#### Scenario: 小宇宙首次提交语义如实
- **WHEN** 查询 `getPodcastEndpoint('xiaoyuzhou')`
- **THEN** `submitChannel='app'`、`submitUrl=null`、`requiresManualFirstSubmit=true`、`timing` 含「人工审核」；未知 id 返回 `null` 不抛错

### Requirement: 提交地址绑定前过共享协议判据

渲染端将分发端 `submitUrl`/`docUrl` 绑定为可点击锚点前 MUST 只使用 `podcastEndpointHref()`（内部为 `safeHttpUrl`）的产出；返回 `null` 时 MUST NOT 渲染锚点（保留文本）。`target="_blank"` MUST 同时携带 `rel="noopener"`。

#### Scenario: app 端无链接不渲染锚点
- **WHEN** 渲染小宇宙（`submitUrl=null`）的指引卡片
- **THEN** 无 `<a href>` 产出，仅显示「在 App 内操作」文案；Apple/Spotify 显示 `podcastEndpointHref` 返回的 https 地址

### Requirement: RSS 通道不扩 publishMode 三态

`config/platforms.yaml` 的 `publishMode` 值域 MUST 保持 `api-only|api-then-dom|dom-only` 三态；MUST NOT 新增 `rss` 第四态。RSS 频道 MUST 以正交通道类型在发布任务入口分流，分发端/播客频道 MUST NOT 进入 `rpa-view-manager` 的 DOM/API 轨调度集合；yaml 误配 `publishMode: rss` 时 config-loader 枚举校验 MUST fail-closed 报错（实现刀接线守卫项）。

#### Scenario: 误配裸值被枚举校验拦截
- **WHEN** 平台段写入 `publishMode: rss`
- **THEN** 加载期枚举校验报错，而不是被 `mode !== 'dom-only'` 判定静默归入 API 轨

### Requirement: feed 自检零出站与逐 enclosure 明细

`verifyFeed(xml, {headImpl})` SHALL 只做结构检查（`FEED_NO_ITEMS`/`FEED_MISSING_ITUNES_NS`/`FEED_MISSING_XML_DECL`）；仅当消费方注入 `headImpl` 时逐 enclosure 产出可达性检查，结果 MUST 以 `checks[]`（`{url, ok, reason, status}`）逐条呈现，异常码限于 `ENCLOSURE_MISSING`/`ENCLOSURE_NOT_HTTPS`/`ENCLOSURE_UNREACHABLE`/`ENCLOSURE_TYPE_MISMATCH`/`ENCLOSURE_LENGTH_MISMATCH`/`DURATION_MISSING`。`podcast-rss.js` 模块自身 MUST NOT 发起任何网络请求（`headImpl` 是唯一注入点）；自检属运维预警口径，MUST NOT 反向阻断 `buildFeed` 的既有 fail-closed 生成口径。响应 `contentType` 为 `application/octet-stream` 时 MUST 视为类型可接受（对象存储常见默认类型）。

#### Scenario: 无 head 实现时只做结构检查
- **WHEN** `verifyFeed(xml, {})`
- **THEN** `checks` 为空数组且零出站请求；结构合法即 `ok:true`

#### Scenario: 404 判不可达
- **WHEN** 注入的 `headImpl` 对某 enclosure 返回 `{status:404}`
- **THEN** issues 含 `ENCLOSURE_UNREACHABLE`，`checks` 中该条 `ok:false, reason:'ENCLOSURE_UNREACHABLE', status:404`
