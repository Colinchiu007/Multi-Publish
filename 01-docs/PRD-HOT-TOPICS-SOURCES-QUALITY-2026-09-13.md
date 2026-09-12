# PRD — 热门选题扩源 + 分类修正 + 序号修复

- 文档编号：PRD-HOT-TOPICS-SOURCES-QUALITY-2026-09-13
- 状态：已实现（分支 codex/hot-topics-sources-quality）
- 关联文档：PRD-HOT-TOPICS-MODULE-2026-09-11.md（基础模块）
- 关联模块：hot-topics-service.js、hot-topics/channels.js、hot-topics/classifier.js、HotTopics.vue
- 创建日期：2026-09-13

## 1. 背景与问题

用户反馈三个问题：

1. **选题数量少、知乎独大**：7 渠道中 5 个依赖 HTML 解析或高反爬端点（抖音需 Referer、百度/tophub HTML 解析），失败即整渠道为空；知乎是唯一免登录稳定 JSON 接口，失败时列表几乎全是知乎。
2. **分类少且不匹配**：5/7 渠道（知乎/B站/抖音/百度/tophub）无原生分类字段，全部走本地关键词子串匹配，误判率高（如「孩子」命中情感、「美国」命中国际），未命中全落「综合」——造成部分分类内容极少且不相关。
3. **序号不从 1 开始**：列表序号直接显示渠道内原始排名（rank），分类/渠道筛选后是各渠道排名混排（如 1、3、7），不符合用户预期。

## 2. 调研结论（2026-09-13 实测）

### 2.1 推荐接入

| 渠道 | 端点 | 原生分类 | 实测 |
|------|------|---------|------|
| 微博热搜 | weibo.com/ajax/statuses/hot_band | category 字段（15 类：数码/电竞/国内时政/演出/互联网/剧集/综艺/民生新闻/体育/幽默/科学科普/美食/健康医疗/舆论监督/游戏） | 连续 3 次 200，50 条，免登录，需 UA+Referer |
| 百度热搜（JSON API） | top.baidu.com/api/board?platform=wise&tab=realtime | 无（tab 分类在 URL 层） | 连续 200，51 条，仅 UA；无 hotScore 字段 |
| B站热门（升级） | api.bilibili.com/x/web-interface/popular?ps=50 | tname 分区名（26 种实测） | 200，50 条 |

### 2.2 已验证不可用/不推荐

- vanfeed：域名 NXDOMAIN + GitHub 404，已消失
- 韩小韩（oioweb.cn）：TLS 握手失败；UomgAPI：DNS 超时；vvhan：连接失败
- DailyHotApi / 60s API：开源可自部署，但公共实例停用/限流严格（429），且无原生分类，不适合桌面应用直接依赖
- 天行数据/聚合数据/大米API：需注册 key

完整调研见 .ccg/tasks/hot-topics-sources-quality/research.md。

## 3. 功能变更

### 3.1 新增微博热搜渠道（FR-1）

- channel id：weibo；渠道名：微博热搜（zh）/ Weibo Hot Search（en）
- 端点：https://weibo.com/ajax/statuses/hot_band
- 请求头：桌面 UA + Referer: https://weibo.com/（无需 cookie）
- 解析 data.band_list[]：word→topic、num→hotValue、rank=数组序 i+1（realpos 偶发稀疏 null，回退会撞号产生重复 id，数组序恒唯一）、category→rawCategory（原生分类）、url 构造 https://s.weibo.com/weibo?q= + encodeURIComponent(word)
- 取 top 20 进列表
- 风险级别 medium，最小间隔 10 分钟

### 3.2 微博原生分类映射（FR-1 续）

微博 15 类映射到 10 分类体系：数码→tech、电竞→entertainment、国内时政→society、演出→entertainment、互联网→tech、剧集→entertainment、综艺→entertainment、民生新闻→society、体育→sports、幽默→entertainment、科学科普→tech、美食→general、健康医疗→health、舆论监督→society、游戏→entertainment。未命中映射的微博分类走关键词规则兜底。

### 3.3 百度渠道切换官方 JSON API（FR-2）

- URL 从 top.baidu.com/board?tab=realtime（HTML s-data 解析）改为 top.baidu.com/api/board?platform=wise&tab=realtime（纯 JSON）
- 解析 data.cards[0].content[0].content[]：word→topic、index→rank、url→url；过滤 isTop:true 置顶条（栏目推广位无 index 字段，不过滤会与正式榜首撞号产生重复 id baidu:1）
- 降级说明：该 JSON 端点无 hotScore 字段，hotValue 置 null（列表热度列该渠道不显示，可接受）
- 风险级别从 medium 降为 low（消除 HTML 结构变化导致的解析失败）

### 3.4 B站渠道升级（FR-3）

- ps=20 改为 ps=50（拉满 50 条，仍取 top 20 进列表，减少翻页请求）
- 提取 tname 分区名作为 rawCategory
- 常见分区映射：手机游戏/单机游戏/电子竞技/国产动画/影视杂谈/音乐综合/鬼畜剧场→entertainment；科技/数码/软件应用/科学科普→tech；校园学习→education；体育→sports；社会→society；日常/生活/美食类/亲子/出行/手工→general
- 未命中映射的分区走关键词规则兜底

### 3.5 分类策略升级（FR-4）

分类优先级（从高到低）：

1. 渠道原生分类映射（weibo category / bilibili tname / toutiao Category / tencent 领域字段）查 RAW_CATEGORY_MAP 命中即用
2. 关键词规则兜底（仅无原生分类或映射未命中的条目）：9 类词表子串匹配
3. general 兜底

变更后带原生分类的渠道从 2/7 提升到 4/8，微博 20 条 + B站 20 条全部走原生分类，分类准确率显著提升。

### 3.6 序号修复：视图内重编号（FR-5）

- 列表序号改为当前筛选视图内从 1 开始的顺序号（v-for 的 index + 1）
- 原 rank（渠道内排名）保留在数据层，hover 序号徽标时通过 title 提示「来源渠道内第 N 名」
- 效果：无论怎么筛选（分类/渠道/组合），序号始终从 1 连续递增

### 3.7 渠道下拉更新（FR-6）

- CHANNEL_KEYS 增加 weibo；**移除 tophub**（weibo 官方渠道成功时，tophub 同源微博条目会被跨渠道去重合并到 weibo 名下，下拉切 tophub 恒空——服务层保留 tophub 渠道作微博数据兜底，但视图不再暴露该筛选）
- 渠道下拉选项：知乎/头条/腾讯新闻/B站/抖音/百度/微博热搜
- 总渠道数 7 变 8，MAX_TOPICS 140 变 160

## 4. 数据校验（增量）

### 4.1 微博条目

| 字段 | 来源 | 校验 |
|------|------|------|
| topic | item.word | trim 后非空，filter(x => x.topic) |
| rank | 数组序 i+1 | 恒唯一（realpos 偶发稀疏 null，不可依赖） |
| hotValue | item.num | Number() 转换，非数字置 null |
| url | 构造 | encodeURIComponent(word)，sanitizeUrl 校验 https |
| rawCategory | item.category | 可空字符串，未命中映射走关键词 |

### 4.2 百度 JSON 条目

| 字段 | 来源 | 校验 |
|------|------|------|
| topic | item.word | decodeHtmlEntities + trim，非空过滤 |
| rank | item.index | Number() 转换，非数字回退 i+1；isTop:true 条目直接过滤（无 index，防撞号） |
| hotValue | 无此字段 | 固定 null |
| url | item.url | sanitizeUrl 校验 |

### 4.3 嵌套结构防御

百度 JSON 嵌套较深（cards 到 content 再到 content），解析器逐层判空：cards 非数组返回空；card.content[0].content 非数组跳过该 card。任一层缺失不抛错，返回空数组触发渠道级 error 记录（熔断计数）。

## 5. 流程与功能逻辑（增量）

### 5.1 抓取流程（8 渠道并发）

```
fetchTopics(force)
  ├─ 缓存 TTL 检查（10min）→ 命中返回 fromCache
  ├─ in-flight 去重
  └─ Promise.all(8 渠道 _collectChannel)
       ├─ weibo: 限流(10min) → 熔断检查 → fetch(UA+Referer) → parseWeibo → classifyTopic(原生分类优先)
       ├─ baidu: 限流(10min) → fetch(UA) → parseBaidu(JSON) → classifyTopic(关键词)
       ├─ bilibili: 限流(10min) → fetch(UA) → parseBilibili(tname) → classifyTopic(原生分类优先)
       └─ 其余 5 渠道不变
  → 跨渠道 topic.trim() 去重（保留先到者+mergedFrom）
  → slice(0, 160) → 写缓存（内存+SQLite）
```

### 5.2 序号渲染流程

```
filteredTopics = topics.filter(分类匹配 && 渠道匹配)
渲染 v-for="(topic, viewIndex) in filteredTopics"
  序号徽标文本 = viewIndex + 1（视图内顺序）
  序号徽标 title = t('hotTopics.sourceRank', { rank: topic.rank })（渠道内排名提示）
```

## 6. 交互逻辑（增量）

- **序号 hover**：鼠标悬停序号徽标，tooltip 显示「来源渠道内第 N 名（列表序号为当前筛选视图内顺序）」（zh）/「Rank #N on source channel (list numbers are sequential within the current filtered view)」（en）
- **渠道筛选**：新增「微博热搜」选项；微博渠道失败时下拉中标记「不可用」+ 页顶警告条
- 其余交互（分类 chips、勾选、批量操作、一键生成视频）不变

## 7. 显示项与提示文字（i18n 增量）

| key | zh | en |
|-----|----|----|
| hotTopics.channels.weibo | 微博热搜 | Weibo Hot Search |
| hotTopics.sourceRank | 来源渠道内第 {rank} 名（列表序号为当前筛选视图内顺序） | Rank #{rank} on source channel (list numbers are sequential within the current filtered view) |

## 8. 验收标准

1. 渠道总数 8 个（新增 weibo），CHANNEL_CONFIGS 断言通过
2. 微博条目带原生分类（如 数码→tech、民生新闻→society），不再走关键词猜测
3. B站条目带分区分类（如 手机游戏→entertainment、校园学习→education）
4. 百度渠道走 JSON API（URL 断言），不再依赖 HTML s-data 正则
5. 任意分类/渠道筛选下，序号从 1 连续递增（回归测试覆盖）
6. 序号 hover 显示来源渠道内排名提示
7. 单渠道失败不阻塞其他渠道（沿用容错，测试覆盖）
8. hot-topics-service.test.js 26 用例全绿（含新增 6 个）
9. HotTopics.test.js 21 用例全绿（含新增序号重编号用例）
10. zh/en locales 成对（check-locale-sync --pair-base 通过）
11. 渲染端无新增硬编码中文（check-locale-sync --cjk 通过）

## 9. 测试覆盖（增量）

| 测试 | 用例 |
|------|------|
| classifier：微博原生分类映射 | 数码→tech / 民生新闻→society / 健康医疗→health / 未命中走关键词 |
| classifier：B站分区映射 | 手机游戏→entertainment / 科学科普→tech / 校园学习→education |
| parser：weibo hot_band JSON | band_list 解析 / 数组序 rank / category rawCategory / url 构造 |
| parser：baidu JSON API | 嵌套 content 解析 / index rank / 实体解码 |
| parser：bilibili tname | tname 提取为 rawCategory |
| service：8 渠道配置 | 数量=8 / weibo+baidu 存在 / interval>=5min / https |
| service：baidu JSON URL | 端点断言 + riskLevel=low |
| service：weibo Referer | 请求头断言 + riskLevel=medium |
| view：序号重编号 | 筛选后 1,2 连续 / 全部视图 1,2,3 |

## 10. 技术实现说明（附录）

### 10.1 微博端点选型依据

weibo.com/ajax/statuses/hot_band 是微博 Web 版自身的 AJAX 接口（非第三方爬虫端点），与浏览器正常访问行为一致，带 Referer 即可匿名访问。备选端点 weibo.com/ajax/side/hotSearch 实测 403 不稳定，不采用。m.weibo.cn container 接口需 cookie，不采用。原 tophub 渠道（HTML 解析第三方聚合站）保留作为微博数据兜底。

### 10.2 百度 JSON API 与 HTML s-data 对比

官方 JSON API（top.baidu.com/api/board）与 HTML 页面内嵌 s-data 是同源数据，但 JSON 版无 hotScore/desc/cover 字段。选择 JSON 版的取舍：解析稳定性（无正则依赖 HTML 注释结构）优先于热度值展示。60s 开源项目的 baidu 模块同样使用 HTML s-data 版本（含 hotScore），若后续需要热度值可参考其方案回退。

### 10.3 不引入第三方聚合 API 的理由

桌面应用无法要求用户自建 Docker 服务；公共实例（60s/DailyHotApi/vvhan/Uomg/韩小韩）实测全部停用/限流/失败；且均无原生分类字段，与「固定分类」诉求不符。官方端点直连是最稳路径。
