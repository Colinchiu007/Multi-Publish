# 爆款内容引擎 — 产品概念 v0.1

> 基于跨平台热榜数据的爆款因子分析 + 文案生成产品
> 目标用户：自媒体创作者（公众号、小红书、抖音、B站等）
> 产品形态：A(Multi-Publish 增强) + B(独立产品) + C(API 层)

---

## 一、Why

### 痛点

自媒体创作者每天面临的核心问题：
- **写什么**：什么话题有爆款潜力？现在在起势的是什么？
- **怎么写**：同样的选题，为什么别人爆了我不爆？
- **在哪发**：同一个内容，怎么适配小红书 vs 抖音 vs 公众号？

### 我们已有的积累

- `content-intelligence.js`: Reddit/HN/GitHub 热榜数据 + 互动评分引擎
- 标题分析 + 标签建议 + 基准比较：已经在 Multi-Publish 上线
- `prompt-engine`: 提示词优化管线，可直接复用于文案生成

### 核心假设

> 跨平台热榜数据的互动模式可以反向推导出"爆款因子"——将因子注入文案生成，能显著提升内容的爆款概率。

---

## 二、What — 产品能力

### 2.1 爆款因子分析 (Viral Factor Analysis)

对热榜内容进行结构化拆解，提取可量化的爆款模式：

| 因子维度 | 具体指标 | 数据来源 |
|---------|---------|---------|
| **标题结构** | 疑问句/数字列表/How-to/对比式/悬念式 | 热榜标题 NLP |
| **情感触发** | 好奇/惊讶/争议/共情/实用焦虑 | 情感分析模型 |
| **长度窗口** | 不同平台最佳标题/正文长度区间 | 互动分关联分析 |
| **关键词热力** | 当前上升最快的词/词组 | 时序趋势分析 |
| **结构模式** | 列表体/故事体/干货体/情绪体 | 正文结构分类 |
| **平台差异** | 同一话题在不同平台的表现差异 | 跨平台对比 |
| **时效曲线** | 话题从爆发到衰退的典型周期 | 时间序列分析 |

**输出示例：**
```
爆款潜力分析：《AI 编程工具的 10 个隐藏技巧》

📊 潜力分: 87/100
📈 趋势: 📈 上升中（过去 24h +240%）

🏆 推荐标题结构:
  1. "数字列表+悬念" → 期望互动: 2.3x 基准
  2. "How-to+时间承诺" → 期望互动: 1.8x 基准

🎯 平台适配:
  · 小红书: 标题≤20字，正文≥3张图，多用emoji
  · 公众号: 标题15-25字，前300字要有Hook
  · 抖音: 前3秒抛出悬念/冲突

🔥 参考爆款:
  · Reddit r/programming: 3200 upvotes
  · 小红书: 2.3w 赞 (同类话题)
```

### 2.2 爆款文案生成 (Viral Copy Generation)

基于因子分析结果，生成多角度、多平台的文案建议：

| 生成能力 | 说明 | 输出粒度 |
|---------|------|---------|
| **标题生成** | 基于热榜模式生成 N 个角度的标题 | 短文本 |
| **Hook 生成** | 开头 3 句吸引人的开场白 | 段落 |
| **内容改写** | 将已有草稿适配到目标平台 | 全文 |
| **结构建议** | 推荐最佳的正文结构（故事体/干货体等） | 大纲 |
| **多角度生成** | 同一主题 N 个不同的写作角度 | 多版本 |

### 2.3 内容改写流程

```
原文草稿
  │
  ▼
爆款因子分析 ←── 趋势数据（Reddit/HN/小红书/抖音）
  │
  ▼
平台选择（小红书 / 抖音 / 公众号 / ...）
  │
  ▼
文案改写引擎
  ├─ 标题重写（N 个候选 + 预计互动分）
  ├─ Hook 重写
  ├─ 结构重组（适配平台格式）
  └─ 正文润色（语气/长度/Emoji 等）
  │
  ▼
输出（多版本预览 + 互动潜力预估）
```

---

## 三、How — 产品形态（A+B+C）

### A: Multi-Publish 插件增强

现有 Intelligence 页面的自然延伸：

- **爆款分析 Tab**：输入主题 → 爆款潜力分 + 因子分析
- **Publish 编辑器增强**：
  - 原文草稿 → "爆款改写" 按钮 → 多版本预览
  - 标题候选列表 + 预估互动分
  - 平台适配建议（比如"当前标题过长"）
- **数据看板升级**：新增「创作趋势」模块

**依赖：** 现有 Multi-Publish v1.4.0 + 新增文案生成引擎

### B: 独立 Web 产品

专门的创作工具页面，不依赖 Electron：

- **核心页面**：
  1. 趋势热榜 — 当前各平台上升话题
  2. 爆款分析 — 输入主题/关键词，出分析报告
  3. 文案工坊 — 输入草稿，出改写建议
  4. 创作看板 — 历史分析记录 + 数据统计
- **技术栈**：Vue 3 + lightweight backend（复用 project-orchestrator）

### C: API 服务层

统一的 API 接口，同时服务 A 和 B：

```yaml
POST /api/viral/analyze:
  Body: { articles[], topic?, platform? }
  → { overall_score, trend_direction, factors, suggested_structures, rising_keywords }

POST /api/viral/generate:
  Body: { topic, content?, platform, task (titles|hooks|rewrite|structures), style?, count? }
  → { task, data: { titles|hooks|rewritten_content|suggestions } }

POST /api/viral/trending:
  Body: { articles[], platform? }
  → { total_items, category_distribution, title_structure_distribution, rising_keywords }
```

---

## 四、数据源扩展

现有 Reddit/HN/GitHub 偏技术向，扩展到小红书/抖音是关键：

| 来源 | 接入方式 | 优先级 | 难度 |
|------|---------|-------|------|
| Reddit | ✅ 已有 | - | - |
| HN | ✅ 已有 | - | - |
| GitHub | ✅ 已有 | - | - |
| **小红书热榜** | 爬虫/第三方API | P0 | 中 |
| **抖音热榜** | 爬虫/第三方API | P0 | 中 |
| 微博热搜 | 开放 API | P1 | 低 |
| 公众号热文 | 搜狗/新榜等 | P2 | 高 |

小红书和抖音的热榜数据获取策略：
1. **短期（MVP）**：手动配置热门话题种子，用 content-aggregator 流程采集
2. **中期**：自建爬虫，定时轮询热榜
3. **长期**：接入第三方数据服务商（如新榜、灰豚数据）

---

## 五、技术架构

```
┌────────────────────────────────────────────────────────┐
│                    产品层                               │
│  ┌─────────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ A: Multi-Publish │  │ B: Web App   │  │ C: API    │  │
│  │  → 爆款分析 Tab  │  │  → 趋势热榜  │  │  RESTful  │  │
│  │  → 编辑器增强    │  │  → 文案工坊  │  │  OpenAPI  │  │
│  │  → 看板升级      │  │  → 创作看板  │  │           │  │
│  └────────┬─────────┘  └──────┬───────┘  └─────┬─────┘  │
└───────────┼──────────────────┼──────────────────┼────────┘
            │                  │                  │
            └──────────────────┼──────────────────┘
                               │
┌──────────────────────────────┴────────────────────────────────┐
│                       核心服务层                               │
│                                                               │
│  ┌──────────────────────────────────────────────┐             │
│  │ 爆款文案生成引擎 (ViralCopyGenerator)          │             │
│  │  → 标题生成 (N 角度)                          │             │
│  │  → 内容改写 (平台适配)                        │             │
│  │  → Hook 生成                                 │             │
│  │  → 结构建议                                  │             │
│  └──────────────────────┬───────────────────────┘             │
│                         │                                     │
│  ┌──────────────────────┴───────────────────────┐             │
│  │ 爆款因子分析引擎 (ViralFactorAnalyzer)         │             │
│  │  → 配LLM因子提取 / 结构分析 / 情感分析         │             │
│  │  → 关键词热力追踪 / 趋势检测                  │             │
│  │  → 互动分预测模型                            │             │
│  └──────────────────────┬───────────────────────┘             │
│                         │                                     │
│  ┌──────────────────────┴───────────────────────┐             │
│  │ 统一趋势数据层 (TrendDataAggregator)          │             │
│  │     Reddit / HN / GitHub (已有)              │             │
│  │     小红书热榜 / 抖音热榜 (待接入)             │             │
│  │     统一 Schema + 去重 + 评分                 │             │
│  └──────────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────┘
```

### 与现有系统的关系

```
TrendScope → content-aggregator → [ViralFactorAnalyzer] ─┐
                                                            │
                                            ViralCopyGenerator (standalone LLM service)
                                                            │
                                              Multi-Publish ──┘
                                                 (已集成)
```

- **TrendScope**: 热榜发现层，可扩展为小红书写真/抖音热榜
- **content-aggregator**: 已具备 AI 改写能力
- **prompt-engine**: 提示词优化管线（独立运行，ViralCopyGenerator 不依赖它——因其面向图片生成）
- **ViralCopyGenerator**: 平台 orchestrator 的独立 LLM 文案生成服务，4 种生成模式（标题/Hook/改写/结构），通过 httpx 调 OpenAI 兼容 API
- **Multi-Publish**: 最终发布端 + 爆款分析前端（IPC 桥接 orchestrator API）

---

## 六、实施路线

### Phase 1 — MVP（4-6 周）

目标：验证"爆款因子 → 文案生成"的核心假设

| 序号 | 任务 | 产出 | 优先级 |
|------|------|------|-------|
| 1 | 扩展数据源：小红书热榜接入 | TrendScope 新增爬虫 | P0 |
| 2 | 扩展数据源：抖音热榜接入 | TrendScope 新增爬虫 | P0 |
| 3 | 爆款因子分析引擎 v1 | `ViralFactorAnalyzer` 核心逻辑 | P0 |
| 4 | **ViralCopyGenerator 引擎** | **独立服务（`platform-orchestrator/services/viral_generator.py`），LLM 驱动，4 种生成模式** | P0 |
| 5 | **Multi-Publish 增强（A） ✅** | **IPC 处理器 + `ViralAnalysis.vue` 视图 + 导航集成** | P0 |
| 6 | **API 层（C） ✅** | **3 endpoints + feature gates + 认证** | P1 |
| 7 | **测试 + PRD ✅** | **33 测试全通过** | P0 |

### Phase 2 — 独立产品（Q3）

目标：B 产品上线，验证独立定价

| 序号 | 任务 | 产出 |
|------|------|------|
| 1 | 独立 Web App 前端 | Vue 3 + 趋势热榜/文案工坊页面 |
| 2 | 用户系统 | 账号/用量/付费 |
| 3 | 更多数据源 | 微博热搜/公众号热文 |
| 4 | 互动分预测模型 | 基于历史数据训练 |

### Phase 3 — 平台化（Q4）

| 序号 | 任务 | 产出 |
|------|------|------|
| 1 | OpenAPI 对外发布 | 第三方接入 |
| 2 | 爆款素材库 | 历史爆款内容积累 |
| 3 | 团队协作 | 多账号/多项目 |

---

## 七、核心定位

> **一句话定位：**
> 
> 基于跨平台趋势数据的 AI 爆款文案助手——帮你回答"现在该写什么"、"怎么写会爆"、"适配哪个平台"。

**竞品差异：**
- 传统 SEO 工具 → 只看搜索量，不看互动质量
- Copy.ai / Jasper → 纯生成，没有趋势数据驱动
- 新榜 / 灰豚 → 只有数据监控，不出文案
- **我们 = 趋势数据 + 因子分析 + AI 生成，闭环**

---

## 八、数据源扩展深度分析

> 基于现有 TrendScope crawler-engine 完整代码审计的分析结论

### 8.1 当前爬虫现状

**已有基础设施（确认可用）：**

| 爬虫 | 平台 | 文件 | 数据采集范围 |
|------|------|------|-------------|
| `XiaohongshuSpider` | 小红书 | `spiders/xiaohongshu.py` | 标题、热度值、分类、作者信息、URL |
| `DouyinSpider` | 抖音 | `spiders/douyin.py` | 同上 + 娱乐/社会/科技等分类 |
| `BaseSpider` | 基类 | `spiders/base.py` | httpx 客户端、代理、Cookie、限速 |

**数据管道状态：**
TrendScope 的 `crawl_platform()` celery 任务通过 `_run_pipeline` → `write_to_db_and_cache` + `push_to_pipeline` 将数据写入 DB 并桥接到 content-aggregator。所有平台包括小红书/抖音都已经在 `crawl_all_active()` 中被调度。

### 8.2 数据结构审计

**小红书爬虫当前输出：**

```
{
    "rank": int,              # 排名
    "title": str,             # 标题（从 note_card.display_title）
    "hot_value": str,         # 热度（liked_count 或 share_count）
    "topic_url": str,         # 笔记链接
    "snapshot_at": datetime,  # 快照时间
    "category": str,          # 分类（tech/entertainment/social/lifestyle）
    "_article": {
        "title": str,
        "summary": str,       # note_card.desc（笔记描述/正文片段）
        "images": [{"url": str}],
        "author_name": str,
        "author_avatar": str,
        "source_url": str,
        "like_count": int,    # ✅ 互动数据
        "comment_count": int, # ✅ 互动数据
        "share_count": int,   # ✅ 互动数据
    }
}
```

**抖音爬虫当前输出：**
结构类似，包含 `rank`, `title`, `hot_value`, `category`, `_article` 中的互动指标。

### 8.3 数据缺口分析

| 需求 | 现状 | 缺口 | 影响 |
|------|------|------|------|
| 标题结构分析 | ✅ 有 title 字段 | 无，可直接用 | 标题模式提取 |
| 互动指标（赞/评/转） | ✅ liked_count, comment_count, share_count | 缺少收藏数、关注者数 | 爆款评分可做但不完整 |
| 正文内容（NLP 分析） | ⚠️ 只有 summary/desc 片段 | **没有全文内容抓取** | 无法做"结构模式分析"（故事体 vs 干货体 vs 情绪体） |
| 作者信息 | ✅ author_name, author_avatar | 缺少粉丝数、历史作品数 | 无法评估"作者影响力"因子 |
| 趋势数据 | 只有单次快照 | **没有时序数据**（24h/7d 变化趋势） | 无法做"时效曲线"分析 |
| 跨平台关联 | 各平台独立存储 | **没有统一去重/关联** | 同一话题在不同平台的表现无法对比 |
| 互动分基线 | Reddit/HN 有 log10 评分 | 小红书/抖音没有归一化互动分 | 无法做"基准比较" |

### 8.4 扩展策略

#### P0 — 现有能力激活（≈ 1 天）

利用现有爬虫输出即可启动 MVP，无需额外开发：

```
现有能力:
  ✅ 标题采集 → 标题结构分析 + 关键词热力
  ✅ 互动指标 → 互动分评分 + 基准比较
  ✅ 分类标签 → 按分类筛选热点
  ✅ 快照数据 → 时序聚合（多次爬取后自然形成）

缺口容忍:
  ⏳ 正文全文 → MVP 阶段用标题+摘要做因子分析
  ⏳ 作者画像 → MVP 阶段忽略，Phase 2 补充
```

**行动项：**
1. 确认 `HotArticleModel` 的互动数据被 content-aggregator 正确透传
2. 在 `HotArticleModel` 基础上增加 `ViralScoreModel`（归一化互动评分）
3. 爬虫采集频率从 6h→1h（热榜数据变化快）

#### P1 — 扩充互动数据（1-2 周）

在现有爬虫中补充缺失字段，**不需要改架构，只扩展数据模型**：

| 字段 | 平台 | 爬虫改动量 |
|------|------|-----------|
| `favor_count`（收藏） | 小红书 | +1 行 `interact.get("favor_count", 0)` |
| `author_followers` | 小红书/抖音 | +1 行 `user.get("follower_count", 0)` |
| `duration_sec`（视频时长） | 抖音 | JSON 路径确认 + 2 行 |
| `collected_count` | 抖音 | JSON 路径确认 + 1 行 |

**模型扩展建议：**
```python
# HotArticleModel 新增字段（向后兼容）
class HotArticleModel(BaseModel):
    ...
    # 🆕 互动深度指标
    favor_count: int = 0
    collected_count: int = 0
    author_followers: int = 0
    # 🆕 统一评分
    viral_score: float = 0.0  # 归一化爆款潜力分
    viral_score_norm: float = 0.0  # 按平台归一化
```

#### P2 — 正文全文抓取（Phase 2 范围）

需要评估的内容：
- **小红书**：笔记详情页需要单独的 fetch，热榜 API 不返回全文
- **抖音**：视频内容只能提取标题/描述，正文需要 ASR 转录
- **评估结论**：小 part 说红书/n_article 篇的正文获取需要独立流程，不适合热榜爬虫

**建议方案：**
```
热榜爬虫 → 发现热门笔记/视频 → 提取标题+摘要+互动
               ↓ 异步延迟
           content-aggregator 深度采集 → 抓取正文/描述全文
```

利用已有 content-aggregator 的采集能力，不做成热榜爬虫的同步任务。

#### P3 — 跨平台趋势引擎（Q3 范围）

需要新开发的系统：
- **时序存储**：SQLite 时序表或简单的轮次快照表
- **趋势检测**：滑动窗口计算 24h/7d 互动增长率和话题起势
- **去重关联**：基于标题相似度 + 关键词匹配的跨平台话题关联

### 8.5 建议路线

| 时间段 | 范围 | 投入 | 产出 |
|--------|------|------|------|
| **立即** | P0: 利用现有爬虫启动 MVP | 1 天 | 完整 Title+互动数据可用 |
| **Phase 1** | P1: 扩充互动深度指标 | 1-2 周 | 多维度爆款评分 |
| **Phase 2** | P2: 正文深度采集 | 2-3 周 | 结构模式分析能力 |
| **Q3** | P3: 跨平台趋势引擎 | 4 周+ | 趋势检测+选题推荐 |

---

## 九、共享 LLM 配置模型

### 9.1 背景：4 种分散的 LLM 配置实现

代码审计发现 4 套独立的 LLM 配置方案：

| 系统 | 实现方式 | 加密 | 典型场景 |
|------|---------|------|---------|
| `platform-orchestrator/provider_router.py` | SQLite + Fernet AES-GCM | ✅ 加密 | DB 存储、多用户、权限分级 |
| `platform-orchestrator/config.py` | Pydantic-settings env | ❌ 明文 | 服务启动配置 |
| `prompt-engine/config.yaml` | YAML + ${ENV_VAR} 解析 | ❌ 环境变量 | 单用户、静态配置 |
| `auto-exec-mechanism/model_routing.py` | JSON + 硬编码 DEFAULT_ROUTES | ❌ 明文 | 按任务类别选择模型 |

### 9.2 统一数据契约

新建 `shared_models/llm.py`，定义 6 个核心 Pydantic v2 模型：

| 模型 | 用途 | 覆盖项目数 |
|------|------|-----------|
| `LLMProviderConfig` | 单供应商配置（endpoint/key/模型列表/参数） | 4/4 |
| `ModelRoute` | 任务类别 → (供应商, 模型) 映射 | 2/4 |
| `UserLLMOverride` | 用户级 API Key 覆盖 | 1/4 |
| `LLMInvocationRequest` | 标准化的 LLM 调用请求（含路由指令） | 2/4 |
| `LLMInvocationResponse` | 标准化的 LLM 调用响应（含用量/延迟） | 2/4 |
| `LLMGlobalConfig` | 完整配置聚合（providers + routing + overrides） | 4/4 |

### 9.3 设计原则

1. **存储无关**：模型只定义*传输格式*，不约束存储方式。每个项目继续用自己的持久化方案
2. **向后兼容**：所有新增字段有默认值。现有 `config.yaml`/`model_routes.json` 无需修改即可导入
3. **单向依赖**：其他项目依赖 `shared-models`。`shared-models` 不依赖任何项目
4. **加密在存储层**：API Key 在模型中是明文——加密是各存储层的责任（参考 orchestrator 的 Fernet 模式）

### 9.4 迁移路径

| 阶段 | 范围 |
|------|------|
| **Phase 0**（已完成） | 定义数据契约 + 导出到 `shared_models.__init__` |
| **Phase 1** | prompt-engine 的 `from_config()` 工厂改为返回 `LLMProviderConfig` |
| **Phase 2** | platform-orchestrator 的 `ProviderRouter.get()` 改为返回 `LLMProviderConfig` |
| **Phase 3** | auto-exec-mechanism 的 `load_config()` 改为返回 `ModelRoute[]` |
