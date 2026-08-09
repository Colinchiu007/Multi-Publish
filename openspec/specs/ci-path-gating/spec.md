# ci-path-gating Specification

## Purpose
定义全量 CI workflow 的路径门控契约：文档/流程/配置类路径变更不触发全套 CI（黑名单 paths-ignore，fail-closed——代码/依赖/CI 路径一律保留触发）；忽略清单以契约测试为单一来源防漂移；tag 发布触发不受路径过滤影响。
## Requirements
### Requirement: 全量 workflow 路径门控

build / electron-ci / quality-gate 三个全量 workflow 的 push 与 pull_request 触发 SHALL 使用一致的 `paths-ignore` 黑名单；黑名单 SHALL 仅包含文档/流程/配置类路径（docs、*.md、LICENSE、.gitignore、.editorconfig、流程目录、lockfile 等）；代码/依赖/CI 路径（apps/**、packages/**、.github/**、package.json）SHALL NOT 被排除。

#### Scenario: 文档改动不触发全量

- **WHEN** 一个 PR 仅修改文档/流程类路径（命中 paths-ignore）
- **THEN** 三个全量 workflow 不触发

#### Scenario: 代码改动仍触发

- **WHEN** 一个 PR 修改任意代码/依赖/CI 路径
- **THEN** 三个全量 workflow 正常触发

### Requirement: 忽略清单单一来源

路径门控的忽略清单 SHALL 以契约测试（CI_IGNORED_PATHS）为单一来源，三个 workflow 的 push/pull_request 共 6 处 SHALL 与清单一致；任何漂移 SHALL 导致契约测试失败。

#### Scenario: 契约守护

- **WHEN** 修改任一 workflow 的 paths-ignore 或契约测试中的清单
- **THEN** 本地 `node --test` 契约套件断言一致性，不一致即失败

### Requirement: tag 发布不受路径过滤影响

build workflow 的 `tags: [v*]` 发布触发 SHALL NOT 被 paths-ignore 拦截（GitHub 官方行为：tag 推送不评估路径过滤）。

#### Scenario: tag 触发发布

- **WHEN** 推送 v* tag
- **THEN** 发布 job 正常触发，与 paths-ignore 无关

### Requirement: doc-gate 流程/配置类自动 bypass

doc-gate 的 paths-ignore SHALL 包含流程目录（.ccg/.claude/.hermes/.agents/openspec）与配置类文件（package.json/package-lock.json/nx.json），使纯流程/CI/配置变更 PR 自动跳过 PRD 同步门禁。

#### Scenario: 纯 CI 配置 PR 跳过 doc-sync

- **WHEN** 一个 PR 仅修改 .github/、.ccg/、openspec/、package.json 等流程/配置路径
- **THEN** doc-gate 不触发（自动 bypass），不要求 PRD 同步

