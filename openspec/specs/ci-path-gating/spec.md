# ci-path-gating Specification

## Purpose
定义全量 CI workflow 的路径门控契约：文档/流程/配置类路径变更不触发全套 CI（黑名单 paths-ignore，fail-closed——代码/依赖/CI 路径一律保留触发）；忽略清单以契约测试为单一来源防漂移；tag 发布触发不受路径过滤影响。
## Requirements
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

### Requirement: tag 发布不受路径过滤影响

build workflow 的 `tags: [v*]` 发布触发 SHALL NOT 被 paths-ignore 拦截（GitHub 官方行为：tag 推送不评估路径过滤）。

#### Scenario: tag 触发发布

- **WHEN** 推送 v* tag
- **THEN** 发布 job 正常触发，与 paths-ignore 无关

### Requirement: doc-gate 流程/配置类自动 bypass

doc-gate 的目标为 `main` 的 `pull_request` 触发 SHALL NOT 使用 `paths-ignore`；`文档同步检查` 与 `单元测试 + Lint` SHALL 对 docs-only、CI-only 和代码 PR 都运行真实门禁。是否要求业务文档同步 SHALL 仍由既有文档同步脚本按实际变更判断，不得通过跳过 workflow 规避。

#### Scenario: 纯文档 PR 产生 Doc Gate 检查

- **WHEN** 一个目标为 `main` 的 PR 仅修改 Markdown、`01-docs/**` 或流程目录
- **THEN** `文档同步检查` 与 `单元测试 + Lint` check run 都出现并报告真实结果

#### Scenario: 纯 CI 配置 PR 产生 Doc Gate 检查

- **WHEN** 一个目标为 `main` 的 PR 仅修改 `.github/**`
- **THEN** `文档同步检查` 与 `单元测试 + Lint` check run 都出现并报告真实结果

### Requirement: 接线的「资格」必须有机械登记表

系统 SHALL 以可执行判据核对「一条门禁被点名在**哪个 job**」，而不只核对「它是否被某个 workflow 提及」：
凡输入命中 docs-only 白名单（`CI_IGNORED_PATHS`）的测试锁，MUST 被登记于判据本体的登记表，
并由 `scripts/check-unwired-tests.js` 校验它**至少被一个无 job 级 `if:` 的 job 点名**；
只住在被 `docs-only != 'true'` 一类条件整片门控的 job 里 MUST 判失败，
登记表项指向不存在的文件时 MUST 另判「过时」，两类红都不得靠放宽判据消除。

理由：既有判据只对整份 workflow 的可执行正文做子串匹配，于是"接在会被跳过的 job"与"接在不会跳过的 job"
在它眼里是同一件事。实测后果（2026-10-08，归档 PR #3114）：vendored 契约镜像锁被该 PR 判红，
而 PR 侧 `QG Changes=pass` / `QG Static=skipping` —— 这条锁在纯文档 PR 上一次都没跑，漂移合法合入 main，
由 main push 才红（run 37716816985，step `Gate 2b`），并卡住当时所有 open PR 的 `QG Static`。

#### Scenario: 只住在可跳过的 job 必须变红

- **WHEN** 登记表里的测试锁只被点名在有 job 级 `if:` 的 job 中
- **THEN** `scripts/check-unwired-tests.js` MUST 返回非零，并在 `where` 里点名是哪几个 job
- **AND** 同一条锁另有点名落在无 job 级 `if:` 的 job 时 MUST 判合规（正控与负控 MUST 成对存在）

#### Scenario: 点名只认 step 的 run 正文，且同名文件不得互相冒领

- **WHEN** 某 job 的 `env:` 值、`with:` 参数或其它 YAML 映射值里出现该测试路径
- **THEN** MUST NOT 判其被点名 —— 那只是一个字符串，不会执行任何东西
- **AND** 同一路径出现在 `node --test scripts/x.test.js` / `bash scripts/x.test.sh` 这类 run 正文里 MUST 判其被点名
- **AND** 当该文件名的 basename 在全仓不唯一时，MUST 只认整相对路径（与既有「未接线棘触」的同名串号守卫同口径），
  否则 `scripts/a/x.test.js` 的点名会冒领 `scripts/b/x.test.js` 的接线

#### Scenario: job 级门控按缩进层级判，不按相对位置判

- **WHEN** 某 job 的 `if:` 写在 `steps:` **之后**（YAML 映射键序自由）
- **THEN** 该 job MUST 被判为「整片被门控」，MUST NOT 因位置靠后而被读成合法接线
- **AND** 出现在 step 内（`- if:` 或更深缩进）的 `if:` MUST NOT 被判为 job 级门控
  （误判方向是假红，其结局是逼人清空登记表，与没有门禁等效）

#### Scenario: 解析退化不得读成「无需核对」

- **WHEN** workflows 目录缺失、其中无 yml、或按 job 解析后命中 0 个 job
- **THEN** 判据 MUST 抛错并返回非零，MUST NOT 输出"全部合规"
- **AND** 存在一条锁用真实仓库验证解析规模（job 数与"不被门控的 job 数"各有下界）

#### Scenario: 登记表只能缩小且必须带销账条件

- **WHEN** 登记项指向的测试文件已不存在
- **THEN** MUST 判「过时」并变红（防止用"删掉文件"或"清空清单"逃避判据）
- **AND** 真实仓库上登记清单的内容 MUST 以精确相等钉住，新增登记须同 PR 把点名补进不被短路的 job

#### Scenario: 被接进 changes job 的锁只能依赖 node 内置模块

- **WHEN** 一条锁被接进不安装 npm 依赖的 job
- **THEN** 该锁的 `require` 面 MUST 全部落在 node 内置模块清单内，否则 MUST 变红
- **AND** 依赖面为空的测试文件 MUST NOT 因此静默通过（命中数须有下界）

