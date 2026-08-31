# PRD：智能标签建议功能优化（方案 C+D）

> 版本：v1.0 | 日期：2026-08-31 | 分支：`codex/smart-tag-suggest-v2`
> 状态：已确认方案（C+D） | 复杂度：L | 风险：中
> 关联功能：F11「标签推荐 智能标签生成」、F1a「标签 每平台 2-10 个，每标签 ≤30 字符」

---

## 1. 背景与问题

### 1.1 现状

当前「智能标签建议」功能（`content-intelligence-analysis.js` 的 `suggestTags()`）采用**纯本地摘词**策略：

1. `_extractKeywords()` 对标题+正文做 CJK + 英文词频统计，摘取高频词作为标签。
2. `relatedTerms` 来自 Reddit/HN 英文搜索结果的二次摘词。
3. 各平台仅通过 `platformTagStyle` 控制 `prefix`（是否加 `#`）和 `max`（标签数量上限），所有平台喂同一份 keywords。

### 1.2 问题

| 问题 | 表现 |
|------|------|
| **标签不符合真实场景** | 只是从标题/正文摘抄词句，不是真实的热门话题标签 |
| **缺乏热门话题** | 没有接入抖音/小红书/B站/微博等平台的真实热门话题，标签无流量价值 |
| **平台适配差** | 所有平台共用同一份标签，无平台类目/话题词表，不符合各平台调性 |
| **零合规过滤** | 无长度/空格/违禁词/去重检查，标签可能含空格、超长或敏感词 |
| **回退即空** | LLM 或搜索失败时直接返回空结果，用户无标签可用 |
| **无来源标注** | 用户无法区分标签是 AI 生成还是本地摘词 |

### 1.3 目标

参考抖音、小红书、Bilibili、微博等平台的智能标签功能，将「智能标签建议」升级为：

1. **LLM 生成**：利用 AI 生成语义化、场景化的内容标签与流量标签。
2. **热门话题库校准**：流量标签与真实热门话题库匹配校准，确保是热门话题而非随意摘词。
3. **平台类目树**：按平台类目/话题词表裁剪，符合各平台调性。
4. **内容/流量标签区分**：内容标签描述主题，流量标签蹭热度（须与内容关联）。
5. **合规过滤**：长度、空格、违禁词、去重、编码安全。
6. **优雅回退**：LLM 不可用/失败时回退到本地摘词，保证用户始终有标签可用。

---

## 2. 方案选型（C+D）

### 2.1 方案对比

| 方案 | 说明 | 结论 |
|------|------|------|
| A. 纯规则/词频 | 在现有摘词上优化 | ❌ 无法解决「非热门话题」根本问题 |
| B. 纯 LLM | 完全依赖 LLM 生成 | ⚠️ 无热门库校准，可能生成不存在的「伪话题」 |
| C. LLM 生成 + 热门话题库校准重排 | LLM 生成 → 热门库匹配 → 校准排序 | ✅ 核心方案 |
| D. 平台专属类目树/标准话题词表 | 按平台类目裁剪标签 | ✅ 配套方案 |

### 2.2 选定方案

**方案 C + D 组合**：

- **方案 C（核心）**：LLM 生成内容/流量标签 → 热门话题库校准（精确/别名/子话题/模糊匹配 + heat 加权重排）→ 合规过滤 → 平台裁剪。
- **方案 D（配套）**：平台专属类目树（`platform-taxonomy.json`）+ 标准话题词表（`trending-topics-*.json`），按平台调性裁剪标签。

---

## 3. 架构设计

### 3.1 模块划分

```
apps/desktop/electron/services/
├── content-intelligence-analysis.js      ← 修改：suggestTags() 改为编排入口
├── tag-suggest/                          ← 新增模块目录
│   ├── index.js                          ← 导出 suggestTagsWithLLM()
│   ├── llm-tag-generator.js              ← LLM prompt 组装 + 调用 + JSON 解析
│   ├── trending-topics-store.js          ← 热门话题库加载 + 查询 + 匹配
│   ├── calibrator.js                     ← 校准重排引擎（LLM标签 ↔ 热门库匹配）
│   ├── compliance-filter.js              ← 合规过滤（长度/空格/违禁词/去重）
│   ├── fallback-extractor.js             ← 摘词回退（复用原 _extractKeywords 逻辑）
│   └── platform-rules.js                 ← 平台规则集中管理（标签样式+类目树+上限）
├── tag-suggest-data/                     ← 静态数据目录
│   ├── trending-topics-zh.json           ← 中文平台热门话题快照
│   ├── platform-taxonomy.json            ← 平台类目树/标准话题词表
│   └── compliance-blocklist.json         ← 违禁词/敏感词基础黑名单
```

### 3.2 数据流

```
TagSuggester.vue
  │  watch(content, debounce=800ms)
  │  intelligenceSuggestTags(content, { platforms })
  ▼
preload/publish.js  →  IPC 'intelligence:suggest-tags'
  ▼
content-intelligence.js  →  IPC handler
  ▼
content-intelligence-analysis.js  →  suggestTags(content, opts)  ← 修改为编排入口
  │
  ├─ 1. 检查 LLM 可用性（aiGenerator 是否已配置）
  │     ├─ 可用 → tag-suggest/index.js::suggestTagsWithLLM()
  │     └─ 不可用 → fallback-extractor.js（原 _extractKeywords 逻辑）
  │
  ├─ 2. suggestTagsWithLLM() 流程：
  │     ├─ a. llm-tag-generator.js → 组装 prompt → 调用 AIGenerator.generateWithDefault('llm', ...)
  │     ├─ b. 解析 LLM JSON 输出（stripCodeFence + parseJson + 自定义校验）
  │     ├─ c. LLM 失败/JSON 无效 → fallback-extractor.js
  │     ├─ d. trending-topics-store.js → 按平台加载热门话题库
  │     ├─ e. calibrator.js → LLM 标签 ↔ 热门库匹配 → 校准重排
  │     ├─ f. compliance-filter.js → 合规过滤
  │     └─ g. platform-rules.js → 按平台规则裁剪（prefix/max/mode）
  │
  └─ 3. 返回统一数据结构 → IPC handler 包装 { code:0, data }
  ▼
TagSuggester.vue  →  渲染分组标签
```

### 3.3 依赖注入

`ContentIntelligence` 构造函数当前只接收 `store`。新增 `aiGenerator` 引用，采用 **setter 模式**（与 `AIGenerator` 自身一致），避免循环依赖：

```js
// content-intelligence.js
constructor(store) {
  this._store = store
  // ...
}

setAIGenerator(aiGenerator) {
  this._aiGenerator = aiGenerator
}
```

**注入点**：`bootstrap/phase1-context.js` 的 `extractContext()` 内同时有 `container.get('contentIntelligence')` 和 `container.get('aiGenerator')`，在此处调用 `contentIntelligence.setAIGenerator(aiGenerator)`。

**不采用的方式**：让 tag-suggest 模块自行 `require('ai-generator')` —— 会造成循环依赖（`ContentIntelligence` ↔ `AIGenerator`）。

---

## 4. 接口契约

### 4.1 IPC 契约（不变）

- 入参：`{ content, opts }`（`opts.platforms` 为平台数组）——**不变**
- 出参：`{ code: 0, data }` 包裹——**不变**（`data` 内部扩展）

### 4.2 数据结构（向后兼容扩展）

```ts
interface SuggestTagsResult {
  keywords: string[]                        // 内容标签（全局，描述型）——兼容旧字段
  trafficTags: string[]                     // 流量标签（全局，蹭热度型）——新增
  relatedTerms: string[]                    // 保留兼容（回退模式填充）
  byPlatform: Record<PlatformKey, string[]> // 合并输出（content+traffic）——保持数组，兼容旧字段
  byPlatformDetail: Record<PlatformKey, {
    content: string[]                       // 内容标签——新增
    traffic: string[]                       // 流量标签——新增
  }>                                        // 分组明细——新增
  source: 'llm' | 'extractor'               // 标注来源——扩展
  calibrated: boolean                       // 是否经热门库校准——新增
  matchedTopics: Record<PlatformKey, Array<{
    tag: string                             // 匹配到的话题
    heat: number                            // 热度分
  }>>                                       // 匹配到的话题明细——新增
}
```

### 4.3 关键决策：`byPlatform[p]` 保持 `string[]`

**`byPlatform[p]` 保持为 `string[]`（向后兼容）**，不改为对象。理由：

1. 前端 `TagSuggester.vue` 直接 `v-for="tag in tags"` 遍历，`copyPlatformTags` 用 `tags.join(' ')`。
2. 现有测试 `TagSuggester.test.js` 的 `successResponse()` 用 `byPlatform: { zhihu: ["#知乎", "科技"] }`（数组）。
3. 避免破坏现有前端遍历与测试。

分组明细通过**新增顶层字段 `byPlatformDetail`** 提供，前端按需读取。

### 4.4 字段语义与渲染形态契约

本节明确几个容易混淆的字段语义与前后端渲染形态契约，作为实现与测试的权威依据。

#### 4.4.1 `relatedTerms` 恒为空（有意取舍）

- **现状**：`relatedTerms` 字段保留用于向后兼容，但**恒为空数组**（`[]`）。
- **原因**：旧实现依赖 Reddit/HN 等外部搜索接口填充该字段，本次改造移除该外部依赖后，该字段不再有数据源。
- **决策**：不删除字段（避免破坏前端遍历与既有测试），但明确其恒为空。前端不得依赖该字段展示内容。
- **测试约束**：所有测试断言 `relatedTerms` 为 `[]`，不得断言非空。

#### 4.4.2 `matchedTopics` 渲染形态契约

- **数据形态**：`matchedTopics[p]` 中每项的 `tag` 字段保存**热门话题库中的原始 tag 形态**（例如 weibo 存 `#人工智能#`，zhihu 存 `人工智能`）。
- **渲染形态**：前端热度角标匹配时，必须使用**渲染形态**（经 `applyPrefix` 处理后的形态，例如 weibo 渲染为 `#人工智能`）。
- **契约**：后端在填充 `matchedTopics[p]` 时，`tag` 字段必须用 `applyPrefix(t.tag, p)` 的渲染形态写入，保证前端 `hotHeat` 精确匹配能命中。**禁止**直接写入热门库原始 tag（否则 hash 平台热度角标永不渲染）。
- **测试约束**：测试必须覆盖 hash 平台（weibo/xiaohongshu/douyin）与非 hash 平台（zhihu/bilibili）两种形态，断言 `matchedTopics[p][i].tag` 等于渲染形态。

#### 4.4.3 `fallback` 字段语义

- **语义**：`fallback` 为布尔字段，标记本次建议是否走了**摘词回退**路径（LLM 不可用或失败时）。
- **LLM 路径**：`fallback: false`。
- **回退路径**：`fallback: true`（含空内容返回）。
- **前端**：`TagSuggester.vue` 渲染该字段（展示"基础建议"来源标识），后端必须正确设置，禁止死字段。
- **测试约束**：LLM 路径断言 `fallback === false`，回退路径断言 `fallback === true`。

#### 4.4.4 `calibrated` 语义

- **语义**：`calibrated` 标记本次建议是否**经热门话题库校准重排**。
- **判定**：只要**流量标签**（traffic）中任一标签命中热门话题库（`t.matched === true`），即置 `calibrated = true`；否则为 `false`。
- **注意**：`calibrated` 与 `fallback` 独立。回退路径也可能命中热门库（摘词后校准），因此回退路径也可能 `calibrated = true`。
- **测试约束**：覆盖"流量标签命中热门库→calibrated=true"与"未命中→false"两种用例。

#### 4.4.5 内容/流量标签配额

- **内容标签（content）**：保留 `style.max - 2` 个（默认 `max=5` 时保留 3 个），为流量标签预留 2 个位置。
- **流量标签（traffic）**：最多 `2` 个。
- **合并输出**：`byPlatform[p]` 为 `content + traffic` 拼接（content 在前，traffic 在后）。
- **测试约束**：断言 content 长度 `<= max-2`，traffic 长度 `<= 2`，合并后总长 `<= max`。

### 4.5 `_extractKeywords` 与回退摘词的关系

- **现状**：`content-intelligence-analysis.js` 中旧的 `_extractKeywords` 方法在本次改造后**不再被调用**（成为死代码），回退路径统一走新增的 `fallback-extractor.js`。
- **决策**：为避免两套摘词实现漂移，回退摘词**唯一实现**为 `fallback-extractor.js` 的 `extractFallbackTags`。`_extractKeywords` 保留但标记为废弃（不删除，避免破坏既有引用），后续清理。
- **测试约束**：回退路径测试只针对 `fallback-extractor.js`，不针对 `_extractKeywords`。

---

## 5. 热门话题库设计

### 5.1 数据结构

```jsonc
// trending-topics-zh.json
{
  "version": 1,
  "updatedAt": "2026-08-25",
  "platforms": {
    "zhihu": [
      {
        "tag": "人工智能",
        "category": "科技",
        "heat": 92,            // 0-100 热度分
        "trend": "rising",     // rising | stable | declining
        "aliases": ["AI", "artificial intelligence"],
        "subTopics": ["大模型", "AGI", "深度学习"]
      }
    ],
    "weibo": [
      {
        "tag": "#年终总结#",
        "category": "职场",
        "heat": 78,
        "trend": "stable",
        "aliases": [],
        "subTopics": []
      }
    ],
    "xiaohongshu": [
      {
        "tag": "#穿搭分享#",
        "category": "时尚",
        "heat": 95,
        "trend": "stable",
        "aliases": ["穿搭"],
        "subTopics": ["日常穿搭", "通勤穿搭", "秋冬穿搭"]
      }
    ],
    "bilibili": [
      {
        "tag": "原神",
        "category": "游戏",
        "heat": 88,
        "trend": "stable",
        "aliases": [],
        "subTopics": ["原神攻略", "原神角色", "原神剧情"]
      }
    ],
    "toutiao": [
      {
        "tag": "宏观经济",
        "category": "财经",
        "heat": 70,
        "trend": "rising",
        "aliases": ["经济政策"],
        "subTopics": []
      }
    ]
  }
}
```

### 5.2 种子数据策略

| 策略 | 说明 |
|------|------|
| **静态快照起步** | 首版手动编制 5 平台 × 6 类目 × 5-8 条 ≈ 150-240 条 |
| **类目覆盖** | 每平台至少 6 类目（科技/财经/生活/娱乐/教育/职场） |
| **热度分级** | heat 90-100 爆款级、70-89 热门级、50-69 常青级，<50 不入库 |
| **更新机制** | v1 纯手动 JSON 更新；v2 预留 `fetchTrending` 对接热榜 API |
| **版本号** | `version` 字段递增，加载时校验版本，不兼容时跳过 |
| **文件组织** | 参考 `story-context-rules.json` 模式：JSON 与消费模块同目录 |

### 5.3 查询接口

```js
class TrendingTopicsStore {
  constructor(dataDir)               // dataDir → tag-suggest-data/
  load()                             // 同步加载 JSON，校验版本
  getByPlatform(platform)            // → Topic[]
  search(platform, keyword)          // 模糊匹配 tag/aliases/subTopics → Topic[]
  match(platform, tags)              // 输入标签数组 → 匹配结果 {matched:[], unmatched:[]}
  topByCategory(platform, category)  // → Topic[]
}
```

### 5.4 平台类目树（platform-taxonomy.json）

```jsonc
{
  "version": 1,
  "platforms": {
    "zhihu": {
      "categories": ["科技", "财经", "职场", "教育", "生活", "娱乐"],
      "tagStyle": { "prefix": "", "max": 10, "mode": "plain" }
    },
    "weibo": {
      "categories": ["科技", "社会", "娱乐", "体育", "财经", "生活"],
      "tagStyle": { "prefix": "#", "max": 10, "mode": "hash" }
    },
    "xiaohongshu": {
      "categories": ["时尚", "美妆", "家居", "美食", "旅行", "科技"],
      "tagStyle": { "prefix": "#", "max": 10, "mode": "hash" }
    },
    "bilibili": {
      "categories": ["游戏", "科技", "知识", "动画", "生活", "影视"],
      "tagStyle": { "prefix": "", "max": 10, "mode": "plain" }
    },
    "toutiao": {
      "categories": ["科技", "财经", "时事", "社会", "健康", "娱乐"],
      "tagStyle": { "prefix": "", "max": 10, "mode": "plain" }
    }
  }
}
```

---

## 6. LLM Prompt 设计

### 6.1 设计原则

- **平台人格化**：每个平台有独立「人设」，影响标签风格。
- **JSON 强输出**：要求 LLM 返回严格 JSON，parseJson 校验（fail-closed）。
- **双标签类型**：明确区分「内容标签」与「流量标签」。
- **温度控制**：`temperature=0.5`（折中：内容标签需精确，流量标签需创意）。

### 6.2 System Prompt

```
你是一位中国社交媒体标签策略专家。用户将提供一篇文章的内容，你需要为指定平台生成两类标签：

1. **内容标签**（content）：描述文章核心主题的关键词，用于平台推荐算法理解内容。
2. **流量标签**（traffic）：与当前热门话题相关的标签，用于获取额外曝光，但必须与文章内容有关联，不可硬蹭。

## 平台人格

{platformPersonality}

## 输出规则

- 每个平台生成 3-6 个内容标签和 2-4 个流量标签
- 标签不得包含空格，中文标签不超过 8 字，英文标签不超过 30 字符
- 流量标签必须与文章内容存在语义关联，禁止无关蹭热度
- 严格按以下 JSON 格式输出，不要输出任何其他内容：

{
  "platforms": {
    "{platform}": {
      "content": ["标签1", "标签2"],
      "traffic": ["热门标签1", "热门标签2"]
    }
  },
  "reasoning": {
    "contentFocus": "一句话概括文章核心主题",
    "trafficAngle": "一句话说明蹭热度角度"
  }
}
```

### 6.3 平台人格模板

```js
const PLATFORM_PERSONALITY = {
  zhihu: `知乎：知识社区，标签倾向专业术语和领域话题。示例：人工智能、深度学习、行业分析、职业发展。避免：过于口语化或娱乐化标签`,
  weibo: `微博：社交话题广场，标签为 #话题# 格式，倾向热点事件和社会讨论。示例：#人工智能#、#AI新突破#、#科技前沿#。避免：过于学术化标签，微博用户偏好通俗易懂`,
  xiaohongshu: `小红书：生活方式平台，标签为 #话题# 格式，倾向生活化、场景化、情绪化表达。示例：#科技好物分享#、#AI工具推荐#、#效率神器#。避免：纯学术标签，小红书用户偏好实用+种草风格`,
  bilibili: `B站：视频社区，标签倾向二次元、游戏、科技评测、知识科普。示例：人工智能、AI教程、科技UP主、硬核科普。避免：小红书式的种草标签`,
  toutiao: `今日头条：新闻资讯平台，标签倾向时事、社会热点、政策解读。示例：人工智能、AI政策、科技产业、数字经济。避免：二次元或过度娱乐化标签`,
}
```

### 6.4 User Prompt 组装

```
## 文章内容

{content}

## 目标平台

{platforms 列表，附加各自 personality}

## 当前热门话题参考

{从 trending-topics-store 按 platform 取 top-5 高 heat 话题，注入 prompt}

请为以上平台生成标签。
```

### 6.5 调用参数

```js
const params = {
  temperature: 0.5,         // 折中：内容标签需精确，流量标签需创意
  max_tokens: 800,          // 5 平台 × (6+4) 标签 + reasoning ≈ 500-700 token
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt },
  ],
}
const result = await aiGenerator.generateWithDefault('llm', params)
```

### 6.6 LLM 输出校验

复用 `prompt-eval/llm.js` 的 `stripCodeFence` + `parseJson`，新增标签专属校验：

| 校验项 | 行为 |
|--------|------|
| `parsed` 非对象 | fail-closed → 回退摘词 |
| 缺 `platforms` | fail-closed → 回退摘词 |
| `platforms[p].content` 非数组 | fail-closed → 回退摘词 |
| `platforms[p].traffic` 非数组 | fail-closed → 回退摘词 |
| 标签元素非字符串 | fail-closed → 回退摘词 |
| `reasoning` 缺失 | fail-open（不报错，跳过） |
| 某平台缺失 | fail-open（容忍，跳过该平台） |

---

## 7. 校准重排算法

### 7.1 核心思路

LLM 生成的「流量标签」需与热门话题库匹配验证——只有匹配到真实热门话题的流量标签才保留，未匹配的降级或替换为热门库中的相关话题。

### 7.2 算法流程

```
输入：llmTags = { content:[], traffic:[] }（每平台）
      hotTopics = TrendingTopicsStore.getByPlatform(platform)

1. 内容标签直通（不做校准，信任 LLM 的内容理解）
   calibratedContent = llmTags.content

2. 流量标签校准：
   for each tag in llmTags.traffic:
     a. 精确匹配：tag 在 hotTopics 中存在 → 保留，bonus = +20 heat
     b. 别名匹配：tag 在 hotTopics[].aliases 中 → 替换为 canonical tag，bonus = +15 heat
     c. 子话题匹配：tag 在 hotTopics[].subTopics 中 → 替换为父话题 tag，bonus = +10 heat
     d. 模糊匹配：tag 与 hotTopics 任一 tag 编辑距离 ≤ 2 → 替换，bonus = +5 heat
     e. 无匹配 → 标记为 unverified

3. 未验证标签处理：
   for each unverified tag:
     a. 如果 LLM confidence 高（reasoning 提到具体关联）→ 保留但降权（heat = 30）
     b. 否则 → 从 hotTopics 中选 top-N 相关话题替换

4. 排序：
   - 内容标签：保持 LLM 原始顺序
   - 流量标签：按 (matched: bool, heat+bonus) 降序

5. 合并输出：
   byPlatform[p] = [...content, ...traffic].slice(0, platformRules.max)
   byPlatformDetail[p] = { content, traffic }
```

### 7.3 权重表

| 匹配类型 | heat bonus | 排序优先级 |
|---------|-----------|-----------|
| 精确匹配 | +20 | 最高 |
| 别名匹配 | +15 | 次高 |
| 子话题匹配 | +10 | 第三 |
| 模糊匹配 | +5 | 第四 |
| 未验证-有reasoning | 30（固定） | 第五 |
| 未验证-无reasoning | 替换 | — |

### 7.4 降级/替换策略

| 场景 | 行为 |
|------|------|
| LLM 不可用 或 JSON 解析失败 | 回退摘词，`source: 'extractor'`, `calibrated: false` |
| LLM 可用但流量标签全部未验证 | 保留内容标签（`source: 'llm'`），流量标签从热门库按 heat 降序填充 |

---

## 8. 合规过滤规则

### 8.1 过滤流水线

```js
function filterTags(tags, platform) {
  return tags
    .map(tag => normalizeTag(tag, platform))   // 规范化
    .filter(tag => validateLength(tag, platform)) // 长度检查
    .filter(tag => !hasSpaces(tag))             // 空格检查
    .filter(tag => !isBlocked(tag))             // 违禁词检查
    .filter((tag, i, arr) => arr.indexOf(tag) === i) // 去重
}
```

### 8.2 规则明细

| 规则 | 实现 | 说明 |
|------|------|------|
| **长度** | 中文 ≤8 字，英文 ≤30 字符 | 各平台通用限制 |
| **空格** | 标签内不得包含空格 | 微博/小红书 `#话题#` 格式空格会断开话题 |
| **前缀规范化** | weibo/xiaohongshu/douyin 自动补 `#`；其他平台去除 `#` | 已有 `platformTagStyle` 逻辑，移入 `platform-rules.js` |
| **违禁词** | 基础黑名单 + 正则模式匹配 | `compliance-blocklist.json` + 运行时正则 |
| **去重** | 同平台内标签去重（不区分 `#` 前缀） | `人工智能` 和 `#人工智能#` 视为重复 |
| **编码安全** | 过滤控制字符、零宽字符 | 防止 XSS/注入 |

### 8.3 违禁词黑名单

```jsonc
// compliance-blocklist.json
{
  "version": 1,
  "global": [
    // 政治/色情/暴力/赌博/毒品等基础违禁词
    // 初版 ~200 条，覆盖最常见违规类别
  ],
  "platforms": {
    "xiaohongshu": [
      // 小红书特殊敏感词（导流、代购等）
    ],
    "weibo": [
      // 微博特殊敏感词
    ]
  }
}
```

**匹配方式**：标签包含黑名单词条即为违规（子串匹配），不区分大小写。中文全角/半角统一后再匹配。

---

## 9. 前端交互与显示

### 9.1 界面布局

```
┌──────────────────────────────────────────────┐
│  # 智能标签建议                        ✕     │
├──────────────────────────────────────────────┤
│                                              │
│  📝 内容标签（描述文章主题）                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │人工智能│ │深度学习│ │行业分析│ │技术趋势│       │
│  └──────┘ └──────┘ └──────┘ └──────┘        │
│                                              │
│  🔥 流量标签（关联热门话题）                    │
│  ┌──────────┐ ┌────────┐ ┌──────┐            │
│  │#AI新突破# │ │#ChatGPT│ │#大模型│            │
│  └──────────┘ └────────┘ └──────┘            │
│  ℹ️ 基于当前热门话题校准                        │
│                                              │
│  ── 各平台标签 ──────────────────────          │
│  ┌─ 知乎 ──────────────────────┐             │
│  │ 📝 人工智能 · 深度学习 · 行业分析           │
│  │ 🔥 大模型 · AGI                           │
│  │                          [复制标签]        │
│  └──────────────────────────────┘             │
│  ┌─ 微博 ──────────────────────┐             │
│  │ 📝 #人工智能# #深度学习# #行业分析#          │
│  │ 🔥 #AI新突破# #ChatGPT#                    │
│  │                          [复制标签]        │
│  └──────────────────────────────┘             │
│                                              │
│  🏷️ 来源：AI 生成 · 热门库校准 ✓              │
└──────────────────────────────────────────────┘
```

### 9.2 标签分组显示

| 分组 | 样式 | 说明 |
|------|------|------|
| 📝 内容标签 | 蓝色系 | 描述文章主题 |
| 🔥 流量标签 | 绿色系 + 热度角标 | 关联热门话题 |

### 9.3 可解释性

- 底部状态行显示来源：`AI 生成 · 热门库校准 ✓` / `本地摘词（AI 未配置）`。
- 流量标签 hover/tooltip 显示：`匹配热门话题: {tag}（热度 {heat}）`。
- 回退时显示提示：`⚠️ AI 生成失败，已切换到本地摘词模式`。

### 9.4 交互细节

| 交互 | 说明 |
|------|------|
| **复制行为不变** | 点击「复制标签」仍复制该平台全部标签（内容+流量合并，空格分隔） |
| **标签点击** | 可选——点击单个标签切换选中/取消，复制时只复制选中的 |
| **Loading 状态** | 保持 `分析内容中...` 动画，增加副文案 `AI 正在分析标签...`（LLM 模式）/ `正在提取关键词...`（摘词模式） |

### 9.5 Locale 新增键

`tagSuggest` 命名空间（zh/en 成对，CI Gate 7 强制）：

```js
// zh.js
tagSuggest: {
  title: '智能标签建议',
  contentTags: '内容标签（描述文章主题）',
  trafficTags: '流量标签（关联热门话题）',
  platformTags: '各平台标签',
  copyTags: '复制标签',
  loadingAI: 'AI 正在分析标签...',
  loadingLocal: '正在提取关键词...',
  sourceAI: 'AI 生成',
  sourceLocal: '本地摘词',
  calibrated: '热门库校准 ✓',
  notCalibrated: '未校准',
  aiNotConfigured: 'AI 未配置',
  fallbackNotice: 'AI 生成失败，已切换到本地摘词模式',
  hotMatch: '匹配热门话题: {tag}（热度 {heat}）',
  emptyContent: '输入内容后自动分析标签',
  analysisFailed: '标签分析失败',
}

// en.js
tagSuggest: {
  title: 'Smart Tag Suggestions',
  contentTags: 'Content Tags (describe article topic)',
  trafficTags: 'Traffic Tags (trending topic boost)',
  platformTags: 'Tags by Platform',
  copyTags: 'Copy Tags',
  loadingAI: 'AI is analyzing tags...',
  loadingLocal: 'Extracting keywords...',
  sourceAI: 'AI Generated',
  sourceLocal: 'Local Extraction',
  calibrated: 'Trending Calibrated ✓',
  notCalibrated: 'Not Calibrated',
  aiNotConfigured: 'AI Not Configured',
  fallbackNotice: 'AI generation failed, switched to local extraction',
  hotMatch: 'Matches trending: {tag} (heat {heat})',
  emptyContent: 'Auto-analyze tags after entering content',
  analysisFailed: 'Tag analysis failed',
}
```

---

## 10. 数据校验规则

### 10.1 输入校验

| 输入 | 规则 |
|------|------|
| `content` | 非空字符串；空内容直接返回 `{ keywords: [], byPlatform: {}, ... }` |
| `platforms` | 数组；过滤未知平台；空数组默认全部平台 |
| `opts` | 可选；`opts.platforms` 覆盖默认平台列表 |

### 10.2 输出校验

| 输出 | 规则 |
|------|------|
| `keywords` | 始终为数组（可为空） |
| `byPlatform` | 始终为对象，键为平台，值为 `string[]` |
| `byPlatformDetail` | 始终为对象，键为平台，值为 `{ content: string[], traffic: string[] }` |
| `source` | `'llm'` 或 `'extractor'` |
| `calibrated` | 布尔值 |
| `matchedTopics` | 始终为对象，值为数组 |

### 10.3 LLM 输出校验

| 校验项 | 行为 |
|--------|------|
| 非对象 / 缺 platforms | fail-closed → 回退摘词 |
| content/traffic 非数组或含非字符串 | fail-closed → 回退摘词 |
| reasoning 缺失 | fail-open |
| 某平台缺失 | fail-open |

---

## 11. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `electron/services/tag-suggest/index.js` | **新增** | 模块入口，编排 LLM → 校准 → 合规 |
| `electron/services/tag-suggest/llm-tag-generator.js` | **新增** | Prompt 组装 + LLM 调用 + JSON 校验 |
| `electron/services/tag-suggest/trending-topics-store.js` | **新增** | 热门话题库加载/查询/匹配 |
| `electron/services/tag-suggest/calibrator.js` | **新增** | 校准重排算法 |
| `electron/services/tag-suggest/compliance-filter.js` | **新增** | 合规过滤规则 |
| `electron/services/tag-suggest/fallback-extractor.js` | **新增** | 摘词回退（复用 `_extractKeywords`） |
| `electron/services/tag-suggest/platform-rules.js` | **新增** | 平台规则集中管理 |
| `electron/services/tag-suggest-data/trending-topics-zh.json` | **新增** | 中文热门话题快照 |
| `electron/services/tag-suggest-data/platform-taxonomy.json` | **新增** | 平台类目树 |
| `electron/services/tag-suggest-data/compliance-blocklist.json` | **新增** | 违禁词黑名单 |
| `electron/services/content-intelligence-analysis.js` | **修改** | `suggestTags()` 改为编排入口 |
| `electron/services/content-intelligence.js` | **修改** | 加 `setAIGenerator()` |
| `bootstrap/phase1-context.js` | **修改** | 注入 aiGenerator |
| `src/components/TagSuggester.vue` | **修改** | 分组显示、来源标识、新 locale |
| `src/locales/zh.js` | **修改** | 新增 `tagSuggest` 命名空间 |
| `src/locales/en.js` | **修改** | 新增 `tagSuggest` 命名空间 |
| `tests/content-intelligence.test.js` | **修改** | 扩展 suggestTags 测试用例 |
| `tests/tag-suggest/*.test.js` | **新增** | 各模块单元测试 |

---

## 12. 风险与边界

### 12.1 技术风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| LLM 返回非 JSON / 格式错误 | 标签生成失败 | fail-closed 校验 + 自动回退摘词 |
| LLM 延迟高（>3s） | 用户等待过久 | governor 限流已有 30s 超时；前端 debounce 800ms + loading 状态 |
| 热门话题快照过时 | 校准结果不准确 | `updatedAt` 标注；v2 预留动态更新接口 |
| 违禁词黑名单不完整 | 不合规标签泄露 | 初版覆盖主流违规；标注「基础黑名单，持续更新」 |
| 中文 CJK 分词粗糙 | 摘词回退质量低 | 回退仅作为 fallback，LLM 正常时不走此路径 |

### 12.2 边界约束

| 约束 | 说明 |
|------|------|
| **不修改 IPC 契约** | `intelligence:suggest-tags` 入参/出参包裹不变（data 内部扩展） |
| **不修改 preload 层** | `publish.js` 的 `intelligenceSuggestTags` 签名不变 |
| **不新增外部 API 依赖** | 热门话题 v1 纯静态 JSON，不调用热榜 API |
| **不修改 AIGenerator** | 复用 `generateWithDefault('llm', params)`，不改 AI 基础设施 |
| **QM-1 合规** | 修改 electron/ 代码需本地打包验证 |
| **locale 成对** | zh/en 所有新增键成对出现 |

### 12.3 性能预算

| 阶段 | 预估耗时 | 说明 |
|------|---------|------|
| LLM 调用 | 1-3s | 受 governor 限流 + provider 延迟影响 |
| JSON 解析+校验 | <10ms | 纯 CPU |
| 热门库匹配 | <50ms | 150-240 条级别线性扫描 |
| 合规过滤 | <5ms | 纯 CPU |
| 总计 | 1-4s | 对比原版摘词 ~200ms，可接受（有 loading 状态） |

### 12.4 未来扩展点（不在本次范围）

- **热门话题动态更新**：接入抖音热榜/小红书热点/B站热门/快手热搜 API。
- **标签效果追踪**：记录用户实际使用的标签 → 发布后数据 → 反馈优化。
- **标签 A/B 测试**：对比 LLM 标签 vs 摘词标签的发布后数据。
- **多轮交互**：用户「换一批」功能（LLM temperature 0.7 重新生成流量标签）。
- **标签模板**：用户自定义标签模板（行业/场景预置）。

---

## 13. 测试策略

### 13.1 单元测试

| 模块 | 核心测试点 |
|------|-----------|
| `llm-tag-generator.js` | prompt 组装正确性、JSON 解析成功/失败、校验逻辑（合法/非法结构） |
| `trending-topics-store.js` | 加载/版本校验、精确/别名/子话题/模糊匹配 |
| `calibrator.js` | 匹配 → bonus 计算 → 排序、全未验证 → 热门库替换 |
| `compliance-filter.js` | 长度/空格/违禁词/去重/编码安全 |
| `platform-rules.js` | 各平台 prefix/max/mode 规则 |
| `fallback-extractor.js` | 与原 `_extractKeywords` 结果一致性 |

### 13.2 集成测试

| 场景 | 验证 |
|------|------|
| LLM 可用 + 热门库命中 | 端到端 → 返回校准后的标签 |
| LLM 可用 + 热门库无命中 | 返回 LLM 标签 + 标记 `calibrated: false` |
| LLM 不可用 | 回退摘词，标记 `source: 'extractor'` |
| LLM 返回非法 JSON | 回退摘词 |
| governor 429 限流 | 回退摘词 |

### 13.3 Mock 模式

复用项目 `__registerMock` 模式 mock `AIGenerator`：

```js
__registerMock('./ai-generator', {
  generateWithDefault: vi.fn(async (type, params) => {
    if (type === 'llm') {
      return {
        content: JSON.stringify({
          platforms: {
            zhihu: { content: ['人工智能'], traffic: ['大模型'] },
          },
          reasoning: { contentFocus: 'AI技术', trafficAngle: '大模型热点' }
        })
      }
    }
    throw new Error('unsupported type')
  })
})
```

---

## 14. 验收标准

- [ ] LLM 可用时生成内容/流量两类标签，流量标签经热门库校准。
- [ ] `byPlatform[p]` 保持 `string[]`，现有前端与测试不受破坏。
- [ ] 新增 `byPlatformDetail`/`trafficTags`/`source`/`calibrated`/`matchedTopics` 字段。
- [ ] LLM 不可用/失败/非法 JSON 时回退摘词，`source: 'extractor'`。
- [ ] 合规过滤生效：长度/空格/违禁词/去重/编码安全。
- [ ] locale zh/en 成对新增 `tagSuggest` 命名空间。
- [ ] 单元测试 + 集成测试全部通过。
- [ ] 修改 electron/ 代码后本地打包验证（QM-1）通过。
- [ ] PRD 与架构文档、实现代码一致。
