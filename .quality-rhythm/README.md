
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
│       ├── bug-reflection/
│       └── ci-hardening/            → CI/CD 硬化：runner 迁移、Quality Gate 并行化、触发去重、workflow 契约同步（含模板+脚本）
│
└── references/                        ← 项目开发知识库参考文件（9 篇）
    ├── quality-playbook-ai-prompt.md
    ├── Research提示词.md
    ├── 协作机制和开发流程.md
    ├── AI开发规范SKILL：professional-ai-coding-workflow.md
    └── ...
```

## Spec Kit Preset

`presets/quality-rhythm-sdd/` 包含增强版 Spec Kit 模板，注入 UI 字段规格、
交互控件、弹窗、视觉规范、错误状态、字段校验、TDD 测试映射等 7 层执行层规格。
详见 SKILL.md 第 5.4 节。

安装：

```bash
specify preset add --dev <path-to-quality-rhythm-repo>/presets/quality-rhythm-sdd
```

## Canonical 安装位置

本仓库的主技能文件是 `SKILL.md`。在同时使用 Codex 与其他 Agent 工具时，建议只把本仓库映射到：

```text
C:\Users\邱领\.agents\skills\质量节拍\SKILL.md
```

不要再在 `C:\Users\邱领\.codex\skills\quality-rhythm\` 保留第二份活动副本，否则 Skill 列表会出现重复的 `Quality Rhythm`。
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

## 集成的 58 个技能

质量节拍集成了 gstack 核心技能、Superpowers Skills、Addy-Agent Skills 和
ci-hardening（CI/CD 硬化：runner 迁移、Quality Gate 并行化、触发去重、workflow 契约同步），
覆盖从需求到运营的完整开发流程。详见 SKILL.md 第五章。

### CI 硬化集成（ci-hardening）

ci-hardening 是质量节拍内置的 **CI/CD 硬化子技能**（`skills/other/ci-hardening/`），
把「CI 迁移判断、瓶颈实测、并行拆分、触发去重、契约同步」沉淀为跨项目可复用的
方法与模板（源于 Multi-Publish 实战：electron-tests 迁移 GitHub runner、Quality Gate 25min→12min）。

**触发场景**（说以下任意一句即自动路由）：
- 「CI 太慢 / 排队久 / 优化 Quality Gate」→ 迁移判断 + 瓶颈实测
- 「把 CI 从自托管/ECS runner 迁到 GitHub 官方 runner」→ 适配点核对 + 迁移验证
- 「修改 / 新建 `.github/workflows/*.yml`」→ 全仓契约测试排查 + 结构同步（必做）
- 「给新项目初始化质量门禁」→ 并行 quality-gate.yml + 本地 .quality-gates.md + 可选 electron-ci.yml

**使用方式**（以质量节拍仓库根为 cwd）：

```bash
# 新项目门禁脚手架（生成并行 quality-gate.yml + .quality-gates.md + 可选 electron-ci.yml；--dry-run 预览）
node skills/other/ci-hardening/scripts/apply-ci-hardening.js --repo <target> [--with-electron] [--dry-run]

# 既有 CI 瓶颈实测（GitHub API steps 耗时分析）
node skills/other/ci-hardening/scripts/analyze-ci-steps.js <run-id>
```

**与质量节拍的协同**：
- **M4 三层门禁**：本地提交门禁（`.quality-gates.md` + husky pre-commit）→ 流程 skill（质量节拍 Phase 0-5）→ 远程 CI（GitHub Actions PR 触发）
- **pre-commit 自动化**：`.husky/pre-commit.js` 自动执行 分支保护 + 测试存在性 + 语法检查（node --check）+ 密钥扫描，通过后自动在 `.quality-gates.md` 生成审计记录（无需人工勾选）
- **一键分发**：`integrations/install-mechanism.js <项目> --yes` 会自动调用 ci-hardening 脚手架为新项目渲染门禁产物 + 复制斜杠命令（`.claude/commands/` 与 `.cursor/commands/`）

**防漂移保障**：`.github/scripts/tpl-contract.test.js` 契约测试在 CI 中验证模板变量全覆盖、并行 QG 结构、触发去重、命令模板存在（`node --test .github/scripts/tpl-contract.test.js`）。

详细方法论见 `skills/other/ci-hardening/references/methodology.md`；完整集成说明见 SKILL.md 第 5.7 节。

### Spec Kit 集成（quality-rhythm-sdd Preset）

质量节拍通过 Spec Kit Preset 增强了 Spec-Driven Development 工作流，
在标准 Spec 流程之上注入 UI 字段规格、交互控件、弹窗、视觉规范、错误状态、
字段校验、TDD 测试映射等 7 层执行层规格。

详见 SKILL.md 第 5.4 节。安装方式：

```bash
specify preset add --dev <path-to-quality-rhythm-repo>/presets/quality-rhythm-sdd
```

## 质量门禁

每个 Phase 结束时自动触发质量门禁检查，过不了不进下一阶段。
详见 SKILL.md 第 10.8 节。

## GitHub

仓库：https://github.com/Colinchiu007/quality-rhythm
