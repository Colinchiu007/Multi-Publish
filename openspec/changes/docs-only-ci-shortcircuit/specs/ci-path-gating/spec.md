## ADDED Requirements

### Requirement: docs-only 判定合同

docs-only 判定 SHALL 由单一脚本（`scripts/classify-docs-only.js`）持有：其导出的白名单常量 SHALL 与三个全量 workflow 的 `push.paths-ignore` 清单逐项一致；判定函数 SHALL 接受文件清单，当且仅当**全部**文件命中文档/流程白名单时返回 true；任一文件在白名单之外（代码、依赖、CI 配置、锁文件）SHALL 返回 false；空文件清单 SHALL 返回 false（fail-closed：宁可全量执行，不可漏跑测试）。CLI 形态 SHALL 基于 merge-base diff 输出判定结果与触发文件清单（可审计证据），供 CI changes job 与本地质量节拍共用，禁止出现第二份判定实现。

#### Scenario: 全部文件命中白名单

- **WHEN** 判定函数收到 `["CHANGELOG.md", "openspec/specs/x/spec.md", "01-docs/PRD.md"]`
- **THEN** 返回 true（docs-only 成立）

#### Scenario: 混入任一代码文件即全量

- **WHEN** 判定函数收到的清单中包含 `apps/desktop/electron/main.js` 或 `.github/workflows/quality-gate.yml` 或 `pnpm-lock.yaml` 任一
- **THEN** 返回 false（混合 PR 必须全量执行重型 job）

#### Scenario: 空清单 fail-closed

- **WHEN** 判定函数收到空文件清单（如 diff 无变更或上游取 diff 失败）
- **THEN** 返回 false，CI 按全量执行

#### Scenario: 白名单与 push 清单漂移即红

- **WHEN** 修改脚本导出的白名单或任一 workflow 的 `push.paths-ignore` 使两处不一致
- **THEN** 契约测试（`workflow-contract.test.js`，从脚本 import 真源）失败

## MODIFIED Requirements

### Requirement: 全量 workflow 路径门控

build / electron-ci / quality-gate 三个全量 workflow 的 `push` 触发 SHALL 使用一致的 `paths-ignore` 黑名单；该黑名单 SHALL 仅包含文档/流程/配置类路径（docs、*.md、LICENSE、.gitignore、.editorconfig、流程目录等）；代码/依赖/CI 路径（apps/**、packages/**、.github/**、package.json）SHALL NOT 被排除。三个 workflow 的目标为 `main` 的 `pull_request` 触发 SHALL NOT 使用 `paths-ignore`（触发级过滤仍是禁区：required check 缺失会让纯文档 PR 永久 BLOCKED）；在此前提下，各 workflow 的重型 job SHALL 通过**job 级条件**（`needs` 轻量 changes job + `if: docs-only != 'true'`）按 docs-only 判定跳过，被跳过的 job 产生 skipped 结论并 SHALL 视为满足 required check；轻量 changes job 与汇总 job（如 quality-gate 的 gate-result）SHALL 在纯文档 PR 上真实执行并报告结果。

#### Scenario: 文档改动 PR 产生检查且重型 job 跳过

- **WHEN** 一个目标为 `main` 的 PR 仅修改文档/流程类路径
- **THEN** build、electron-ci 与 quality-gate 三个 workflow 都触发；changes 判定 job 真实执行；各重型 job 显示 skipped；gate-result 汇总放行（skipped 视为满足）；PR 可正常合并

#### Scenario: 混合 PR 全量执行

- **WHEN** 一个 PR 同时修改文档与任一代码/依赖/CI 路径
- **THEN** docs-only 判定为 false，全部重型 job 真实执行（行为与本变更前完全一致）

#### Scenario: 文档改动不触发全量（push）

- **WHEN** 一个仅修改文档/流程类路径的提交被合并并 push 到 `main`
- **THEN** 三个全量 workflow 因统一 `push.paths-ignore` 跳过

#### Scenario: 代码改动仍触发

- **WHEN** 一个 PR 或 main push 修改任意代码/依赖/CI 路径
- **THEN** 三个全量 workflow 正常触发且重型 job 真实执行

### Requirement: 忽略清单单一来源

路径门控的忽略清单 SHALL 以 `scripts/classify-docs-only.js` 导出的 `CI_IGNORED_PATHS` 为单一来源：三个 workflow 的 `push main` paths-ignore 共 3 处、契约测试（`workflow-contract.test.js`）、CI changes job 的判定 SHALL 全部从该真源派生；三个 workflow 的 `pull_request` 触发 SHALL 不声明 `paths-ignore`。任何漂移 SHALL 导致契约测试失败。

#### Scenario: 契约守护

- **WHEN** 修改任一 workflow 的 `push.paths-ignore`、`pull_request` 触发、脚本导出清单或契约测试的派生方式
- **THEN** 本地 `node --test` 契约套件断言 push 清单一致、PR 无路径过滤、短路接线完整，不一致即失败

#### Scenario: 短路接线防再犯

- **WHEN** 从任一全量 workflow 摘掉 changes job、或从任一重型 job 摘掉 docs-only 条件
- **THEN** 契约套件的短路接线断言失败（防再犯锁）
