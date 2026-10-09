# Design：退役已消费的一次性 CHANGELOG 去重授权

## 现状（改动前）

`scripts/check-changelog-growth.js` 的判定流：

```
1. 默认判据：标题多重集包含 + 条目增量棘轮（加例外之前就有的行为）
2. 默认判据过了 → 直接返回 OK（授权通路根本不看）
3. 默认判据红了 → 且 head 相对 base 新增了授权文件 → 授权通路
     ├─ 授权文件在 base 已存在 ⇒ fatal「不是本次新增」（防白蹭）
     ├─ applies_to_base ≠ 本次 merge-base ⇒ fatal「坐标系错位」
     └─ 形状四条 + 额度两条（titles_reduced / entries_after）全对 ⇒ granted
4. 授权不成立 → 报默认判据的原始红
```

**死锁的成因（2026-10-07 深夜修正版）**：授权文件 `88669579` 合入 main 后，
对后续 PR 的判定流取决于**CI 实际读的 head 是什么**。GitHub Actions checkout
PR 时 HEAD 是 **merge ref**（`refs/pull/<n>/merge` = PR head ⊕ 当时 main tip），
不是 PR 分支 tip。于是对「分叉早于清理、且 PR 本身不改 CHANGELOG」的 PR：

```
base        = 分叉点（清理前，无授权文件，CHANGELOG 4.6MB / 269 个多副本标题）
HEAD(merge) = main tip ⊕ PR（含 main 合入的授权文件 + 清理后的 CHANGELOG）
→ authHeadText 非 null、authBaseText 为 null ⇒ 判「head 相对 base 新增授权文件」
→ evaluateAuthorization：applies_to_base(23822b73) ≠ 本次 merge-base(f210f191)
→ fatal「坐标系不等」（实测 PR #3076，日志 L1267-1268）
```

即：**清理提交一旦合入 main，所有"分叉早于清理"的 PR 都卡死**——授权通路
fatal、默认判据又被 base(清理前)→head(merge 后清理后) 的形状差卡住。两者都
未发生解除动作：授权文件没人删（删了才怪，它刚合入），判据没人放宽。

## 改动设计

### 判定流（改动后）

```
1. 默认判据（一字不改）
2. 默认判据过了 → 返回 OK（不变）
3. 默认判据红了 → 分三支：
   3a. HEAD(merge ref) 有授权文件（原通路，原样保留）→ 按 evaluateAuthorization 走
   3b. base 与 HEAD(merge) 均无授权文件 && base 处于"清理前形状"（多副本） &&
       HEAD 处于"清理后形状"（每标题恰 1 份）&& HEAD 标题集 ⊇ base 标题集
       ⇒ **退役放行**：这些"缺失"是已消费授权的那次清理造成的既成事实
   3c. 其余 ⇒ 报默认判据的原始红（行为与加例外之前逐字相同）
```

**为什么 3b 的判定对象是 HEAD(merge ref) 而非 PR 分支 tip**：CI 实际跑门禁时
`--head=HEAD`，HEAD 是 merge ref（`refs/pull/<n>/merge` = PR head ⊕ main tip）；
它承载 main 的现状——授权文件是否还在、CHANGELOG 是否已清理。退役条款要
回答的问题正是「main 现在的台账形状是否等于那次清理的产物」。

**3b 的形状判据**（全部满足才放行）：

| # | 判据 | 防的是什么 |
|---|---|---|
| ① | base 与 HEAD(merge) 均**无**授权文件 | 授权文件还在 main 上时走 3a 原通路（fatal 是真实信号：文件未删 = 退役未执行）。**删除授权文件正是本 change 第一个动作**，删除后 ① 成立 |
| ② | base 的 UNIQUE 标题数 ≤ HEAD 的 UNIQUE 标题数 | 防止借退役之名删标题 |
| ③ | base 中存在"同一标题多份"的组（即 base 未清理） | 只对清理前坐标生效，不影响常规 PR |
| ④ | HEAD 中**每个**标题恰剩 1 份 | 清理后形状的 definition；若 merge ref 又出现多副本，说明有人重新引入冗余，交回默认判据去红 |

**关键取舍**：3b 不看 `git log`、不看授权文件的历史内容，只看**当前 base blob
与 HEAD blob
的形状**。原因：门禁必须可离线复现（reviewer 拉下两个 sha 就能重放），且
"清理已完成"这个事实已经完全编码在两个文件的形状差异里——base 多副本、
head 单份，这**只能**是那次清理的产物（默认判据会挡住任何后来者制造同样
的形状差异，见④）。

### 判据的防滥用推演

| 攻击场景 | 被哪条挡住 |
|---|---|
| 删掉某标题的全部副本再提 PR | ②（head 必须包含 base 全部标题） |
| 删掉标题的 1 份保留 1 份（伪造"清理"） | ③/④ 组合：仅当 base **本来就有多副本**时 3b 才可能触发；常规 PR（base 已是单份）走不到 3b |
| 在 head 新增标题并复制多份 | 默认判据的 head 独有标题份数检查（原样保留） |
| 授权文件重新提交又删除 | ①：只要 base 无授权文件且 head 也无，就走 3b —— 但这等价于"从未授权"，形状判定依然必须满足③④，伪造者得不到额外豁免 |
| 把 3b 当成"任何 CHANGELOG 缩减都能过" | ③：base 必须是多副本形状；单副本 base 的缩减照常红 |

### 与既有测试的关系

`check-changelog-growth.test.js` 的 11 条既有断言**一字不改**。其中
「真仓库四档：…副本删一份=红」钉的是默认判据，不受影响（3b 要求 base
多副本，该用例的 base 是单副本）。

新增用例（全部用**真实 sha 的 blob 回放**，不造假数据）：

1. `retire: base 清理前形状 + head 清理后形状 + 均无授权文件 ⇒ 放行`
   （base 用 `23822b73fecc`、head 用 `88669579b1dc` 的真实 blob）
2. `retire: base 单副本形状 ⇒ 不触发（走默认判据）`
3. `retire: head 出现多副本 ⇒ 不放行（交回默认判据红）`
4. `retire: base 含授权文件 ⇒ 不触发（走 3a 原通路或默认红）`
5. `retire: head 标题集缺了 base 的某个标题 ⇒ 不放行`（防删标题）

### 授权文件与 openspec 收尾

- 删除 `scripts/changelog-dedup-authorization.json`（main 上已存在，本 change
  的 head 相对 base 删除它——这不是"白蹭"，是**退役**：额度已消费，文件使命结束）。
- `openspec/changes/dedup-changelog-history/tasks.md` 追加收尾一节，写明
  授权已消费、由本 change 退役。
- 归档顺序：本 change 归档时，`dedup-changelog-history` 一并标注完成。

## 测试策略

- 全部用真实 blob 回放（`git cat-file blob <sha>:CHANGELOG.md`），
  不构造假 CHANGELOG——避免测试与真实形状漂移。
- 判定函数抽成可单测的纯函数（输入两个文本，输出 `{retired:boolean, reason}`），
  与 `evaluateAuthorization` 同级导出。
- 变异反证：把 3b 的四个条件逐个去掉，对应新用例必须转红。