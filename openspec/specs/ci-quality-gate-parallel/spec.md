# ci-quality-gate-parallel Specification

## Purpose
定义 Quality Gate 的并行化与触发去重契约：gate 步骤分布在并行 job 中保持语义等价，每 head 仅触发一次；契约测试锁定并行结构下的 gate 存在性、顺序与退出码契约。
## Requirements
### Requirement: 并行 job 结构
quality-gate.yml SHALL 将 gate 拆分为并行 job：static-gates（Gate 1/2/3/6）、unit-tests（Gate 4/4b）、coverage（Gate 5）、visual（Gate 7）、e2e（Gate 8）、autonomous（Gate 9）、gate-result（needs 全部，汇总报告）。全部 gate job SHALL 使用 windows-latest。Gate 4 与 Gate 4b SHALL 位于同一 job 且顺序相邻；Gate 7/8/9 的 pwsh 步骤 SHALL 保留 `$PSNativeCommandUseErrorActionPreference = $false` 退出码契约。

#### Scenario: 并行结构可解析
- **WHEN** 解析 quality-gate.yml
- **THEN** 存在上述 7 个 job，unit-tests 内 Gate 4 后紧跟 Gate 4b，visual/e2e/autonomous 内 Gate 7/8/9 后各有一个 Upload GUI quality artifacts 步骤

#### Scenario: 退出码契约保留
- **WHEN** 检查 Gate 7/8/9 步骤
- **THEN** 每个步骤 run 含 `$PSNativeCommandUseErrorActionPreference = $false`（跨 job 汇总可定位）

### Requirement: 触发去重

quality-gate.yml 的 `on` SHALL 仅包含 `pull_request`（branches: [main]）、`workflow_dispatch` 与 `push`（branches: [main]，带与 pull_request 一致的 paths-ignore）；SHALL NOT 包含针对 feature 分支的 push 触发，避免同 head 双跑。push main 用于主分支合并后的全量回归（见 affected-test-selection「全量回归保留」）；feature 分支仍仅由 pull_request 触发。

#### Scenario: 单次触发

- **WHEN** 查看 quality-gate.yml 的 on
- **THEN** 存在 pull_request 与 workflow_dispatch，push 仅限 branches: [main]（feature 分支不触发）

#### Scenario: 主分支全量回归

- **WHEN** 代码合并到 main（push main 事件）
- **THEN** quality-gate 以全量模式执行所有 workspace 测试（nx run-many -t test --all），文档/流程类改动（命中 paths-ignore）跳过

### Requirement: 契约测试同步
workflow-contract.test.js 与 gui-ci-exit-contract.test.js SHALL 以并行结构为准：Gate 7/8 步骤匹配锚定为同 job 的 Upload 步骤；gui-ci 对 Gate 7/8/9 的步骤查找 SHALL 跨 job 汇总。

#### Scenario: 契约测试通过
- **WHEN** 运行 .github/scripts 契约测试与 gui-ci-exit-contract.test.js
- **THEN** 全部通过，且 Gate 4/4b 邻接、Gate 9+Upload 邻接、autonomous-loop-workflow 引用、Gate 9 的 `if ($exitCode -eq 0)...exit 0` 模式均保持

