# 案例：Multi-Publish CI 提速三阶段（2026-08-09，实测数据）

> 本文件是 **L3 参考案例**：具体路径/阈值/workflow 属项目特有，跨项目复用请用方法论（M6/M7/M8）与模板（nx.json.tpl / paths-ignore.yml.tpl / shard-matrix.yml.tpl）。

## 背景与目标
- 每日多 PR，全量 CI（6000+ 测试）等待；改 3 行配置也跑全套。
- 目标：无关改动不触发 + 只跑相关测试 + 快跑。

## 三阶段交付（全部合并：PR #430 / #439 / #445 + 并发 #433 / #435）

| 阶段 | 手段 | 实测 |
|---|---|---|
| 并发 #433 | electron-ci 自托管 ECS → GitHub ubuntu-latest | 消除 30-40min 排队 |
| 并发 #435 | quality-gate 并行拆分（6 job）+ 触发去重（去 push） | 25min → ~12min 关键路径 |
| Phase 1 #430 | build/electron-ci/quality-gate paths-ignore 黑名单 + doc-gate 流程目录 + CI_IGNORED_PATHS 契约 | 文档/流程改动 → 0 CI |
| Phase 2 #439 | Nx 20 affected + 任务缓存 + `--parallel=1`；push main 全量回归 | 单包 PR 只跑相关包；同 head 缓存命中 |
| 脚本 | scripts/affected-report.js（base..head 受影响项目诊断） | workspaces 通用，零依赖 |
| Phase 3 #445 | 桌面套件跨 runner 分片（matrix `--shard=1/2|2/2`） | 单测阶段 11.0 → ~6.4min（-42%） |

## 关键数据
- 依赖图：desktop → [ai-writer, api-publish-engine, rpa-engine, shared-utils, story2video-engine]；改 shared-utils → affected = shared-utils + desktop。
- affected 实测（真实 PR）：desktop-only PR → Gate 4 只跑 desktop（9.3min）；根配置变更 → 9/9。
- 分片后：QG Desktop Shards 1/2=6.0min、2/2=6.4min（并行）；QG Unit Tests（非桌面，`--exclude`）1.4min。
- **诚实结论**：quality-gate 总墙钟 ~11.7min，被 **coverage 门禁（每 PR 全量桌面覆盖率）** 主导——选择接受（QM 门禁成本），可选后续 `--coverage.merge-reports` 分片。

## 决策记录（踩坑）
1. `--parallel=1`：nx 默认跨项目并行 → shared-utils scheduler 时序测试 5000ms 超时；显式串行修复。
2. 分片跨**独立 runner**（机器隔离）而非进程内并行：契约与隔离双保；C1 以双 shard 各自独立通过实证排除。
3. coverage 保持全量：QM 分支覆盖率≥40% 门禁口径不变（选择 A）。
4. W5 取舍：桌面恒全量（核心产品保证）；非桌面 PR 多跑桌面的成本已记录。
5. doc-gate 配置路径缺口：package.json/nx.json 变更触发 doc-sync 硬门禁 → 补入忽略集（配置类自动 bypass）。

## 可复用资产去向
- 方法论：质量节拍 skills/other/ci-hardening references/methodology.md M6/M7/M8。
- 脚本：ci-hardening scripts/affected-report.js（零依赖，动态发现 workspaces）。
- 模板：nx.json.tpl / paths-ignore.yml.tpl / shard-matrix.yml.tpl。
