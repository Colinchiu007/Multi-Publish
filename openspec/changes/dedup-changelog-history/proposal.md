## Why

`CHANGELOG.md` 在 `origin/main` 上带着大量历史重复副本（同一标题最多重复 16 次）。实测规模，两个口径分开写，
因为它们本来就不是同一个数（这正是本 change 要收敛的分裂）：

- **canonical 口径**（`check-changelog-growth.js` 的 `HEADING_RE`，一级标题排除 `# CHANGELOG`）：
  同一份 blob 上 **1,184 条 / 343 种标题** ⇒ 冗余 **841 份**。
- **窄口径**（我自己的 `check-changelog-duplicate-entries.js` 只认 `# [未发布]`）：**1,158 条 / 330 种标题** ⇒ 冗余 **828 份**。
- 文件总量 **65,682 行 / 7,595,055 字节**；按窄口径 `--dedup --apply` 实测得到 **17,891 行 / 2,070,023 字节**（净删 47,791 行 / 约 5.5 MB）。

⚠️ 上面两组数字是**开分支时**在 `origin/main`（当时 tip）上量的，只用于说明"两个口径确实分裂"。
**最终实测以授权文件钉住的 merge-base `6fb99307b` 为准**（main 在开发期间又前进了两个提交；中途曾在 `cbce32541` 上读作
`1,185 条 / 344 种 / 65,715 行`，那组数只说明漂移、不作最终值）：canonical 口径 `1,187 条 / 346 种 / 冗余 841 / 最坏 16`，
65,818 行 / 7,602,769 字节 → 清理后 **347 条 / 347 种 / 18,022 行**；净减 47,796 行。
**head 的字节数故意不写**：这条陈述就位于被本 PR 改写的那 28 行之内，写下任何字节数都会因这次写下立刻变错（实测同一份内容三次改写为 2,070,569 → 2,077,240 → 2,078,238）；要按字节复核一律当场 `git cat-file blob <sha>:CHANGELOG.md` 自量。
其中"新增 133 行"里只有 28 行来自本 PR 那条台账，其余是重排噪声 —— 详见执行记录的同名表格。
这些副本全部来自 re-sync 型解冲突（以陈旧 base 算出「我的块」再 prepend 到别人全文），不是真实历史。

防增量的那一半已经落地并合并（PR #3034 → `03e268ccf`：`check-changelog-duplicate-entries.js` 的
副本数棘轮，实测对 #2792 那两个真实 blob 回放为 `冗余 9 -> 828 / 新增副本=819 / rc=1`）。
**本 change 做剩下的那一半：把这 828 份副本清掉。**

之所以需要一个专门的 change 而不是一次普通编辑：main 上另一会话的
`scripts/check-changelog-growth.js` 用**标题多重集包含**守「条目不许丢」，其测试里有一条
`真仓库四档：… 副本删一份=红` 恰好钉住「`B×2` 削到 `B×1` 必须报丢」。本 change 已实测确认：
任何「允许削到 1 份」的**自动**例外都会把这条断言翻成绿（`node --test` ⇒ `tests 11 / pass 10 / fail 1`），
所以清理不能靠悄悄改宽默认判据来实现，必须走一条**需要书面授权的、一次性的、默认关闭**的通路。

## What Changes

- 新增**条目模型单一实现** `scripts/changelog-entries.js`：一级标题（排除节标题 `# CHANGELOG`）到下一个标题前的整段原文
  为一条条目；`splitEntries / groupByTitle / pickKeeper / dedupe` 只此一份。
- `scripts/check-changelog-growth.js`：改为复用该模型；**新增一条默认不生效的例外通路** ——
  仅当 head 相对 base **新增** `scripts/changelog-dedup-authorization.json` 且其 `applies_to_base`
  等于本次 merge-base 时，才允许「每个被减少的标题恰好剩 1 份 ∧ 保留块逐字节等于 base 中同标题的某一块
  ∧ head 的不同标题集合包含 base 的全部不同标题」。默认口径与现有 11 条断言**一字不动**。
- `scripts/check-changelog-duplicate-entries.js`：改为复用该模型，其条目域从 `# [未发布]`（实测 1,158 条）
  收敛到 canonical 口径（实测 1,184 条），消除两把锁对「什么是一条条目」的口径分裂。
- 落 `scripts/changelog-dedup-authorization.json`（本 PR 一次性使用），并跑 `--dedup --apply` 完成清理。
- 执行记录 `openspec/records/changelog-history-dedup.md`。

## Impact

- Affected specs: `changelog-ledger-integrity`（新增 capability）
- Affected code: `scripts/changelog-entries.js`（新）、`scripts/check-changelog-growth.js`、
  `scripts/check-changelog-duplicate-entries.js`、两者同名 `.test.js`、`.gitignore`（新脚本需反选，
  否则被第 106 行 `scripts/*.js` 静默忽略）、`CHANGELOG.md`（净删 4.7 万行）
- 风险：CI 窗口内任何并发会话的 CHANGELOG 顶插都会与本 PR 的中段大规模删除相撞 ⇒ 需按轮 re-sync；
  合并后所有「以陈旧 base 重放我的块」的 re-sync 脚本第一次会撞到一个被削短的底，这由 #3034 的棘轮负责拦（它允许变好、拦乘法）。
- 非目标：不改任何运行时代码路径；不动 `quality-gate.yml`（默认判据不变，因此无需给 CI 传新 flag）；
  不动 owner 那两条既有断言的内容。
