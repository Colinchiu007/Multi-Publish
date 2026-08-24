## Why

`main` 的分支保护要求多个 workflow job 通过，但这些 workflow 又通过 `pull_request.paths-ignore` 跳过纯文档/流程 PR。GitHub 将未触发的必需检查视为缺失，导致 PR #1146 这类无运行时代码变更的 PR 即使手动 QG 全绿也永久 `BLOCKED`。

路径过滤修复让 PR #1146 首次完整运行 Windows Browser E2E，并暴露 `FunctionalRunner` 对 `net::ERR_NO_BUFFER_SPACE` 的单次导航失败没有恢复策略。该错误发生在 `QG Browser E2E` 的 `/accounts` 路由，但同 run 的账号管理集成流通过；修复必须提升测试基础设施韧性，不能重新隐藏真实检查。

## What Changes

- 目标为 `main` 的 PR 不再因文档/流程路径被全量 CI 或 Doc Sync Gate 过滤；每个受保护 job 都运行其真实检查。
- 保留 `push main` 的全量 workflow 路径过滤：文档提交合并后不重复消耗完整 CI；`v*` tag 发布行为不变。
- 将路径门控契约测试改为区分 PR 和 main-push 事件，防止以后再次把 path-filtered job 加入 PR required contexts。
- 给 `FunctionalRunner` 的 `goto` / `resetToRoute` 添加仅限 `net::ERR_NO_BUFFER_SPACE` 的一次短暂重试，并以快速合同测试锁定失败闭环。
- 更新合并检查与复盘文档，明确 PR 触发全覆盖、push 去重的策略及其 CI 成本。

## Capabilities

### New Capabilities

- `browser-e2e-navigation-resilience`: Windows Browser E2E 的导航瞬态错误恢复与失败闭环。

### Modified Capabilities

- `ci-path-gating`: 将 PR 触发策略从“文档/流程变更跳过”改为“所有目标为 main 的 PR 运行真实受保护检查”，同时保留 main push 的路径去重。

## Impact

- 仓库配置：`.github/workflows/quality-gate.yml`、`electron-ci.yml`、`build.yml`、`doc-gate.yml`。
- 契约测试：`.github/scripts/workflow-contract.test.js`。
- E2E 基础设施：`apps/desktop/tests/e2e/helpers/functional-runner.js`、其 node:test 合同与 Gate 8 调度。
- CI 成本：纯文档/流程 PR 将运行 Windows QG、Linux Electron、双平台 build 和 Doc Gate；这是避免 required check 缺失的明确取舍。
- GitHub branch protection：保留现有 required context，不需要管理员绕过或伪造状态。
