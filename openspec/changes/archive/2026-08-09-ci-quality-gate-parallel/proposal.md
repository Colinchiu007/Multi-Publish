# Proposal: Quality Gate 并行拆分 + 触发去重

## Why

Quality Gate 单 job 串行跑 25 分钟（实测 Gate 4 全 workspace 单测 636s + Gate 5 coverage 588s 占 82%），且 `push`+`pull_request` 双触发导致同 head 每轮跑两遍（CI 分钟翻倍、墙钟受限于最长串行链）。并行拆分 + 触发去重可把关键路径压到 ~12 分钟、每 head CI 分钟约减半。

## What Changes

- quality-gate.yml 拆分为 6 个并行 job（static/unit-tests/coverage/visual/e2e/autonomous）+ gate-result 汇总 job；全部 windows-latest。
- 触发去重：`on` 仅保留 `pull_request` + 新增 `workflow_dispatch`（移除 push 双跑）。
- 契约测试同步：workflow-contract.test.js（Gate 7/8 邻接锚点改为同 job Upload 步骤）、gui-ci-exit-contract.test.js（jobs.gate.steps → 跨 job 汇总）。
- 保留全部 gate 语义与脚本（含 Gate 4 watchdog、Gate 7/8/9 的 pwsh 退出码契约、autonomous-loop-workflow 引用）。

## Capabilities

- **New Capabilities**: `ci-quality-gate-parallel`（Quality Gate 并行化与触发去重契约）

## Impact

- 代码：`.github/workflows/quality-gate.yml`、`.github/scripts/workflow-contract.test.js`、`apps/desktop/tests/gui-ci-exit-contract.test.js`
- 文档：CHANGELOG、learnings
- 无产品代码变更；无 secrets 变更；CI 分钟净降约 40%（30min/head vs 原 50min/head）
