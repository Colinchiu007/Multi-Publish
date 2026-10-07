## Purpose

定义 append-only 台账 `CHANGELOG.md` 的完整性由哪几把锁共同持有、它们的口径如何保持单一、
以及「在不削弱既有不变量的前提下清理历史污染」这条通路必须满足什么条件才可被接受。
目标是让"清理"与"误删"在机器判据上是**可区分**的，且区分依据不是数量阈值而是**是否经过书面授权**。

## ADDED Requirements

### Requirement: 台账条目模型 MUST 只有一份实现

系统 SHALL 由单一模块持有「什么是一条条目」的定义（一级标题、排除节标题 `# CHANGELOG`）与
条目切块、按标题分组、保留份选择、去重这些操作；`check-changelog-growth.js` 与
`check-changelog-duplicate-entries.js` MUST 复用该模块，MUST NOT 各自维护第二份口径。

#### Scenario: 两把锁在同一份 blob 上数出同一条目总数

- **WHEN** 对同一份 `CHANGELOG.md` blob 分别询问两把锁"这里有多少条条目"
- **THEN** 两者报数的条目总数必须相等；不等即为口径分裂，判为缺陷（本仓实测曾为 1,184 与 1,158 并存）

#### Scenario: 无括号形条目不得被任一把锁漏掉

- **WHEN** 台账里存在形如 `# fix(自检门禁): …（#2648）` 的无括号一级标题条目
- **THEN** 两把锁都必须把它算作条目，删除它都必须能被检测到

### Requirement: 减少副本 MUST 经一次性书面授权，默认判据不得放宽

系统 SHALL 在 `check-changelog-growth.js` 的默认路径上保持「base 标题多重集被 head 包含」这一既有不变量
逐字不变（含「同题副本删到一份仍报丢」这一档）；仅当被检查的 head **相对 base 新增**了
`scripts/changelog-dedup-authorization.json` 且其 `applies_to_base` 等于本次 merge-base 时，
才 MAY 额外接受「清理形状」，且该接受 MUST 同时满足下列全部条件。

#### Scenario: 无授权文件时行为与现状逐字相同

- **WHEN** 一个 PR 的 head 里没有 `scripts/changelog-dedup-authorization.json`
- **THEN** 门禁判据与本 change 之前完全一致，删除任意一份副本一律报红

#### Scenario: 授权清理形状被接受

- **WHEN** head 新增授权文件且 `applies_to_base` 等于本次 merge-base，并且台账满足：每个被减少的标题在 head 恰好剩 1 份、该份逐字节等于 base 中同标题的某一块、head 的不同标题集合包含 base 的全部不同标题
- **THEN** 门禁通过，并在输出中打印「例外由授权触发」以及被减少的标题数与份数

#### Scenario: 借授权之名改写内容仍须报红

- **WHEN** 授权成立，但某个被保留的块与 base 中同标题的任何一块都不逐字节相同
- **THEN** 门禁报红 —— 授权只覆盖"删重复副本"，不覆盖"顺便改正文"

#### Scenario: 少一个标题即事故，授权也救不了

- **WHEN** 授权成立，但 base 里某个标题在 head 里一份都不剩
- **THEN** 门禁报红（这是 #2884 整份删空形态的兜底，不得被任何例外绕过）

#### Scenario: 只削一半不算清理

- **WHEN** 授权成立，但某个标题从 base 的 4 份变成 head 的 2 份
- **THEN** 门禁报红 —— 例外只承认"削到恰好 1 份"这一种减少方式

#### Scenario: 授权不可被后续 PR 白蹭

- **WHEN** base 里已经存在同名授权文件（即本次 head 并未新增它）
- **THEN** 例外不生效，判据退回默认路径

#### Scenario: 坐标系错位或授权损坏一律 fail closed

- **WHEN** 授权文件的 `applies_to_base` 与本次 merge-base 不相等，或其 JSON 不可解析 / 缺必填字段
- **THEN** 门禁以非零码失败并点名原因，MUST NOT 退化成"当作没有授权"后静默通过

### Requirement: 清理结果 MUST 可与基准逐块对账且只减不增

系统 SHALL 使每一次台账清理都留下可独立复核的对账证据，且该复核 MUST NOT 复用产生清理的那个脚本自己的结论。

#### Scenario: 只减不增

- **WHEN** 一次清理 PR 完成后
- **THEN** `git diff` 相对 merge-base 的新增行数必须为 0，删除行数必须与实际削掉的副本块相符并当场打印

#### Scenario: 幂等

- **WHEN** 对已经清理过的台账再次运行去重
- **THEN** 报告 `removed=0` 且不产生任何写入

#### Scenario: 保留内容与基准逐字节同源

- **WHEN** 复核清理后的台账
- **THEN** 其中每一个块都必须能在 merge-base 中找到逐字节相同的同源块
