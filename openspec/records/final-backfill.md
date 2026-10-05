---
record: final-backfill
task: 把本会话五个已合并 PR 的台账一次收口（5 篇记录销账 + 3 条 CHANGELOG 条目）
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；回填者＝下一个会话。这是一条**一行机械改写**的欠账：把下面「远程同步」行改成 PASS 并填入 `git log origin/main --grep='(#<本 PR 号>)$' --format=%H|%cI` 现取的 SHA 与时间，同时整段删除本段三个 sync_* 字段（留着不删会被门禁判「已回填却仍留登记字段」）。
sync_backfill_owner: 下一个会话（同分支名 final-backfill；`git ls-remote --heads origin final-backfill` 返回 0 行即证远端分支已删）
---

## 本次执行记录：五个已合并 PR 的台账收口（final-backfill，2026-10-05）【docs-only】

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | 纯文档/台账（docs-only 快速通道） | 就地编辑经 PR 落地：worktree `D:/Data/projects/mp-worktrees/mp-final-backfill`，裸分支 `final-backfill`，base `8600dd214`（= 采集时的 origin/main，即 #2910 的 squash 落地提交）；三连实证 toplevel / branch / head 全对、`matches-base=True`。改动面只含 `CHANGELOG.md` + `openspec/records/*.md`，未触任何运行时路径 |
| 判定 | `docs-only=true`（files=6） | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` ⇒ `docs-only=true`，files=6：`CHANGELOG.md` + 5 篇记录。**这条是在 commit 之后跑的** —— 同一命令在提交前会 fail-close 成 `false`（记忆里已立此规，本轮再验一次） |
| 保留门禁①：行尾/编码对账 | ✅ | `git diff origin/main --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件相等**：CHANGELOG `41 0`（纯插入、零删除），五篇记录各 `1 4`（+1 行 PASS，−4 = 三行 `sync_*` + 一行旧 PENDING）。CHANGELOG 落盘前逐字节扫：blob `crlf=0 bareLF=64511 loneCR=0 NUL=0`（纯 LF），写后 `crlf=0 loneCR=0 NUL=0`、行数增量精确等于块内换行数 41。**全程 `Buffer.concat`，零 split/join**，并断言「结果尾部与 HEAD 的 blob 逐字节相等」成立 |
| 保留门禁②：CHANGELOG 只可增长棘轮 | ✅ 实跑 | `node scripts/check-changelog-growth.js --base=$(git merge-base HEAD origin/main) --head=HEAD` ⇒ `PASS：base 1149 条（308 种标题）全部在 head 1152 条（311 种）里，字节 7486107 -> 7493411`。这里的 1149/1152 本身就是 #2910 那条形状修复生效的现场（旧判据在同一份文件上读 1140/1143） |
| 保留门禁③：品牌残留 | ✅ | `node scripts/check-no-brand-residue.js` ⇒ PASS（扫描 6847 个 tracked 文件）。新条目里出现的是 `vitest`/`undici`/`ajv`/`pnpm` 等**依赖与工具名**，不是竞品品牌；未触发 Gate 12 |
| 保留门禁④：文档同步（doc-gate） | ✅ | 6 个文件全部命中 `PRD_PATTERN`（`CHANGELOG.md` 与 `openspec/`），`DOCS_CHANGED` 点亮 ⇒ 不存在"改代码不带文档"的缺口；本 PR 无代码文件 |
| 保留门禁⑤：记录欠账门禁 | ✅ | `node scripts/check-gate-record-debt.js` ⇒ rc=0，`OK: …记录文件登记字段无残留`。这条同时是本次销账的**后置断言**：五篇记录删掉 `sync_*` 三字段后，若哪篇的 `远程同步` 行没改成闭合词表里的状态，门禁会当场报「未登记欠账」 |
| 销账取证口径 | 现取，不凭记忆 | 每条 SHA/时间来自 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI`，远端分支缺失来自 `git ls-remote --heads origin <branch>` 返回 **0 行**；采集时的 `origin/main=8600dd214` 一并写进每一行的取证文字里（采集清单落盘 `Mulpub-scratch/backfill-evidence-2026-10-05.txt`） |
| 五个销账对象 | ✅ 逐文件断言 | #2901 `1c98294a8` → `changelog-growth-gate.md`；#2904 `a565e0f8d` → `dep-audit-opscenter-domain.md`；#2905 `2296c869b` → `undici-fasturi-bounded.md`；#2908 `7dd55937e` → `backfill-2898-record.md`；#2910 `8600dd214` → `qm6-gate-hardening.md`。脚本对每篇断言：`sync_*` 前=3 后=0、`远程同步` 行恰好 1 条且状态列为 `PASS`、行数只减 3、frontmatter 仍以 `---` 开头；任一不成立即**跳过该文件不落盘**（fail closed，不写半份） |
| 三条新增 CHANGELOG 条目 | ✅ | #2904（第三扫描域 + 挂账可闭合判据 + `DOMAIN_NOT_WIRED`）、#2905（`>=`→`^` + 整表上界棘轮 + 锁一致性）、#2910（QM-6 七条发现处置 + 竞态代价 + 十一次变异反证）。**#2901 不重复建条目**：它的落地已由 #2908 那条（`changelog-restore / changelog-growth-gate`）覆盖，实测 main 的 H1 里含「只可增长」的恰是那条 |
| 刻意不做的事 | ✅ 划界 | 不碰其他会话的五条 PENDING 记录（`exec-record-wiring-71a` / `fix-settings-roundtrip` / `gate2c2-landing-correction` / `publish-frequency-control` / `qm6-agents-dedup`）与 `_TEMPLATE.md`；不改写任何已合并的 CHANGELOG 条目（那是历史事实快照，改写必然制造新的置顶冲突并篡改记录） |
| QM-1 打包 / QM-2 代码必检 / QM-4 视觉 / TDD / QM-6 双模型评审 | 跳过（docs-only） | 与运行时无关：无代码、无依赖区间、无 UI 文件。QM-6 的评审对象是 #2910 那批判据代码，已在那一侧执行并如实记「部分执行（三路两败一成，7 条处置）」；本 PR 只动台账文字 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#<本 PR 号>)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin final-backfill` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 一条方法论（写下来是因为它本轮真的差点漏掉）

Gate 2c2「执行记录存在性」的口径是 **A 任一记录**，或 **M 且文件名 == `<本分支名>.md`**。本 PR 改的全是**别人分支名**的记录（五篇 M），因此**不满足**"携带记录"——照本 PR 的内容看它就像"只回填、不写记录"。所以这篇记录的存在本身就是被判据逼出来的，不是形式主义：`check-pr-exec-record.js` 的注释里写明"只看文件路径会把『改了别人的记录』当成『自己写了记录』而放行"，且该放宽只按文件名这一维发生、不按状态放宽。
