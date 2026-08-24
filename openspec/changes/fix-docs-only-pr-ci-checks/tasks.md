## 1. 触发合同与回归保护

- [x] 1.1 移除 quality-gate、electron-ci、build 的 `pull_request.paths-ignore`，保留三个 `push main` 的统一忽略清单与 build tag 触发；测试目标：`.github/scripts/workflow-contract.test.js`。
- [x] 1.2 移除 doc-gate 的 PR 路径过滤，确保 `文档同步检查` 和 `单元测试 + Lint` 对任意 main PR 形成真实 check run；测试目标：workflow YAML 解析契约。
- [x] 1.3 更新 `workflow-contract.test.js`：断言三个 main-push 清单一致、三个 PR 触发不带 paths-ignore、doc-gate PR 触发不带 paths-ignore；运行 `node --test .github/scripts/workflow-contract.test.js`。

## 2. 规格与运行验证

- [x] 2.1 更新 `ci-path-gating` delta spec、合并检查说明、质量门禁与 learnings，记录“PR 全覆盖 / main push 去重”及 CI 成本；运行 `openspec validate fix-docs-only-pr-ci-checks --strict`。live spec 将在远程 CI 通过且 change 归档时合入。
- [x] 2.2 运行受影响本地门禁：workflow contract、`scripts/check-docs-sync.sh --base=main --head=HEAD`、`git diff --check`。
- [x] 2.3 为 `FunctionalRunner` 新增 node:test 导航恢复合同：精确 `ERR_NO_BUFFER_SPACE` 重试一次、非匹配错误不重试、耗尽后原样抛出、成功后才 `waitForAppReady`；运行 `node --test apps/desktop/tests/e2e/helpers/functional-runner.test.js` 与 `e2e-remaining-waits.test.js`。
- [x] 2.4 在 `QG Browser E2E` 中于真实扫描前执行该合同，并扩展 `workflow-contract.test.js` 锁定调度顺序。
- [ ] 2.5 推送并用 PR #1146 验证：13 个 branch-protection required context 都产生真实 check run 且通过，`mergeStateStatus` 不再因缺失 check 或 Browser E2E 瞬态导航失败为 `BLOCKED`。

## 3. 审查与交付

- [ ] 3.1 双模型审查 workflow、E2E helper、合同测试与 OpenSpec diff；Critical 必修，Warning 记录处置。若通道不可用，按降级规则记录并完成本地逐项审查。
- [ ] 3.2 合并后核对 `origin/main`、归档 OpenSpec 与 CCG task、运行 `scripts/openspec-sync-check.js`。
