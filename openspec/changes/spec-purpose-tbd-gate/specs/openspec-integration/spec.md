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
- **AND** 定位 step MUST 用其**语义标题**而非门禁编号，命令 MUST 落在该 step 正文内，
  注释行 MUST NOT 参与"已接线"判定（在注释里提一句脚本路径既不构成接线，也不得把位置判据骗过去）

#### Scenario: 每个 Purpose 段都被判，而不只是第一个

- **WHEN** 一份主规格里出现两个 `## Purpose` 段，第一段已写好、第二段仍是归档占位词
- **THEN** 检查 MUST 判失败，并点名"第 2 个 Purpose 段"
- **AND** 两段都合规时 MUST NOT 判失败 —— 重复标题本身不属本门禁的职责，不得把它变成噪声源

#### Scenario: 标题形态与文件编码的取值边界

- **WHEN** Purpose 标题写作 `### Purpose`，或文件带 UTF-8 前导 BOM
- **THEN** 检查 MUST 判其合规（层级 `##`/`###` 都收；BOM 先剥）
- **AND** 当标题写作 `##Purpose`（`#` 序列后无空白）时 MUST 判 `MISSING_SECTION` ——
  CommonMark 下那不是标题，"没有 Purpose 段"是事实而非误报
- **AND** BOM 档位 MUST 用"BOM 直接压在 Purpose 标题行上"的样本验证（否则该锁对判据路径失明，
  反证 M9 首跑 `NOT_RED` 即由此而来）

#### Scenario: 参数化行为必须从进程入口被验证

- **WHEN** 以 `--limit=abc` / `--min-specs=2.5` / `--min-specs=-1` 调用判据
- **THEN** MUST 以 rc=2 出声并点名坏参数，MUST NOT 静默回落默认值 ——
  旧写法 `Number('abc')=NaN` 会让 `slice(0, NaN)` 把违规明细整页吞掉而 rc 仍为 1
- **AND** `--root` / `--min-specs` / `--limit` MUST 同时接受等号式与空格式，且两式产出同一结果
- **AND** MUST 存在 `--help`（rc=0），其正文写明退出码口径：0 合规 / 1 违规或判据自身故障
  （文案带 `FAIL(closed)`）/ 2 用法错误
- **AND** 至少一条 CLI 用例 MUST 经**子进程入口**打进去：只调用导出函数不构成对参数层的覆盖
