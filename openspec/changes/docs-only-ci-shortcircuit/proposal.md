## Why

纯文档 PR（`.md`、`01-docs/**`、`openspec/**` 等）按分层规则必须经 PR 落地，但 `pull_request` 触发无路径过滤（PR #2151 死锁后刻意如此），导致每个纯文档 PR 跑满 quality-gate 8 个重型 job + electron-ci + build，合计 10+ 台 Windows runner、墙钟 20–40 分钟，其中 90% 检查对文档无意义；push 侧已有 `paths-ignore` 承认这一分层，PR 侧因 required check 语义无法用触发级过滤落地。质量节拍侧同样按完整口径执行，靠逐项 N/A 消化，`.quality-gates.md` 每条记录 10+ 行。

## What Changes

- 新增 `scripts/classify-docs-only.js`：文档白名单 + docs-only 判定 CLI 的**单一真源**（导出 `CI_IGNORED_PATHS` 常量与 `isDocsOnly(files)` 判定函数；CLI 按 merge-base diff 输出判定与文件清单证据）。本地质量节拍与 CI 共用同一判定，禁止两份清单漂移。
- `quality-gate.yml` 新增轻量 `changes` job（ubuntu，merge-base diff 判定 `docs-only`）；8 个重型 job（static-gates / unit-tests / desktop-shards / coverage / business-api-postgres / visual / e2e / autonomous）加 `needs: [changes]` + `if: docs-only != 'true'` 条件跳过；`gate-result` 保持 `if: always()` 与既有 `skipped` 放行口径，零改动。
- `electron-ci.yml` / `build.yml` 同模式：job 级 docs-only 条件跳过（build 的快速检查对纯文档同样无意义）。
- `doc-gate.yml` 的 `doc-sync` job 从 windows-latest 换 ubuntu-latest（只跑 bash 脚本 + gh CLI，零风险提速并释放 Windows 并发额度）。
- `workflow-contract.test.js` 防再犯锁：①`CI_IGNORED_PATHS` 改从 `classify-docs-only.js` import（真源迁移）；②新增断言锁住「docs-only 短路存在且接线完整」（摘掉 changes job 或任一重型 job 的条件即红）；③保留既有「pull_request 不得用 paths-ignore」红线断言不变。
- 质量节拍侧：AGENTS.md 新增 docs-only 快速通道（判定走同一 CLI；保留门禁清单：行尾对账 / 品牌残留 Gate 12 / 文档同步 / 远程同步；跳过 QM-1/QM-2/QM-4/TDD/QM-6）+ `.quality-gates.md` 精简记录模板（4–5 行）。
- **不变的红线**：`pull_request` 触发级 `paths-ignore` 仍然禁止（required check 缺失 = 纯文档 PR 永久 BLOCKED）；workflow 照常触发使所有 required check context 都出现，被跳过的 job 显示 skipped（GitHub 视为满足）。

## Capabilities

### New Capabilities

（无——本 change 是既有路径门控契约的行为演进，不引入新能力域。）

### Modified Capabilities

- `ci-path-gating`: 「全量 workflow 路径门控」Requirement 的 PR 侧行为从「触发并执行其真实 job」改为「触发产生 required check，重型 job 按 docs-only 判定条件跳过（skipped）」；「忽略清单单一来源」Requirement 的真源从契约测试内嵌数组迁移为 `scripts/classify-docs-only.js` 导出常量，契约测试与 CI changes job 均从其派生。

## Impact

- **CI 行为**：纯文档 PR 的 CI 从 10+ runner × 20–40 分钟降至 changes job + 轻门禁 ≈ 5 分钟内全绿；混合 PR（含任一代码/依赖/CI 路径）行为完全不变；push main 与 workflow_dispatch 不变。
- **代码**：`scripts/classify-docs-only.js`（新）+ `scripts/classify-docs-only.test.js`（新，TDD）；`.github/workflows/quality-gate.yml`、`electron-ci.yml`、`build.yml`、`doc-gate.yml`；`.github/scripts/workflow-contract.test.js`。
- **流程文档**：`AGENTS.md`（docs-only 快速通道 + 精简记录模板）。
- **风险面**：混合 PR 被误判 docs-only 而漏跑全量测试——由「全部文件命中白名单才短路」+ 判定单测 + 变异反证 + 契约锁守住；required check 的 skipped 语义需一次真实纯文档 PR 实证 ruleset 不 BLOCK（唯一需实测点，回退 = 去掉 job 级 if）。
- **不触碰**：apps/、packages/ 运行时代码；QM-1 打包不适用。
