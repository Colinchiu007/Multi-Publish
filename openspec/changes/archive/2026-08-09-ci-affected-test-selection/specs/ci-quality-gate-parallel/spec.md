# ci-quality-gate-parallel

## MODIFIED Requirements

### Requirement: 触发去重

quality-gate.yml 的 `on` SHALL 仅包含 `pull_request`（branches: [main]）、`workflow_dispatch` 与 `push`（branches: [main]，带与 pull_request 一致的 paths-ignore）；SHALL NOT 包含针对 feature 分支的 push 触发，避免同 head 双跑。push main 用于主分支合并后的全量回归（见 affected-test-selection「全量回归保留」）；feature 分支仍仅由 pull_request 触发。

#### Scenario: 单次触发

- **WHEN** 查看 quality-gate.yml 的 on
- **THEN** 存在 pull_request 与 workflow_dispatch，push 仅限 branches: [main]（feature 分支不触发）

#### Scenario: 主分支全量回归

- **WHEN** 代码合并到 main（push main 事件）
- **THEN** quality-gate 以全量模式执行所有 workspace 测试（nx run-many -t test --all），文档/流程类改动（命中 paths-ignore）跳过
