# Spec Delta: openspec-integration（spec-purpose-tbd-gate）

## ADDED Requirements

### Requirement: 主规格的 Purpose 完整性必须有门禁

系统 SHALL 对 `openspec/specs/**/spec.md` 的 `## Purpose` 段做**全量**自动检查：
缺失、正文为空、或仍是归档占位词（`TBD` / `TODO` / `待补充` 等开头形态）一律判失败，
并在输出里逐条点名文件与原因码。该检查 MUST 接在**不被 docs-only 短路**的执行面上。

理由：`openspec archive` 留下的 `TBD - created by archiving change …` 此前没有任何东西在看
（2026-10-07 实测：151 份主规格里 43 份如此，`git grep -l Purpose -- scripts .github` = 0 命中），
于是"先文档再代码"的前置门对这些规格静默失效。

#### Scenario: 占位词被拦下

- **WHEN** 任一主规格的 Purpose 正文以 `TBD` 开头（或整段缺失、或只有空白）
- **THEN** `scripts/check-spec-purpose.js` MUST 返回非零，并列出该文件路径与原因码
  （`TBD` / `MISSING_SECTION` / `EMPTY`）

#### Scenario: 判据必须能分辨"写好但形状特别"与"真的没写"

- **WHEN** 一份规格的 `## Purpose` 与正文之间按惯例存在空行，或正文含代码围栏
- **THEN** 检查 MUST 判其合规，MUST NOT 因取正文的实现把空行当段落结束而误判 `EMPTY`
- **AND** 存在一条锁，用**真实仓库里已写好 Purpose 的规格**验证这一点
  （第一版实现正是这样误判了 15 份，被这条锁的形态挡住）

#### Scenario: 扫描域退化不得读成通过

- **WHEN** `openspec/specs` 目录不存在、或遍历后命中 0 份 `spec.md`、或命中数低于规模下界
- **THEN** 检查 MUST 抛错并返回非零，MUST NOT 输出"全部合规"
- **AND** 两条空集出口（目录不存在 / 目录存在但零命中）MUST 各有独立回归锁
  （反证实测：只锁其中一条时，把另一条改成"判通过"的变异照样全绿）

#### Scenario: 归档增量目录不入域

- **WHEN** `openspec/changes/<name>/specs/**/spec.md` 里存在 `TBD`
- **THEN** 检查 MUST NOT 判失败 —— 那是尚未归档的提案增量，TBD 属其正常生命周期

#### Scenario: 接线位置由测试钉住而非注释

- **WHEN** 有人把这条门禁从 `changes` job 移到被 `docs-only != 'true'` 门控的 `static-gates`，
  或移到写出 `docs-only` 输出的 `classify` step 之前，或从 step 里摘掉测试点名
- **THEN** `scripts/check-spec-purpose.test.js` 的结构锁 MUST 变红
- **AND** 去掉 `.gitignore` 中对判据本体的 negation 时，同文件的 `check-ignore` 锁 MUST 变红
