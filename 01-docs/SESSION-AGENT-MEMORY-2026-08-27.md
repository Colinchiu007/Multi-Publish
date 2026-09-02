# 会话记录：Agent 记忆系统研究与 Multi-Publish 集成评估

> **会话主题**：研究 TencentDB Agent Memory 记忆系统，评估其能否借鉴到 Multi-Publish 项目，并深度比对多个开源 Agent 记忆系统
> **日期**：2026-08-27
> **产出文档**：
> - `01-docs/INTEGRATION-AGENT-MEMORY-2026.md` — Multi-Publish 接入记忆系统可落地集成方案
> - `01-docs/RESEARCH-AGENT-MEMORY-COMPARISON-2026.md` — 开源 Agent 记忆系统深度比对报告
>
> 本文件为会话全量问答汇总，供迁移到外部知识库使用。

---

## 目录

1. [第 1 轮：研究 TencentDB Agent Memory](#第-1-轮研究-tencentdb-agent-memory)
2. [第 2 轮：持久化/导出/多设备同步/多 Agent 共用记忆](#第-2-轮持久化导出多设备同步多-agent-共用记忆)
3. [第 3 轮：评估能否借鉴到 Multi-Publish](#第-3-轮评估能否借鉴到-multi-publish)
4. [第 4 轮：写可落地集成方案](#第-4-轮写可落地集成方案)
5. [第 5 轮：开源 Agent 记忆系统深度比对](#第-5-轮开源-agent-记忆系统深度比对)
6. [第 6 轮：能否同时装两个](#第-6-轮能否同时装两个)

---

## 第 1 轮：研究 TencentDB Agent Memory

### 用户问题

研究一下这个记忆系统：https://github.com/TencentCloud/TencentDB-Agent-Memory

### 研究过程

克隆了仓库到本地，深入阅读了 README、MemoryCore 核心源码（L0 记录器、L1 提取器、存储层、检索工具、注入管线）、MemoryProxy、MemoryPanel、MemoryKnowledge 等模块。

### 研究结论

**项目概览**：腾讯云开源的面向 Agent 团队的跨会话记忆系统。核心口号 "Agents remember. Humans innovate."。规模约 751 个 TS/JS/Vue/Py 文件，约 18.4 万行代码。MIT 许可证。

**整体架构（5 大模块 + 部署）**：

```
Agent 客户端（Claude Code / Codex / CodeBuddy / DSH 等）
        │ 改 base_url 指向 Proxy（零代码接入）
        ▼
MemoryProxy（记忆代理/注入网关）—— 拦截 LLM 请求 → 注入记忆 → 转发
        │ /v3 API                 │ 知识工具
        ▼                         ▼
MemoryCore（记忆引擎）      MemoryKnowledge（知识引擎）
L0-L3 分层记忆              Wiki + CodeGraph
Skill 技能库                文档/代码知识图谱
        │                         │
        ▼                         ▼
MemoryPanel（记忆控制台）—— 团队/资产管理、权限/绑定
        │
        ▼
存储层（本地 SQLite + sqlite-vec + FTS5，或云上 TCVDB）
```

**核心设计理念**：

1. 记忆不是"聊天记录仓库"，而是"记忆资产"（RAG 只回答"能找到什么"，团队记忆还回答"谁能用、哪个版本有效、该发给哪个 Agent"）
2. 记忆分层 L0 → L3：L0 原始对话 → L1 原子记忆（事实/偏好/约束）→ L2 场景块（项目知识）→ L3 画像（长期 profile）
3. 检索分层：通常 L2/L3 做快速上下文引导，需要具体事实时用 BM25 + 向量 + RRF 回落到 L1/L0

**关键实现细节**：

- **L0 记录器**（`l0-recorder.ts`）：JSONL 格式按天分文件，双重防重复捕获（位置切片 + 时间戳游标），清洗策略（剥离 base64 图片/代码块），用缓存原始输入替换被 prependContext 污染的 user 消息
- **L1 提取器**（`l1-extractor.ts`）：单次 LLM 调用完成"场景分割 + 记忆提取"，质量门控过滤，批量冲突检测（store/update/merge/skip），记忆类型：persona/episodic/instruction/work_fact/work_task/work_method/work_artifact
- **存储层**（`store/`）：后端无关抽象 `IMemoryStore`，能力标志（vectorSearch/ftsSearch/nativeHybridSearch/sparseVectors），SQLite（sqlite-vec + FTS5 + BM25）或 TCVDB，五维隔离（teamId/userId/agentId/taskId/sessionId）
- **混合检索**（`memory-search.ts`）：hybrid（FTS5 + 向量并行，RRF 融合）→ embedding → fts 三级降级，RRF 公式 `1/(60+rank+1)`
- **注入管线**（`injection/pipeline.ts`）：9 个注入点（system.prefix/before_tools/after_tools/suffix、tools.prepend/append、user.first_turn/before/after），锚点注入 + 粗粒度 point 回退，hook 缓存
- **跨 Agent 借入**（`tdai-fixed-asset.ts`）：self + 借入 ≤2 个 agent 合并召回

**Benchmark**：PersonaMem 从 48% 提升到 76%（+59%）。

---

## 第 2 轮：持久化/导出/多设备同步/多 Agent 共用记忆

### 用户问题

这个记忆系统有持久化的记忆保存是吧，那怎么导出和多设备同步呢，能实现吗？可以几个 agent 统一用同一套记忆吗，有这个技术实现方法吗

### 回答要点

**问题 1：持久化记忆保存 —— ✅ 有，而且是核心设计**

- L0/L1 结构化记忆存 SQLite（`vectors.db`，含 sqlite-vec + FTS5）或 TCVDB
- L2/L3 文件型记忆存本地文件系统（Markdown）或 COS 对象存储
- 两层是平行的、互相独立的抽象（`IMemoryStore` = 数据库抽象，`IStorageBackend` = 文件抽象）
- 有 checkpoint、backup、memory-generation-log（生成日志）保证持久化与可追溯

**问题 2：导出和多设备同步 —— ✅ 能实现，三条路径**

- **路径 A**：官方数据迁移工具（`MemoryCore/scripts/migrate-v2-to-v3/v2-to-v3-migrate.py`）证明数据可导出
- **路径 B**：COS 对象存储后端（`storage/factory.ts` 支持 `cos` 和 `local`），云端天然多设备共享
- **路径 C**：自建同步——把 `data/` 目录放进 git/Syncthing/NAS/云盘，或自实现 `IStorageBackend`
- ⚠️ 注意：SQLite 文件含向量索引，多设备并发写有锁冲突，建议 COS 或"单写多读"

**问题 3：多个 Agent 统一用同一套记忆 —— ✅ 这是系统最核心的设计**

- 核心机制是"固定绑定 + ACL"（Fixed Binding + ACL）
- 记忆资产统一注册，四级可见性：private / team / restricted / agent
- 跨 Agent 借入记忆（self + 借入 ≤2），合并召回后注入，每条标来源
- 按需装配（Agent Loadout）：不同 Agent 装配不同记忆资产

---

## 第 3 轮：评估能否借鉴到 Multi-Publish

### 用户问题

评估这套方案能否借鉴到你的 Multi-Publish 项目（比如给发布引擎加团队记忆）

### 评估过程

探索了 Multi-Publish 项目结构（monorepo），核对了发布引擎（`api-publish-engine`）、AI 写作引擎（`ai-writer`）、桌面端存储（`store.js`/`store-schema.js`/`publish-history.js`）等现有架构。

### 评估结论

**关键认知**：Multi-Publish 不是"Agent 框架"，而是"发布工具 + 内容生产管线"。这决定了借鉴的边界——不能照搬整套系统，但核心思想和技术模式高度可借鉴。

**现有"记忆"能力盘点**：

| 现有能力 | 文件 | 形态 |
|---|---|---|
| 发布历史 | `publish-history.js` | JSONL |
| 发布影响追踪 | `publish-impact-tracker.js` | 记录效果 |
| 内容智能 | `content-intelligence.js` | 内容分析 |
| 故事上下文 | `story-context-engine.js` | 视频创作上下文 |
| 统一 SQLite 存储 | `store.js` + `store-schema.js` | 多表 |

**现状痛点**：无统一记忆抽象、无智能召回、无跨会话学习、无团队记忆共享。

**值得借鉴的 5 个模式**：

1. ✅ **分层记忆（L0-L3）**——最值得借鉴，增量改造不推翻现有架构
2. ✅ **混合检索 + RRF 融合**——直接可复用（`1/(60+rank+1)`）
3. ✅ **记忆资产 + 可见性/ACL**——扩展现有 `owner_subject` 隔离
4. ✅ **跨 Agent 借入记忆**——内容创作 Agent 借入发布效果 Agent 经验
5. ⚠️ **Skill 技能库**——部分借鉴（版本化 + 校验规则思想）

**不建议照搬**：MemoryProxy（LLM 请求注入网关）、MemoryPanel（完整控制台）、MemoryKnowledge（Wiki + CodeGraph）、COS 存储。

**推荐落地路径（三步增量演进）**：

- 阶段 1：统一记忆抽象（新增 `memory-store` 模块，SQLite 加 `memory_l1` 表 + FTS5）
- 阶段 2：智能召回（混合检索 + 注入 ai-writer/prompt-engine）
- 阶段 3：团队记忆（扩展 `owner_subject` 为个人 + 团队两级）

**结论**：可以借鉴，但要"取其思想、弃其重量"。最佳切入点是给发布引擎加一个轻量的"发布经验记忆层"。

---

## 第 4 轮：写可落地集成方案

### 用户问题

写一份可落地的集成方案（如何在你现有架构里接入这套记忆系统）

### 产出

创建了 **`01-docs/INTEGRATION-AGENT-MEMORY-2026.md`**（261 行），核心内容：

**一句话**：借鉴 TencentDB Agent Memory 的"分层记忆 + 混合检索 + 记忆资产"思想，弃其重量，在现有 SQLite 上增量实现一个轻量"发布经验记忆层"。

**架构**：`发布历史(L0) → LLM 提炼 → 原子记忆(L1) → 混合检索召回 → 注入 AI 写作/发布规划 prompt`

**分 3 阶段交付**：

- 阶段 1：统一记忆抽象 + SQLite 记忆表（`memory_l1` + FTS5 + 向量索引），1-2 天
- 阶段 2：混合检索（BM25 + 向量 + RRF）+ 注入 prompt，2-3 天
- 阶段 3：团队记忆 + 跨账号借入，2-3 天

**关键设计**（都基于现有源码）：

- 复用现有 `store.js` 的 SQLite + `owner_subject` 隔离模型
- 复用 `SENSITIVE_CONTEXT_KEYS` 做敏感凭据守卫
- RRF 融合算法直接借鉴（`1/(60+rank+1)`）
- 注入格式借鉴 `<tdai_recalled_l1_memories>`
- 遵循项目 QM 门禁（TDD、`os.tmpdir()` 隔离测试、QM-1 打包验证）

**SQLite schema 设计**：

```sql
CREATE TABLE IF NOT EXISTS memory_l1 (
  owner_subject TEXT NOT NULL,
  team_subject  TEXT DEFAULT '',
  id            TEXT NOT NULL,
  content       TEXT NOT NULL,
  type          TEXT NOT NULL,
  priority      INTEGER DEFAULT 50,
  platform      TEXT,
  source_history_id TEXT,
  score         REAL DEFAULT 0,
  created_at    TEXT DEFAULT '',
  updated_at    TEXT DEFAULT '',
  PRIMARY KEY (owner_subject, id)
);
-- 向量索引（sqlite-vec）+ 全文索引（FTS5）
```

**注入格式示例**：

```
<recalled_publish_memories>
1. [work_fact] [douyin score=0.912] 抖音晚8点发布互动率比早间高 35%
2. [episodic] [zhihu score=0.887] 知乎长文（>1500字）比短文效果好
</recalled_publish_memories>
```

**交付计划**：总预估 5-8 天，每阶段独立交付、独立验证、独立 review。

---

## 第 5 轮：开源 Agent 记忆系统深度比对

### 用户问题

现在找一些网上类似的agent记忆系统的多个开源项目，尽量找知名或者参与者多的，和这个进行深度比对和分析，看看哪些更好

### 研究过程

克隆并深度分析了 6 个知名开源项目（基于最新源码，非二手资料）：

- TencentDB Agent Memory（基准）
- Mem0（`mem0ai/mem0`）
- Letta / MemGPT（`letta-ai/letta-code`）
- Graphiti / Zep 内核（`getzep/graphiti`）
- LangMem（`langchain-ai/langmem`）
- Zep（托管平台，内核即 Graphiti）

### 产出

创建了 **`01-docs/RESEARCH-AGENT-MEMORY-COMPARISON-2026.md`**（187 行）。

### 核心结论

**6 个项目对比**：

| 项目 | 记忆组织 | 核心机制 | 代码规模 |
|---|---|---|---|
| TencentDB | L0-L3 分层 | 异步流水线逐层提炼 + 混合检索 | ~18.4 万行 |
| Mem0 | 扁平条目 + 3 类型 | LLM 提取 + ADD/UPDATE/DELETE 去重 | ~8.4 万行 |
| Letta | MEMORY.md 文件系统 | Agent 用工具读写 Markdown 文件 | ~23.8 万行 |
| Graphiti | 时序知识图谱 | 实体-关系图 + 时间戳 + 社区检测 | ~3.6 万行 |
| LangMem | 命名空间记忆 | Agent 主动调用 manage/search 工具 | ~0.6 万行 |

**两大派系**：

- "LLM 自动提炼"派：TencentDB、Mem0（系统后台提炼，Agent 无需主动管理）
- "Agent 主动管理"派：Letta、LangMem（Agent 自己决定写什么读什么）
- "知识图谱"派：Graphiti（实体关系建模，支持多跳推理）

**综合评分（针对 Multi-Publish 发布引擎场景）**：

| 维度 | TencentDB | Mem0 | Letta | Graphiti | LangMem |
|---|---|---|---|---|---|
| 接入成本 | 1 | **5** | 2 | 2 | 4 |
| 技术栈匹配 | 3 | **5** | 3 | 2 | 2 |
| 自动提炼 | **5** | **5** | 2 | 3 | 2 |
| 去重/更新 | **5** | **5** | 2 | 3 | 2 |
| 团队记忆 | **5** | 2 | 2 | 2 | 3 |
| 检索质量 | **5** | **5** | 3 | 4 | 3 |
| 社区活跃度 | 3 | **5** | 4 | 3 | 3 |
| 架构轻量 | 1 | **5** | 2 | 2 | 4 |
| 多设备同步 | 3 | 3 | **4** | 3 | 3 |
| **总分** | 31 | **40** | 22 | 24 | 26 |

**推荐排序**：🥇 Mem0（综合最优）> 🥈 TencentDB（团队记忆最强）> 🥉 LangMem（若已用 LangGraph）

**对集成方案的修正建议**：优先考虑 Mem0 而非自研。推荐方案：

```
Mem0（核心记忆：提取/去重/检索/存储）
  + 自研扩展（团队记忆/ACL，复用现有 owner_subject）
  + 注入 ai-writer/prompt-engine
```

---

## 第 6 轮：能否同时装两个

### 用户问题

可以同时装两个吗？会冲突吗

### 回答要点

**一句话结论**：能同时装，且默认不冲突——因为两者是"不同层"的组件，各管各的存储和注入。

**为什么默认不冲突**：

| 维度 | TencentDB | Mem0 |
|---|---|---|
| 本质 | 完整记忆基础设施（多服务） | 轻量记忆库（SDK） |
| 部署形态 | 独立服务 | 库，嵌入应用 |
| 存储 | 自己的 SQLite/TCVDB + COS | 自己的向量库 |
| 注入方式 | 拦截 LLM 请求（Proxy） | 应用主动调用 add()/search() |
| 记忆内容 | 对话 + Skill + Wiki + CodeGraph | 语义/情景/程序记忆 |

**4 个边界点（处理不好才冲突）**：

1. ⚠️ **LLM 请求注入通道**（最可能冲突）：两个系统都注入记忆会导致上下文膨胀/重复。解决：二选一作为注入通道，推荐用 Mem0
2. ⚠️ **向量存储资源**：共用同一 Qdrant/Chroma 且同 collection 名会冲突。解决：用不同 collection/namespace
3. ⚠️ **Embedding 模型**：不同模型各自检索各自，不冲突但不能跨系统检索。解决：想互检索就用同一模型
4. ⚠️ **记忆内容重叠**：记录同一类内容会重复。解决：明确分工

**针对 Multi-Publish 的建议**：**不建议两个都装**。Mem0 已够用，TencentDB 架构重，两个都装 = 双份复杂度。

**如果一定要同时用**的正确姿势：

```
Mem0（主记忆层：发布经验）
  + TencentDB（仅作团队记忆存储，不用它的 Proxy 注入）
  + 统一注入通道：只用 Mem0 的 search() 注入
  + 分工：Mem0 管发布经验，TencentDB 管团队对话/协作记忆
```

---

## 附：会话关键产出文件清单

| 文件 | 说明 |
|---|---|
| `01-docs/INTEGRATION-AGENT-MEMORY-2026.md` | Multi-Publish 接入记忆系统可落地集成方案 |
| `01-docs/RESEARCH-AGENT-MEMORY-COMPARISON-2026.md` | 开源 Agent 记忆系统深度比对报告 |

## 附：关键参考资料

- TencentDB Agent Memory：https://github.com/TencentCloud/TencentDB-Agent-Memory
- Mem0：https://github.com/mem0ai/mem0
- Letta (MemGPT)：https://github.com/letta-ai/letta-code
- Graphiti (Zep 内核)：https://github.com/getzep/graphiti
- LangMem：https://github.com/langchain-ai/langmem
- Zep：https://github.com/getzep/zep

---

*本文件由会话问答自动汇总生成，供迁移到外部知识库使用。*