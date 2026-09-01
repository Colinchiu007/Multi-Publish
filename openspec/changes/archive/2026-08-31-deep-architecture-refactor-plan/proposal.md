## Why

Multi-Publish 已演进为 Electron 桌面端、多 pnpm workspace 包、Python/Node 服务、运营后台与多种部署形态并存的系统，但全局架构知识分散在代码、OpenSpec、超大 PRD、历史架构文档和 CI 门禁中。当前缺少一份以最新 `origin/main` 代码为基线、能量化耦合与风险并指导增量演进的统一技术重构方案，继续按局部需求叠加将提高跨进程契约漂移、重复实现、测试成本和发布风险。

## What Changes

- 对当前代码基线执行全仓架构、依赖、数据流、信任边界、部署边界和质量门禁审计。
- 形成包含现状架构图、模块责任矩阵、热点与债务清单、目标架构及架构决策原则的 Markdown 报告。
- 正式报告固定写入 `01-docs/ARCH-REFACTOR-ROADMAP-2026-08-31.md`，审查记录写入 CCG task 的 `review.md`。
- 将重构建议拆为可独立批准、可回滚、可验证的迁移波次，并定义每一波的前置条件、验收门禁和退出条件。
- 使用 opencode 与 Claude 对现状发现和最终方案分别进行独立分析与交叉审查，记录共识、分歧和证据边界。
- 只交付规划工件，不修改产品行为；后续每个实施波次须另建 OpenSpec change。
- 每个未来实施 change 都必须独立完成适用的单元/集成测试、打包验证、真实 Electron UI 或服务运行验证，以及远端 CI/分支保护核对；这些证据不得互相替代。

## Capabilities

### New Capabilities

无。本 change 是技术调研与规划文档，不引入系统能力或外部可观察行为，因此在 `.openspec.yaml` 中声明 `skip_specs: true`。

### Modified Capabilities

无。报告可建议未来修改现有 capability，但本 change 不改变任何现有 Requirement。

## Impact

- 直接影响仅限 `.ccg/tasks/deep-architecture-refactor-plan/`、`openspec/changes/deep-architecture-refactor-plan/` 和最终技术报告。
- 审计范围覆盖 `apps/desktop`、`packages/*`、`ops-center`、`config`、部署与 CI 脚本、OpenSpec/项目规范及测试目录。
- 不变更 API、IPC、数据库 Schema、依赖版本、打包产物、运行配置或生产环境。
- 报告基线固定为 `origin/main@2e1b84fcf42245842ae09554a054a8d5f4b66b07`，避免把并发 worktree 或共享根脏改动混入结论。
