# DEEP-ANALYSIS-KNOWLEDGE-BASE — LLM 记忆系统深度代码分析

> 日期：2026-09-08
> 目标工作区：`D:/Data/projects/mp-worktrees/mp-rewrite-engine-v2`
> 分析对象：`E:/BaiduSyncdisk/100-Agent-data/skill-repo/llm-wiki-v2/`（本地成熟源码，最高优先级）+ `mem0ai/mem0` + `letta-ai/letta`（GitHub 公开源码）
> 当前引擎：`packages/rewrite-engine/src/knowledge-base.js`（v1，内存存储）
> 用途：为 rewrite-engine v2 的知识库升级提供算法、数据模型、移植方案

---

## 0. 结论速览（TL;DR）

- **LLM-Wiki-V2 是纯文件 + SQLite 的轻量方案**，核心算法全部集中在 `lib/` 下 7 个 Python 文件（约 1600 行），无第三方重依赖（jieba 可选）。**移植到 Node.js 复杂度低**，是 rewrite-engine v2 的首选蓝本。
- **mem0 是「向量库 + LLM 提取 + 实体链接」的重方案**，依赖 embedding 模型与向量数据库（Qdrant/FAISS 等），移植成本高，但其 **hash 去重、additive 混合评分、实体 boost、历史审计表** 值得借鉴。
- **letta（前 MemGPT）是「上下文记忆块 + 自编辑工具」范式**，核心是 `memory_blocks`（带 label/limit/read_only）与 6 个记忆编辑工具（append/replace/insert/rethink/apply_patch/finish_edits），其 **「核心记忆 vs 归档记忆」分层** 与 **agent 自编辑记忆** 机制是 v2 最值得吸收的交互范式。
- **当前 v1 `knowledge-base.js` 的差距**：无搜索、无时间衰减、无知识图谱、无矛盾检测、无隐私过滤、无生命周期、单 JSON blob 存储。**每一项都能从 LLM-Wiki-V2 直接移植**。

**推荐落地优先级**（见 §9）：
1. **P0**：SQLite 存储层（better-sqlite3）+ 置信度/遗忘曲线 + 生命周期状态机
2. **P1**：混合搜索（jieba→Node 分词 + FTS5 BM25 + RRF 融合）
3. **P1**：隐私过滤（正则表直接移植）
4. **P2**：知识图谱（wikilink 解析 + DFS 遍历 + 8 关系类型）
5. **P2**：质量评分 + 矛盾检测（bigram Jaccard）
6. **P3**：letta 式记忆块自编辑 + 归档记忆分层

---

## 1. LLM-Wiki-V2 项目结构

```
llm-wiki-v2/
├── lib/                        # 核心算法（Python，无重依赖）
│   ├── search.py               # 混合搜索：jieba + FTS5 BM25 + RRF
│   ├── confidence.py           # 置信度/遗忘曲线 + 生命周期
│   ├── entities.py             # 知识图谱：wikilink + 8 关系 + DFS
│   ├── quality.py              # 质量评分：结构/引用/可读性
│   ├── contradiction.py        # 矛盾检测：bigram Jaccard + 否定词
│   ├── privacy_filter.py       # 隐私过滤：正则表
│   ├── consolidate_ops.py      # 知识巩固：identify/reinforce/archive
│   └── migrate_ops.py          # v1→v2 迁移
├── scripts/                    # bash 编排层
├── templates/                  # 页面模板
└── SKILL.md                    # 工作流定义（init/ingest/query/lint/...）
```

数据存储形态：**Markdown 文件（frontmatter 承载元数据）+ SQLite（`.wiki-search.db`，仅存搜索索引）+ JSON（`graph-data.json`，图谱）**。这与 rewrite-engine 当前「单 JSON blob」形态差异巨大，但迁移路径清晰。

---

## 2. 混合搜索（`lib/search.py`）

### 2.1 架构：三通道 + RRF 融合

```
query
 ├─ BM25 通道  → SQLite FTS5（jieba 分词后写入）→ 关键词精确匹配
 ├─ Vector 通道→ Chroma + embeddings（可选，需 chromadb）→ 语义相似度
 └─ Graph 通道 → graph-data.json 遍历（实体识别后）→ 关联发现
        ↓
   RRF 融合（reciprocal_rank_fusion）→ 置信度重排序 → top-k
```

### 2.2 中文分词（`tokenize`）

```python
def tokenize(text):
    text = re.sub(r'[#*`>\[\]|{}~\-]', ' ', text)   # 去 Markdown 标记
    tokens = jieba.cut_for_search(text)              # 搜索引擎模式分词（更细粒度）
    return ' '.join(tokens)
```

- 关键点：**先剥 Markdown 符号再分词**，避免 `#`/`*`/`[` 被当成 token。
- `jieba.cut_for_search` 比 `cut` 产生更细的粒度（利于召回），英文原样保留。
- **jieba 是可选依赖**：`ImportError` 时回退到 `text.split()` 按空格切分。Node.js 移植时可用 `nodejieba` 或纯 JS 分词器（见 §10）。

### 2.3 BM25 索引（SQLite FTS5）

表结构：

```sql
CREATE TABLE pages (
    path TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    title_tokenized TEXT,      -- jieba 分词后
    content_tokenized TEXT,    -- jieba 分词后
    tags TEXT
);
CREATE VIRTUAL TABLE pages_fts USING fts5(
    path, title_tokenized, content_tokenized, tags,
    tokenize='porter unicode61'   -- 英文 porter 词干 + unicode 切分
);
```

- **关键设计：jieba 分词在应用层完成，FTS5 只用简单 tokenizer**。中文不依赖 FTS5 自带分词（SQLite 默认不支持中文分词）。
- 索引构建：遍历 `wiki/*.md`，提取标题（`# ` 行）、去 frontmatter、jieba 分词、写入 `pages` + `pages_fts`。
- **FTS5 不可用时回退到 `LIKE` 搜索**（`content LIKE '%term%'`），保证降级可用。

### 2.4 BM25 查询

```python
query_tokens = tokenize(query)
safe_tokens = [f'"{re.sub(r"[\"*:^+-]", "", t)}"' for t in query_tokens.split()]
fts_query = ' OR '.join(safe_tokens)   # 宽松匹配，多词 OR
# SELECT p.path, p.title, f.rank FROM pages_fts f JOIN pages p
# WHERE pages_fts MATCH ? ORDER BY f.rank LIMIT ?
# score = round(-rank, 4)   -- FTS5 的 rank 是负值，取负得正分
```

- 每个 token 用引号包裹 + 转义 FTS5 特殊字符（`"*:^+-`），防注入。
- **多词用 `OR` 连接（宽松匹配）**，FTS5 自动按 BM25 排序。
- 返回 `{path, title, score, source:'bm25'}`。

### 2.5 RRF 融合（`reciprocal_rank_fusion`）

```python
def reciprocal_rank_fusion(result_sets, k=60, top_k=10):
    scores = {}
    for results in result_sets:
        for rank, item in enumerate(results, 1):
            doc_id = item.get('path', item.get('id', ''))
            rrf_score = 1.0 / (k + rank)          # 核心公式
            scores[doc_id]['score'] += rrf_score
            scores[doc_id]['sources'].append({'engine': item.get('source'), 'rank': rank})
    return sorted(scores.values(), key=lambda x: x['score'], reverse=True)[:top_k]
```

**RRF 公式**：`score(doc) = Σ 1/(k + rank_i)`，`k=60`。

- **不依赖各通道的绝对分数**，只依赖**排名**，天然解决不同通道分数量纲不一致的问题（BM25 分数 vs 向量余弦 vs 图权重）。
- 同一 doc 出现在多通道时分数累加，`sources` 记录来源通道与排名（用于展示「bm25#2, vector#1」）。
- 权重分配：**RRF 本身不显式加权**——各通道等权，靠排名自然融合。若需加权，可在 `rrf_score` 前乘通道权重系数（v2 可扩展）。

### 2.6 置信度重排序（search 工作流）

融合后，读取结果页面的 frontmatter，按 `confidence × retrieval_priority` 重排序（`get_retrieval_priority`，见 §3.4），返回 top-5 给 LLM。**这是「搜索相关性」与「知识可信度」的二次融合**，是 v2 的关键增强点。

---

## 3. 置信度 / 遗忘曲线（`lib/confidence.py`）

### 3.1 置信度公式（Ebbinghaus 遗忘曲线）

```python
base = 0.5
source_bonus  = min(len(sources), 3) * 0.1      # 来源数加分，封顶 3 个
authority_bonus = authority * 0.2               # 权威度加分（默认 0.5）
access_bonus  = min(access_count, 10) * 0.02    # 访问次数加分，封顶 10 次
decay         = 0.5 ** (days_since_last_access / 30)   # 30 天半衰期
confidence    = (base + source_bonus + authority_bonus + access_bonus) * decay
confidence    = min(confidence, 0.99)
```

**逐项拆解**：
- **base = 0.5**：新知识默认置信度。
- **source_bonus**：来源数越多越可信，但**封顶 3 个**（`min(len,3)`），避免无限堆来源。
- **authority_bonus**：`authority` 是 frontmatter 里的权威度字段（用户可手动标注，默认 0.5），权重 0.2。
- **access_bonus**：访问次数强化记忆，**封顶 10 次**（`min(access_count,10)`），权重 0.02。
- **decay**：**30 天半衰期**——每过 30 天置信度减半。`0.5^(days/30)` 是指数衰减。
- 结果 clamp 到 `[0, 0.99]`。

**数值示例**（新知识，无来源，authority=0.5，access=0）：
- 第 0 天：`(0.5 + 0 + 0.1 + 0) × 1 = 0.6`
- 第 30 天：`0.6 × 0.5 = 0.3`
- 第 90 天：`0.6 × 0.5^3 = 0.075`
- 第 180 天：`0.6 × 0.5^6 ≈ 0.009`

### 3.2 权威度（authority）如何计算

**LLM-Wiki-V2 没有自动计算 authority**——它是 frontmatter 里的**用户手动标注字段**，默认 0.5。SKILL.md 的 v2 frontmatter 规范明确：

```yaml
authority: 0.7   # 来源权威度（用户可手动标注，默认 0.5）
```

**v2 增强建议**：可引入自动权威度——按来源类型打分（官方文档=1.0、论文=0.9、博客=0.6、聊天记录=0.3），或按来源域名信誉。这是 rewrite-engine 可扩展的点。

### 3.3 访问次数衰减机制

- `record_access()`：每次访问 `access_count += 1`，更新 `last_accessed`，重算 `confidence`。
- `reinforce()`：巩固时同样 `access_count += 1`，且 `quality = min(quality + 0.05, 0.99)`（质量分也强化）。
- **访问次数本身不衰减**，但通过 `last_accessed` 驱动 `decay` 指数衰减——**「越久没访问，置信度越低，即使访问次数很高」**。这是 Ebbinghaus 遗忘曲线的核心：记忆靠「近期复习」维持，而非累计次数。

### 3.4 检索优先级（`get_retrieval_priority`）

```python
priority = confidence * math.log1p(access_count)   # log1p = ln(1+x)
if status == 'stale':      priority *= 0.5
elif status == 'deprecated': priority *= 0.1
elif status == 'superseded': priority *= 0.01
```

- **基础优先级 = 置信度 × ln(1+访问次数)**：置信度越高、访问越多越优先。
- **状态降级**：stale 打 5 折、deprecated 打 1 折、superseded 打 1%。**这是「生命周期状态」对检索排序的直接干预**。

### 3.5 生命周期状态机

| 状态 | 触发条件 | 检索优先级系数 |
|------|---------|---------------|
| `active` | 默认 | 1.0 |
| `stale` | 超过 90 天未访问 | 0.5 |
| `deprecated` | 超过 180 天未访问 | 0.1 |
| `superseded` | 被 `supersede.sh` 取代 | 0.01 |
| `archived` | `access_count<3` 且 `>180` 天（consolidate） | 移出主库 |

**状态转换**（`check_lifecycle`，按 `last_accessed` 距今天数）：

```
active --(>90天)--> stale --(>180天)--> deprecated
active --(被取代)--> superseded
active --(低频+久未访问)--> archived
```

- 每次 `decay-check`（self-heal 触发）扫描所有页面，按天数推进状态。
- **superseded 是「版本取代」专用状态**（`supersede.sh`），旧页面标记 `status:superseded, superseded_by:[new]`，正文替换为重定向引用，原文件复制到 `archive/`。

---

## 4. 知识图谱（`lib/entities.py`）

### 4.1 8 种关系类型

```python
RELATION_TYPES = {
    'uses':          {'direction': 'unidirectional', 'label': '使用'},
    'depends_on':    {'direction': 'unidirectional', 'label': '依赖'},
    'causes':        {'direction': 'unidirectional', 'label': '导致'},
    'contradicts':   {'direction': 'bidirectional', 'label': '矛盾'},
    'supersedes':    {'direction': 'unidirectional', 'label': '取代'},
    'related_to':    {'direction': 'bidirectional', 'label': '相关'},
    'part_of':       {'direction': 'unidirectional', 'label': '部分'},
    'implemented_by':{'direction': 'unidirectional', 'label': '实现'},
}
```

- **6 单向 + 2 双向**（`contradicts`、`related_to`）。
- `contradicts` 用于矛盾检测结果落图（`add-edge --type contradicts`）。
- `supersedes` 用于版本取代（`supersede.sh` 更新图谱）。

### 4.2 Wikilink 解析

```python
WIKILINK_RE = re.compile(r'\[\[([^\]]+)\]\]')
def extract_wikilinks(content):
    links = WIKILINK_RE.findall(content)
    targets = []
    for link in links:
        if '|' in link: targets.append(link.split('|')[1].strip())  # [[display|target]]
        else:           targets.append(link.strip())
    return list(dict.fromkeys(targets))   # 去重保序
```

- 支持别名语法 `[[display|target]]`，取 `|` 后的真实目标。
- 去重保序（`dict.fromkeys`）。

### 4.3 图谱数据模型（`graph-data.json`）

```json
{
  "nodes": [{"id": "entities/X.md", "name": "X", "type": "entity", "degree": 3}],
  "edges": [{"source": "...", "target": "...", "type": "related_to", "weight": 1.0, "confidence": "EXTRACTED"}]
}
```

- 节点 `type` 由目录推断：`entities/`→entity、`topics/`→topic、`sources/`→source、`synthesis/`→synthesis。
- `build_graph_from_wiki`：扫描所有 `.md` 的 wikilinks，构建 nodes + edges（默认 `related_to`，后续由 LLM 细化类型），去重同源同目标边。

### 4.4 DFS 图遍历

```python
def graph_traverse(graph, start_name, relation_types=None, max_depth=2):
    start = find_node(graph, start_name)   # 模糊匹配（name 包含/id 包含）
    visited = set()
    def dfs(node_id, depth):
        if depth > max_depth or node_id in visited: return
        visited.add(node_id)
        for edge in graph['edges']:
            if edge['type'] not in relation_types: continue
            if edge['source'] == node_id:          # 出边
                results.append({...}); dfs(edge['target'], depth+1)
            elif edge['target'] == node_id:        # 反向边（双向关系）
                results.append({..., 'reversed': True}); dfs(edge['source'], depth+1)
    dfs(start['id'], 0)
    return results
```

- **DFS 带深度限制（默认 2）+ visited 集合防环**。
- 同时遍历出边与反向边（对 `contradicts`/`related_to` 等双向关系）。
- 返回每条边带 `depth` 与 `reversed` 标记。

### 4.5 图谱权重增强（`scripts/graph-analysis.js`，Node）

`build-graph-data.sh` 调用 Node helper 计算**3 信号边权重** + **Louvain 社区**：

```js
// 边权重 = 3 信号均值（clamp 0-1）
co_citation  = shared_inlinks / max(from_inlinks, to_inlinks, 1)   // 共引强度
source_overlap = overlap / min(from_sources, to_sources)           // 来源重叠
type_affinity = {entity:entity:1, entity:topic:1, topic:topic:0.8,
                 entity:source:0.6, source:source:0.3, default:0.5}
weight = clamp01((co_citation + source_overlap + type_affinity) / signals.length)
```

**Louvain 社区检测**（`runLocalMove` + `aggregateGraph`）：
- 模块度增益：`gain = in_weight - (total_community_degree * node_degree) / m2`。
- 迭代直到收敛（最多 50 轮），聚合出社区。
- 输出 insights：`surprising_connections`（跨社区高权重边）、`bridge_nodes`（连接 ≥2 社区）、`sparse_communities`（密度 <0.15）、`isolated_nodes`（度数 ≤1）。
- 图规模超预算（>250 节点 / >1000 边）时 insights 自动降级。

**这是 v2 可选的进阶能力**——Louvain 社区检测可直接移植为 JS（算法已在 `graph-analysis.js` 中，本身就是 Node）。

---

## 5. 质量评分（`lib/quality.py`）

### 5.1 加权公式

```python
weights = {'structure': 0.3, 'citation': 0.4, 'readability': 0.3}
quality = structure*0.3 + citation*0.4 + readability*0.3
label = 'good' if quality>=0.7 else 'needs_review' if quality>=0.4 else 'low_quality'
```

**引用权重最高（0.4）**，结构/可读性各 0.3。

### 5.2 结构完整性（`check_structure`，0-1）

| 检查项 | 加分 | 条件 |
|--------|------|------|
| 有标题 | +0.3 | 存在 `^# ` 行 |
| 有段落 | +0.3 / +0.15 | ≥2 个非标题段落 / ≥1 个 |
| 有列表 | +0.2 | 存在 `^[-*] ` 行 |
| 有引用/代码块 | +0.2 | 存在 `^> ` 或 ` ``` ` |
| 封顶 | 1.0 | |

### 5.3 引用覆盖率（`check_citation_coverage`，0-1）

| 条件 | 得分 |
|------|------|
| sources ≥ 3 | 1.0 |
| sources ≥ 2 | 0.7 |
| sources ≥ 1 | 0.4 |
| 正文 wikilink ≥ 3 | 0.5 |
| 正文 wikilink ≥ 1 | 0.3 |
| 无 | 0.1 |

- 优先看 frontmatter 的 `sources`，其次看正文 `[[wikilinks]]`。

### 5.4 可读性（`check_readability`，0-1）

```python
avg_len = 平均段落长度（去 frontmatter）
if 100 <= avg_len <= 300: return 0.9   # 100-300 字最佳
elif 50 <= avg_len <= 500: return 0.6
else: return 0.3
```

- 简化版：只按平均段落长度分档，**100-300 字段落最佳**。

### 5.5 批量评分

`batch_score(wiki_root, threshold=0.4)`：遍历所有页面，返回 quality < threshold 的页面（用于 self-heal 标记低质量页）。

---

## 6. 矛盾检测（`lib/contradiction.py`）

### 6.1 声明提取（`extract_claims`）

- 提取每个 `- `/`* ` 列表项（清理 markdown 格式，长度 >10 才算声明）。
- 提取每个段落首句（按 `。！？.!?` 切分，长度 10-200）。
- 跳过标题/列表/引用行。

### 6.2 字符级 bigram Jaccard 相似度

```python
def text_similarity(text1, text2):
    def ngrams(text, n=2):
        return set(text[i:i+n] for i in range(len(text)-n+1))
    ng1, ng2 = ngrams(text1), ngrams(text2)
    return len(ng1 & ng2) / len(ng1 | ng2)   # Jaccard
```

- **字符级 2-gram（bigram）Jaccard**：`|交集|/|并集|`。
- 对中文有效（中文没有空格分词，字符 bigram 是常用相似度手段）。

### 6.3 矛盾判定策略

```python
# 只比较有共同 wikilink 引用的页面对（避免 O(n²) 全量）
if links1 & links2 or 互相引用:
    for c1 in claims1, c2 in claims2:
        sim = text_similarity(c1, c2)
        if sim > threshold(0.7) and c1 != c2:
            has_neg1 = any(w in c1 for w in NEGATION_WORDS)   # 否定词扫描
            has_neg2 = any(w in c2 for w in NEGATION_WORDS)
            if has_neg1 != has_neg2:   # 一个有否定一个没有 = 潜在矛盾
                contradictions.append({type:'negation_conflict', ...})
```

**否定词表**：`['不','非','无','未','别','反','不是','并非','并非如此']`

**核心逻辑**：
1. **候选对剪枝**：只比较有共同引用/互相引用的页面对（避免全量 O(n²)）。
2. **高相似度**（>0.7）= 讨论同一话题。
3. **否定词不对称**（一个有否定词一个没有）= 观点相反 = 潜在矛盾。
4. 标记为 `negation_conflict`。

**矛盾解决策略**（SKILL.md contradict 工作流）：检测到矛盾 → 展示给用户 → 建议走 supersede 或修正 → 标记双方为 `contradicts` 关系（`add-edge --type contradicts`）。

---

## 7. 隐私过滤（`lib/privacy_filter.py`）

### 7.1 敏感信息正则表

| 类型 | 正则 | 说明 |
|------|------|------|
| API Key | `(sk-\|pk-\|pk_live_\|pk_test_)[a-zA-Z0-9_\-]{20,}` | OpenAI/Stripe 风格 |
| Google API Key | `AIzaSy[0-9A-Za-z_-]{33}` | |
| OpenAI Key | `OPENAI_API_KEY\s*[=:]\s*["\']?[a-zA-Z0-9_\-]{20,}` | 环境变量形式 |
| Anthropic Key | `ANTHROPIC_API_KEY\s*[=:]\s*["\']?[a-zA-Z0-9_\-]{20,}` | |
| GitHub Token | `ghp_[a-zA-Z0-9]{36}` / `gho_[a-zA-Z0-9]{36}` | |
| 密码 | `(?:password\|passwd\|pwd)\s*[=:]\s*["\']?[^\s"\'{}]{8,}` | |
| 手机号(CN) | `1[3-9]\d{9}` | |
| 身份证(CN) | `[1-9]\d{5}(?:19\|20)\d{2}(?:0[1-9]\|1[0-2])(?:0[1-9]\|[12]\d\|3[01])\d{3}[\dXx]` | 18 位含校验位 |
| 银行卡 | `(?:62\|4\d\|5[1-5])\d{14,17}` | |
| JWT | `eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+` | |
| AWS Key | `AKIA[0-9A-Z]{16}` | |
| 私钥 | `-----BEGIN (?:RSA \|EC )?PRIVATE KEY-----` | |

### 7.2 过滤策略

- `scan_content`：逐行扫描，返回 `[{type, match, position, line_number, line_preview}]`。
- `filter_content`：**替换为 `[REDACTED:TYPE]`**（从后往前替换避免偏移）。
- **SKILL.md 强调**：正则误报率高，ingest 前先让用户自查确认，脚本只做辅助扫描。**过滤策略是「替换」而非「删除/拒绝」**——替换为占位符保留上下文。

### 7.3 v2 建议

rewrite-engine 已有 `sensitive-filter.js`（敏感词库替换），可**扩展正则表**覆盖 API Key/手机号/身份证等结构化敏感信息，形成「敏感词 + 敏感信息」双层过滤。

---

---

## 8. 数据模型（SQLite 表结构设计）

综合 LLM-Wiki-V2 的 `pages`/`pages_fts`、mem0 的 `history`/`messages`、letta 的 `archival_passages` 三套表设计，为 rewrite-engine v2 设计一套统一的 SQLite 存储层。**设计原则**：以 LLM-Wiki-V2 的「页面 + 搜索索引」为骨架，吸收 mem0 的「历史审计 + 消息留存」、letta 的「记忆块分层」作为扩展。

### 8.1 表总览

| 表 | 来源借鉴 | 职责 |
|----|---------|------|
| `memories` | LLM-Wiki-V2 `pages` | 记忆主表（内容 + 元数据 + 生命周期） |
| `memories_fts` | LLM-Wiki-V2 `pages_fts` | FTS5 全文索引（BM25 搜索） |
| `memory_history` | mem0 `history` | 记忆变更审计（old/new/event/actor） |
| `memory_messages` | mem0 `messages` | 会话消息留存（每 scope 保留最近 N 条） |
| `memory_entities` | mem0 实体存储 + LLM-Wiki-V2 图谱 | 实体节点 |
| `memory_edges` | LLM-Wiki-V2 `graph-data.json` | 实体关系边（8 关系类型） |
| `memory_blocks` | letta `Block` | 核心记忆块（label/limit/read_only） |
| `memory_passages` | letta `archival_passages` | 归档记忆（长文本，可向量化） |

### 8.2 `memories` 主表（核心）

```sql
CREATE TABLE memories (
    id            TEXT PRIMARY KEY,              -- uuid
    content       TEXT NOT NULL,                  -- 记忆正文
    content_hash  TEXT NOT NULL,                  -- SHA-256，用于去重（mem0 借鉴）
    title         TEXT,                           -- 可选标题
    tags          TEXT,                           -- JSON 数组
    sources       TEXT,                           -- JSON 数组（来源引用，驱动 source_bonus）
    authority     REAL DEFAULT 0.5,               -- 权威度（用户手动标注）
    quality       REAL DEFAULT 0.5,               -- 质量分（quality.py）
    confidence    REAL DEFAULT 0.5,               -- 置信度（confidence.py 计算）
    status        TEXT DEFAULT 'active',          -- active/stale/deprecated/superseded/archived
    superseded_by TEXT,                           -- superseded 时指向新记忆 id
    access_count  INTEGER DEFAULT 0,              -- 访问次数
    created_at    TEXT NOT NULL,                  -- ISO8601 UTC
    updated_at    TEXT NOT NULL,                  -- ISO8601 UTC
    last_accessed TEXT,                           -- 驱动遗忘曲线
    scope         TEXT,                           -- 会话作用域（user_id&agent_id&run_id，mem0 借鉴）
    metadata      TEXT                            -- 扩展元数据 JSON
);
CREATE INDEX idx_memories_status ON memories(status);
CREATE INDEX idx_memories_scope ON memories(scope);
CREATE INDEX idx_memories_last_accessed ON memories(last_accessed);
```

**关键设计点**：
- **`content_hash`**：mem0 用 hash 去重——同一内容不重复入库。v2 写入前先算 SHA-256，命中则更新 `access_count`/`last_accessed` 而非新增。
- **`status` + `last_accessed`**：驱动生命周期状态机（§3.5），`check_lifecycle` 定期扫描推进状态。
- **`scope`**：mem0 的会话隔离——同一知识库可服务多用户/多 agent，用 `user_id&agent_id&run_id` 拼接（mem0 `_build_session_scope`，`%`/`&`/`=` 需转义）。

### 8.3 `memories_fts` 全文索引

```sql
CREATE VIRTUAL TABLE memories_fts USING fts5(
    id UNINDEXED,
    title_tokenized,
    content_tokenized,
    tags,
    tokenize='porter unicode61'
);
```

- **jieba 分词在应用层完成**（Node 侧），FTS5 只用 `porter unicode61`（同 LLM-Wiki-V2，中文不依赖 FTS5 自带分词）。
- 与 `memories` 通过 `id` 关联，BM25 查询 `JOIN` 取正文。
- FTS5 不可用时回退 `LIKE`（降级可用）。

### 8.4 `memory_history` 变更审计（mem0 借鉴）

```sql
CREATE TABLE memory_history (
    id          TEXT PRIMARY KEY,
    memory_id   TEXT NOT NULL,
    old_content TEXT,
    new_content TEXT,
    event       TEXT,          -- ADD/UPDATE/DELETE/REINFORCE/SUPERSEDE
    actor_id    TEXT,
    role        TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX idx_history_memory ON memory_history(memory_id);
```

- **每次记忆变更都留痕**，支持回滚、审计、调试。
- `event` 记录操作类型，`actor_id`/`role` 记录操作者（mem0 的 actor 概念）。

### 8.5 `memory_messages` 会话留存（mem0 借鉴）

```sql
CREATE TABLE memory_messages (
    id            TEXT PRIMARY KEY,
    session_scope TEXT NOT NULL,
    role          TEXT,
    content       TEXT,
    name          TEXT,
    created_at    TEXT NOT NULL
);
CREATE INDEX idx_messages_scope ON memory_messages(session_scope, created_at);
```

- **每 scope 保留最近 10 条**（mem0 `save_messages` 的 evict 逻辑），用于给 LLM 提供会话上下文。
- 写入后执行 `DELETE ... WHERE id NOT IN (SELECT id ... ORDER BY created_at DESC LIMIT 10)`。

### 8.6 `memory_entities` + `memory_edges` 知识图谱

```sql
CREATE TABLE memory_entities (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,          -- 实体名（规范化：小写去空格）
    type        TEXT,                   -- entity/topic/source/synthesis
    degree      INTEGER DEFAULT 0,
    metadata    TEXT
);
CREATE UNIQUE INDEX idx_entities_name ON memory_entities(name);

CREATE TABLE memory_edges (
    id         TEXT PRIMARY KEY,
    source_id  TEXT NOT NULL REFERENCES memory_entities(id),
    target_id  TEXT NOT NULL REFERENCES memory_entities(id),
    type       TEXT NOT NULL,           -- uses/depends_on/causes/contradicts/supersedes/related_to/part_of/implemented_by
    weight     REAL DEFAULT 1.0,
    confidence TEXT,                    -- EXTRACTED/LLM_REFINED
    UNIQUE(source_id, target_id, type)
);
CREATE INDEX idx_edges_source ON memory_edges(source_id);
CREATE INDEX idx_edges_target ON memory_edges(target_id);
```

- 实体名**规范化**（mem0 `_normalize_entity_text`：`" ".join(value.strip().lower().split())`）保证去重。
- 边 `UNIQUE(source,target,type)` 去重同源同目标边（LLM-Wiki-V2 的 `build_graph_from_wiki` 逻辑）。
- 8 关系类型见 §4.1。

### 8.7 `memory_blocks` + `memory_passages`（letta 借鉴，P3）

```sql
CREATE TABLE memory_blocks (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,          -- human/persona/自定义
    value       TEXT NOT NULL,
    limit       INTEGER DEFAULT 100000, -- 字符上限（letta CORE_MEMORY_BLOCK_CHAR_LIMIT）
    read_only   INTEGER DEFAULT 0,
    description TEXT,
    metadata    TEXT
);
CREATE UNIQUE INDEX idx_blocks_label ON memory_blocks(label);

CREATE TABLE memory_passages (
    id          TEXT PRIMARY KEY,
    text        TEXT NOT NULL,
    tags        TEXT,
    metadata    TEXT,
    embedding   BLOB,                   -- 向量（可选）
    created_at  TEXT NOT NULL
);
```

- **核心记忆 vs 归档记忆分层**：`memory_blocks` 是常驻上下文（小、精炼），`memory_passages` 是长文本归档（大、可向量化、按需检索）。
- letta `Block` 的 `limit`/`read_only`/`description` 字段直接对应。

---

## 9. 与当前引擎逐项对比

当前 `packages/rewrite-engine/src/knowledge-base.js`（v1）是**单 JSON blob + 内存 Map 存储**，能力与 LLM-Wiki-V2 差距显著。

### 9.1 能力差距表

| 能力维度 | v1 `knowledge-base.js` | LLM-Wiki-V2 / mem0 / letta | 差距 |
|---------|----------------------|---------------------------|------|
| **存储形态** | 单 JSON blob（`rewrite_engine_kb` key） | SQLite 多表 + Markdown + JSON 图谱 | 无结构化查询、无索引 |
| **搜索** | ❌ 无 | FTS5 BM25 + 向量 + 图谱三通道 RRF 融合 | 完全缺失 |
| **时间衰减** | ❌ 无（`avgSentenceLength` 用 0.7/0.3 加权但非遗忘曲线） | Ebbinghaus 30 天半衰期 | 完全缺失 |
| **置信度** | ❌ 无 | `(0.5+...)×0.5^(days/30)` | 完全缺失 |
| **生命周期** | ❌ 无 | active→stale→deprecated→superseded/archived | 完全缺失 |
| **知识图谱** | ❌ 无 | 8 关系 + wikilink + DFS + Louvain | 完全缺失 |
| **矛盾检测** | ❌ 无 | bigram Jaccard + 否定词 | 完全缺失 |
| **隐私过滤** | 有 `sensitive-filter.js`（敏感词替换） | 正则表（API Key/手机号/身份证） | 有基础，缺结构化敏感信息 |
| **历史审计** | `feedbackLog`（仅 500 条内存数组） | mem0 `history` 表（完整审计） | 无持久化审计 |
| **会话隔离** | ❌ 无 | mem0 `scope`（user_id&agent_id&run_id） | 完全缺失 |
| **记忆块分层** | ❌ 无 | letta 核心记忆 vs 归档记忆 | 完全缺失 |
| **去重** | ❌ 无 | mem0 hash 去重 | 完全缺失 |

### 9.2 v1 已有、可保留的能力

- **风格指纹**（`styleFingerprint`：平均句长、常用短语、开头/结尾模式、emoji 频率）——这是 v1 独有的、LLM-Wiki-V2 没有的能力，**v2 应保留**，可存入 `memories` 表的 `metadata` 或独立偏好表。
- **策略评分**（`getStrategyRating`：adopted=5/modified=3/rejected=1）——可迁移为 `memory_history` 的 `event` 统计。
- **偏好计数**（`industries`/`tones`/`platforms` 的 0.1 增量）——可保留为偏好表。

### 9.3 迁移策略

v1 的 JSON blob 可通过 `migrate_ops.py` 的思路（LLM-Wiki-V2 v1→v2 迁移）写一个 JS 迁移函数：读取旧 `rewrite_engine_kb` JSON → 拆解为 `memories`（feedbackLog→history、preferences→偏好表、styleFingerprint→metadata）→ 写入 SQLite → 标记迁移版本。**迁移是幂等的**（`content_hash` 去重保证）。

---

## 10. Node.js 移植方案

### 10.1 SQLite 驱动选择

| 方案 | 优点 | 缺点 | 适用 |
|------|------|------|------|
| **better-sqlite3**（推荐） | 同步 API（Electron 主进程友好）、性能好、支持 FTS5 | 需原生编译（node-gyp） | Electron 主进程、Node 服务 |
| **sql.js** | 纯 WASM，无编译 | 内存数据库，需手动持久化、性能较低 | 浏览器、无原生编译环境 |
| **node:sqlite**（Node 22+ 实验） | 内置，无依赖 | 实验性、API 未稳定 | 未来 Node 版本 |

**推荐 better-sqlite3**：
- 同步 API 与当前 `KnowledgeBase` 的同步方法签名（`init()`/`getContextSummary()`）天然兼容，无需 async 改造。
- Electron 主进程使用原生模块无问题（打包时需在 `files` 数组包含 `.node` 二进制，见 AGENTS.md QM-2「文件 glob 覆盖」）。
- **FTS5 支持**：better-sqlite3 默认编译含 FTS5（SQLite ≥3.35），但需确认——若打包环境 SQLite 版本不含 FTS5，需在编译时 `--enable-fts5` 或回退 `LIKE`。

### 10.2 中文分词

| 方案 | 说明 |
|------|------|
| **nodejieba** | 官方 jieba 的 Node 绑定，`cut_for_search` 对应 `jieba.cut_for_search`，C++ 实现性能好 |
| **@node-rs/jieba** | Rust 实现，更快，但 API 略有差异 |
| **纯 JS 分词**（如 `segmentit`/`nodejieba` 的 JS fallback） | 无原生依赖，但准确率/性能较低 |
| **FTS5 trigram tokenizer** | SQLite 3.34+ 内置，对 CJK 有效（按 3-gram 切分），可免 jieba 依赖 |

**推荐**：优先 `@node-rs/jieba` 或 `nodejieba`（对齐 LLM-Wiki-V2 的 `jieba.cut_for_search` 语义）；若想零原生依赖，可用 **FTS5 `trigram` tokenizer**（`tokenize='trigram'`），中文按 3-gram 索引，配合 `LIKE` 回退。**关键：分词必须在应用层完成，FTS5 只用简单 tokenizer**（同 LLM-Wiki-V2 设计）。

### 10.3 模块结构建议

```
packages/rewrite-engine/src/knowledge-base/
├── index.js            # 对外 API（保持 v1 的 KnowledgeBase 类签名兼容）
├── storage.js          # better-sqlite3 封装（建表、迁移、CRUD）
├── search.js           # 混合搜索（jieba + FTS5 BM25 + RRF）← LLM-Wiki-V2 search.py
├── confidence.js       # 置信度/遗忘曲线/生命周期 ← confidence.py
├── entities.js         # 知识图谱（wikilink + 8 关系 + DFS）← entities.py
├── quality.js          # 质量评分 ← quality.py
├── contradiction.js    # 矛盾检测 ← contradiction.py
├── privacy.js          # 隐私过滤（扩展正则表）← privacy_filter.py
└── memory-blocks.js    # letta 式记忆块（P3）← letta
```

每个模块对应一个 LLM-Wiki-V2 的 `lib/*.py`，**一一对应移植**，测试也一一对应（`*.test.js`）。

---

## 11. 推荐实现方案（优先级排序）

### P0 — SQLite 存储层 + 置信度 + 生命周期（最高优先）

**为什么先做**：这是所有其他能力的地基。没有 SQLite，搜索/图谱/审计都无处安放；置信度与生命周期是「记忆系统」区别于「简单 KV」的核心。

**内容**：
1. `storage.js`：建表（§8.2-8.5）+ `content_hash` 去重 + 迁移。
2. `confidence.js`：置信度公式 + `record_access`/`reinforce` + 生命周期状态机。
3. 保留 v1 的 `KnowledgeBase` 类签名，内部换 SQLite 存储。

**验收**：记忆写入/读取/去重/衰减/状态推进全部有测试；`getContextSummary` 行为不变。

### P1 — 混合搜索（jieba + FTS5 BM25 + RRF）

**内容**：
1. 分词（nodejieba 或 FTS5 trigram）+ `memories_fts` 索引。
2. BM25 查询 + 置信度重排序（`confidence × ln(1+access)`）。
3. RRF 融合（`1/(60+rank)`），预留向量/图谱通道。

**验收**：中文关键词能召回相关记忆；`LIKE` 回退可用。

### P1 — 隐私过滤（正则表直接移植）

**内容**：把 `privacy_filter.py` 的正则表（§7.1）移植为 JS，扩展 `sensitive-filter.js` 为「敏感词 + 敏感信息」双层。

**验收**：API Key/手机号/身份证等结构化信息被替换为 `[REDACTED:TYPE]`。

### P2 — 知识图谱（wikilink + 8 关系 + DFS）

**内容**：`entities.js` + `memory_entities`/`memory_edges` 表；wikilink 解析、DFS 遍历、可选 Louvain 社区检测（`graph-analysis.js` 已是 Node）。

**验收**：实体提取、关系落库、DFS 遍历有测试。

### P2 — 质量评分 + 矛盾检测

**内容**：`quality.js`（结构 0.3/引用 0.4/可读性 0.3）+ `contradiction.js`（bigram Jaccard + 否定词）。

**验收**：低质量页被标记；矛盾对能被检测并落 `contradicts` 边。

### P3 — letta 式记忆块自编辑 + 归档记忆分层

**内容**：`memory-blocks.js` + `memory_blocks`/`memory_passages` 表；6 个记忆编辑工具（append/replace/insert/rethink/apply_patch/finish_edits）。

**验收**：agent 能通过工具自编辑记忆块；核心记忆 vs 归档记忆分层清晰。

---

## 12. 具体可移植 Python→JS 代码对照

以下给出核心算法的 Python 原文 + JS 移植对照，供实现时直接参考。

### 12.1 置信度公式（confidence.py → confidence.js）

**Python 原文**（`lib/confidence.py`）：
```python
def compute_confidence(sources, authority, access_count, days_since_last_access):
    base = 0.5
    source_bonus  = min(len(sources), 3) * 0.1
    authority_bonus = authority * 0.2
    access_bonus  = min(access_count, 10) * 0.02
    decay         = 0.5 ** (days_since_last_access / 30)
    confidence    = (base + source_bonus + authority_bonus + access_bonus) * decay
    return min(confidence, 0.99)
```

**JS 移植**：
```js
function computeConfidence(sources, authority, accessCount, daysSinceLastAccess) {
  const base = 0.5
  const sourceBonus = Math.min(sources.length, 3) * 0.1
  const authorityBonus = authority * 0.2
  const accessBonus = Math.min(accessCount, 10) * 0.02
  const decay = Math.pow(0.5, daysSinceLastAccess / 30)
  const confidence = (base + sourceBonus + authorityBonus + accessBonus) * decay
  return Math.min(confidence, 0.99)
}
```

### 12.2 RRF 融合（search.py → search.js）

**Python 原文**（`lib/search.py`）：
```python
def reciprocal_rank_fusion(result_sets, k=60, top_k=10):
    scores = {}
    for results in result_sets:
        for rank, item in enumerate(results, 1):
            doc_id = item.get('path', item.get('id', ''))
            rrf_score = 1.0 / (k + rank)
            scores.setdefault(doc_id, {'score': 0.0, 'sources': []})
            scores[doc_id]['score'] += rrf_score
            scores[doc_id]['sources'].append({'engine': item.get('source'), 'rank': rank})
    return sorted(scores.values(), key=lambda x: x['score'], reverse=True)[:top_k]
```

**JS 移植**：
```js
function reciprocalRankFusion(resultSets, k = 60, topK = 10) {
  const scores = new Map()
  for (const results of resultSets) {
    results.forEach((item, idx) => {
      const rank = idx + 1
      const docId = item.path ?? item.id ?? ''
      const rrfScore = 1.0 / (k + rank)
      if (!scores.has(docId)) scores.set(docId, { score: 0.0, sources: [] })
      const entry = scores.get(docId)
      entry.score += rrfScore
      entry.sources.push({ engine: item.source, rank })
    })
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, topK)
}
```

### 12.3 bigram Jaccard 相似度（contradiction.py → contradiction.js）

**Python 原文**（`lib/contradiction.py`）：
```python
def text_similarity(text1, text2):
    def ngrams(text, n=2):
        return set(text[i:i+n] for i in range(len(text)-n+1))
    ng1, ng2 = ngrams(text1), ngrams(text2)
    return len(ng1 & ng2) / len(ng1 | ng2)
```

**JS 移植**：
```js
function textSimilarity(text1, text2) {
  const ngrams = (text, n = 2) => {
    const set = new Set()
    for (let i = 0; i <= text.length - n; i++) set.add(text.slice(i, i + n))
    return set
  }
  const ng1 = ngrams(text1)
  const ng2 = ngrams(text2)
  let inter = 0
  for (const g of ng1) if (ng2.has(g)) inter++
  const union = new Set([...ng1, ...ng2]).size
  return union === 0 ? 0 : inter / union
}
```

### 12.4 隐私正则过滤（privacy_filter.py → privacy.js）

**Python 原文**（`lib/privacy_filter.py`）：
```python
PRIVACY_PATTERNS = {
    'api_key': r'(sk-|pk-|pk_live_|pk_test_)[a-zA-Z0-9_\-]{20,}',
    'phone_cn': r'1[3-9]\d{9}',
    'id_card_cn': r'[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]',
    'jwt': r'eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+',
}

def filter_content(text):
    result = text
    for name, pattern in PRIVACY_PATTERNS.items():
        result = re.sub(pattern, f'[REDACTED:{name}]', result)
    return result
```

**JS 移植**：
```js
const PRIVACY_PATTERNS = {
  api_key: /(sk-|pk-|pk_live_|pk_test_)[a-zA-Z0-9_\-]{20,}/g,
  phone_cn: /1[3-9]\d{9}/g,
  id_card_cn: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
  jwt: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
}

function filterContent(text) {
  let result = text
  for (const [name, pattern] of Object.entries(PRIVACY_PATTERNS)) {
    result = result.replace(pattern, `[REDACTED:${name}]`)
  }
  return result
}
```

### 12.5 mem0 混合评分（scoring.py → scoring.js，P1 增强）

mem0 的 additive 评分与 LLM-Wiki-V2 的 RRF 是两种融合思路，可互补：

```js
function getBm25Params(numTerms) {
  if (numTerms <= 3) return [5.0, 0.7]
  if (numTerms <= 6) return [7.0, 0.6]
  if (numTerms <= 9) return [9.0, 0.5]
  if (numTerms <= 15) return [10.0, 0.5]
  return [12.0, 0.5]
}

function normalizeBm25(rawScore, midpoint, steepness) {
  return 1.0 / (1.0 + Math.exp(-steepness * (rawScore - midpoint)))
}

// combined = (semantic + bm25 + entity_boost*0.5) / max_possible
function scoreAndRank(semanticResults, bm25Scores, entityBoosts, threshold, topK) {
  const hasBm25 = Object.keys(bm25Scores).length > 0
  const hasEntity = Object.keys(entityBoosts).length > 0
  let maxPossible = 1.0
  if (hasBm25) maxPossible += 1.0
  if (hasEntity) maxPossible += 0.5

  const scored = []
  for (const result of semanticResults) {
    const semanticScore = result.score ?? 0
    if (semanticScore < threshold) continue
    const id = String(result.id)
    const bm25 = bm25Scores[id] ?? 0
    const entity = entityBoosts[id] ?? 0
    const combined = Math.min((semanticScore + bm25 + entity) / maxPossible, 1.0)
    scored.push({ id, score: combined, payload: result.payload })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, topK)
}
```

---

## 附：参考来源

- **LLM-Wiki-V2**（本地）：`E:/BaiduSyncdisk/100-Agent-data/skill-repo/llm-wiki-v2/`，`lib/` 下 7 个 Python 文件 + `scripts/` + `SKILL.md`。
- **mem0**（GitHub `mem0ai/mem0`）：`D:/Temp/mem0-src/`（storage.py、scoring.py、main.py、lemmatization.py、entity_extraction.py）。
- **letta**（GitHub `letta-ai/letta`，archive 分支 V1 Python 源码）：`D:/Temp/letta-src/`（schemas/block.py、schemas/passage.py、functions/function_sets/base.py、orm/passage.py）。
- **当前引擎**：`packages/rewrite-engine/src/knowledge-base.js`、`sensitive-filter.js`、`tests/knowledge-base.test.js`。

> 注：letta 主源码已迁移到 `letta-ai/letta-code`（TS 项目），archive 分支保留 V1 Python 源码；mem0 是「向量库 + LLM 提取 + 实体链接」的重方案，letta 是「记忆块 + 自编辑工具」范式。本分析以 LLM-Wiki-V2 为移植蓝本，mem0/letta 仅作能力借鉴。
