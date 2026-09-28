# PRD：发布页「标题参考」相关性与数据源契约

> **文档日期**：2026-09-28
> **类型**：Bug 反哺型规格补写（该功能此前无任何 PRD 条目，本次连同契约一起补齐）
> **关联提交**：本 change
> **涉及文件**：
> - `apps/desktop/electron/services/content-intelligence.js`（相关性门禁、源域白名单）
> - `apps/desktop/electron/services/content-intelligence-utils.js`（CJK 感知分词、重叠判定）
> - `apps/desktop/electron/services/content-intelligence-analysis.js`（高频词提取口径）
> - `apps/desktop/src/components/TitleAssistantPanel.vue`（来源标签、空态）
> - `apps/desktop/src/locales/zh.js` / `en.js`（3 个新 key，成对）
> - `apps/desktop/src/views/Publish.vue`（挂载点，本次未改）

---

## 1. 背景与问题

发布页（含视频发布流程）右侧的「标题参考」面板，在用户填写标题后展示三块内容：
标题建议提示、同类标题高频词、高互动参考列表。

用户实测反馈（2026-09-28 截图）显示面板产出为垃圾：

| 显示项 | 实际内容 |
| --- | --- |
| 提示 | 「高互动标题常包含: homepage, 申请加入请在这里评论, （也可以直接发 Pull Request）。当前标题缺失: …，可考虑加入。」 |
| 高频词 | `homepage`、`申请加入请在这里评论`、`（也可以直接发`、`pull`、`request)` |
| 高互动参考 | `homepage` / `申请加入请在这里评论 （也可以直接发 Pull Request）` / `Gitalk Demo` / `ActNotify~>Bilibili` / `Daily weather email`，**五条全部标注 GitHub**，互动分 1.0–1.6 |

这些不是测试数据，也不是 mock —— 它们是 **GitHub 上的真实 issue / 仓库标题**（Gitalk 演示仓库的置顶招募 issue、若干仓库名）。用户据此判断「内容像是测试性的」是对的：**它们对内容创作者的标题优化毫无参考价值**。

### 1.1 实测取证（2026-09-28，本机直连公开 API）

| 数据源 | 查询 | 结果 |
| --- | --- | --- |
| `api.github.com/search/issues` | `三步学会做红烧肉` | `total_count: 3595`，首条标题 `旧文归档 · 2024 年 2 月` —— **与查询零词重叠** |
| `hn.algolia.com/api/v1/search` | `红烧肉` | `nbHits: 0` |
| `reddit.com/search.json` | `红烧肉` | 空响应 |

结论：**GitHub 是唯一"有结果"的源，而它的结果全部来自正文匹配**。这解释了为什么截图里五条清一色 GitHub —— 不是标签打错，是排序后只有它家有货。

---

## 2. 根因（三层叠加）

| # | 层 | 位置 | 根因 |
| --- | --- | --- | --- |
| R1 | 源域 | `content-intelligence.js` `searchTitles()` | 直接复用通用 `search()`，继承其默认源 `['reddit','hackernews','github']`。GitHub 是代码托管站，其 issue 标题由仓库维护者书写，**不是内容标题语料** |
| R2 | 校验 | `search()` 出口 | **没有「标题是否真的与查询同类」这道判据**。三个源的检索接口匹配的都是正文，正文命中即入榜 |
| R3 | 分词 | `_extractPatterns()` | 按空白/标点切词。中文无空格 ⇒ 整句被切成一个"词"，于是「申请加入请在这里评论」以"高频词"身份渲染给用户 |

R1 是本次症状的直接成因，R2 是系统性漏洞（换一个源就会复发），R3 让垃圾以"词"的形态二次放大。三者都修，缺一即残留。

---

## 3. 范围

**在范围内**：标题参考面板的数据源、结果校验、高频词口径、来源标注、空态表现。

**不在范围内**（记录为已知限制，见 §11）：
- 引入中文内容平台（抖音/B站/小红书）的标题语料源 —— 那是数据源扩容，不是本 Bug 的修复；
- 中文分词器（jieba 等）依赖 —— 二元组方案零依赖，见 §4.3；
- 「智能标签建议」「最佳发布时间」两个面板的取数逻辑（仅因共用 `search()` 出口而顺带受益）。

---

## 4. 功能逻辑

### 4.1 数据源矩阵（唯一口径表）

| 功能入口 | 方法 | 使用的源 | 为什么 |
| --- | --- | --- | --- |
| 主题情报页 | `search(query, opts)` | `reddit` + `hackernews` + `github`（默认全开） | 用户找的是"某主题在讨论什么"，GitHub issue 是合法讨论载体 |
| **标题参考面板** | `searchTitles(title)` | **`reddit` + `hackernews`**（`TITLE_SOURCES` 白名单） | 需要的是"同类内容的标题"，issue 标题不属于该类别 |
| 发布后提及追踪 | `searchMentions(keywords)` | 默认全开，但判据字段放宽为 `title+snippet+author` | 找"谁转载/提到了我"，我的词常只出现在对方**正文**里；只看标题会把真实提及静默丢掉（见 §4.2） |
| 热门趋势 | `fetchTrending()` | 默认全开 | 无查询词 ⇒ 不适用相关性门禁（见 §4.2 边界） |

调用方显式传入非空 `opts.sources` 时**一律尊重调用方**，白名单只是缺省值，不是强制锁。

### 4.2 相关性门禁（R2 的修法）

**位置**：`search()` 内，`Promise.allSettled` 汇聚之后、`engagement` 排序之前。
放在排序前，是为了让下游按 `results[0]` 取 `topSource` / `topEngagement` 的 `searchMentions` 同样拿到相关结果 —— 门禁若挂在排序后，`topSource` 仍可能来自一条垃圾。

**判据**：结果的**判据字段**与查询**至少共享一个内容词**（按 §4.3 的分词口径）。

判据字段是**按消费者**声明的（`opts.relevanceOn`，默认 `['title']`）：

| 消费者 | relevanceOn | 为什么 |
| --- | --- | --- |
| `search()`（主题情报页） | `['title']`（默认） | 展示的是"同类内容的标题" |
| `searchTitles()`（标题助手） | `['title']`（默认） | 同上 |
| `searchMentions()`（发布后提及追踪） | `['title','snippet','author']`（`MENTION_RELEVANCE_ON`） | **别人转载我时，我的标题词通常出现在对方正文里，而不是对方标题里**。若沿用只看 title 的判据，真实提及会被全部丢掉，`totalMentions` / `topSource` / `topEngagement` 静默少算 |

```
queryTokens = Set(tokenizeContentWords(query))
if queryTokens 非空:
    before = results.length
    kept   = results.filter(r => relevanceOn.some(f => sharesContentWord(r[f], queryTokens)))
    droppedIrrelevant = before - kept.length
```

**`relevanceOn` 必须进缓存键**（实测键形如 `search:<query>:<sources>:<limit>:<relevanceOn.join('+')>`）。
否则 `searchTitles` 与 `searchMentions` 用同一个 query 时会互相串用对方的过滤结果 ——
一个只看标题、一个看正文，共用一条缓存必然有一方拿到错的那份。
回归锁：`content-intelligence.test.js`「不同 relevanceOn 档位必须落在不同缓存键上」，
反证「把 relevanceOn 从键里摘掉」实测 2 条变红。

**日志隐私**：门禁日志**只记计数与形状**（`dropped/before`、`queryLen`、`tokens`、`on=`），
**禁止记 query 原文** —— `searchTitles` 的 query 就是用户的草稿标题，属尚未发布的业务内容，
而 `logger` 只脱敏凭证、不脱敏用户文本。

**边界与不变量**：

| 情形 | 行为 | 理由 |
| --- | --- | --- |
| 查询切不出内容词（如纯数字 `2024`、纯标点） | **不设判据，原样放行**，`droppedIrrelevant = 0` | 没有判据可依时不改变既有语义，避免新增一种失败模式 |
| 结果的某个判据字段缺失 / 空串 / 非字符串 | 该字段判为不相关；**只要有一个判据字段命中即保留** | 判据挂在声明的字段集上；`title` 缺失但 `snippet` 命中，在提及追踪口径下仍算真实提及 |
| 全部结果被剔除 | `results: []`、`total: 0`、`droppedIrrelevant: N` | 渲染层据此走空态（§7、§8） |
| 缓存 | 门禁结果随 `search()` 输出一起进 5 分钟缓存 | 判据对同一 query 确定，缓存不产生漂移 |

**新增返回字段**：`droppedIrrelevant: number` —— 被门禁剔除的条数。渲染层用它区分「一个源都没响应」与「有响应但都不算同类」，两者给用户的解释不同（§8）。

### 4.3 分词口径（R3 的修法）

唯一实现：`content-intelligence-utils.js` 的 `tokenizeContentWords(text)`。
`_extractPatterns`（高频词）与 `sharesContentWord`（门禁）**必须共用它**，禁止再出现第二份切词逻辑。

| 文本类型 | 切法 | 例子 |
| --- | --- | --- |
| 预处理 | 先剥离 URL（`https?://\S+`）与 HTML 实体（`&[a-z][a-z0-9#]*;`），再分词 | 不剥的话两条无关标题会因为**共享同一个域名**而通过门禁（实测 `https://example.com/path&amp;🚀` 会产出 `https`/`example`/`com`/`amp` 四个"词"） |
| 拉丁词 | `/[a-z0-9][a-z0-9'+-]*/g`，长度 ≥2，剔除纯数字与停用词 | `How to learn AI in 2026` → `how, learn, ai` |
| 汉字连串 | `/\p{Script=Han}{2,}/gu`，按**码点**取相邻二元组 | `红烧肉` → `红烧, 烧肉` |
| 单个汉字 | **不产出** | 单字区分度不足，且多为虚词 |

**为什么用 `\p{Script=Han}` 而不是 BMP 区间表**：区间表 `[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]`
漏掉扩展 B 平面及以后（U+20000+）。实测 `𠀀𠀁红烧肉` 在区间表下只产出 `红烧, 烧肉`；
更糟的是**纯扩展平面汉字的查询会切成空 token 集 ⇒ 门禁被整体绕过**（`queryTokens.size === 0`
走"不设判据"分支）。同时按 UTF-16 单元 `slice(i, i+2)` 会把一个代理对**切成半个字符**产出非法字符串 ——
必须 `Array.from(run)` 后按码点组二元组。

**为什么是二元组**：不引入分词器依赖的前提下，这是唯一能让「红烧 / 烧肉」这类真实词素浮出来的最小单位。整句当一个词是本次事故的直接表现；引入 jieba 级依赖则违反"能不用第三方就不用"的架构原则。
代价是会产生 `的教`、`入请` 这类跨词边界的噪声二元组 —— 不逐个排除（`好看` 的 `好` 也在单字停用表里，按"任一字为停用词即排除"会误杀真词），改由 document frequency 排序压制。

**停用表**（`CONTENT_STOPWORDS`，一处维护）：英文虚词 + 中文单字虚词 + **中文高频二元组虚词**（`可以 / 我们 / 你们 / 他们 / 什么 / 怎么 / 这个 / 那个`）。最后一类是必要的：单字停用表覆盖不到二元组，`申请加入我们的群` 会产出 `我们` 这种无信息量高频词。

**去重**：返回去重后的数组，保持首次出现顺序。

### 4.4 高频词与建议生成

`_extractPatterns(results)`：

1. 只统计高互动样本：`engagement > 1.0`；
2. 样本数 `< 2` 时返回 `null`（**不得凭 1 条样本编造"同类"词表**）；
3. **计数口径 = document frequency**：一个词素出现在多少条标题里，而不是出现总次数。
   旧口径按出现次数累加，`AI AI AI tools` 会把 `ai` 记成 3 次并高亮为高频词，这是错的 —— 同一条标题里的重复不代表同类共性；
4. 排序：`count` 降序，**并列时按词素字典序**（保证同一批结果每次渲染顺序稳定，不随机跳动）；
5. 取前 5 条，返回 `[[word, count], …]`。

`_generateTitleSuggestion(title, patterns)`：取前 3 个词素，挑出未出现在草稿标题里的，产出提示。逻辑未改，但其输入质量由 §4.3 保证 —— 门禁上线后，进入统计的标题都与草稿同类，建议才可能有用。

---

## 5. 数据校验

| 校验点 | 规则 | 失败处理 |
| --- | --- | --- |
| 面板触发 | 草稿标题长度 `>= 3` 才发请求 | 清空 `data`，回到「输入标题后自动分析」 |
| 按钮可见 | 草稿标题长度 `> 5` 才显示「标题参考」入口按钮（`Publish.vue`） | 不渲染入口 |
| IPC 参数 | `arg` 必须是非空对象，否则 `VALIDATION_ERROR` | 不进入 `searchTitles` |
| 信封 | `res.code === 0` 才取 `res.data` | 视为无数据，走空态 |
| 结果相关性 | §4.2 门禁 | 剔除并计数，**不降级放行** |
| 单源超时 | 每源 `timeout: 8000ms` | `Promise.allSettled` 吞掉失败源，其余源照常出结果（不整批失败） |
| 互动分渲染 | `engagement` 参与 `toFixed(1)` | 由数据源在映射阶段保证为数值（`_engagementScore` 恒返回数值） |

**fail-closed 取向**：判据不足时宁可显示空态，不用不相关结果凑列表。这是本契约的核心决定 —— 面板的价值在于"可信"，一条垃圾建议比没有建议更伤（用户会照抄）。

---

## 6. 交互逻辑

```
用户在发布页编辑「标题」
    │
    ├─ 标题长度 > 5 ──→ 侧栏显示「标题参考」按钮
    │                        │ 点击
    │                        ▼
    │                   visible = true
    │
    ├─ 标题每次变化 ──→ 清旧定时器 ──→ 800ms 防抖 ──→ intelligenceSearchTitles(title, {limit:6})
    │                                                   │
    │                        ┌──────────────────────────┼─────────────────────┐
    │                        ▼                          ▼                     ▼
    │                   loading=true            code===0 且有 titleAnalysis   抛错
    │                   「正在分析同类标题…」         │                          │
    │                                                   ▼                          ▼
    │                                          data = {patterns, suggestion,   error = 「搜索失败: …」
    │                                                droppedIrrelevant, titles}  data = null
    │                                                   │
    │                        ┌──────────────────────────┴─────────────┐
    │                        ▼ 有 titles                              ▼ titles 为空
    │                  渲染建议 / 高频词 / 高互动参考              渲染空态（§8）
    │
    ├─ visible 转 false ──→ data = null, error = null（收起即清状态，不残留上次结果）
    └─ 组件卸载 ──→ clearTimeout(debounceTimer)（防卸载后异步回调改已销毁组件状态）
```

并发口径：同一时刻只有一个在途请求（防抖覆盖式），无请求竞态守卫；后到的旧响应会覆盖新响应，这是 800ms 防抖下的可接受窄窗，记录为已知限制（§11）。

---

## 7. 显示项

| 区块 | 显示条件 | 内容与格式 |
| --- | --- | --- |
| 面板头 | `visible` | 图标 + `intelligence.titleAssistantTitle`（「标题参考」）+ `✕` 关闭 |
| 加载态 | `loading` | 「正在分析同类标题…」，居中 |
| 错误态 | `error` | `搜索失败: <formatUserError 摘要>`，coral 色 |
| 待输入态 | `!loading && !error && !data` | 「输入标题后自动分析」 |
| 建议提示 | `data.suggestion` | 左侧 3px 橙色竖条块，文案见 §8 |
| 高频词 | `data.patterns` | 标签组，逐个 `word`；`count >= 3` → coral 底白字，否则灰底灰字（**count 现为"出现在几条标题里"**） |
| 高互动参考 | `data.titles.length > 0` | 最多 5 条（`slice(0,5)`，请求 limit 6）：标题原文 + 互动分 `toFixed(1)` + 来源标签 |
| 互动分配色 | — | `>= 2.0` 绿 `#2e7d32`；`>= 1.0` 橙 `#f57c00`；其余灰 `#999` |
| **来源标签** | `sourceLabel(t.source)` 非空 | **显式映射**：`reddit`→`Reddit`、`hackernews`→`HN`、`github`→`GitHub`；未知源**如实回显其标识**；`source` 缺失则不渲染该 span |
| **空态** | `data` 有但 `titles` 为空 | 见 §8 三行文案，居中，muted |

**来源标签为什么不许有兜底值**：旧实现是 `v-else → "GitHub"`。品牌名不是缺省值 —— 任何未列举的源都会被打上 GitHub 的牌子，等于给用户假证据（本次截图里"怎么还有 GitHub"就来自这个兜底与真实 GitHub 结果的叠加，两者无法区分）。

---

## 8. 提示文字（全量，含 locale key）

| key | zh | en | 触发条件 |
| --- | --- | --- | --- |
| `intelligence.titleAssistantTitle` | 标题参考 | Title reference | 面板头（**既有 key**，非本次新增） |
| `intelligence.titleAssistantEmpty` | 暂未找到同类高互动标题 | No comparable high-engagement titles found | `data` 已就绪但 `titles` 为空 |
| `intelligence.titleAssistantEmptyHint` | 同类标题数据来自 Reddit 与 Hacker News 的公开标题，中文题材暂无命中属正常情况。 | Comparable titles come from public Reddit and Hacker News posts; no match for Chinese topics is normal. | 同上，且 `droppedIrrelevant === 0`（源真的没响应） |
| `intelligence.titleAssistantFiltered` | 已过滤 {n} 条正文命中、但标题与当前内容不相关的结果 | Filtered {n} results that matched the body text but not the title | 同上，且 `droppedIrrelevant > 0` |

非 locale 的既有硬编码文案（`正在分析同类标题…` / `输入标题后自动分析` / `同类标题高频词：` / `高互动参考：` / `搜索失败: `）保持原样，属既有基线，本次不扩大改动面。

引擎侧产出的建议文案模板（`_generateTitleSuggestion`）：
`高互动标题常包含: {k1, k2, k3}。当前标题缺失: {m1, m2}，可考虑加入。`
—— 其中词素质量由 §4.3 保证；修复前该句式会把整句 issue 标题填进 `{k}`。

---

## 9. 验收标准

| # | 标准 | 验证方式 |
| --- | --- | --- |
| A1 | 标题参考不再出现 GitHub 条目 | 单测断言 `_searchGitHub` 未被调用（源域锁） |
| A2 | 正文命中但标题零重叠的结果不出现在任何列表 | 单测用真实事故标题「旧文归档 · 2024 年 2 月」断言 `results` 精确等于真同类那一条 |
| A3 | 高频词不含整句子句 | 单测精确断言二元组数组；并断言 `every(w => w.length <= 2)` |
| A4 | 无同类结果时显示诚实空态而非空白/垃圾 | 组件测断言「暂未找到同类高互动标题」+「已过滤 3 条」 |
| A5 | 未知来源不得显示 GitHub | 组件测断言 `not.toContain("GitHub")` 且回显 `bilibili` |
| A6 | 主题情报页仍保留 GitHub 源（未被误伤） | 单测断言 `search()` 调用了 `_searchGitHub` |
| A7 | 既有行为不回归 | `content-intelligence` 系列 + `Intelligence` + `TitleAssistantPanel` 全绿；QM-1 打包通过 |

---

## 10. 回归保护与反证矩阵

每条锁都做过「把守卫改成失效形态必须变红」的变异实测（2026-09-28）：

| 变异 | 改动 | 实测结果 |
| --- | --- | --- |
| M1 | 摘掉 `search()` 出口的相关性门禁 | **3 条变红**（43 中） |
| M2 | 把 `github` 放回 `TITLE_SOURCES` | **5 条变红** |
| M3 | `_extractPatterns` 退回按空白切词 | **2 条变红** |
| M4 | 来源标签退回 `v-else → GitHub` | **1 条变红** |
| M5 | 摘掉情报页空态的 `description` 绑定 | **1 条变红**（18 中） |
| M6 | 面板不再透传 `droppedIrrelevant`（恒 0） | **1 条变红**（10 中） |
| M7 | `MENTION_RELEVANCE_ON` 退回只看 `title` | **2 条变红**（46 中） |
| M8 | 缓存键退回不含 `relevanceOn` | **2 条变红**（9 中） |
| M9 | CJK 正则退回 BMP 区间表 | **1 条变红**（18 中） |
| M10 | 退回不剥离 URL / HTML 实体 | **1 条变红**（18 中） |

十条变异跑完均 `restored byte-identical: true`。

**探针自身两次失效（记为方法论，不当结论用）**：① 首版 VERDICT 解析式没匹配 vitest 4 的
`Tests  N failed | M passed` 汇总行，把已经变红的四条误报成 "GREEN (锁失效)" ——
判为**探针坏而非锁坏**，修解析器后重跑取可信读数；② M5 首版锚点用 `\n` 构造，而
`Intelligence.vue` 是纯 CRLF（278/278），导致 anchor 匹配 0 次而 ABORT —— 改为按文件实际行尾构造。

**同时修掉的两处"把 Bug 钉成契约"的既有断言**：

1. `tests/content-intelligence.test.js` 原版 `searchTitles` 用例把 `_searchGitHub.mockResolvedValue([])` —— 真实事故路径在这类夹具下**永远不可能被观察到**，且只断言 `patterns` 为 `toBeDefined()`。现改为投递垃圾到 reddit/hn 源，证明判据挂在标题上、与源无关。
2. `TitleAssistantPanel.test.js` 原版用 `source: "github"` 的条目并断言 `toContain("GitHub")` 为**正确渲染**。现改为 `hackernews` + `not.toContain("GitHub")`。
3. `search > deduplicates by title prefix` 用例的查询写的是 `'test'`，与其夹具标题 `'Duplicate title here'` 零重叠 —— 门禁上线后被正确判为不相关（`total` 0≠1）。该用例测的是去重不是门禁，故把查询改为 `duplicate` 并加断言 `droppedIrrelevant === 0`，让两条同题结果真正进入去重环节。

---

## 11. 已知限制

1. **中文题材大概率空态**。数据源只有 Reddit / Hacker News / GitHub 三个英文开发者平台，对中文视频标题，修好后最常见的正确表现就是「暂未找到同类高互动标题」。这是诚实，不是修坏了 —— 但要让该功能对中文创作者真正有用，需要接入中文内容平台的标题语料（另立需求，见 §12）。
2. **二元组非真分词**。`入请`、`在这` 这类跨词边界的二元组仍会产出，靠 document frequency 排序压制（跨标题重复出现的才有机会进前 5），不保证逐条都是词。
3. **无请求竞态守卫**。防抖已覆盖绝大多数输入场景，极端慢网下旧响应可能覆盖新响应。
4. **门禁对 `snippet` 无关**：只看标题。若未来某源标题字段语义不是"内容标题"，需按 §4.1 矩阵调整该功能的源域，而不是放宽门禁。
5. **同形缺陷仍存在于 `_extractKeywords`（本次未修，如实登记）**：`content-intelligence-analysis.js` 的 `_extractKeywords` 用其 CJK 连串正则（`content-intelligence-analysis.js:86`，实测字面量 `/[一-鿿㐀-䶿豈-﫿]{2,}/g`）把**整段 CJK 连串当成一个词**，与本次 R3 是同一形状的问题。它服务的是「智能标签建议 / 引用查找 / 最优发布时间」，判据是**单文档内词频**（与 §4.4 的跨标题 document frequency 不是同一口径），因此没有并入 `tokenizeContentWords`。若将来要收敛，替换点是 `tokenizeContentWords` 一处，但必须同时重跑 `tag-suggest` 与 `getOptimalTime` 的既有断言 —— 那是一次独立的行为变更，不属于本 Bug 的修复范围。
6. **`search()` 输出的 `sources` 字段是一段 no-op 过滤（既有，未动）**：它拿 `sources` 的每个元素回查同一个 `sources` 数组，恒等返回输入，包括未知源名。因此 `output.sources` 实际含义是「请求了哪些源」而不是「哪些源成功返回」。与本次修复无关，故未在同一 PR 里顺手改，登记待独立处理。
7. **情报页结果卡的 `:href` 未做协议校验（既有安全面，未动）**：`Intelligence.vue` 把外部返回的 `item.url` 直接绑到 `:href`，而 HN 的 `url` 是任意值，`javascript:` 之类会成为可点击链接。本 PR 触及的文本渲染面已核实安全（Vue `{{ }}` 自动转义、无 `v-html`），但这条**先于本 PR 存在**，应单独提 PR 加 `http:`/`https:` 白名单校验，不在这里混改。
8. **带参 locale 文案与 `.ccg/spec/frontend/index.md:39` 冲突（规格滞后于代码）**：该规格要求「带参文案必须写成 Message Function，不能写成含 `{name}` 的普通字符串」，但实测 `zh.js` 有 **98 条**普通 `{param}` 字符串，且 `i18n/index.js` 的 `toMessageFunctions` 在运行时支持它们（本 PR 用例亦实测 `{n}` 插值渲染成功）。本 PR 因此**跟随既有约定**写普通 `{n}` —— 改成 Message Function 会让它成为 98 条里唯一的异类。规格与代码谁为准需单独裁决。

## 12. 后续建议（不在本次范围）

- 接入中文内容平台的公开热榜/搜索作为 `TITLE_SOURCES` 的中文侧补充（需先取证可用端点与配额）；
- 把「标题参考」的空态文案与 §11.1 的限制在首次使用时向用户说明一次（避免被当成故障）；
- 若引入分词器，`tokenizeContentWords` 是唯一替换点，门禁与高频词共用，不需改判据。
