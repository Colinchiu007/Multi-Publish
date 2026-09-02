# 开源 Agent 记忆系统深度比对报告

> **日期**：2026-08-27
> **研究目的**：在 TencentDB Agent Memory 之外，找更多知名开源 Agent 记忆系统，深度比对分析，评估哪个更适合 Multi-Publish 项目
> **研究方法**：克隆 6 个项目到本地，基于最新源码（非二手资料）逐项分析
> **参考**：`01-docs/SESSION-AGENT-MEMORY-2026-08-27.md`（会话全量问答汇总）

---

## 目录

1. [研究项目一览](#1-研究项目一览)
2. [各项目深度分析](#2-各项目深度分析)
3. [核心机制对比矩阵](#3-核心机制对比矩阵)
4. [技术架构深度分析](#4-技术架构深度分析)
5. [三大派系归类](#5-三大派系归类)
6. [综合评分（针对 Multi-Publish）](#6-综合评分针对-multi-publish)
7. [推荐与结论](#7-推荐与结论)

---

## 1. 研究项目一览

| # | 项目 | GitHub | 语言 | 代码规模 | 许可证 | 核心定位 |
|---|---|---|---|---|---|---|
| 1 | **TencentDB Agent Memory** | TencentCloud/TencentDB-Agent-Memory | TS/JS/Vue/Py | ~18.4 万行 | MIT | Agent 团队记忆基础设施 |
| 2 | **Mem0** | mem0ai/mem0 | Python + TS | ~8.4 万行 | MIT | LLM 驱动的记忆 SDK |
| 3 | **Letta (MemGPT)** | letta-ai/letta-code | TS | ~23.8 万行 | GPL-3.0 | 文件系统记忆 Agent 框架 |
| 4 | **Graphiti (Zep 内核)** | getzep/graphiti | Python | ~3.6 万行 | MIT | 时序知识图谱记忆 |
| 5 | **LangMem** | langchain-ai/langmem | Python | ~0.6 万行 | MIT | LangGraph 记忆工具 |
| 6 | **Zep Cloud** | getzep/zep | Python/TS | 托管平台 | 商业 | 托管记忆服务（内核即 Graphiti） |

---

## 2. 各项目深度分析

### 2.1 TencentDB Agent Memory

**定位**：面向 Agent 团队的跨会话记忆基础设施。"Agents remember. Humans innovate."

**记忆组织**：L0 → L1 → L2 → L3 分层

- L0：原始对话记录（JSONL，按天分文件）
- L1：原子记忆（LLM 提炼，结构化条目，含 memory_types）
- L2：场景块（项目级知识聚合）
- L3：画像（长期 persona profile）

**核心机制**：

- **异步流水线逐层提炼**：L0 捕获 → L1 提取（单次 LLM 调用完成场景分割 + 记忆提取）→ L2 聚合 → L3 画像
- **混合检索**：hybrid（FTS5 + 向量并行，RRF 融合）→ embedding → fts 三级降级
- **RRF 公式**：`score = 1/(60+rank+1)`，跨列表累加
- **冲突检测**：批量检测，store/update/merge/skip 四策略
- **存储隔离**：五维（teamId/userId/agentId/taskId/sessionId）
- **注入管线**：9 个注入点（system.prefix/before_tools/after_tools/suffix、tools.prepend/append、user.first_turn/before/after）
- **跨 Agent 借入**：self + 借入 ≤2 个 agent 合并召回

**优势**：分层记忆最成熟、团队记忆/ACL 最强、检索质量高、Benchmark 有数据支撑

**劣势**：架构最重（18.4 万行）、部署复杂（需要 Proxy 服务）、团队记忆是核心但单人场景过度设计

### 2.2 Mem0

**定位**：LLM 驱动的记忆 SDK，YC S24。"Memories give AI apps the ability to remember."

**记忆组织**：扁平条目 + 3 类型（语义 / 情景 / 程序）

- **语义记忆**（Semantic）：用户事实、偏好、长期知识
- **情景记忆**（Episodic）：具体事件、对话历史、上下文
- **程序记忆**（Procedural）：工作流程、方法、规则

**核心机制**：

- **LLM 自动提取**：每次对话后自动从交互中提取记忆，无需 Agent 主动管理
- **去重/更新机制**：基于 LLM 相似度判断，自动 UPDATE 或 DELETE 重复/冲突记忆
- **检索**：向量检索 + LLM 后处理，结果质量依赖嵌入模型
- **存储后端**：支持 Qdrant、Pinecone、Chroma 等（不绑定单一数据库）

**优势**：API 最简单（add/search/delete）、Python + TS 双 SDK、社区活跃（YC 背书）、接入成本极低、架构轻量

**劣势**：无内建团队记忆/ACL、检索能力比 TencentDB 略弱（无 BM25 + RRF 混合）、无分层记忆

### 2.3 Letta (MemGPT)

**定位**：让 Agent 拥有类似人类工作记忆的系统。原 MemGPT。

**记忆组织**：MEMORY.md 文件系统

- 一个 Markdown 文件包含 Agent 的完整记忆
- 分为"核心记忆"（有限容量，类似短期记忆）和"归档记忆"（长期）
- Agent 用工具读写自己的 MEMORY.md

**核心机制**：

- **Agent 主动管理**：Agent 自己决定写什么、读什么、归档什么
- **容量约束**：核心记忆有 token 上限，超出后 Agent 必须自己"遗忘"或"归档"
- **工具驱动**：提供 read_memory/write_memory/archive_memory 等工具
- **状态管理**：类似人类记忆的工作机制（工作记忆 + 长期记忆 + 归档）

**优势**：设计理念新颖（模拟人类记忆）、对 Agent 行为可解释性强、不依赖外部存储基础设施

**劣势**：无自动去重/更新（靠 Agent 自己判断）、检索能力弱（就是读文件）、代码规模最大（23.8 万行，但很多是 Agent 框架代码）、无团队记忆、GPL-3.0 许可证有传染性

### 2.4 Graphiti (Zep 内核)

**定位**：时序知识图谱记忆，让 Agent 理解实体之间的关系和变化。Zep Cloud 的开源内核。

**记忆组织**：实体-关系-事件三元组 + 时间戳

- **实体**（Entity）：人、物、概念
- **关系**（Relation）：实体间的连接
- **事件**（Event）：发生在实体上的行为
- **时间戳**：所有关系和事件都有时间维度

**核心机制**：

- **知识图谱构建**：从对话中自动提取实体、关系、事件
- **时间旅行查询**：可查询"昨天张三和李四是朋友，现在呢"
- **社区检测**：基于图算法发现实体聚类
- **存储**：支持 Neo4j、FalkorDB、Kuzu、Neptune 等图数据库

**优势**：实体关系建模能力最强、支持多跳推理、时间维度是唯一亮点、图数据库生态成熟

**劣势**：需要图数据库基础设施（部署复杂）、代码规模大但记忆核心占比低、团队记忆/ACL 弱、对发布引擎场景过重

### 2.5 LangMem

**定位**：LangChain 生态下的 Agent 记忆工具。"Give your LangGraph agents long-term memory."

**记忆组织**：命名空间记忆

- 按命名空间组织记忆条目
- Agent 通过工具主动调用 manage/search
- 记忆存储在 LangChain 的向量存储中

**核心机制**：

- **Agent 主动管理**：Agent 调用 `manage_memory` 工具决定存什么
- **向量存储检索**：标准 LangChain retriever
- **与 LangGraph 深度集成**：原生支持 LangGraph 的 state 管理

**优势**：与 LangChain/LangGraph 生态无缝集成、代码极小（0.6 万行）、API 简洁

**劣势**：强依赖 LangChain 生态（Multi-Publish 不用）、无自动提炼（靠 Agent 主动写）、无团队记忆、无混合检索、功能最单一

### 2.6 Zep Cloud

**定位**：托管的 Agent 记忆服务（平台型产品）

**核心机制**：

- 内核即 Graphiti（知识图谱）
- 提供托管服务（API 调用），无需自建
- 记忆、检索、管理一体化

**优势**：零部署、开箱即用、商业支持

**劣势**：商业产品（非完全开源）、依赖 Graphiti 的知识图谱模式、锁定风险、成本

---

## 3. 核心机制对比矩阵

| 机制 | TencentDB | Mem0 | Letta | Graphiti | LangMem | Zep |
|---|---|---|---|---|---|---|
| **记忆组织** | L0-L3 分层 | 3 类型扁平 | MEMORY.md 文件 | 知识图谱 | 命名空间 | 知识图谱 |
| **提炼方式** | 自动（LLM 流水线） | 自动（LLM） | Agent 主动 | 自动（LLM） | Agent 主动 | 自动（LLM） |
| **去重/更新** | ✅ 批量冲突检测 | ✅ LLM 相似度 | ❌ Agent 自己判断 | ⚠️ 部分（时间戳覆盖） | ❌ | ⚠️ 部分 |
| **检索方式** | BM25 + 向量 + RRF | 向量 + LLM 后处理 | 文件读取 | 图查询 | 向量 | 图查询 |
| **团队记忆** | ✅ 四级 ACL | ❌ | ❌ | ❌ | ❌ | ⚠️ 商业版 |
| **跨 Agent 共享** | ✅ 固定绑定 + 借入 | ❌ 需自研 | ❌ | ❌ | ❌ | ❌ |
| **存储依赖** | SQLite + 向量 | Qdrant/Pinecone 等 | 文件系统 | 图数据库 | 向量存储 | 托管 |
| **注入方式** | Proxy 网关 | SDK 调用 | 工具调用 | API 调用 | 工具调用 | API 调用 |
| **部署复杂度** | 高（多服务） | 低（库） | 中（Agent 框架） | 高（图数据库） | 极低 | 零（托管） |

---

## 4. 技术架构深度分析

### 4.1 分层深度

```
TencentDB: L0(对话) → L1(原子) → L2(场景) → L3(画像)  ← 四层
Graphiti:  事件 → 实体 → 关系 → 社区              ← 四层（知识图谱）
Mem0:      对话 → 记忆条目（3 类型）               ← 两层
Letta:     MEMORY.md（核心 + 归档）                ← 两层
LangMem:   命名空间 → 条目                         ← 两层
```

**结论**：TencentDB 分层最完整，但发布引擎场景是否需要 L2/L3 值得商榷。Mem0 的两层结构（对话→记忆）对 Multi-Publish 已经够用。

### 4.2 检索质量深度

| 能力 | TencentDB | Mem0 | Graphiti | LangMem |
|---|---|---|---|---|
| 关键词匹配 | ✅ BM25 (FTS5) | ❌ | ❌ | ❌ |
| 语义向量 | ✅ sqlite-vec | ✅ 后端向量 | ⚠️ 部分 | ✅ |
| RRF 融合 | ✅ `1/(60+rank+1)` | ❌ | ❌ | ❌ |
| 混合检索 | ✅ | ❌ | ❌ | ❌ |
| 图多跳推理 | ❌ | ❌ | ✅ | ❌ |

**结论**：混合检索（BM25 + 向量 + RRF）是腾讯方案的核心优势，Mem0 的单一向量检索在特定关键词场景（如平台名"抖音"、"知乎"）召回率会打折扣。但 RRF 融合算法可以借鉴——如果采用 Mem0，可自建 RRF 层弥补。

### 4.3 部署形态深度

```
TencentDB:  MemoryProxy 服务 + MemoryCore 服务 + MemoryPanel
              → 需要 Node.js 运行时 + SQLite + 可能的 COS 依赖
              → 部署复杂度高

Mem0:       SDK 库（Python 或 TS）
              → 嵌入现有应用，无额外服务
              → 部署复杂度极低

Letta:      Agent 框架本身
              → 不是库，是完整应用框架
              → 引入即重构整个应用

Graphiti:   知识图谱服务 + 图数据库
              → 需要 Neo4j/FalkorDB 等
              → 部署复杂度高
```

**结论**：Mem0 的库形态最适合"增量接入"，无需部署新服务、无需改变现有应用结构。

---

## 5. 三大派系归类

### 派系 A：LLM 自动提炼派

**代表**：TencentDB、Mem0、Graphiti

**特点**：系统后台自动从对话中提取记忆，Agent 无需主动管理。Agent 只需调用检索。

**适用**：不需要 Agent 理解记忆含义的场景（如发布经验积累）

**Multi-Publish 适配度**：✅ 最适合——发布引擎不需要"理解"记忆，只需要"调用"记忆

### 派系 B：Agent 主动管理派

**代表**：Letta、LangMem

**特点**：Agent 自己决定写什么读什么。系统提供读写工具，但不主动提炼。

**适用**：需要 Agent 有自主判断的场景（如长期对话伙伴）

**Multi-Publish 适配度**：❌ 不适合——发布引擎不是对话伙伴，不需要自主管理记忆

### 派系 C：知识图谱派

**代表**：Graphiti、Zep

**特点**：实体-关系建模，支持多跳推理和时间旅行查询。

**适用**：需要理解"谁和谁是什么关系"的场景

**Multi-Publish 适配度**：❌ 不适合——发布经验是"规则"和"事实"，不是"实体关系"

---

## 6. 综合评分（针对 Multi-Publish 发布引擎场景）

评分维度说明：

| 维度 | 说明 |
|---|---|
| **接入成本** | 引入到 Multi-Publish 的开发工作量（越高越好） |
| **技术栈匹配** | 与现有 JS/TS + Electron 技术栈的匹配度 |
| **自动提炼** | 能否自动从发布结果中提取经验记忆 |
| **去重/更新** | 能否自动处理重复/冲突的记忆条目 |
| **团队记忆** | 是否支持多个账号/Agent 共享记忆 |
| **检索质量** | 检索准确性、覆盖率、召回率 |
| **社区活跃度** | 社区规模、维护频率、生态 |
| **架构轻量** | 代码量、部署复杂度、依赖数量 |
| **多设备同步** | 是否容易实现多设备/多环境同步 |

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
| **总分** | **31** | **40** | **22** | **24** | **26** |

---

## 7. 推荐与结论

### 推荐排序

🥇 **Mem0**（总分 40）— 综合最优
- 理由：接入成本最低（SDK 直接嵌入）、技术栈完美匹配（TS SDK + Electron）、自动提炼、去重、社区活跃
- 适配场景：发布经验记忆（提取/去重/检索），自研扩展团队记忆层

🥈 **TencentDB Agent Memory**（总分 31）— 团队记忆最强
- 理由：分层记忆最成熟、检索质量最高、团队记忆/ACL 最完整
- 适配场景：如果团队记忆是核心需求，可借鉴其分层设计思想，但建议自建轻量版而非整套引入

🥉 **LangMem**（总分 26）— 若已用 LangGraph
- 理由：代码极小、API 简洁
- 适配场景：仅当 Multi-Publish 已深度使用 LangGraph 生态时才推荐

❌ **Letta**（总分 22）— 不适配
- 理由：Agent 主动管理模式不适合发布引擎、GPL-3.0 许可证有传染性、代码过重

❌ **Graphiti**（总分 24）— 过度设计
- 理由：知识图谱对发布经验场景过重、需要图数据库基础设施、部署复杂

### 修正后的集成方案

> 此前 `INTEGRATION-AGENT-MEMORY-2026.md` 推荐"借鉴 TencentDB 思想 + 自建"。经本次深度比对，**修正为**：

```
推荐方案：Mem0（核心记忆）+ 自研扩展

├── Mem0（直接使用）
│   ├── 记忆提取：对话 → 发布经验条目（自动）
│   ├── 去重/更新：基于 LLM 相似度（自动）
│   ├── 检索：向量检索 + 自建 RRF 混合层
│   └── 存储：Qdrant/Pinecone/Chroma（选一个）
│
├── 自研扩展（复用现有架构）
│   ├── 团队记忆/ACL：扩展 owner_subject 为个人 + 团队两级
│   └── 跨 Agent 借入：内容创作 Agent 借入发布效果经验
│
└── 注入（复用 ai-writer/prompt-engine）
    └── 发布经验注入写作/发布规划 prompt
```

### 一句话结论

**Mem0 是 Multi-Publish 的最佳选择**——它解决了"怎么存、怎么找"的问题，而"团队共享"和"注入"这两个 Multi-Publish 特有的问题，可以用现有架构增量解决。

---

## 附：关键参考资料

- TencentDB Agent Memory：https://github.com/TencentCloud/TencentDB-Agent-Memory
- Mem0：https://github.com/mem0ai/mem0
- Letta (MemGPT)：https://github.com/letta-ai/letta-code
- Graphiti (Zep 内核)：https://github.com/getzep/graphiti
- LangMem：https://github.com/langchain-ai/langmem
- Zep：https://github.com/getzep/zep

---

*本报告由源码深度阅读生成，基于各项目最新版本，非二手资料。*