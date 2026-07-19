
# 质量节拍 (Quality Beat)

> 开发质量不是靠检查清单堆出来的，是靠固定节奏的日常循环跑出来的。
> AI 编程不是自动写代码，而是辅助完整开发流程。

## 目录结构

```
质量节拍/
├── SKILL.md                           ← 主技能文件（质量节拍 v2）
├── README.md                          ← 本文件
├── skills/
│   ├── gstack-core/                   ← gstack 核心技能（32 个）
│   │   ├── office-hours/             → 产品需求分析
│   │   ├── plan-ceo-review/          → CEO 战略审查
│   │   ├── plan-eng-review/          → 工程审查
│   │   ├── plan-design-review/       → 设计审查
│   │   ├── plan-devex-review/        → DX 审查
│   │   ├── autoplan/                 → 全自动规划审查
│   │   ├── review/                   → 预合并代码审查
│   │   ├── investigate/              → 根因调试
│   │   ├── retro/                    → 复盘
│   │   ├── learn/                    → 经验学习
│   │   ├── ai-collaboration/         → AI 协作能力（新增）
│   │   ├── ship/                     → 发布
│   │   ├── land-and-deploy/          → 部署
│   │   ├── canary/                   → 灰度
│   │   ├── cso/                      → 安全审计
│   │   ├── guard/                    → 安全门禁
│   │   ├── freeze/unfreeze/          → 冻结/解冻
│   │   ├── qa/ qa-only/              → 质量保证
│   │   ├── design-*/                 → 设计技能系列
│   │   ├── document-release/         → 发布文档
│   │   ├── health/                   → 质量仪表盘
│   │   ├── benchmark/                → 基准测试
│   │   ├── browse/                   → Web 浏览
│   │   ├── pair-agent/               → Agent 协作
│   │   └── codex/                    → Codex CLI 包装
│   │
│   ├── gstack-templates/             ← 已更新技能的 .tmpl 模板
│   │   ├── investigate/
│   │   ├── office-hours/
│   │   ├── retro/
│   │   ├── learn/
│   │   ├── autoplan/
│   │   ├── review/
│   │   └── ai-collaboration/
│   │
│   ├── superpowers/                   ← Superpowers 技能（16 个）
│   │   ├── collaboration/            → 协作类（brainstorming, subagent-driven 等）
│   │   ├── debugging/                → 调试类（systematic-debugging 等）
│   │   ├── testing/                  → 测试类（TDD, testing-anti-patterns 等）
│   │   └── meta/                     → 元技能（writing-skills）
│   │
│   ├── addy-agent/                   ← Addy-Agent 技能（22 个）
│   │   ├── planning-and-task-breakdown/
│   │   ├── spec-driven-development/
│   │   ├── incremental-implementation/
│   │   ├── code-review-and-quality/
│   │   ├── source-driven-development/
│   │   ├── doubt-driven-development/
│   │   └── ...（完整列表见 skills/addy-agent/）
│   │
│   └── other/                        ← 其他参考技能
│       └── bug-reflection/
│
└── references/                        ← 项目开发知识库参考文件（9 篇）
    ├── quality-playbook-ai-prompt.md
    ├── Research提示词.md
    ├── 协作机制和开发流程.md
    ├── AI开发规范SKILL：professional-ai-coding-workflow.md
    └── ...
```

## 核心工作流

质量节拍将完整开发流程划分为 5 大 Phase、13 子阶段：

```
Phase 0: 探索期 — 调研、构想、需求确认
Phase 1: 规划期 — 架构、设计、计划、DX
Phase 2: 开发期 — 日常循环 ⓪→①→②→③→④→⑤→⑥
Phase 3: 交付期 — 审查、灰度、上线、文档
Phase 4: 复盘期 — 体检、复盘、沉淀
Phase 5: 运营期 — 排查、性能、可观测、安全
```

首次使用：`使用质量节拍，当前焦点：[Phase 编号] —— [子任务名称]`
后续使用：`遵循质量节拍。当前焦点：[新子任务]`

## 集成的 52+ 个技能

质量节拍集成了 gstack 核心技能、Superpowers Skills 和 Addy-Agent Skills，
覆盖从需求到运营的完整开发流程。详见 SKILL.md 第五章。

## 质量门禁

每个 Phase 结束时自动触发质量门禁检查，过不了不进下一阶段。
详见 SKILL.md 第 10.8 节。

## GitHub

仓库：https://github.com/Colinchiu007/quality-rhythm
