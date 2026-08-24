## MODIFIED Requirements

### Requirement: 全量 workflow 路径门控

build / electron-ci / quality-gate 三个全量 workflow 的 `push` 触发 SHALL 使用一致的 `paths-ignore` 黑名单；该黑名单 SHALL 仅包含文档/流程/配置类路径（docs、*.md、LICENSE、.gitignore、.editorconfig、流程目录、lockfile 等）；代码/依赖/CI 路径（apps/**、packages/**、.github/**、package.json）SHALL NOT 被排除。三个 workflow 的目标为 `main` 的 `pull_request` 触发 SHALL NOT 使用 `paths-ignore`，使任何 PR 都产生分支保护所要求的真实检查。

#### Scenario: 文档改动 PR 触发全量检查

- **WHEN** 一个目标为 `main` 的 PR 仅修改文档/流程类路径
- **THEN** build、electron-ci 与 quality-gate 三个 workflow 都触发并执行其真实 job

#### Scenario: 文档改动不触发全量

- **WHEN** 一个仅修改文档/流程类路径的提交被合并并 push 到 `main`
- **THEN** 三个全量 workflow 因统一 `push.paths-ignore` 跳过

#### Scenario: 代码改动仍触发

- **WHEN** 一个 PR 或 main push 修改任意代码/依赖/CI 路径
- **THEN** 三个全量 workflow 正常触发

### Requirement: 忽略清单单一来源

路径门控的忽略清单 SHALL 以契约测试（CI_IGNORED_PATHS）为单一来源，三个 workflow 的 `push main` 共 3 处 SHALL 与清单一致；三个 workflow 的 `pull_request` 触发 SHALL 不声明 `paths-ignore`。任何漂移 SHALL 导致契约测试失败。

#### Scenario: 契约守护

- **WHEN** 修改任一 workflow 的 `push.paths-ignore`、`pull_request` 触发或契约测试中的清单
- **THEN** 本地 `node --test` 契约套件断言 push 清单一致且 PR 无路径过滤，不一致即失败

### Requirement: doc-gate 流程/配置类自动 bypass

doc-gate 的目标为 `main` 的 `pull_request` 触发 SHALL NOT 使用 `paths-ignore`；`文档同步检查` 与 `单元测试 + Lint` SHALL 对 docs-only、CI-only 和代码 PR 都运行真实门禁。是否要求业务文档同步 SHALL 仍由既有文档同步脚本按实际变更判断，不得通过跳过 workflow 规避。

#### Scenario: 纯文档 PR 产生 Doc Gate 检查

- **WHEN** 一个目标为 `main` 的 PR 仅修改 Markdown、`01-docs/**` 或流程目录
- **THEN** `文档同步检查` 与 `单元测试 + Lint` check run 都出现并报告真实结果

#### Scenario: 纯 CI 配置 PR 跳过 doc-sync

- **WHEN** 一个目标为 `main` 的 PR 仅修改 `.github/**`
- **THEN** `文档同步检查` 与 `单元测试 + Lint` check run 都出现并报告真实结果
