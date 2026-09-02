# 跨 Agent 共享记忆系统：开源项目全景调研

> **日期**：2026-08-27
> **研究目标**：在之前比对的 6 个项目之外，寻找更多支持"跨 Agent 共享记忆"的开源项目
> **研究方法**：基于 GitHub 话题分类（`agent-memory` / `cross-agent-memory` / `ai-memory-system`）、社区推荐、学术论文检索（arXiv），以及 GitHub 搜索和 web 搜索交叉验证
> **参考**：`01-docs/RESEARCH-AGENT-MEMORY-COMPARISON-2026.md`（上一轮 6 项目比对报告）

---

## 目录

1. [调研背景与发现总览](#1-调研背景与发现总览)
2. [Tier 1：专为跨 Agent 共享设计的系统（深度分析）](#2-tier-1专为跨-agent-共享设计的系统深度分析)
3. [Tier 2：记忆平台（支持跨 Agent 共享）](#3-tier-2记忆平台支持跨-agent-共享)
4. [Tier 3：代码/Agent 框架的跨 Agent 记忆模块](#4-tier-3代码agent-框架的跨-agent-记忆模块)
5. [Tier 4：轻量/实验性项目](#5-tier-4轻量实验性项目)
6. [全景对比矩阵](#6-全景对比矩阵)
7. [与上一轮 6 项目的关系](#7-与上一轮-6-项目的关系)
8. [针对 Multi-Publish 的推荐](#8-针对-multi-publish-的推荐)

---

## 1. 调研背景与发现总览

上一轮比对的 6 个项目（TencentDB / Mem0 / Letta / Graphiti / LangMem / Zep）中，**只有 TencentDB 对跨 Agent 共享有完整支持**（固定绑定 + ACL + 借入 ≤2）。Mem0 反而不支持。

本次调研发现：**"跨 Agent 共享记忆"这个细分赛道在 2025-2026 年爆发式增长**，出现了大量专门为此设计的项目。以下是全部发现的 18 个项目：

### 项目数量速览

| 层级 | 数量 | 说明 |
|---|---|---|
| Tier 1：专为跨 Agent 共享设计 | 7 个 | 核心定位就是"多 Agent 共享" |
| Tier 2：记忆平台（支持跨 Agent） | 3 个 | 记忆平台 + 可跨 Agent 共享 |
| Tier 3：代码 Agent 框架内建 | 2 个 | 框架自带跨 Agent 记忆 |
| Tier 4：轻量/实验性 | 6 个 | 概念验证或极简实现 |
| **合计** | **18 个** | — |

---

## 2. Tier 1：专为跨 Agent 共享设计的系统（深度分析）

### 2.1 Caura（原名 MemClaw）⭐⭐⭐⭐⭐

| 属性 | 详情 |
|---|---|
| **GitHub** | [caura-ai/caura](https://github.com/caura-ai/caura) |
| **语言** | Python + TypeScript |
| **许可证** | Apache 2.0 |
| **定位** | Agent 舰队的"受控共享记忆层" |
| **Slogan** | "Governed shared memory for AI agent fleets" |
| **生产案例** | eToro（NASDAQ: ETOR）—— 300+ Agent 共享一套记忆 |

**核心能力**：

- **多租户 + 多 Agent**：一个内存后端，多个 Agent 读/写，带硬性舰队边界（query-layer enforcement）
- **四大治理机制**：scope（范围）、trust tier（信任层级）、audit trail（审计跟踪）、self-improving（自改进）
- **跨 Agent 结果传播**：一个 Agent 学到的知识自动"传导"给其他 Agent
- **舰队在规模维度上的竞争力**：延迟（23ms p50 搜索）、Token 效率、治理
- **部署**：Docker 自托管 / 托管平台 / OpenClaw 插件
- **配套 Demo 仓库**：`caura-cross-fleet-gov`（Sales/Legal/Admin 三 Agent 共享）、`caura-long-run-fleet`
- **有论文**：arXiv《Governed Shared Memory for Multi-Agent LLM Systems》

**与 TencentDB 的区别**：

| 维度 | TencentDB | Caura |
|---|---|---|
| 核心对象 | Agent 团队的记忆资产 | Agent 舰队的治理化记忆 |
| 治理模型 | 4 级可见性（private/team/restricted/agent） | scope + trust tier + audit trail |
| 自改进 | 无 | 有（每次交互让下一次更聪明） |
| 检索速度 | 未公开 | 23ms p50 |
| 部署 | 重（多服务） | 中（Docker + API） |
| 许可证 | MIT | Apache 2.0 |

**一句话**：Caura 是腾讯方案在"治理 + 自改进"方向上的进化版，专门为生产环境的多 Agent 场景设计。

---

### 2.2 agentmemory（rohitg00）⭐⭐⭐⭐⭐

| 属性 | 详情 |
|---|---|
| **GitHub** | [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) |
| **Stars** | ~23.8k（GitHub trending，增长极快） |
| **语言** | TypeScript-first |
| **许可证** | Apache 2.0 |
| **定位** | 编码 Agent 的持久记忆层 |
| **Slogan** | "#1 Persistent memory for AI coding agents" |

**核心能力**：

- **一个服务器，所有 Agent 共享**："All agents share the same memory server. One server, memories shared across all of them."
- **支持 Agent**：Claude Code、Cursor、Codex CLI、Gemini CLI、Windsurf、Kilo Code、OpenCode、Cline、Roo、Goose、Aider、Hermes、OpenClaw + 任何 MCP/REST 客户端
- **架构**：本地内存服务器 → MCP 暴露 → REST API → 多 Agent 共享
- **记录 + 压缩**：记录 Agent 会话 → AI 压缩 → 持久记忆
- **关注点**：编码场景（代码库上下文、项目配置、编程偏好）

**一句话**：GitHub 上增长最快的跨 Agent 记忆项目，专为编码 Agent 设计，"一个服务器管所有 Agent"。

---

### 2.3 memX（MehulG）⭐⭐⭐⭐

| 属性 | 详情 |
|---|---|
| **GitHub** | [MehulG/memX](https://github.com/MehulG/memX) |
| **语言** | Python (FastAPI + Redis) |
| **许可证** | MIT（推断） |
| **定位** | 多 Agent 系统的实时共享记忆层 |
| **Slogan** | "Shared Memory for Multi-Agent LLM Systems" |

**核心能力**：

- **底层**：Redis（7+），存储最后写入 + 时间戳（确定性的 last-write-wins）
- **通信**：HTTP + WebSocket（实时同步）
- **访问控制**：细粒度 API Keys（Supabase 记录或本地 ACL）
- **Pub/Sub**：Agent 写入 → 自动通知其他 Agent（不需要轮询）
- **Schema 验证**：结构化状态带 schema 校验
- **兼容**：AutoGen、LangGraph 风格的 Agent

**一句话**：Redis + pub/sub + schema + ACL 的最小化实现，"Agent 不发消息，通过共享状态协调"。

---

### 2.4 Eion ⭐⭐⭐⭐

| 属性 | 详情 |
|---|---|
| **GitHub** | [eiondb/eion](https://github.com/eiondb/eion) |
| **语言** | Python |
| **许可证** | 开源（具体待确认） |
| **定位** | 多 Agent 系统的共享记忆存储 + 知识图 |
| **Slogan** | "Google Docs for AI Agents — Solving the Shared Memory Problem" |

**核心能力**：

- **知识图统一能力**：内存 + 知识图合一
- **部署场景覆盖**：单 LLM → 顺序 Agency → 并发实时 Agency（WIP）
- **MCP Server 集成**：原生支持 MCP 协议，Agent 通过 MCP 连接
- **架构模式**：
  - 顺序模式：Agent A → context → Agent B → context → Agent C，全部连到 Eion
  - 并发模式（WIP）：Agent A/B/C 同时连接 live sync + notifications
- **刚开源**（2026 年 6 月），社区处于早期

**一句话**：最新开源的"Agent 版 Google Docs"，知识图 + 内存合一，支持顺序和并发两种 Agent 协作模式。

---

### 2.5 RCLL（fleet-memory）⭐⭐⭐

| 属性 | 详情 |
|---|---|
| **GitHub** | [holetron-lab/fleet-memory](https://github.com/holetron-lab/fleet-memory)（RCLL 项目） |
| **网站** | [rcll.ai](https://rcll.ai/) |
| **语言** | Python |
| **许可证** | 开源 |
| **定位** | Agent 舰队的自托管共享记忆 |
| **说明** | Hindsight 的 Fork |

**核心能力**：

- **底层**：Postgres + pgvector
- **Topic Rooms**：Agent 按主题房间共享记忆
- **L0-L3 深度分层**：与 TencentDB 相同的四层模型
- **无 LLM 读路径**：检索不需要调用 LLM（纯数据库查询）
- **Benchmarks**：有公开评估

**一句话**：TencentDB 的"轻量版"—— 同样 L0-L3 分层，但用 Postgres + 无 LLM 读路径，部署更简单。

---

### 2.6 Mnemory ⭐⭐⭐

| 属性 | 详情 |
|---|---|
| **GitHub** | [fpytloun/mnemory](https://github.com/fpytloun/mnemory) |
| **语言** | TypeScript |
| **许可证** | MIT |
| **定位** | 多类型 Agent 记忆 + MCP Server |

**核心能力**：

- **多类型记忆**：facts（事实）、preferences（偏好）、episodic（情景）
- **TTL**：记忆条目有过期时间
- **User/Agent Scoping**：按用户或 Agent 范围隔离
- **MCP Server**：通过 MCP 协议暴露，任意 Agent 可接入

**一句话**：TypeScript 实现的记忆层，带 TTL + 范围隔离 + MCP 暴露，Agent 开箱即用。

---

### 2.7 Mnemoverse ⭐⭐⭐

| 属性 | 详情 |
|---|---|
| **GitHub** | [mnemoverse/mcp-memory-server](https://github.com/mnemoverse/mcp-memory-server) |
| **语言** | TypeScript |
| **许可证** | 开源 |
| **定位** | 基于 MCP 的 Agent 持久记忆 API |

**核心能力**：

- **写入时评分重要性**：每次写入自动评估记忆重要性
- **Hebbian 联想**：基于"一起出现的记忆互相强化"的神经科学原理
- **结果反馈重排**：根据实际使用效果重新排序记忆
- **MCP 原生**：开放 MCP 客户端

**一句话**：用神经科学（Hebbian）原理管理记忆重要性的 MCP 记忆服务器。

---

## 3. Tier 2：记忆平台（支持跨 Agent 共享）

### 3.1 Cognee ⭐⭐⭐⭐

| 属性 | 详情 |
|---|---|
| **GitHub** | [topoteretes/cognee](https://github.com/topoteretes/cognee) |
| **Stars** | ~17.6k |
| **语言** | Python |
| **许可证** | Apache 2.0 |
| **定位** | Agent 的开源记忆平台（知识图） |

**核心能力**：

- **知识图 + 向量搜索**：任何格式数据 → 知识图 → Agent 可检索
- **多 Agent 共享**：一个知识图，多个 Agent 查询
- **连接器**：GitHub、Slack、Linear、数据仓库、API 等
- **生产用户**：Apple、Cloudflare、Adobe、Microsoft、Uber、Shopify、Alibaba、字节跳动等
- **CLI 快速上手**：`cognee-cli remember` / `cognee-cli recall` / `cognee-cli forget`
- **Rust 高性能版本**：Cognee Rust 引擎

**一句话**：大厂用得最多的知识图记忆平台，多 Agent 共享一个知识图，"公司大脑"的开源实现。

---

### 3.2 EverMind EverOS ⭐⭐⭐⭐

| 属性 | 详情 |
|---|---|
| **GitHub** | [EverMind-AI/EverOS](https://github.com/EverMind-AI/EverOS) |
| **Stars** | ~12.6k |
| **语言** | Python |
| **许可证** | Apache 2.0 |
| **定位** | 本地优先的 Agent 记忆运行时 |
| **Slogan** | "One portable memory layer for every AI agent" |

**核心能力**：

- **Markdown 原生**：所有记忆以纯 Markdown 存储（人类可读）
- **混合检索**：BM25 + 向量（SQLite + LanceDB 索引）
- **自进化 Skills**：记忆会随交互自动进化
- **mRAG / Cases / Skills / Memory Bank**：完整的记忆操作系统
- **Benchmark**：LoCoMo 93.05%、LongMemEval 83.00%、HaluMem 93.04%（业内最高）
- **跨 Agent 共享**：一个记忆层，多个 Agent 共享

**一句话**：Benchmark 第一的记忆平台，Markdown 存储（便携、可读），BM25 + 向量混合检索。

---

### 3.3 AutoGen Memory（0.4+）⭐⭐⭐

| 属性 | 详情 |
|---|---|
| **GitHub** | [microsoft/autogen](https://github.com/microsoft/autogen) |
| **语言** | Python |
| **许可证** | MIT |
| **定位** | 多 Agent 框架的原生记忆模块 |

**核心能力**：

- **Group Chat 天然共享**：RoundRobin / Selector / Swarm 团队自动广播消息给所有 Agent
- **可插拔内存后端**：ChromaDB、Redis、Mem0 等
- **跨 Agent 记忆模块**：可以共享 memory module 给不同 Agent
- **跟踪 Issue**：[#4039](https://github.com/microsoft/autogen/issues/4039) 专做记忆模块设计
- **限制**：需要 AutoGen 框架，不是独立记忆系统

**一句话**：不是独立记忆系统，但 AutoGen 框架内的跨 Agent 记忆已经做得不错。

---

## 4. Tier 3：代码/Agent 框架的跨 Agent 记忆模块

### 4.1 GitHub Copilot Agentic Memory

| 属性 | 详情 |
|---|---|
| **来源** | [github.blog](https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/) |
| **定位** | GitHub Copilot 的跨 Agent 记忆系统 |

**核心能力**：

- **跨 Agent 学习**：Coding Agent 和 Code Review Agent 共享记忆
- **改进流程**：Agent 从开发工作流中学习并改进
- **限制**：非完全开源，是 GitHub 产品能力

**一句话**：行业标杆级实现，但非开源，只能参考思路。

---

### 4.2 Memoris（memrisdk）

| 属性 | 详情 |
|---|---|
| **GitHub** | [Boburmirzo/autogen-multi-agent-memory](https://github.com/Boburmirzo/autogen-multi-agent-memory) |
| **定位** | AutoGen 多 Agent 会话和记忆召回 |

**核心能力**：

- **集成**：与 AutoGen AgentChat + Memoris 集成
- **多 Agent 记忆**：多个 Agent 的会话记忆和召回

**一句话**：AutoGen + Memoris 的组合方案，需要 AutoGen 框架。

---

## 5. Tier 4：轻量/实验性项目

| 项目 | GitHub | 特点 | 规模 |
|---|---|---|---|
| **Remnic** | [joshuaswarren/remnic](https://github.com/joshuaswarren/remnic) | 本地优先 Markdown 记忆，跨编码 Agent 共享，结果溯源 | 新 |
| **Akephalos** | [daveinturkey15-byte/akephalos](https://github.com/daveinturkey15-byte/akephalos) | Git 同步的便携 Agent 配置文件 | 小 |
| **memgres** | [mozgsml/memgres](https://github.com/mozgsml/memgres) | Postgres 版本化文档记忆，多租户 MCP/HTTP | 小 |
| **Panella** | [panellatech/panella](https://github.com/panellatech/panella) | 人类审批的受控 MCP 记忆 | 新 |
| **CommonGround Kernel** | [Intelligent-Internet/CommonGround](https://github.com/Intelligent-Internet/CommonGround) | Postgres 共享工作记录，可持久交接事实 | 小 |
| **Minerva-Project** | [XdotX78/Minerva-Project](https://github.com/XdotX78/Minerva-Project) | 跨 LLM Agent/CLI 的本地持久记忆 | 新 |
| **MisakaNet** | [Ikalus1988/MisakaNet](https://github.com/Ikalus1988/MisakaNet) | Git 分布式群记忆，通过 GitHub Issues 同步 | 实验 |
| **cross-agent-memory** | [VladimirGutuev/cross-agent-memory](https://github.com/VladimirGutuev/cross-agent-memory) | Codex/Claude/Kimi 共享项目记忆 | 实验 |

---

## 6. 全景对比矩阵

| 项目 | 跨 Agent 原生 | 治理/ACL | 记忆分层 | 检索方式 | 存储后端 | MCP 支持 | Stars | 部署复杂度 |
|---|---|---|---|---|---|---|---|---|
| **Caura** | ✅ 核心设计 | ✅ 4 重治理 | ✅ 自改进 | 混合 | 自托管 DB | ✅ | ~中 | 中 |
| **agentmemory** | ✅ 核心设计 | ⚠️ 单服务器 | ⚠️ 扁平 | 向量 | 本地 | ✅ | ~23.8k | 低 |
| **memX** | ✅ 核心设计 | ✅ ACL | ❌ | 直接读取 | Redis | ❌ | 新 | 低 |
| **Eion** | ✅ 核心设计 | ⚠️ 基础 | ✅ 知识图 | 混合 | 自托管 | ✅ | 新 | 中 |
| **RCLL** | ✅ 核心设计 | ⚠️ Topic 隔离 | ✅ L0-L3 | pgvector | Postgres | ❌ | 新 | 中 |
| **Mnemory** | ✅ 核心设计 | ✅ Scope/TTL | ✅ 3 类型 | 向量 | 本地 | ✅ | 新 | 低 |
| **Mnemoverse** | ✅ MCP 原生 | ⚠️ 评分 | ❌ | 联想 | 本地 | ✅ | 新 | 低 |
| **Cognee** | ⚠️ 平台级 | ⚠️ 连接器级 | ✅ 知识图 | 图+向量 | 自托管 | ✅ | ~17.6k | 中 |
| **EverOS** | ⚠️ 平台级 | ⚠️ 基础 | ✅ 多层 | BM25+向量 | SQLite+LanceDB | ✅ | ~12.6k | 低 |
| **AutoGen** | ✅ 框架内 | ⚠️ 框架内 | ⚠️ 插件 | 多种 | 多种 | ✅ | ~39k | 低（需框架） |

---

## 7. 与上一轮 6 项目的关系

```
上一轮 6 项目                         本次新增 12 项目
┌─────────────────────────┐         ┌─────────────────────────────┐
│ TencentDB Agent Memory  │         │ Caura (MemClaw)             │  ← 腾讯方案的治理化进化版
│ Mem0                    │         │ agentmemory (rohitg00)      │  ← 编码 Agent 共享记忆之王
│ Letta                   │         │ memX                        │  ← Redis 实时共享层
│ Graphiti (Zep 内核)     │         │ Eion                        │  ← "Agent 版 Google Docs"
│ LangMem                 │         │ RCLL (fleet-memory)         │  ← TencentDB 轻量版
│ Zep Cloud               │         │ Mnemory / Mnemoverse        │  ← MCP 记忆服务器
│                         │         │ Cognee / EverOS             │  ← 记忆平台
│                         │         │ AutoGen Memory              │  ← 框架内建
│                         │         │ Remnic / Akephalos / memgres│  ← 轻量/实验
└─────────────────────────┘         └─────────────────────────────┘
```

**关键发现**：
- Caura 和 TencentDB 是**同一条技术路线的进化**：Caura 在"治理 + 自改进"方向上更成熟
- agentmemory 填补了"编码 Agent 共享记忆"这个腾讯方案没做的空白
- memX / Mnemory / Mnemoverse 提供了**极简的 Redis/MCP 实现**
- EverOS / Cognee 是**更通用的记忆平台**，支持但不专攻跨 Agent

---

## 8. 针对 Multi-Publish 的推荐

### 场景分析

Multi-Publish 的"跨 Agent"本质是：
- **内容创作 Agent**（ai-writer）：负责生成文案
- **发布规划 Agent**（prompt-engine）：负责发布策略
- **发布执行 Agent**（api-publish-engine + 12 平台适配器）：负责实际发布
- **效果追踪 Agent**（publish-monitor + publish-impact-tracker）：负责收集效果

这 4 个 Agent 需要共享的核心是"**发布经验**"——什么时间发什么内容在哪个平台效果最好。

### 推荐排序

| 排序 | 项目 | 适配理由 | 不推荐理由 |
|---|---|---|---|
| 🥇 | **agentmemory** | 共享服务器架构完美匹配 Multi-Publish 的"多 Agent 共享经验"需求，TypeScript 技术栈匹配，MCP 暴露可直接接入 | 偏编码场景，但核心架构通用 |
| 🥈 | **memX** | Redis + pub/sub 的极简架构，Multi-Publish 加一个 Redis 即可，实时同步适合发布效果反馈 | ACL 和治理较弱 |
| 🥉 | **Caura** | 治理最强，生产验证（eToro），最适合未来扩展到团队级别 | 部署较重，对当前 Multi-Publish 可能过度设计 |
| 4 | **EverOS** | Benchmark 第一，Markdown 存储（可读），BM25 + 向量混合检索 | 跨 Agent 不是核心定位 |
| 5 | **RCLL** | L0-L3 分层（借鉴腾讯方案），Postgres 存储，无 LLM 读路径 | 社区较小 |

### 修正后的集成方案（最终版）

结合本调研，修正上一轮 `RESEARCH-AGENT-MEMORY-COMPARISON-2026.md` 的推荐：

```
Multi-Publish 跨 Agent 记忆方案（最终推荐）

├── 核心记忆层（选一个）
│   ├── 方案 A：agentmemory（共享服务器）
│   │   ├── 一个服务器，4 个 Agent 共享
│   │   ├── TypeScript，技术栈完美匹配
│   │   └── MCP 暴露，直接接入
│   │
│   └── 方案 B：memX（Redis 轻量）
│       ├── Redis 存储，部署最简单
│       ├── pub/sub 实时同步发布效果
│       └── 适合 MVP 快速验证
│
├── 自研扩展（复用现有架构）
│   ├── owner_subject 扩展为个人 + 团队两级
│   ├── 发布效果自动提炼为记忆（LLM）
│   └── RRF 混合检索（借鉴 TencentDB 算法）
│
└── 注入（复用 ai-writer/prompt-engine）
    └── 发布经验注入写作/发布规划 prompt
```

### 一句话结论

**Multi-Publish 的跨 Agent 记忆不需要整套"企业级"方案。** agentmemory（共享服务器）或 memX（Redis 轻量）足够解决"多个 Agent 共享发布经验"的问题，自研扩展补齐团队记忆和混合检索即可。

---

## 附：全部 18 个项目链接速查

| # | 项目 | GitHub |
|---|---|---|
| 1 | Caura (MemClaw) | [caura-ai/caura](https://github.com/caura-ai/caura) |
| 2 | agentmemory | [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) |
| 3 | memX | [MehulG/memX](https://github.com/MehulG/memX) |
| 4 | Eion | [eiondb/eion](https://github.com/eiondb/eion) |
| 5 | RCLL (fleet-memory) | [holetron-lab/fleet-memory](https://github.com/holetron-lab/fleet-memory) |
| 6 | Mnemory | [fpytloun/mnemory](https://github.com/fpytloun/mnemory) |
| 7 | Mnemoverse | [mnemoverse/mcp-memory-server](https://github.com/mnemoverse/mcp-memory-server) |
| 8 | Cognee | [topoteretes/cognee](https://github.com/topoteretes/cognee) |
| 9 | EverMind EverOS | [EverMind-AI/EverOS](https://github.com/EverMind-AI/EverOS) |
| 10 | AutoGen Memory | [microsoft/autogen](https://github.com/microsoft/autogen) |
| 11 | Remnic | [joshuaswarren/remnic](https://github.com/joshuaswarren/remnic) |
| 12 | Akephalos | [daveinturkey15-byte/akephalos](https://github.com/daveinturkey15-byte/akephalos) |
| 13 | memgres | [mozgsml/memgres](https://github.com/mozgsml/memgres) |
| 14 | Panella | [panellatech/panella](https://github.com/panellatech/panella) |
| 15 | CommonGround Kernel | [Intelligent-Internet/CommonGround](https://github.com/Intelligent-Internet/CommonGround) |
| 16 | Minerva-Project | [XdotX78/Minerva-Project](https://github.com/XdotX78/Minerva-Project) |
| 17 | MisakaNet | [Ikalus1988/MisakaNet](https://github.com/Ikalus1988/MisakaNet) |
| 18 | cross-agent-memory | [VladimirGutuev/cross-agent-memory](https://github.com/VladimirGutuev/cross-agent-memory) |

---

*本报告基于 GitHub 源码和官方文档检索生成，非二手资料。*