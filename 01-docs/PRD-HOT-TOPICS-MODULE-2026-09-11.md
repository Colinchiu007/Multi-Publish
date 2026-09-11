# PRD — 「更多」菜单新增「热门选题」功能模块

- 文档编号：PRD-HOT-TOPICS-MODULE-2026-09-11
- 状态：已实现（待合并）
- 关联分支：`codex/hot-topics-module`
- 关联模块：`apps/desktop/src/views/HotTopics.vue`、`apps/desktop/electron/services/hot-topics-service.js`
- 创建日期：2026-09-11

## 1. 背景与目标

自媒体创作者（图文与视频）的核心痛点之一是「选题」：不知道今天写什么、拍什么。各大平台（微博、知乎、百度、B站、抖音、头条等）每天都会产生热搜榜/热榜标题，这些标题天然就是内容选题或标题素材，但分散在十几个网站里，人工逐个查看效率极低。

本需求在应用左侧菜单「更多」分组中新增「热门选题」模块，用于：

1. 从多个公开渠道定期聚合热门选题（热搜榜标题），形成统一列表；
2. 按常见内容类别（综合/社会/财经/科技/娱乐/体育/情感/教育/健康/国际）分类展示；
3. 每个选题带勾选框，支持批量操作：【创作文案】（跳转文案改写页，自动进入选题创作模式并自动开始改写）与【一键发布】（先自动改写生成新文案，再走采集页一键发布流程）；
4. 采集过程复用采集模块的防反爬体系（限流、熔断、冷却、缓存），避免封 IP。

## 2. 术语定义

| 术语 | 含义 |
|------|------|
| 热门选题（选题/选题） | 自媒体内容（图文和视频）的文案内容选题或标题；常见形态是一个词汇、一句话或一个短句；来源于各平台热搜榜/热榜的标题条目 |
| 渠道 | 提供热门选题数据的公开站点/接口，如知乎热榜、今日头条热榜、百度热搜等 |
| 分类 | 选题所属内容类别，共 10 类：综合、社会、财经、科技、娱乐、体育、情感、教育、健康、国际 |
| 创作文案 | 把选题文本带入文案改写页输入框、改写模式设为「选题创作」并自动开始改写的动作 |
| 一键发布 | 对选中选题先批量自动改写、生成新文案存为草稿，再跳转发布页草稿列表的流程 |
| 选题创作 | 文案改写页已有改写模式（`create`），以给定选题为起点创作全新文案 |
| 渠道原生分类 | 渠道接口返回数据中自带的选题分类字段（如头条的 Category、腾讯的领域信息） |

## 3. 功能范围

### 3.1 菜单入口（P0）

- 左侧菜单「更多」分组（`YixiaoerSidebar.vue` 的 `moreItems`）新增一项：`{ key: 'hot-topics', label: t('hotTopics.menuLabel'), to: '/hot-topics', icon: TrendCharts }`。
- 路由 `/hot-topics` 懒加载 `HotTopics.vue`，路由名 `HotTopics`。
- 菜单 label 走 i18n key `hotTopics.menuLabel`（zh/en 成对）。

### 3.2 选题列表页（P0）

- 页面结构：顶部标题区（页面标题 + 描述 + 分类筛选 chips + 渠道筛选下拉 + 【刷新】按钮 + 上次刷新时间）→ 批量操作条（全选/取消全选 + 已选计数 + 【创作文案】+【一键发布】）→ 选题列表。
- 每个选题条目：勾选框 + 排名徽标（渠道内排名）+ 选题标题 + 分类标签 + 渠道标签 + 热度值（如有）+ 单条【创作文案】快捷按钮。
- 列表为空时展示空状态：标题「暂无热门选题」+ 描述「点击刷新按钮获取最新选题，或等待自动刷新」+ 【立即刷新】按钮。
- 加载中展示加载指示器。
- 单渠道失败不阻塞整体：列表正常渲染其余渠道数据，失败渠道在渠道下拉中标记「不可用」并在页面顶部以警告条提示「部分渠道获取失败：xxx」。

### 3.3 分类体系（P0）

10 个分类，映射规则：

1. **渠道原生分类优先**：头条 `Category`、腾讯领域字段直接映射到 10 类之一（映射表见 5.2）；无法映射的原生分类归入综合。
2. **关键词规则兜底**：无原生分类的渠道（知乎/B站/抖音/百度/tophub-微博）用类别关键词表匹配（如 财经：股票/基金/A股/楼市/房价/经济；科技：AI/芯片/手机/互联网；情感：恋爱/婚姻/离婚/相亲；体育：足球/篮球/奥运；娱乐：明星/综艺/电影/演唱会；教育：高考/考研/开学；健康：医院/疫苗/养生；国际：美国/日本/韩国/国际）。
3. **兜底归综合**：规则匹配不中的选题归入「综合」。

### 3.4 创作文案（P0）

- 单条快捷按钮与批量【创作文案】：跳转 `/rewrite?topic=<encodeURIComponent(topic)>`。
- 改写页 `RewriteView.vue` 读取 `route.query.topic`：非空时填入 `content`，`rewriteMode` 设为 `create`（选题创作），并自动调用 `startRewrite()`。
- topic 为空/缺失时不做任何填充，保持页面原状（防止误触发）。
- 自动改写前置校验与手动一致：内容 ≥20 字符才启动；不足 20 字符的选题（如单个词汇）自动补充引导语「请以下面这个选题为主题，创作一篇适合自媒体发布的文案：」以满足长度门槛并给 AI 明确指令。

**topic 长度补足规则**：选题长度不足 20 字符时，前置引导语 + 选题原文拼接作为改写输入：

```
请以下面这个选题为主题，创作一篇适合自媒体发布的文案：
${topic}
```

### 3.5 一键发布（P0）

- 勾选选题 + 点击【一键发布】→ 弹出与采集页相同的 `PublishDestinationModal`，用户选择「图文发布」或「视频发布」。
- 选择后进入批量自动改写阶段：逐条调用改写 IPC（`aiRewrite`，模式 `create`），页面内显示批量进度（已完成 n/总数、每条成功/失败状态、整体进度条）；失败条目标红，支持单条重试。
- 全部改写完成后：逐条把改写结果存为草稿（复用采集页 `saveDraftAfterRewrite` 的草稿构造逻辑），然后跳转：
  - 图文发布 → `/publish`（草稿列表，用户逐条确认发送）；
  - 视频发布 → `/create?draft=<lastDraftId>`（视频创作页，带入最后一个草稿）。
- 批量改写中途用户可【取消】：已完成的草稿保留，未完成的条目恢复未改写状态。

### 3.6 定时刷新（P0）

- 应用启动后首次进入页面自动拉取（若缓存超过 10 分钟）。
- 页面内每 30 分钟自动刷新一次（可配置，设置项 `hotTopics.refreshIntervalMinutes`，默认 30，范围 5-120）。
- 单渠道最小抓取间隔：知乎/头条/腾讯/B站 5 分钟，抖音 15 分钟，百度 10 分钟，tophub 30 分钟（由渠道策略配置控制，复用 rate-limiter）。
- 刷新结果缓存落 SQLite（settings 表 key `hot_topics_cache`），结构：`{ topics: [...], fetchedAt, channelStats }`；缓存有效期 10 分钟（`CACHE_TTL_MS = 10 * 60 * 1000`）。

### 3.7 防反爬体系（P0）

复用 `packages/collection-engine` 现有组件：

| 组件 | 用途 |
|------|------|
| `rate-limiter.js` | 单渠道最小间隔 + 随机抖动 + 活跃时段 |
| `circuit-breaker.js` | 连续 3 次失败熔断 30 分钟 |
| `content-cache.js` | URL+内容哈希去重，避免重复抓取 |
| `default-strategies.json` | 渠道级参数（riskLevel/dailyBudget/interval） |

请求层约定：

- 统一 `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)`（桌面 Chrome UA）；
- 抖音渠道必须携带 `Referer: https://www.douyin.com/`（实测缺 Referer 返回空 body）；
- 超时 10 秒（`AbortController`），失败不自动重试（熔断器计数），下次刷新周期再试；
- 每渠道每次刷新最多取 top 20 条；
- SSRF 防护：仅允许 https/http、拒绝内网地址。

### 3.8 渠道清单（P0 接入 7 个）

| # | 渠道 | 端点 | 格式 | 登录 | 建议间隔 |
|---|------|------|------|------|---------|
| 1 | 知乎热榜 | `www.zhihu.com/api/v4/creators/rank/hot?domain=0` | JSON | 无 | 5-10 分钟 |
| 2 | 今日头条 | `www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc` | JSON | 无 | 5-10 分钟 |
| 3 | 腾讯新闻 | `r.inews.qq.com/gw/event/hot_ranking_list?page_size=20` | JSON | 无 | 10 分钟 |
| 4 | 哔哩哔哩 | `api.bilibili.com/x/web-interface/popular?ps=20&pn=1` | JSON | 无 | 10 分钟 |
| 5 | 抖音热点 | `www.douyin.com/aweme/v1/web/hot/search/list/` | JSON | 无（需 Referer） | 15 分钟 |
| 6 | 百度热搜 | `top.baidu.com/board?tab=realtime` | HTML 内嵌 JSON | 无 | 10 分钟 |
| 7 | tophub.today（含微博榜） | `tophub.today` 聚合页 | HTML | 无 | 15-30 分钟 |

明确不接入：微博直连（432/passport 反爬）、RSSHub 公共实例（Cloudflare 拦截）、网易新闻（端点失效）。tophub 作为微博数据的间接来源。

### 3.9 非目标（Out of Scope）

- 不做选题搜索/自定义选题订阅；
- 不做选题热度趋势图/历史对比；
- 不做 AI 自动分类（本期用原生分类+规则）；
- 不做发布动作的全自动发送（发布仍需用户在发布页确认）；
- 不做自建 RSSHub/代理池。

## 4. 数据校验

### 4.1 选题条目结构

| 字段 | 类型 | 校验规则 |
|------|------|---------|
| `id` | string | 必填；`channel + ':' + rank`；列表 key 与操作定位依据 |
| `topic` | string | 必填非空；trim 后长度 1-100；超长截断到 100 字符加省略号展示（完整文本保留在 title 属性） |
| `channel` | string | 必填；7 渠道枚举之一（`zhihu/toutiao/tencent/bilibili/douyin/baidu/tophub`） |
| `category` | string | 必填；10 分类枚举之一；缺省 `general`（综合） |
| `rank` | number | 0-50；渠道内排名 |
| `hotValue` | number \| null | 可空；渠道原始热度值（知乎热度分/B站播放等），仅展示用 |
| `url` | string \| null | 可空；选题详情链接；仅允许 http/https 协议，其他协议丢弃置 null |
| `fetchedAt` | string | ISO 时间戳；本批数据抓取时间 |

### 4.2 校验与防御规则

- **反序列化 fail-closed**：缓存读取 `JSON.parse` 失败或非对象/非数组 `topics` 时回退 `{ topics: [], fetchedAt: 0, channelStats: {} }`，不抛错。
- **去重**：同批次跨渠道按 `topic.trim()` 归一化去重（保留先到者，记录 `mergedFrom: [channel]` 数组）；同渠道内按 rank 去重。
- **HTML 实体解码**：HTML 渠道（百度/tophub）解析出的文本必须解码（`&amp;` 等）。
- **XSS**：选题文本一律经 Vue 转义渲染（`{{ }}`），禁止 v-html。
- **批量上限**：单次批量改写最多 20 条（超出提示「一次最多批量处理 20 条选题，请减少选择」）。
- **空选择守卫**：【创作文案】/【一键发布】未勾选任何选题时提示「请先勾选至少一条选题」。

## 5. 流程与功能逻辑

### 5.1 刷新流程

```
进入页面 / 定时器触发 / 点击【刷新】
  → 检查缓存（fetchedAt 距今 < 10 分钟且非强制）→ 命中则直接用缓存，结束
  → 未命中：并发调用 7 渠道 fetch（各自过 rate-limiter + circuit-breaker 门禁）
  → 每渠道成功：解析 → 提取 top20 → 分类 → 入列表；失败：记入 channelStats.failed，不阻塞其他渠道
  → 全部返回后：跨渠道去重 → 按 fetchedAt 写缓存 → 更新页面状态
```

### 5.2 分类映射流程

```
选题条目
  → 渠道有原生分类字段？
    ├─ 是 → 查原生分类映射表（头条 Category → 10 类）→ 命中 → 用之
    │        └─ 未命中 → 落入规则匹配
    └─ 否 → 关键词规则匹配（10 类词表，优先级：国际 > 社会 > 财经 > 科技 > 娱乐 > 体育 > 情感 > 教育 > 健康）
  → 规则不中 → 综合（general）
```

### 5.3 创作文案流程（单条与批量同构）

```
用户点击【创作文案】（单条或勾选后批量）
  → 勾选校验（批量时 ≥1 条，上限 20）
  → 单条：直接跳转 /rewrite?topic=xxx
  → 批量：把勾选选题存入 sessionStorage（key hot_topics_selected，上限 20 条）
        → 跳转 /rewrite?topic=<第一条>
        → 改写页读完 query 后保留 session 队列供后续手动消费（本期简化：批量创作=存队列 + 首条自动开始，改写页不新增队列 UI）
```

### 5.4 一键发布流程

```
勾选选题 + 点击【一键发布】
  → 弹 PublishDestinationModal
  → 用户选「图文发布」或「视频发布」
  → 批量自动改写（逐条 aiRewrite，模式 create，输入=引导语+topic）
  → 进度展示：n/total、单条状态（pending/rewriting/success/failed）、进度条
  → 单条失败：标红 + 【重试】按钮；整体不中断
  → 全部完成（或用户点【取消】）
  → 成功条目逐条存草稿（title=改写结果标题或选题、content=改写正文、source='hot-topics'）
  → 图文：跳 /publish（草稿列表）
  → 视频：跳 /create?draft=<lastDraftId>
```

### 5.5 定时刷新逻辑

```
onMounted
  → 读缓存 → 缓存新鲜（<10min）→ 直接渲染，不抓取
  → 缓存缺失/过期 → 触发 refresh(force=false)
  → 启动 setInterval(30min, refresh(force=false))
onUnmounted → clearInterval
```

`document.hidden` 时跳过自动刷新 tick，恢复可见时检查缓存过期则刷新。

## 6. 交互逻辑

### 6.1 勾选与批量操作

- 勾选状态：`selectedIds: Set<string>`；全选=当前过滤视图全部条目 id；取消全选清空。
- 已选计数实时显示「已选 n 条」；n=0 时【创作文案】【一键发布】disabled。
- 勾选变化时按钮态即时更新。
- 单条快捷【创作文案】按钮不依赖勾选状态。

### 6.2 筛选与列表

- 分类 chips：全部 + 10 分类，单选；切换立即过滤列表。
- 渠道下拉（el-select）：全部渠道 + 7 渠道（含不可用标记）；切换立即过滤。
- 刷新按钮：loading 态（转圈 + 禁用），完成后显示「上次刷新 HH:mm」。
- 失败渠道警告条：`el-alert` warning，文案「部分渠道获取失败：渠道A、渠道B」，可关闭。

### 6.3 一键发布进度交互

- 批量改写期间：批量操作条替换为进度区（进度条 + n/total + 取消按钮）。
- 取消：已完成草稿保留并提示「已取消，已保留 n 条草稿」；剩余条目恢复可勾选状态。
- 失败条目在进度列表中标红，提供【重试】；重试成功则转绿并计入草稿。

### 6.4 状态保持与竞态守卫

- 遵循 spec「目标快照守卫」：刷新请求发起时记录请求序号（requestSeq），响应返回时若序号不匹配则丢弃，防止旧响应覆盖新数据。
- 批量改写期间禁用【刷新】与筛选操作（防止列表变动导致改写目标错位）。

### 6.5 路由与菜单

- 菜单高亮：`isActive` 沿用现有前缀匹配（`/hot-topics` 精确匹配）。
- 页面离开时清理定时器（interval）与 in-flight 请求（AbortController.abort）。

## 7. 显示项与提示文字（i18n）

### 7.1 新增 i18n key（zh/en 成对，命名空间 hotTopics.*）

| key | zh | en |
|-----|----|----|
| hotTopics.menuLabel | 热门选题 | Hot Topics |
| hotTopics.pageTitle | 热门选题 | Hot Topics |
| hotTopics.pageDesc | 多渠道热门选题聚合，一键创作文案或批量发布 | Aggregate trending topics, create copy or publish in batch |
| hotTopics.refresh | 刷新 | Refresh |
| hotTopics.lastRefresh | 上次刷新 {time} | Last refresh {time} |
| hotTopics.categoryAll | 全部 | All |
| hotTopics.categories.general | 综合 | General |
| hotTopics.categories.society | 社会 | Society |
| hotTopics.categories.finance | 财经 | Finance |
| hotTopics.categories.tech | 科技 | Tech |
| hotTopics.categories.entertainment | 娱乐 | Entertainment |
| hotTopics.categories.sports | 体育 | Sports |
| hotTopics.categories.emotion | 情感 | Emotion |
| hotTopics.categories.education | 教育 | Education |
| hotTopics.categories.health | 健康 | Health |
| hotTopics.categories.international | 国际 | International |
| hotTopics.channelAll | 全部渠道 | All channels |
| hotTopics.channels.zhihu | 知乎 | Zhihu |
| hotTopics.channels.toutiao | 头条 | Toutiao |
| hotTopics.channels.tencent | 腾讯新闻 | Tencent News |
| hotTopics.channels.bilibili | B站 | Bilibili |
| hotTopics.channels.douyin | 抖音 | Douyin |
| hotTopics.channels.baidu | 百度 | Baidu |
| hotTopics.channels.tophub | 微博(tophub) | Weibo (tophub) |
| hotTopics.selectAll | 全选 | Select all |
| hotTopics.selectedCount | 已选 {count} 条 | {count} selected |
| hotTopics.createCopy | 创作文案 | Create copy |
| hotTopics.publish | 一键发布 | Publish |
| hotTopics.emptyTitle | 暂无热门选题 | No topics yet |
| hotTopics.emptyDesc | 点击刷新按钮获取最新选题，或等待自动刷新 | Click refresh to fetch latest topics, or wait for auto refresh |
| hotTopics.emptyAction | 立即刷新 | Refresh now |
| hotTopics.partialFail | 部分渠道获取失败：{channels} | Some channels failed: {channels} |
| hotTopics.noSelection | 请先勾选至少一条选题 | Please select at least one topic first |
| hotTopics.batchLimit | 一次最多批量处理 20 条选题，请减少选择 | Batch limit is 20 topics, please reduce selection |
| hotTopics.topicPrefix | 请以下面这个选题为主题，创作一篇适合自媒体发布的文案： | Please create self-media copy based on the following topic: |
| hotTopics.publishProgress | 改写中 {done}/{total} | Rewriting {done}/{total} |
| hotTopics.publishCancelled | 已取消，已保留 {count} 条草稿 | Cancelled, {count} drafts kept |
| hotTopics.publishDone | 改写完成，已生成 {count} 条草稿 | Done, {count} drafts created |
| hotTopics.publishRetry | 重试 | Retry |
| hotTopics.publishCancel | 取消 | Cancel |
| hotTopics.channelUnavailable | 不可用 | Unavailable |
| hotTopics.loadFailed | 选题获取失败，请稍后重试 | Failed to fetch topics, please retry later |
| hotTopics.rank | 排名 | Rank |
| hotTopics.hotValue | 热度 | Heat |

### 7.2 显示规则

- 分类标签颜色：综合=灰、社会=蓝、财经=橙、科技=紫、娱乐=粉、体育=绿、情感=红、教育=青、健康=teal、国际=深蓝。
- 渠道标签：固定色带 + 渠道名。
- 热度值：≥10000 显示为 x.x万，否则千分位。

### 7.3 带参文案 Message Function 约定

所有含 `{param}` 的文案必须写成 `(ctx) => 'xxx' + ctx.named('param')` 形式（zh/en 两侧一致），禁止静态字符串带占位符。

## 8. 验收标准

1. 「更多」菜单出现「热门选题」入口，点击进入 `/hot-topics` 页面。
2. 首次进入自动拉取（缓存过期时），7 渠道并发抓取，单渠道失败不阻塞整体。
3. 列表按渠道内排名展示：勾选框、分类标签、渠道标签、热度值齐全。
4. 10 类分类筛选与渠道筛选正常工作，分类不中归综合。
5. 【创作文案】单条/批量跳转改写页：topic 填入、模式=create、自动开始（含 <20 字补引导语）。
6. 【一键发布】弹窗选图文/视频 → 批量改写带进度、失败重试、存草稿、跳转。
7. 缓存与定时刷新：10 分钟缓存、30 分钟自动刷新、document.hidden 暂停。
8. 防反爬组件接入（rate-limiter/circuit-breaker/cache 有测试断言）。
9. i18n zh/en 成对 + Message Function + 无硬编码中文泄漏到模板。

## 9. 测试覆盖

### 9.1 单元测试

| 测试文件 | 覆盖 |
|---------|------|
| `hot-topics-service.test.js` | 渠道解析（7 渠道各一 fixture）、分类映射（原生+规则+综合兜底）、去重、缓存读写 fail-closed、限流/熔断调用断言、SSRF 拒绝 |
| `HotTopics.test.js` | 渲染（菜单/标题/空态）、勾选与批量按钮态、筛选过滤、刷新交互（mock IPC）、一键发布进度流（mock aiRewrite） |
| `RewriteView.test.js`（补充） | query.topic 填充、模式切换 create、自动 startRewrite、<20 字补引导语 |

### 9.2 视觉回归

- `all-views.visual.test.js` 注册 `hot-topics` 视图（需 dev server + mock 数据，随实现落地）。

### 9.3 契约测试

- preload 暴露的 API（`hotTopicsFetch/hotTopicsGetCache`）与主进程 handler 参数/返回结构一致。
- 缓存 settings key `hot_topics_cache` 的结构契约（topics 数组 + fetchedAt + channelStats）。

### 9.4 手动验证清单

- 打包启动 → 更多菜单 → 热门选题 → 刷新 → 勾选 → 创作文案（跳转自动改写）→ 一键发布（图文/视频各一次全流程）。

## 10. 技术实现说明（附录）

### 10.1 主进程 service

- `apps/desktop/electron/services/hot-topics-service.js`：`HotTopicsService` 类，方法 `fetchTopics(force)` / `getCache()`。
- DI 链路：`container.setup.js` 注册 `hotTopicsService` → `phase1-context.js` 提取 → `phase5-ipc.js` 传递 deps → `ipc-handlers/hot-topics.js` 注册 IPC（channel：`hot-topics:fetch` / `hot-topics:get-cache`）。
- preload：`preload/hot-topics.js` 暴露 `hotTopicsFetch/hotTopicsGetCache`。
- 持久化：settings 表 `hot_topics_cache` key（复用 settings-store）。

### 10.2 渠道适配器

`apps/desktop/electron/services/hot-topics/channels/*.js`：每渠道一个解析器（fetch + parse），统一输出 `{ channel, rank, topic, hotValue, url, rawCategory }`。

### 10.3 分类器

`apps/desktop/electron/services/hot-topics/classifier.js`：`classifyTopic(rawCategory, channel, topicText) → category`，含原生分类映射表 + 关键词词表。

### 10.4 渲染层

- `HotTopics.vue`：列表 + 筛选 + 批量操作 + 进度 UI；IPC 调用经 `api/hot-topics.js`（invokeWithFallback）。
- `RewriteView.vue`：新增 query.topic 消费逻辑（约 15 行）。

### 10.5 渠道清单与间隔配置

渠道策略内嵌于 service（`CHANNEL_CONFIGS`），每渠道：`{ id, name, url, headers, parser, intervalMinutes, riskLevel }`；不新增外部配置文件（避免打包 files 清单变更）。

