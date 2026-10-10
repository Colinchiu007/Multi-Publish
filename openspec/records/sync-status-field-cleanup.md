---
record: sync-status-field-cleanup
task: 删掉 11 篇已回填记录里遗留的死字段 sync_status: PASS，并登记门禁「登记字段无残留」这句话超出其实际检查范围
date: 2026-10-08
---

## 本次执行记录：清理已回填记录里的死字段（sync-status-field-cleanup，2026-10-08）【docs-only】

- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）→ 结果见下表
- 保留门禁：变更类型与隔离声明 ✅ | 行尾对账 ✅ | 品牌残留 ✅ | 文档同步 ✅ | Gate 2c ✅ | 远程同步 PASS（已合并 #3131 → main `d1535e894`，三源取证见同篇权威表格行）

### 现象：AGENTS.md 说删三个字段，实际有 11 篇只删了两个

AGENTS.md 两处（`:93`「删除 frontmatter 的 `sync_*` 三字段」、`:99`「删除 `sync_*` 三字段」）都要求回填时把三个登记字段整段删掉。
实测 origin/main 上 `grep -h "^sync_status:"` 的取值分布是 **`PASS` × 11 + `PENDING` × 2** —— 那 11 篇的 `sync_reason` / `sync_backfill_owner` 都删了，
唯独把 `sync_status` 改成 `PASS` 留在原地。也就是说**回填动作有两种实现并存**，而其中一种不符合文档口径。

### 为什么这个字段是死的（删它为什么安全）

不是"看着没人用就删"，三条实测：

1. **门禁不读它**：`git grep -n "sync_status\|sync_reason\|sync_backfill_owner" origin/main -- scripts .github/scripts` ⇒
   `check-gate-record-debt.js` 只有 `RECORD_FIELD_REASON = 'sync_reason'` 与 `RECORD_FIELD_OWNER = 'sync_backfill_owner'` 两个常量，**没有 `sync_status`**；
   `check-pr-exec-record.js` 提示文案里点名的也是那两个字段的**名字**，不是 `sync_status`。
2. **全仓无其他消费者**：`git grep -n "sync_status" origin/main -- . ':(exclude)openspec/records'` 的 7 处命中全是**同名不同物**
   （`ops-center/backend/routers/sync.py:62` 的 `async def sync_status(...)` 及其测试、`.ccg` 里的 `doc_sync_status`、learnings 里另一个项目 `sync.py` 的同名函数），
   没有一处解析记录 frontmatter。
3. **删除已被真实 PR 证伪过风险**：#3125 / #3128 两批回填就是把三个字段全删后合并的，`check-gate-record-debt.js` 与 `check-pr-exec-record.js` 在 CI 上均 PASS。

### 顺带暴露的一条：门禁的自述比它实际做的宽

`check-gate-record-debt.js` 通过时打印「记录文件**登记字段无残留**」，但它的判据只覆盖 `sync_reason` / `sync_backfill_owner`。
所以这 11 篇带着 `sync_status: PASS` 的文件**是在这句"无残留"下过关的** —— 门禁没有说谎（它检查的那两个确实没残留），
但**读者会把它当成"三个字段都查过"**。这正是本仓反复记的那类「消息范围 > 判据范围」的假安心。

把它补齐（把 `sync_status` 也纳入残留判据）是**门禁改动**，按 AGENTS.md 须人工过目，**本 PR 不做**，只在此点名并给出可直接落地的形状：
在 `RECORD_FIELD_REASON` / `RECORD_FIELD_OWNER` 旁边加 `RECORD_FIELD_STATUS = 'sync_status'` 并纳入同一条残留检查即可；
配套的 `check-gate-record-debt.test.js` 需要一条「只留 `sync_status` 也必须红」的用例，否则补了也是装饰。

### 动作与判据

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯 `openspec/records/**` 文档变更 ⇒ docs-only 通道；隔离 worktree `D:/Data/projects/mp-worktrees/mp-sync-status-field-cleanup`（裸分支 `sync-status-field-cleanup`，base `f74de1d12` = 当时 origin/main）。建区以 `git worktree list` 出现该路径实证，未采信入口 rc；共享根保持 main clean |
| 只动"账已收口"的文件 | PASS | 脚本对每篇先查 `sync_reason` / `sync_backfill_owner` 是否还在 —— 只要有一个在就 `SKIP_STILL_OPEN` 整篇不碰（说明那笔账还没收，它的 `sync_status` 是**活的**）。实跑 `TOTAL_CLEANED=11 SKIPPED=0`；`_TEMPLATE.md`（模板示例）与 `gate-record-backfill-11.md`（本篇，PENDING）因 `sync_status` 值是 PENDING 而非 PASS，**根本不在候选集里**，无需特例 |
| 删除动作的自证 | PASS | 每篇断言「恰好 1 行 `^sync_status:\s*PASS\s*$`」才动手（多于 1 判 `SKIP_AMBIGUOUS`），写回后回读三个字段全部不存在才记 `CLEANED`，任一断言不过**当场 exit 1 停手**。11 篇全部 `CLEANED`，`fmHead` 逐篇打印为 `---\|record: <名>`，证明 frontmatter 结构未被破坏 |
| 行尾与 diff 对账 | PASS | 11 篇工作副本都是 CRLF（逐篇 `fmHead` 带 `\r` 现场可见）。脚本按 `split('\n')/splice/join('\n')` 只摘掉目标那一整行，**不碰任何其它行的行尾**；`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件完全相同**（11 × `0 1`）⇒ 纯删除、零插入、无幽灵行 |
| Gate 2c | PASS（提交 `be1845e3e` 后复跑） | `node scripts/check-gate-record-debt.js` ⇒ 顶部 `OK`，现场 `远程同步行 251 条 / 执行记录 453 篇（全部 ## 标题 461 个）/ 已登记欠账 8 条 / 记录文件 103 篇`。**形状**：本 PR 只应动「记录文件」（+1 = 本篇）；「远程同步行 / 执行记录 / 已登记欠账」三项必须不变 —— 本 PR 改的是 frontmatter 的一个**非判据字段**，不新增也不闭合任何「远程同步」行。另注：本 PR 清掉 11 个 `sync_status` 后该门禁的输出**逐字不变**（连"登记字段无残留"那句照旧），这本身就是上面那条「门禁不看 `sync_status`」的现场复现 |
| 本地门禁汇总 | PASS（提交 `be1845e3e` 后实跑） | `classify-docs-only --base=origin/main --head=HEAD` ⇒ **`docs-only=true` / files=12**（11 篇被清记录 + 本篇）；`check-no-brand-residue.js` ⇒ `PASS（扫描 7270 个 tracked 文件，无品牌残留…）`；`check-pr-exec-record.js --base=origin/main --mode=enforce` ⇒ `OK`（`变更文件 12 个（A=1 M=11 D=0）｜新增记录 1 篇｜载体M=11`）；`.github/scripts/check-max-lines.js` ⇒ `超限文件=98 挂账=98 墓碑=1 ✅ 无新增超大文件，挂账清单与现实一致`；`check-docs-sync.sh --base=main --head=HEAD` ⇒ `✅ 仅文档/流程变更，无需额外同步`。**清理后复核**：`grep -c "^sync_status: PASS" openspec/records/*.md` 非零文件数 = **0**；仍带 `sync_status:` 的只剩 3 篇 —— `_TEMPLATE.md`（模板示例）、`gate-record-backfill-11.md`（未收口的活账）、本篇，三者都**应当**带着它 |
| 为什么不顺手把门禁补宽 | 已决定 | 改 `check-gate-record-debt.js` 的判据属"谁来守门"的改动，AGENTS.md 要求人工过目；且改宽判据会**立刻**让别的并发会话写回的 `sync_status` 变红，那应当是一次有意的、带测试的变更，不是清理 PR 的搭车。本 PR 只把树清成符合既有文档口径，并把缺口留在记录里 |
| QM-1 / QM-2 / QM-4 / TDD / QM-6 | N/A | docs-only 通道，零运行时文件、零逻辑分支 |
| 远程同步 | PASS | 已合并：squash 落地 `d1535e89436ca4386d587e041226ac473c6bcbdd`（committer 2026-10-08T13:04:31+08:00）。取证两源一致：`git log origin/main --grep='(#3131)$' --format=%H|%cI` 唯一命中该 SHA 与时间，`gh pr view 3131 --json mergeCommit` 报同一 oid；`git ls-remote --heads origin sync-status-field-cleanup` 返回 **0 行**证远端分支已随合并删除。该记录清掉 11 篇遗留的 `sync_status: PASS`，并点名"门禁不看这个字段"—— 那处缺口已由 #3140（`2542a9b29`）补上。 本 frontmatter 的三个 `sync_*` 登记字段（`sync_status` / `sync_reason` / `sync_backfill_owner`）已在本条由 PENDING 转 PASS 的**同一次提交**内整段删除 |

### 明确留在场上的边界

1. **本 PR 不能防止它自己复发**。只要 `check-gate-record-debt.js` 不看 `sync_status`，下一个回填会话仍可能留下它。真正的收口是那条门禁改动，已登记但不在本 PR。
2. 那 11 篇记录正文里对回填动作的**叙述文字**（例如"删除三个字段"与实际只删两个的历史）没有被改写 —— 记录是历史事实快照，本 PR 只改结构字段，不重写别人的过程描述。
3. `_TEMPLATE.md` 里的 `sync_status: PENDING` 是**模板示例**，属模板该有的样子（新记录照抄即得合法登记），不动。
