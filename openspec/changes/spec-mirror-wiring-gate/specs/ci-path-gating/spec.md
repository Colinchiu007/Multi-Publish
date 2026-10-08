# Spec Delta: ci-path-gating（spec-mirror-wiring-gate）

## ADDED Requirements

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

#### Scenario: 不得用启发式自动判据代替登记

- **WHEN** 有人提出"从测试源码提取路径字面量、与白名单求交即可自动判红"
- **THEN** 该提案 MUST 被拒绝并给出实测精度证据（本仓清点：6 条可疑逐条核对后仅剩 1 条为真）
- **AND** 口径固定为：登记由人做，登记的正确性由上述判据锁

#### Scenario: 被接进 changes job 的锁只能依赖 node 内置模块

- **WHEN** 一条锁被接进不安装 npm 依赖的 job
- **THEN** 该锁的 `require` 面 MUST 全部落在 node 内置模块清单内，否则 MUST 变红
- **AND** 依赖面为空的测试文件 MUST NOT 因此静默通过（命中数须有下界）
