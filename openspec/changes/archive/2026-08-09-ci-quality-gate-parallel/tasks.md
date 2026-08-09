# Tasks: ci-quality-gate-parallel

## 1. workflow 并行拆分

- [x] quality-gate.yml 拆分为 static/unit-tests/coverage/visual/e2e/autonomous/gate-result 7 个 job（windows-latest）
- [x] 触发去重：on 仅 pull_request + workflow_dispatch（移除 push 双跑）
- [x] 保留 Gate 4 watchdog、Gate 4+4b 邻接、Gate 9+Upload 邻接、autonomous-loop-workflow 引用、退出码契约
- **测试目标**：本 PR 自身 CI 的 QG 并行 job 通过（关键路径 <20min）

## 2. 契约测试同步

- [x] workflow-contract.test.js：Gate 7/8 邻接锚点改为同 job Upload 步骤
- [x] gui-ci-exit-contract.test.js：jobs.gate.steps → 跨 job 汇总
- **测试目标**：node --test 契约 25/25 + vitest gui-ci 31/31 本地通过

## 3. 门禁与交付

- [ ] 本 PR CI（并行 QG + electron-tests + gui + visual 等）通过
- [ ] claude 审查（antigravity 降级记录）
- [ ] 合并；归档三同步；记忆更新
