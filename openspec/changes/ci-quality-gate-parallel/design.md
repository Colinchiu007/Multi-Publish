# Design: Quality Gate 并行拆分 + 触发去重

## Context

实测 QG step 耗时（PR #429 通过 run）：Gate 4 全 workspace 单测 636s + Gate 5 coverage 588s = 1224s，占总时长 1498s 的 82%；其余（静态 31s、视觉 43s、E2E 112s）仅 ~4min。串行单 job 25min；同 head 被 push+PR 双触发跑两遍。

## Goals / Non-Goals

**Goals**: 关键路径 25min→~12min（约减半）；触发去重（每 head 只跑一遍）；保留全部 gate 语义与契约测试覆盖。
**Non-Goals**: 不合并/裁剪任何 gate；不改 vitest 单 worker 串行契约；不减少全量测试覆盖（Gate 4+5 分别跑，覆盖等价）。

## Decisions

### D1: 并行 job 拆分（quality-gate.yml）
- static-gates（Gate 1/2/3/6 + npm ci）≈1min
- unit-tests（Gate 4 + 4b）≈11min ← 关键路径
- coverage（Gate 5，独立 job 避免与 Gate 4 争资源）≈10min
- visual（Gate 7 + upload）≈3min
- e2e（playwright + Gate 8 + upload）≈3min
- autonomous（Gate 9 + upload）≈1min
- gate-result（needs 全部，打印汇总）
- 全部 windows-latest（与现状一致）；npm ci 每 job 独立（job 隔离 VM）。

### D2: 触发去重
- `on` 去掉 `push: branches-ignore: [main]`，保留 `pull_request: branches: [main]` + 新增 `workflow_dispatch`。
- 效果：每 head 一次 QG 运行（原 push+PR 双跑），CI 分钟减半。

### D3: 契约测试同步
- workflow-contract.test.js：Gate 7/8 邻接锚点从 `# --- Gate N` 注释改为同 job 的 `Upload GUI quality artifacts` 步骤（并行化后注释分隔符不存在）。
- gui-ci-exit-contract.test.js：`workflow.jobs.gate.steps` → 跨 job `Object.values(workflow.jobs).flatMap(...)` 汇总（Gate 7/8/9 分布到三个 job）。
- 保留：Gate 4+4b 邻接（同 unit-tests job）、Gate 9+Upload 邻接（同 autonomous job）、Gate 3 的 `autonomous-loop-workflow.test.js` 字符串、Gate 9 的 `if ($exitCode -eq 0)...exit 0` 模式。

## Risks / Trade-offs

- 分钟消耗：并行 job 总分钟 ≈ 6×npm ci(~1min) + 10.6+9.8+3+3+1 ≈ 30min（原 25min），墙钟减半；触发去重后每 head 分钟 ≈ 30（原 50）→ 净降 40%。
- 失败隔离增强：单 gate 失败不再阻断其余 gate（可并诊断）。
- E2E/visual 各自独立起 vite(5174)，job 隔离无端口冲突；各自安装 playwright。
