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
quality-gate.yml 的 `on` SHALL 仅包含 `pull_request`（branches: [main]）与 `workflow_dispatch`，不得包含 push 触发，避免同 head 双跑。

#### Scenario: 单次触发
- **WHEN** 查看 quality-gate.yml 的 on
- **THEN** 键为 pull_request 与 workflow_dispatch，无 push

### Requirement: 契约测试同步
workflow-contract.test.js 与 gui-ci-exit-contract.test.js SHALL 以并行结构为准：Gate 7/8 步骤匹配锚定为同 job 的 Upload 步骤；gui-ci 对 Gate 7/8/9 的步骤查找 SHALL 跨 job 汇总。

#### Scenario: 契约测试通过
- **WHEN** 运行 .github/scripts 契约测试与 gui-ci-exit-contract.test.js
- **THEN** 全部通过，且 Gate 4/4b 邻接、Gate 9+Upload 邻接、autonomous-loop-workflow 引用、Gate 9 的 `if ($exitCode -eq 0)...exit 0` 模式均保持

