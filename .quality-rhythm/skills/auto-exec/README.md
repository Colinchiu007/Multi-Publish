# Auto-Exec Mechanism

> 自主执行编排机制 — 将开发目标自动分解为可执行任务，跨会话批量执行数小时，无需用户监督。

## 核心架构

```
主会话
  │
  ├── Phase 0-2: 意图分类 → 风险分级 → 任务分解
  │
  ├── Phase 3-4: 执行调度 (多子 Agent 并行)
  │     ├── A — 数据层 (trendscope / content-aggregator)
  │     ├── B — 语义层 (splitter / prompt-engine)
  │     ├── C — 交付层 (Story2Video / Multi-Publish)
  │     └── general — 文档/配置/测试
  │
  ├── Phase 4.6: Review Agent — 代码审查
  ├── Phase 4.7: E2E 自动验收
  └── Phase 5: 自适应记忆 → 清理
```

## 集成能力

| 机制 | 说明 |
|------|------|
| Intent Gate | 用户请求分类，决定是否触发 auto-exec |
| ECC 安全分级 | low/medium/high 三级风险，high 阻塞等待确认 |
| TDD 雪球 | bug fix 先写回归测试，RED→GREEN→REFACTOR |
| Review Checklist | 正确性/安全/架构/测试/PRD 七维审查 |
| PRD 门禁 | 功能变更必须同步 PRD |
| .plan/ 持久化 | 跨会话状态目录，scheduled task 轮询执行 |
| 多子 Agent 并行 | 按 ROLE_CARD 角色分组，无依赖任务并行 |
| Review Agent | 独立审查子 Agent，❌ 不通过不合并 |
| E2E 验收 | 全测试套件 + 集成验收 + 边界回归 |
| 资源感知调度 | 同资源任务串行（db/port/file/llm） |
| 自适应记忆 | 执行分析自动写入 memory/feedback |
| 上下文压缩 (s08) | L1 snip_compact + L3 tool_result_budget — 防止 context 膨胀 |

## 上下文压缩策略 (s08)

在长时间跨会话执行中，context 会自然膨胀。采用 learn-claude-code s08 的四层压缩管线防止 session 提前终结：

| 层级 | 名称 | 触发条件 | 操作 | 成本 |
|------|------|---------|------|------|
| L1 | snip_compact | 消息数 > 30 对 | 保留前 5 后 10，中间截断 | 0 API |
| L2 | micro_compact | 旧工具结果 > 20 对 | 旧结果 → `[Tool result: X chars]` 占位符 | 0 API |
| L3 | tool_result_budget | 单个工具输出 > 100 行 | 保存到 `.plan/context/` → 用文件引用替代 | 0 API |
| L4 | auto_compact | 估计尺寸仍 > 限制 | LLM 总结历史 → 替换 | 1 API 调用 |

### Worker 每轮执行时的上下文管理

```
每轮 LLM 调用前:

1. 检查消息总数
   - > 30 对 → 执行 L1（截断中间） + 可选 L2（旧结果→占位符）

2. 检查最近工具结果大小
   - 单结果 > 100 行 → 执行 L3（保存到 .plan/context/，注入文件引用）

3. 如果 API 返回 prompt_too_long
   - 执行 reactive compact（保留最近 5 条） → retry 一次

4. L4（auto_compact）作为最后手段，仅在以上压缩后仍超限时使用
   因为涉及 LLM 调用开销，只在必要场景用
```

**不依赖上下文：** 即使 context 被压缩，`.plan/` 目录仍是真理源。每次执行从头读 plan → 执行 → 写回进度。

## 文件结构

```
auto-exec-mechanism/
├── README.md              # 本文
├── SKILL.md               # auto-exec skill（可导入其他项目）
├── .plan/
│   └── README.md          # .plan/ 协议规范
├── dashboard/
│   └── auto-exec-dashboard.html  # 执行仪表盘
├── tools/                 # 开发辅助工具（oh-my-openagent 集成）
│   ├── README.md          # 工具注册表
│   ├── hash_anchor.py     # P0-1: Hash-Anchored Editing
│   ├── init_deep.py       # P0-2: AGENTS.md 自动生成
│   ├── planning_pipeline.py # P1-1: 规划管线
│   ├── notepads.py        # P1-2: Wisdom Accumulation
│   ├── model_routing.py   # P2: 多模型路由
│   └── team_mode.py       # P3: Team Mode
└── ROLE_CARD_MAPPING.md   # 角色映射参考
```

## 使用方式

### 方式 1: 自动触发

所有会话通过 `core-rules.md` 的 Intent Gate 自动评估 → 复杂任务自动走 auto-exec。

### 方式 2: 手动启动

```bash
# 在任何会话中说:
/auto-exec "<目标描述>"
```

### 方式 3: 跨会话执行

Auto-Exec 自动创建 scheduled task，每 1 分钟轮询一次（batch 模式） `.plan/` 状态目录，直到所有任务完成。

## 前置依赖

- Claude Desktop App with Cowork MCP
- `.plan/` 目录在 workspace 根目录
- GitHub PAT for PR 操作
- ROLE_CARD 文件在 `agent-patch/.cowork/`（可自定义）


## v3 更新 — Worker Prompt 三修复（2026-06-30）

- **新增分支检查步骤**：worker prompt 步骤 1，执行前确认分支，避免在 feat/ 上直接改
- **新增原子 Commit 指令**：步骤 7，每独立逻辑变更单独 commit，禁止 `git add -A`
- **新增强制 Push 步骤**：步骤 11，每 3 commit 或 batch 结束时推送，防止本地 commit 丢失
- 纪律章节补充 3 条：先分支再动手、改完就 commit、push 不能忘
