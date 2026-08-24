## Context

见 [proposal.md](proposal.md)。当前基线审计如下：

| 分类 | 结论 | 证据 |
|---|---|---|
| 已交付 | `quality-gate.yml` 可经 `workflow_dispatch` 运行，PR #1146 的 run `32687373193` 已产生并通过全部 8 个 QG job 与 `Gate Result` | GitHub Actions run，2026-08-24 |
| 已交付 | 分支保护 required contexts 当前包含 8 个 QG job 与 `electron-tests`、`单元测试 + Lint`、`文档同步检查`、双平台 build | `GET /branches/main/protection` |
| 待办 | docs-only PR 不会自然产生 5 个 path-filtered required job，导致 `BLOCKED` | PR #1146 head `44d439c22` 的 check-run 差集 |
| 待办 | `ci-path-gating` 与 `workflow-contract.test.js` 仍把 docs-only PR 跳过视为契约 | live spec 与 `.github/scripts/workflow-contract.test.js` |

## Goals / Non-Goals

**Goals:**

- 让所有目标为 `main` 的 PR 产生现有分支保护所要求的真实 job，不依赖手动 dispatch 或管理员合并。
- 保留 main 分支 push 的路径过滤，防止合并后的纯文档提交重复跑全量 CI。
- 用自动化契约测试锁定 PR 与 push 的不同触发语义。

**Non-Goals:**

- 不更改 required-context 白名单、组织 ruleset 或使用 GitHub API 绕过保护。
- 不新增同名空 job、伪造 check run，或以跳过真实测试来模拟通过。
- 不更改产品运行时代码、打包命令或测试内容。

## Decisions

### 1. PR 全覆盖，main push 保留去重过滤

对 `quality-gate.yml`、`electron-ci.yml`、`build.yml` 移除 `pull_request.paths-ignore`；保留 `push.branches: [main]` 的现有 `paths-ignore`。这样 PR head 始终有对应 check，合并后的 docs-only main push 不重复执行。`build` 的 tag 触发保持不变。

备选“保留过滤、只在 docs PR 手动 dispatch”被拒绝：workflow_dispatch 结果不能可靠显示为 PR 检查，且无法产生其余五个 required context。

### 2. Doc Gate 对所有 main PR 执行

移除 `doc-gate.yml` 的 `pull_request.paths-ignore`，使 `文档同步检查` 与 `单元测试 + Lint` 在 docs-only、CI-only 与代码 PR 都形成真实运行记录。这个 workflow 的 PRD 校验仍由现有脚本根据变更内容判断；不把“workflow 是否运行”与“是否需要 PRD 改动”混为一谈。

备选“使用同名轻量 no-op job”被拒绝：它会把 required status 的名称与实际验证脱钩，形成伪造绿灯。

### 3. 契约测试按事件维度断言

`CI_IGNORED_PATHS` 继续是三个全量 workflow 的 `push main` 单一来源。测试改为断言：三者的 push 路径过滤仍一致、`pull_request` 不含 `paths-ignore`、Doc Gate 的 PR 触发不含路径过滤。

备选“删除路径清单与全部过滤”被拒绝：main 的 docs-only 合并会无必要重跑重型 CI，且违背合并后去重目标。

## Risks / Trade-offs

- [纯文档 PR CI 时间和 runner 消耗增加] → 只在 PR 执行；合并后的 `push main` 继续过滤；由 GitHub Actions 并行 job 缩短 wall-clock。
- [workflow 配置变更的首个 PR 需要验证各 job 真实出现] → 用本 PR 的 docs-only 变更作为回归样本，核对 13 个 required contexts 与 PR check-runs 的差集为空。
- [Doc Gate 对配置 PR 执行后暴露既有同步问题] → 这属于真实门禁结果，修复输入或脚本；不得重新用 path filter 隐藏。

## Migration Plan

1. 更新 workflow、契约测试与 `ci-path-gating` delta spec。
2. 本地运行 workflow-contract 与文档同步检查，提交后推送 PR #1146。
3. GitHub `pull_request.synchronize` 自动运行全套 workflow；验证分支保护 required contexts 全部存在且成功。
4. 若 CI 成本或稳定性不可接受，回退本 PR 的 workflow 配置提交即可恢复现有过滤；不修改 GitHub branch protection。
