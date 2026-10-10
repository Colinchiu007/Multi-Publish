# Spec Delta：CHANGELOG growth 门禁的授权退役条款

## ADDED Requirements
> **⚠️ 本文件描述的另一套判据（3b）从未实施，全文仅作写案时的历史快照。**（2026-10-09 对账，与 `proposal.md` / `tasks.md` 顶部同源）
> 实际落地的是 PR #3151（merge `a3565726`）在 `evaluateAuthorization` 内部加的**祖先坐标系判据**
> （`scripts/check-changelog-growth.js` 约 187-217 行）：`applies_to_base` 是本次 base 的祖先 ⇒ 视为已消费；
> 形状四条与额度数字仍由 `collect`（约 340-372 行）核对。触发条件与本文正相反：**它要求 head 必须携带授权文件**，
> 而本文 3b 要求"两侧都无授权文件"。回归锁见 `scripts/check-changelog-growth-retire.test.js`。
> 把本文当现状引用会得出反向结论（本仓实测：`openspec/records/retire-dedup-auth-file.md` 与 PR #3225 都因此被 QM-6 纠过一次）。



### Requirement：已消费授权的退役放行（retire-consumed-authorization）

**场景**：CHANGELOG 的一次性去重清理（授权 `dedup-changelog-history`）已合入
main 并消费完毕。此后分叉较早的 PR（merge-base 落在清理**前**）会因 base 与
head 隔着那次清理而触发默认判据的"条目缺失"红，且原授权通路因「授权文件不是
本次新增」永久 fatal。

**判据（全部满足才放行，缺一即回到默认判据的原始红）**：

1. base 与 head **均不存在** `scripts/changelog-dedup-authorization.json`
   （授权已退役，不得复活）；
2. base 的**不同标题集合 ⊆ head 的不同标题集合**
   （清理只删副本，从未删标题）；
3. base 中**存在**同一标题多份的组（base 处于清理前形状；
   常规 PR 的 base 已是单份，走不到本条款）；
4. head 中**每个**标题恰好 1 份（head 处于清理后形状；
   若 head 重新引入多副本，交回默认判据报红）。

**通过时的输出**必须包含 `retired: true` 与本次放行所依赖的形状计数
（base 标题种数 / head 标题种数 / base 冗余副本数），供 reviewer 复核。

#### Scenario: 较早分叉的 PR 不再被死锁

- **WHEN** PR 的 merge-base 是 `23822b73fecc`（清理前，4.6MB / 11919 标题 / 1434 种），
  head 是 `88669579b1dc` 及之后（清理后，18155 行 / 1441 种），且两侧均无授权文件
- **THEN** 门禁放行并输出 `retired: true`，不要求重新授权、不要求补回副本

#### Scenario: 常规 PR 不受影响

- **WHEN** PR 的 merge-base 已是清理后形状（base 每标题 1 份）
- **THEN** 判据 3 不满足，退役条款不触发，行为与加例外之前逐字相同

#### Scenario: 借退役删标题被挡

- **WHEN** head 缺失 base 中的某个标题（整份删空）
- **THEN** 判据 2 不满足，不放行，报默认判据的原始红

#### Scenario: 借退役重新引入多副本被挡

- **WHEN** head 中某标题出现 ≥2 份
- **THEN** 判据 4 不满足，不放行

#### Scenario: 授权文件复活被挡

- **WHEN** base 或 head 任一侧重新出现授权文件
- **THEN** 判据 1 不满足，退役条款不触发（走 3a 原通路或默认红）

## MODIFIED Requirements

### Requirement：一次性授权通路只服务"head 相对 base 新增授权文件"（原有行为保留）

原 `evaluateAuthorization` 的全部 fatal 分支**逐字保留**（防白蹭、JSON 校验、
40 位 sha、坐标系核对、形状四条、额度两条）。本 delta 不改动其中任何一行。

**唯一改动**：默认判据红后、进入授权通路**之前**，先评估退役条款
（上节 ADDED）；退役放行时**跳过**授权通路与默认判据的报红。

## REMOVED Requirements

### Requirement：`scripts/changelog-dedup-authorization.json` 作为常驻文件存在

**原因**：该文件是 `dedup-changelog-history` 的一次性授权，其额度已在
`88669579` 消费完毕。保留它使授权通路对后续 PR 永久 fatal（"不是本次新增"），
且无法通过重新授权解除——门禁明文禁止"被后续 PR 白蹭"。

**替代**：删除该文件；其历史由 `openspec/changes/dedup-changelog-history/`
与 PR #3059 的执行记录承载。若将来需要第二次清理，应新开 change、新写授权
（在 head 相对 base 新增，满足原通路全部判据），而非复活旧文件。