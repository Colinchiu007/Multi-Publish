# 个人知识库自我进化 + EverOS/LLM Wiki v2 整合分析

> 日期：2026-09-10 | 作者：/root | 类型：技术分析
> 前置阅读：DEEP-ANALYSIS-KNOWLEDGE-BASE.md、PRD-KNOWLEDGE-BASE.md、DESIGN-KNOWLEDGE-EVOLUTION.md、EVEROS-COGNEE-COMPLETE-SETUP-2026-09-02.md、RESEARCH-CROSS-AGENT-MEMORY-2026-08-27.md

## 一、个人知识库现状盘点

Multi-Publish 现有三套知识存储，通过改写引擎三层 Prompt 融合协同：

| 知识库 | 实现 | 存储 | 作用 |
|--------|------|------|------|
| 用户偏好库 | knowledge-base.js（v2） | SQLite KV（rewrite_engine_kb） | 行业/风格/平台偏好 + 风格指纹 + 历史成功案例 |
| 爆款库 | viral-library.js | SQLite viral_library 表 | 平台爆款风格参考（标题模式/开头钩子/标签） |
| 个人知识库 | personal-knowledge-base.js | SQLite personal_knowledge 表 | IP 人设/背景/故事/观点/经验素材 |

三层融合（KnowledgeContextBuilder）：
- 第1层：KnowledgeBase.getContextSummary() 用户偏好（始终注入）
- 第2层：buildViralContext() 爆款风格参考（勾选时）
- 第3层：buildPersonalContext() 个人素材（勾选时，按约束型/立场型/权威型/素材型分组）

## 二、自我进化现状：P0+P1 已落地，P2 反馈闭环未接线

### 2.1 已实现（P0+P1，PR #1629 已合并）

knowledge-evolution.js 提供 5 个纯函数 + KnowledgeEvolutionScheduler 调度器：

| 机制 | 实现 | 触发时机 |
|------|------|---------|
| Ebbinghaus 遗忘曲线 | confidence = (0.5 + source*0.1 + authority*0.2 + access*0.02) x 0.5^(days/30) | 检索即强化（_touchKnowledge） |
| 生命周期状态机 | active→stale(>90d)→deprecated(>180d)→archived(access<3) | 启动 + 每6h decay-check |
| 质量评分 | 结构0.3/引用0.4/可读性0.3 | 每周日3点 batchScoreQuality |
| 知识巩固 | 强化高置信度(≥0.7) + 归档低频 | 每周一2点 consolidate |
| 审计日志 | knowledge_audit_log 表 | 所有进化事件 |

### 2.2 未接线（P2 反馈闭环）

**关键缺口**：feedbackBoost() 函数已定义并导出，但**从未在改写引擎调用链中真正触发**。

- rewrite-engine-core.js 第 116 行调用的是旧的 this._knowledgeBase.recordFeedback()（偏好库），不是新的 feedbackBoost()
- KnowledgeContextBuilder.buildFullContext() 未返回 touchedItems，因此改写引擎无法知道本次改写引用了哪些知识条目
- 用户采纳/拒绝改写时，被引用条目的置信度不会上升/下降

**后果**：知识库的检索即强化已生效（access_count 递增），但反馈驱动（用户采纳→置信度+0.1）这一最关键的进化闭环是断的。

## 三、EverOS 机制分析（可借鉴点）

EverOS（EverMind-AI/EverOS，12.6k stars）是本地优先的 Agent 记忆运行时，核心机制：

### 3.1 5 维正交隔离
user_id / agent_id / app_id / project_id / session_id 五维隔离，同一记忆层服务多 Agent。
**借鉴**：Multi-Publish 的 4 个 Agent（内容创作/发布规划/发布执行/效果追踪）可共享发布经验记忆，用 agent_id 区分来源。

### 3.2 事件驱动 + 策略调度（OME）
进化不是用户手动触发，而是后台策略引擎按事件/定时自动执行：
| EverOS 策略 | 触发 | 对应实现 |
|------------|------|---------|
| extract_atomic_fact | 每次 memcell | touchKnowledge() |
| profile_clustering | 事件 | decayCheck + consolidate |
| reflect_episodes | 每周 cron | consolidate 强化+归档 |
| extract_agent_skill | 事件 | feedbackBoost() |

### 3.3 Markdown 原生 + 混合检索
所有记忆以纯 Markdown 存储（人类可读、Git 版本化），BM25 + 向量混合检索。

### 3.4 自进化 Skills
记忆随交互自动进化，mRAG/Cases/Skills/Memory Bank 完整记忆操作系统。

## 四、LLM Wiki v2 机制分析（已深度移植）

LLM Wiki v2 是纯文件+SQLite 轻量方案，7 个 Python 文件。Multi-Publish 已移植大部分：

| LLM Wiki v2 模块 | 移植状态 | 说明 |
|-----------------|---------|------|
| confidence.py | ✅ 已移植 | Ebbinghaus 遗忘曲线 |
| consolidate_ops.py | ✅ 已移植 | 知识巩固/归档 |
| quality.py | ✅ 已移植 | 结构/引用/可读性评分 |
| privacy_filter.py | ✅ 已移植 | 正则隐私过滤 |
| search.py | ⚠️ 部分 | RRF 已实现，FTS5 BM25 未用（LIKE 替代） |
| entities.py | ⚠️ 部分 | 知识图谱已实现（knowledge-base.js），但爆款/个人库未接 |
| contradiction.py | ⚠️ 部分 | 矛盾检测已实现（knowledge-base.js），但未接入爆款/个人库 |

## 五、整合与集成方案

### 5.1 优先级 P0：接通反馈闭环（最关键）

让用户采纳/拒绝驱动知识置信度，形成完整进化闭环：

1. KnowledgeContextBuilder.buildFullContext() 返回 touchedItems（本次检索命中的条目 id + table）
2. rewrite-engine-core.js 改写完成后，将 touchedItems 透传给 feedbackBoost()
3. 前端反馈（采纳/拒绝）→ 调 feedbackBoost → 被引用条目置信度 +0.1 / -0.05

### 5.2 优先级 P1：EverOS 式多 Agent 共享

借鉴 EverOS 5 维隔离，让发布经验跨 Agent 共享：

- 在爆款库/个人库加 agent_id 列（默认 ai-writer）
- 发布效果追踪 Agent 写入发布经验（什么时间发什么内容在哪个平台效果好）→ 注入改写 Prompt
- 检索时按 agent_id 过滤，实现一个记忆层服务多 Agent

### 5.3 优先级 P2：LLM Wiki v2 深度能力补齐

- FTS5 BM25 搜索：当前用 LIKE 子串，升级为 FTS5（sql.js 无 FTS5，需 better-sqlite3 或保持 LIKE）
- 知识图谱接入爆款/个人库：当前图谱只在偏好库，爆款/个人库条目间关系稀疏（P3 按需）
- 矛盾检测接入：个人库观点条目间矛盾检测（人设一致性）

### 5.4 优先级 P3：EverOS/Cognee 外部记忆系统集成

将 Multi-Publish 知识库与 EverOS（WSL :8002）+ Cognee（WSL :8000）打通：

- 双写：改写产生的知识同时写入本地 SQLite + EverOS Markdown
- EverOS 为主存储，Cognee 为图谱索引：每日 cron 同步
- MCP 接入：让外部 Agent 通过 MCP 查询 Multi-Publish 知识库

## 六、结论

1. 个人知识库自我进化已具备骨架（P0+P1：遗忘曲线/生命周期/质量/巩固），但最关键的反馈闭环（P2）未接线——这是当前最大短板，应优先接通。
2. EverOS 的核心启示是事件驱动策略调度 + 多 Agent 共享，Multi-Publish 已借鉴其调度范式，可进一步借鉴 5 维隔离实现跨 Agent 发布经验共享。
3. LLM Wiki v2 的算法已深度移植，剩余差距在搜索（FTS5）和图谱/矛盾检测的接入范围。
4. 外部记忆系统（EverOS/Cognee）集成是可选增强，非当前必需——本地 SQLite 已满足核心需求，外部系统用于跨 Agent/跨设备场景。

