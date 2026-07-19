
现在我对这 7 个技能的核心内容有了完整了解。下面逐一梳理它们的功能和用法。

---

## P0 优先级的技能

### 1. `/investigate` — 根因调试与系统化排查

**做什么：**  
四阶段系统化调试框架，核心铁律是 **"没有根因就不能修"**。

- **Phase 1 调查**：复现 Bug、检查相关代码、差分对比
- **Phase 2 分析**：跟踪数据流、缩小根因范围
- **Phase 3 假设验证**：一次只验证一个假设，3 次失败后 STOP 并升级
- **Phase 4 实施**：修根因而非症状，写回归测试
- **Phase 5 验证报告**：输出结构化的 `DEBUG REPORT`

**触发的场景：**

- 用户说"debug this"、"fix this bug"、"why is this broken"、"root cause analysis"
- 自动在用户报告错误、500 错误、堆栈、"it was working yesterday" 时触发

**用法示例：**

```
为什么这个 API 返回 500？
```

→ 自动进入 `/investigate` 流程，从头开始调取证、跟踪数据流、提假设。不允许跳过 Phase 1 直接修。

**文章可改进的点：**

- 在 Phase 1 中增加"上下文完整性检查"步骤——强制要求用户提供完整错误信息、堆栈和相关代码
- 增加"连环追问"模式：先让 AI 问用户要缺失的信息，而不是"猜错"

---

### 2. `/office-hours` — 产品需求分析与创意验证

**做什么：**  
YC 风格的产品需求分析。两种模式：

- **Startup Mode**：6 个强约束问题，暴露需求真相、目标用户的紧迫性、最小切入点
- **Builder Mode**：设计思维脑暴，适合副项目、学习、开源

输出：设计文档（`design-doc-*.md`）+ 具体的下一步行动

**触发的场景：**

- 用户说"brainstorm this"、"is this worth building"、"help me think through"
- 自动在用户提出新想法、想评估值不值得做时触发

**用法示例：**

```
我想做一个 AI 代码审查工具，帮我分析一下有没有搞头
```

→ 自动进入 `/office-hours` 流程，六轮追问（需求现实、现状、绝望细节、最小入口等），最终生成设计文档。

**文章可改进的点：**

- 增加"让 AI 帮你想清楚"的需求澄清追问框架——自动探测需求盲区
- 在 Startup Mode 中增加"需求完整性检查"环节，模仿文章说的"先问 AI 几个问题"

---

### 3. `/retro` — 工程复盘周报

**做什么：**  
每周技术复盘。分析：

- 提交历史和代码变化（per person 维度）
- 工作模式和速度趋势
- 代码质量指标
- 个人贡献亮点和改进空间（团队模式下）
- 与之前的 retro 做趋势对比

**触发的场景：**

- 用户说"weekly retro"、"what did we ship"、"engineering retrospective"
- 自动在周末或 sprint 结束时建议触发

**用法示例：**

```
/retro
```

→ 自动拉取本周提交记录，分析变化趋势，输出结构化的复盘报告。

**文章可改进的点：**

- 在复盘报告中增加"技术复盘 = 需求回顾 → 做了什么 → 踩坑 → 经验"的结构
- 增加"复盘输出自动转化为 skill/提示词模板"的环节，把经验沉淀为可复用资产
- 增加"踩坑经验 → learnings 系统"的桥接

---

### 4. `/learn` — 经验学习管理

**做什么：**  
管理 gstack 的跨会话学习记录（learnings.jsonl）。功能：

- 查看/搜索 learnings
- 清理过期或文件的 learnings（stale detection）
- 导出 learnings

**触发的场景：**

- 用户说"show learnings"、"what have we learned"、"manage project learnings"
- 自动在用户问"我们之前是不是遇到过这个问题"时触发

**用法示例：**

```
/learn
```

→ 显示当前项目的所有学习记录，支持搜索和筛选。

```
这个模块有问题 -> 让我看看之前的 learnings
```

→ 自动搜索相关学习记录。

**文章可改进的点：**

- 增加"从 learnings 自动生成可复用的提示词模板/检查清单"的流程
- 增加"经验->技能"的转化桥接——把多次重复的 learnings 沉淀为新的 skill

---

## P1 优先级的技能

### 5. `/autoplan` — 全自动规划审查

**做什么：**  
自动串联完整的审查管道——依次运行 CEO 审查、设计审查、工程审查、DX 审查。包含：

- 6 大自动决策原则
- 最后的审批门（处理品味决策、模糊边界、模型分歧）
- 一键出完整的审查决策

**触发的场景：**

- 用户说"run all reviews"、"autoplan"、"automatic review"
- 在设计文档/规划文件完成后自动建议

**用法示例：**

```
/autoplan
```

→ 自动读取当前设计文档，运行 4 轮审查，输出完整的决策报告。

**文章可改进的点：**

- 在规划阶段强制增加"小步开发粒度规则"——每个任务应对应一个可独立测试的模块
- 规划模板中固定加入测试阶段、审查阶段、文档阶段
- 引入"一次只改一个模块"的拆解原则

---

### 6. `/review` — 预合并代码审查

**做什么：**  
对 PR diff 做多阶段、多维度代码审查：

- **Step 1-3**：基础分析——检查 SQL 安全、LLM 信任边界、条件副作用
- **Step 4**：专家审查——自动调度测试专家、安全专家、场景审查
- **Step 5**：Fix-First 模式——先自动修复，再问用户
- **Step 6**：对抗性审查（Codex 子模型交叉验证）
- 输出 PR 质量评分 + 审查发现树状图

**触发的场景：**

- 用户说"review this PR"、"code review"、"check my diff"
- 自动在检测到分支有未审查更改时建议

**用法示例：**

```
/review
```

→ 分析当前分支与 base 的 diff，运行多阶段审查，输出评分和发现。修复项自动应用，复杂项问用户。

**文章可改进的点：**

- 在最终输出前增加一层"上下文完整性自检"
- 增加对"是否缺乏异常处理/权限/事务"的专项检查（文章特别强调的 6 大问题点）

---

### 7. `subagent-driven-development`（Superpowers Skill）

**做什么：**  
子 Agent 驱动的开发流程。核心理念：**"新鲜子 Agent 一个任务 + 任务间审查 = 高质量快速迭代"**。

流程：

1. 读取规划文件 → 创建任务列表
2. 为每个任务分发新鲜子 Agent
3. 子 Agent 实现后自动触发 Code Review
4. 审查通过后继续下一个任务

**适用场景：**

- 任务相对独立时
- 想保持连续进度但有质量门禁
- 在同一会话中，不想上下文切换

**用法示例：**  
在 `/autoplan` 生成的规划文件基础上，自动分派子 Agent 逐个实现。

**文章可改进的点：**

- 增加子任务拆解粒度的指导——"每个子任务应是一个可独立测试的模块"
- 增加"一个任务改一个模块"的限制规则
- 增加任务间上下文传递模板

---

## 结构总览

```
                     文章核心方法论
                    ┌────────────────────┐
                    │ AI 是开发流程辅助   │
                    │ 不是自动写代码      │
                    └────────┬───────────┘
                             │
         ┌───────────────────┼────────────────────┐
         │                   │                     │
    ┌────▼────┐       ┌─────▼──────┐       ┌──────▼─────┐
    │ 想清楚    │       │ 改代码      │       │ 沉淀        │
    │ (ChatGPT) │       │ (Codex)    │       │ (复盘学习)   │
    └────┬────┘       └─────┬──────┘       └──────┬─────┘
         │                   │                     │
    ┌────▼────┐       ┌─────▼──────────┐    ┌─────▼─────┐
    │office-   │       │investigate     │    │retro      │
    │hours     │       │review          │    │learn      │
    │autoplan  │       │subagent-driven │    │           │
    └──────────┘       │-development    │    └───────────┘
                       └────────────────┘
```

**各技能在文章方法论中的定位：**

|技能|文章价值层|核心改进方向|
|---|---|---|
|`/investigate`|第三层：报错排查|增加上下文完整性检查 + 连环追问模板|
|`/office-hours`|第一层+：需求想清楚|增加需求盲区自动探测追问|
|`/retro`|第七层：经验沉淀|增加复盘→可复用资产转化|
|`/learn`|第七层：经验沉淀|增加 learnings→skill 转化桥接|
|`/autoplan`|规划+拆解|增加小步粒度规则 + 全流程阶段|
|`/review`|第五层：代码审查|增加异常处理/权限/事务专项检查|
|`subagent-driven-dev`|执行层|增加任务粒度规则|

---
# 现在与产品经理、产品需求、开发规范、开发流程、工程、审查、评审、项目管理有关的skill有哪些，也像这样梳理一遍

现在我有完整的信息了。按你要求的 5 个类别梳理如下：

---

## 一、产品经理 / 产品需求

### 1. `/office-hours` — YC 风格产品需求分析

**做什么：** 六轮强约束追问（需求真相、现状、绝望细节、最小切入点、观察、未来适配），输出设计文档 + 具体行动。Builder Mode 用于副项目/脑暴。

**触发：** "brainstorm this" / "is this worth building" / "help me think through"

### 2. `/plan-ceo-review` — CEO/创始人模式战略审查

**做什么：** 四种模式审查规划 — `SCOPE EXPANSION`（放大梦想）、`SELECTIVE EXPANSION`（精选扩张）、`HOLD SCOPE`（最大严谨度）、`SCOPE REDUCTION`（精简到核心）。挑战前提假设，寻找 10 倍产品方向。

**触发：** "think bigger" / "strategy review" / "rethink this plan"

### 3. `idea-refine`（addy-agent）— 创意精炼

**做什么：** 先发散再收敛的结构化思考。对模糊的想法做压力测试，扩展选项后再收敛到一个方案。

**触发：** "ideate" / "refine this idea" / "stress-test my plan"

### 4. `spec-driven-development`（addy-agent）— 规范驱动开发

**做什么：** 写代码前先写结构化规范。四阶段门禁流程：Spec → Validate → Implement → Verify。Spec 是人和 AI 之间的共享真理源。

**触发：** 新项目/新功能没有文档时主动建议

### 5. `design-consultation` — 设计咨询

**做什么：** 理解产品 → 调研市场 → 提出完整设计系统（美学、排版、色彩、布局、间距、动效），生成字体+色彩预览页，输出 `DESIGN.md`。

**触发：** "design system" / "brand guidelines" / "create DESIGN.md"

---

## 二、开发规范 / 开发流程

### 6. `context-engineering`（addy-agent）— 上下文工程

**做什么：** 优化 Agent 的上下文配置。按持久度分层的上下文结构（长久→临时），包含规则文件管理、会话恢复、质量退化检测。

**触发：** 新会话 / Agent 输出质量下降 / 切换任务时主动建议

### 7. `source-driven-development`（addy-agent）— 源码驱动开发

**做什么：** 确保代码基于权威来源（官方文档、最新 API 参考），而不是模型记忆。每条模式都追溯到可验证的来源。

**触发：** 构建样板代码 / 使用框架特定模式 / 审查框架代码时主动建议

### 8. `doubt-driven-development`（addy-agent）— 怀疑驱动开发

**做什么：** 任何非平凡决策在落地前，都经过"新鲜上下文对抗审查"——一个偏向证伪而非证实的审查者。跨模块边界、不可逆操作、生产环境等高危场景必用。

**触发：** 正确性比速度更重要时 / 陌生代码 / 高 stakes 场景

### 9. `code-simplification`（addy-agent）— 代码简化

**做什么：** 在保持行为不变的前提下简化代码。目标不是更少行数，而是让新团队成员能更快理解。

**触发：** 功能完成测试通过但实现偏重 / 审查时发现复杂度问题 / 合并后出现重复

### 10. `codex` — Codex CLI 多模式包装

**做什么：** 三种模式 — `codex review`（独立 diff 审查 + pass/fail 门禁）、`codex challenge`（对抗模式，尝试破坏你的代码）、`codex consult`（问答 + 会话连续性），相当于"200 IQ 自闭开发者"的第二意见。

**触发：** "codex review" / "second opinion" / "outside voice challenge"

### 11. `incremental-implementation`（addy-agent）— 增量实现

**做什么：** 薄垂直切片构建 — 实现一块、测试一块、验证一块、再扩展。每次增量后系统保持可工作可测试状态。避免一次实现整个功能。

**触发：** 任何多文件变更 / 新功能实现 / 重构时主动建议

### 12. `deprecation-and-migration`（addy-agent）— 废弃与迁移

**做什么：** 系统化处理 API/代码废弃和迁移。包含废弃标注、迁移路径文档、兼容层管理。

**触发：** 需要弃用旧 API 或迁移到新方案时主动建议

---

## 三、工程（Engineering）

### 13. `/plan-eng-review` — 工程经理模式规划审查

**做什么：** 锁定执行计划 — 架构、数据流、ASCII 图表、边界情况、测试覆盖、性能。交互式逐项审查，给出有观点的推荐。必要时可在规划中修改文件。

**触发：** "review the architecture" / "engineering review" / "eng plan review"

### 14. `/plan-devex-review` — 开发者体验规划审查

**做什么：** 三种模式 — `DX EXPANSION`（竞争优势）、`DX POLISH`（无死角打磨）、`DX TRIAGE`（仅关键缺口）。探索开发者画像、竞品对标、设计魔法时刻、追踪摩擦点。

**触发：** "developer experience review" / "dx plan review" / "API design review"

### 15. `/plan-design-review` — 设计师视角规划审查

**做什么：** 交互式审查每个设计维度（0-10 评分），解释如何达到 10 分，然后修复规划。对已有站点用 `/design-review`。

**触发：** "design plan review" / "review ux plan" / "check design decisions"

### 16. `/benchmark` / `benchmark-models` — 性能基准测试

**做什么：** 运行性能基准测试，对比不同方案或模型的表现。

**触发：** "benchmark this" / "performance comparison"

### 17. `/canary` — 金丝雀部署

**做什么：** 灰度部署流程，带自动回滚机制。逐步放量 + 健康检查。

**触发：** "canary deploy" / "rolling deployment"

### 18. `/land-and-deploy` — 合入与部署

**做什么：** 在 `/ship` 创建 PR 后接管：合并 PR → 等待 CI → 部署 → 金丝雀验证生产健康。

**触发：** "merge and deploy" / "land the pr" / "ship to production"

### 19. `api-and-interface-design`（addy-agent）— API 与接口设计

**做什么：** 系统化 API 设计指南，包含 REST/gRPC/GraphQL 模式、版本策略、错误处理规范。

**触发：** 设计新 API 或接口时主动建议

### 20. `ci-cd-and-automation`（addy-agent）— CI/CD 流水线

**做什么：** CI/CD 流水线设计与管理：构建、测试、部署自动化；流水线安全；缓存策略。

**触发：** 设置 CI/CD / 优化构建流程时主动建议

### 21. `performance-optimization`（addy-agent）— 性能优化

**做什么：** 系统化性能分析：瓶颈定位、缓存策略、懒加载、数据库查询优化、前端性能。

**触发：** 性能问题排查 / 优化请求时主动建议

### 22. `observability-and-instrumentation`（addy-agent）— 可观测性

**做什么：** 日志、指标、追踪的埋点和监控体系设计。结构化日志、分布式追踪、告警规则。

**触发：** 系统监控 / 排查生产问题时主动建议

### 23. `security-and-hardening`（addy-agent）— 安全加固

**做什么：** 安全最佳实践：输入验证、认证授权、加密、依赖安全、OWASP 防护。

**触发：** 安全相关开发 / 安全审查时主动建议

### 24. `shipping-and-launch`（addy-agent）— 发布上线

**做什么：** 端到端发布流程：版本号管理、CHANGELOG 生成、构建发布、上线检查清单。

**触发：** 准备发布时主动建议

### 25. `frontend-ui-engineering`（addy-agent）— 前端 UI 工程

**做什么：** 前端工程最佳实践：组件设计模式、状态管理、样式方案、可访问性、响应式设计。

**触发：** 前端开发 / UI 实现时主动建议

---

## 四、审查 / 评审

### 26. `/review` — 预合并代码审查

**做什么：** 多阶段多维度审查 — 基础安全分析 → 专家审查（测试/安全/场景）→ Fix-First 自动修复 → 对抗性审查（Codex 子模型交叉验证）→ 输出质量评分。

**触发：** "review this PR" / "code review" / "check my diff"

### 27. `code-review-and-quality`（addy-agent）— 多维代码审查

**做什么：** 五轴审查：正确性、可读性、架构、安全性、性能。每个变更必须通过审查才能合入。

**触发：** 合并前 / 功能完成后自动建议

### 28. `/cso` — 首席安全官审计

**做什么：** 两种模式 — `daily`（零噪音，8/10 置信度门禁）和 `comprehensive`（月深度扫描，2/10 门禁）。覆盖：密钥考古、依赖供应链、CI/CD 安全、LLM/AI 安全、技能供应链扫描、OWASP Top 10、STRIDE 威胁建模。

**触发：** "security audit" / "threat model" / "owasp review"

### 29. `/design-review` — 可视化设计审查

**做什么：** 对已有站点的可视化审查（而非规划阶段的设计审查）。审查视觉设计实现质量。

**触发：** "design review of this page" / "visual audit"

### 30. `/qa` / `qa-only` — 全质量保证

**做什么：** 功能测试 + 视觉检查 + 响应式 + 可访问性 + 安全。`/qa-only` 仅测试指定 URL。

**触发：** "qa this feature" / "run full QA"

### 31. `/guard` — 全安全模式

**做什么：** `/careful`（破坏性命令警告）+ `/freeze`（限定目录编辑）的组合。禁止在限定目录外写文件，拦截危险命令。

**触发：** "full safety mode" / "lock it down" / "maximum safety"

### 32. `/freeze` / `/unfreeze` — 冻结/解冻审查状态

**做什么：** 冻结时阻止在指定目录外进行写操作，确保调试/审查范围不扩散。`/unfreeze` 恢复。

**触发：** "freeze the scope" / "unfreeze"

### 33. `requesting-code-review`（superpowers）— 请求代码审查

**做什么：** 分发审查子 Agent，在继续前验证实现是否符合规划或需求。每个任务完成后必做 + 大功能完成 + 合并前必做。

**触发：** 子 Agent 开发流程中的自动门禁

### 34. `receiving-code-review`（superpowers）— 接收代码审查反馈

**做什么：** 用技术严谨性（而非表演性同意或盲目实施）来处理审查反馈。核心规则：实施前验证，提问前确认，技术正确性优先于社交舒适。

**触发：** 收到代码审查反馈时主动建议

---

## 五、项目管理

### 35. `/autoplan` — 全自动规划审查管道

**做什么：** 自动串联 CEO + 设计 + 工程 + DX 四轮审查，6 大自动决策原则 + 最终审批门。一键输出完整的审查决策。

**触发：** "run all reviews" / "autoplan" / "automatic review pipeline"

### 36. `/retro` — 工程复盘周报

**做什么：** 分析提交历史、工作模式趋势、代码质量指标。团队模式下按人拆解贡献 + 亮点 + 改进空间。持久化趋势追踪。

**触发：** "weekly retro" / "what did we ship" / "engineering retrospective"

### 37. `/plan-tune` — 问题敏感度自调优

**做什么：** 审查 gstack 的 AskUserQuestion 触发频率，设置每个问题的偏好（永不问/总是问/仅单向问），查看开发者画像双轨分析。

**触发：** "tune questions" / "stop asking me that" / "show my profile"

### 38. `planning-with-files` — 持久化文件规划

**做什么：** Manus 风格的文件级规划：`task_plan.md` + `findings.md` + `progress.md` 持久化到磁盘，`/clear` 后自动恢复。支持多阶段规划和完成度检查。

**触发：** 多步骤项目 / 5+ 次工具调用的复杂任务时自动激活

### 39. `planning-and-task-breakdown`（addy-agent）— 规划与任务拆解

**做什么：** 将工作分解为有序的小任务，每个有明确的验收标准。核心原则：每个任务应小到可以在单次专注会话中实现、测试和验证。

**触发：** 有 spec 需要分解 / 任务太大无处下手 / 需要并行化时主动建议

### 40. `writing-plans`（superpowers）— 编写实施计划

**做什么：** 为零代码库上下文的工程师编写详尽的实施计划。含：改哪些文件、代码示例、测试指南。假设工程师是熟练开发者但不知道你的领域。

**触发：** 设计完成后需要细化实施任务时主动建议

### 41. `executing-plans`（superpowers）— 批量执行计划

**做什么：** 加载计划 → 批判性审查 → 分批执行任务 → 批次间生成审查报告。核心原则：分批执行 + 架构师审查检查点。

**触发：** 收到完整实施计划需要受控分批执行时

### 42. `subagent-driven-development`（superpowers）— 子 Agent 驱动开发

**做什么：** 每个任务分发新鲜子 Agent + 任务间代码审查。避免上下文污染，确保质量门禁。适用于同一会话内任务相对独立的场景。

**触发：** 有实施计划、任务独立、需要连续进度时

### 43. `dispatching-parallel-agents`（superpowers）— 并行 Agent 调度

**做什么：** 3+ 个独立失败问题时，每个独立问题域分发一个 Agent 并行工作。无共享状态无依赖。

**触发：** 多个不相关的测试失败 / 子系统故障时主动建议

### 44. `/ship` — 发布工作流

**做什么：** 检测基础分支 → 合并 → 运行测试 → 审查 diff → 升级版本 → 更新 CHANGELOG → commit → push → 创建 PR。

**触发：** "ship it" / "create a pr" / "push to main"

### 45. `/document-release` — 发布后文档更新

**做什么：** 读取所有项目文档，对照 diff 交叉引用，更新 README/ARCHITECTURE/CONTRIBUTING/AGENTS.md，打磨 CHANGELOG 语气，清理 TODOS。

**触发：** "update the docs" / "post-ship docs"

### 46. `/health` — 代码质量仪表盘

**做什么：** 封装项目已有工具（类型检查、linter、测试、死代码检测、shell linter），计算加权综合评分 0-10，追踪趋势。

**触发：** "health check" / "code quality" / "quality score"

### 47. `finishing-a-development-branch`（superpowers）— 完成开发分支

**做什么：** 验证测试 → 呈现选项（merge/PR/清理） → 执行选择 → 清理。标准化分支完成流程。

**触发：** 实现完成、测试通过、需要决定如何集成时主动建议

### 48. `test-driven-development`（superpowers）— 测试驱动开发

**做什么：** 先写测试 → 看它失败 → 写最简代码让它通过。核心原则：没看过测试失败，就不确认测试是否正确。

**触发：** 任何功能实现或 Bug 修复前主动建议

### 49. `testing-anti-patterns`（superpowers）— 测试反模式

**做什么：** 禁止测试 mock 行为、禁止为测试给生产代码加方法、mock 前先理解依赖。铁律：测试代码做了什么，不是 mock 做了什么。

**触发：** 编写/修改测试 / 添加 mock 时主动建议

### 50. `git-workflow-and-versioning`（addy-agent）— Git 工作流与版本管理

**做什么：** Git 最佳实践：分支策略、commit 规范、版本号管理、rebase vs merge 决策、冲突解决。

**触发：** Git 相关操作 / 版本管理讨论时主动建议

### 51. `documentation-and-adrs`（addy-agent）— 文档与架构决策记录

**做什么：** 系统化文档管理：README、API 文档、ADR（架构决策记录）、运行指南。确保决策上下文可追溯。

**触发：** 需要记录架构决策 / 项目文档缺失时主动建议

---

## 总结：全景分类图

```
产品经理/需求                                项目管理
┌─────────────────────┐              ┌──────────────────────────┐
│ /office-hours        │              │ /autoplan                │
│ /plan-ceo-review     │              │ /retro                   │
│ idea-refine          │              │ /plan-tune               │
│ spec-driven-dev      │              │ planning-with-files      │
│ design-consultation  │              │ planning-and-task-bd     │
└─────────────────────┘              │ writing-plans            │
                                      │ executing-plans          │
开发规范/流程                           │ subagent-driven-dev      │
┌─────────────────────┐              │ dispatching-parallel-agt  │
│ context-engineering  │              │ /ship                    │
│ source-driven-dev    │              │ /document-release        │
│ doubt-driven-dev     │              │ /health                  │
│ code-simplification  │              │ finishing-a-dev-branch   │
│ codex                │              │ TDD                      │
│ incremental-impl     │              │ testing-anti-patterns    │
│ deprecation-migration│              │ git-workflow-versioning  │
└─────────────────────┘              │ documentation-and-adrs   │
                                      └──────────────────────────┘
工程                                    
┌─────────────────────┐              审查/评审
│ /plan-eng-review     │              ┌──────────────────────┐
│ /plan-devex-review   │              │ /review               │
│ /plan-design-review  │              │ code-review-and-quality│
│ /benchmark           │              │ /cso                  │
│ /canary              │              │ /design-review        │
│ /land-and-deploy     │              │ /qa / qa-only         │
│ api-and-interface    │              │ /guard                │
│ ci-cd-automation     │              │ /freeze/unfreeze      │
│ performance-optimize │              │ requesting-code-review │
│ observability        │              │ receiving-code-review  │
│ security-hardening   │              └──────────────────────┘
│ shipping-launch      │
│ frontend-ui-eng      │
└─────────────────────┘
```

一共 **51 个技能**分属 5 大类别。其中 gstack 系技能（以 `/` 开头）是核心工作流技能，直接作为斜杠命令调用；addy-agent-skills 和 superpowers-skills 是流程性/方法论技能，由 Agent 根据上下文自动激活，不需要用户手动触发。