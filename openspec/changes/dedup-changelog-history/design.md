## Context

两把锁现在共同持有 `CHANGELOG.md` 的单调性，但语义相反且口径不同：

| 锁 | 判据 | 实测（同一份 `origin/main` blob） |
|----|------|--------------------------------|
| `check-changelog-growth.js`（另一会话，2026-10-05） | base 标题**多重集**被 head 包含 | 1,184 条 / 343 种 |
| `check-changelog-duplicate-entries.js`（本会话，2026-10-07，PR #3034） | 每标题副本数**不得变多** | 1,158 条 / 330 种 |

清理 828 份副本必须让第一把锁放行，而它的测试里有一条**明写为不变量**的断言正好挡住这条路：
`check-changelog-growth.test.js:136` 注释 `// 3) 只删重复副本中的一份 -> 仍须报丢（集合口径会漏，这条就是为它写的）`，
其第 4 档构造的就是 `base B×2 → head B×1`，且保留的 `b2` 与 base 的 `b2` 逐字节相同。

## Decisions

### D1 不改默认判据，清理走「新增授权文件」才生效的一次性通路（选定）

**实测依据**（本机、可逆）：在 worktree 里把 `compareMultisets` 打成「允许 `m===1 && n>=2`」，
`node --test scripts/check-changelog-growth.test.js` ⇒ `tests 11 / pass 10 / fail 1`，
唯一变红的正是 `真仓库四档：… 副本删一份=红`；其余 10 条（含 `4 份删到 3 份必须报丢`、`整份重写必须报丢`、
两条 fail-closed、CI 接线锁）仍绿。随后按备份逐字节还原（`a.equals(b) === true`、`git status --porcelain` 空、
基线 `11 pass / 0 fail`）。

⇒ 「削到 1 份」与「削到 3 份」在 owner 语义里是同一类操作，区别只在数量，而数量是这条门禁唯一能区分的信号。
把它改成「4→1 可以、4→3 不行」不是加例外，是**换不变量的定义**，不属于本 PR 的授权范围。

选定的折中：默认路径**一个字节都不改**（那 11 条断言继续按原语义守着每一个普通 PR）；
只有当 head 相对 base **新增**了 `scripts/changelog-dedup-authorization.json`
且其 `applies_to_base` 恰等于本次 merge-base 时，才**额外**接受一条清理形状：

1. 每个被减少的标题在 head 里**恰好剩 1 份**；
2. 那一份块**逐字节等于** base 中同标题的某一块（不得"顺便"改正文）；
3. head 的**不同标题集合 ⊇ base 的不同标题集合**（一个标题都不许消失 —— 这条保住 #2884 那种事故）；
4. 例外生效时**必须出声**：打印被减少的标题数与份数，不允许静默放行。

一次性由判据 ①「本次新增」保证：授权文件若在 base 已存在，例外**不生效**，
所以它不能被后续 PR 白蹭；要再清一次就得再提交一个授权文件（可见、可评审、留 diff）。

### D2 条目模型抽成单一实现（选定）

现状是两个文件各写一遍「什么是条目」（1184 vs 1158 就是这么来的）。
新增 `scripts/changelog-entries.js` 持有 `HEADING_RE`（取 growth 的 canonical 口径，它对无括号形条目
的失明是 QM-6 实测纠正过的，见其 `:36-45` 注释）与 `splitEntries / groupByTitle / pickKeeper / dedupe`。
两把锁都改为 require 它；`check-changelog-duplicate-entries.js` 的域随之从 1,158 收敛到 1,184。

### D3 保留份的选择沿用既有唯一实现

`pickKeeper` = 同题取正文最长那份、并列取首次出现，已是 #3034 里被交叉断言钉住的行为，不重写。

## Rejected Alternatives

- **自动窄例外**：被 D1 的实测否证（翻掉 owner 断言）。
- **CI 传 `--allow-dedup` flag**：需要改 `quality-gate.yml`，而那个 flag 会**对每一个 PR 常开**，
  等于把例外变成默认通路，比自动例外更松。
- **规模阈值特例**（如「减少 ≥50 种标题才放行」）：能保住那条断言，但引入魔法数，
  且把「清理」与「误删」的区别交给一个数字，日后无人能解释它为什么是 50。
- **不删、只防增量**：#3034 已经做了，作为本 change 的**备选出口**保留 —— 若 D1 通路评审不过，就按此收口并把 #3037 关成 won't-fix。

## Risks

- **中段大删除 vs 顶插**：CI 窗口（混合 PR 约 25–30 分钟）内任何并发顶插都会与本 PR 撞；按轮 re-sync，冲突只在文件顶部，机械可解。
- **口径收敛后计数变化**：`check-changelog-duplicate-entries` 的 14 条用例与门禁输出数字会变，必须实测重跑而不是改期望值。
- **re-sync 工具的隐性前提**：其它会话的解法器可能记着「CHANGELOG 很长」这种规模假设；清理后它们的
  「我的块 = mine − base」算术若仍用陈旧 base，#3034 的棘轮会当场判红 —— 这是**期望行为**，不是回归。
