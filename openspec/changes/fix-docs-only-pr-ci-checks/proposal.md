## Why

`main` 的分支保护要求多个 workflow job 通过，但这些 workflow 又通过 `pull_request.paths-ignore` 跳过纯文档/流程 PR。GitHub 将未触发的必需检查视为缺失，导致 PR #1146 这类无运行时代码变更的 PR 即使手动 QG 全绿也永久 `BLOCKED`。

## What Changes

- 目标为 `main` 的 PR 不再因文档/流程路径被全量 CI 或 Doc Sync Gate 过滤；每个受保护 job 都运行其真实检查。
- 保留 `push main` 的全量 workflow 路径过滤：文档提交合并后不重复消耗完整 CI；`v*` tag 发布行为不变。
- 将路径门控契约测试改为区分 PR 和 main-push 事件，防止以后再次把 path-filtered job 加入 PR required contexts。
- 更新合并检查与复盘文档，明确 PR 触发全覆盖、push 去重的策略及其 CI 成本。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `ci-path-gating`: 将 PR 触发策略从“文档/流程变更跳过”改为“所有目标为 main 的 PR 运行真实受保护检查”，同时保留 main push 的路径去重。

## Impact

- 仓库配置：`.github/workflows/quality-gate.yml`、`electron-ci.yml`、`build.yml`、`doc-gate.yml`。
- 契约测试：`.github/scripts/workflow-contract.test.js`。
- CI 成本：纯文档/流程 PR 将运行 Windows QG、Linux Electron、双平台 build 和 Doc Gate；这是避免 required check 缺失的明确取舍。
- GitHub branch protection：保留现有 required context，不需要管理员绕过或伪造状态。
