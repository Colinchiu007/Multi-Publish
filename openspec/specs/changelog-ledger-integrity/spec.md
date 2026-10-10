# changelog-ledger-integrity Specification

## Purpose
定义 append-only 台账 `CHANGELOG.md` 的完整性由哪几把锁共同持有、它们的口径如何保持单一、
以及「在不削弱既有不变量的前提下清理历史污染」这条通路必须满足什么条件才可被接受。
目标是让"清理"与"误删"在机器判据上是**可区分**的，且区分依据不是数量阈值而是**是否经过书面授权**。
## Requirements
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
`scripts/changelog-dedup-authorization.json`，且其 `applies_to_base` **等于本次 merge-base**（清理形状）**或为其祖先**（那次清理已落 main ⇒ 授权按**已消费**退休，改核消费后形状）时，
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

#### Scenario: 坐标系被越过（祖先）不叫错位，改核「消费后形状」

- **WHEN** 授权仍是 head 相对 base 的新增，其 `applies_to_base` 与本次 merge-base **不相等**，但**是**本次 merge-base 的祖先（`git merge-base --is-ancestor` 成立）
- **THEN** 门禁 MUST NOT 报「坐标系错位」，而 MUST 把该授权判为**已消费**（`retired:true`），改为核对消费后形状：head 条目数 MUST 等于授权声明的 `expected_entries_after`，且 MUST 打印退休理由与两个坐标系 sha；此后新增条目只能经正常追加进入台账，不得借退休复活已被清掉的副本（PR #3151 落地）

### Requirement: 清理结果 MUST 由一个独立对账器核对，且核对的是「块」而非「行」

系统 SHALL 提供 `scripts/changelog-dedup-reconcile.js`，以 base/head 两个 blob 为输入，独立核对五条**与顺序无关**的性质，
并 MUST NOT 复用产生清理的那个脚本（`--dedup`）自己的结论来充当证据。
判据层面必须承认：去重会把幸存块挪到该标题首次出现的槽位，因此**行级** `+/-` 必然包含重排噪声，
把"新增行为 0"写成判据是错的（第一版就是这么写的，并被真实数据当场判红）。

#### Scenario: 每标题恰好一块且标题集闭合

- **WHEN** 对清理结果跑独立对账
- **THEN** 必须满足 `head 块数 == head 标题数`，且 `head 标题数 == base 标题数 + 本次新增标题数`

#### Scenario: 保留块逐字节可溯且必须是 pickKeeper 选定的那份

- **WHEN** 对账器检查 head 里的每一个块
- **THEN** 该块必须与 base 中同标题的某一块**在原始字节上完全相等**（不得是"剥掉 CR 后相等"），且必须就是 `pickKeeper` 会选定的那一份

#### Scenario: 幂等

- **WHEN** 对已经清理过的文本再跑一次去重
- **THEN** 必须报告 `removed=0`

#### Scenario: 行级规模只作信息打印

- **WHEN** 对账器输出结果
- **THEN** 必须打印 `added_lines` / `deleted_lines` / 字节变化，但它们**不参与**通过与否的判定；被判定的是上面三条块级性质

#### Scenario: 取数失败不得读成"没问题"

- **WHEN** base 或 head 的 blob 读不出来，或其中一方**一条条目都没有**
- **THEN** 对账器必须以非零码失败并点名，MUST NOT 把"零条目"当成"零丢失"通过

### Requirement: 一次性授权 MUST 有生命周期，不得作为常驻文件留在仓库

系统 SHALL 由 `scripts/check-changelog-growth.test.js` 内的生命周期锁守住授权件的**存在形态**。判据 MUST 取
**base ∧ head**（两侧清单同时成立才算违规），MUST NOT 写成「任何地方存在就红」——后者会把自己提示语推荐的
修复路径（退役 PR：base 有 / head 无）一起打红，使通路代码还在而流程层已死。两条清单 MUST 取自 git
（`git ls-files` 与 `git ls-tree -r --name-only <base>`），不是工作树，且各带规模下界断言，防解析退化成空集合造成恒真。
base 坐标系可用 `MP_CHANGELOG_BASE_REF` 注入（反证与本地复现用）；取不到 MUST 当场红，MUST NOT 读成「没有 base」放行。

#### Scenario: 已落 main 还被继续携带即红

- **WHEN** base 清单里有 `changelog-dedup-authorization*.json`，head 清单里也有
- **THEN** 锁点名红并给出两种出路（本次 PR 删掉它 / 或确认正在借一份已消费的授权混过门禁）

#### Scenario: 退役 PR 形态必须放行

- **WHEN** base 有、head 无（即本次 PR 正在删除它）
- **THEN** 锁 MUST 通过 —— 这条是锁自己的恢复路径，不是漏洞

#### Scenario: 未来合规的一次性新增必须放行

- **WHEN** base 无、head 有规范路径那一份（未来某次清理在同一 PR 内用 `changelog-dedup-regen.js` 现生成）
- **THEN** 锁 MUST 通过，豁免通路在流程层仍然可用

#### Scenario: 改名或换目录不放行

- **WHEN** head 清单里的授权件路径不等于规范常量 `AUTH_PATH`
- **THEN** 锁红（按 `deepEqual(atHead, [AUTH_PATH])` 判定，换位与改名同一条覆盖）

#### Scenario: 退的是授权件，不是通路

- **WHEN** 有人为了消除上一条的红而删掉 `AUTH_PATH` 常量、`changelog-dedup-regen.js` 的 `regenerate` 或门禁的 `evaluateAuthorization` / `checkDedupShape`
- **THEN** 另一条锁 MUST 红（断言四样仍在且 `regen.AUTH_PATH === AUTH_PATH`）—— 把门禁拆掉不算修门禁

