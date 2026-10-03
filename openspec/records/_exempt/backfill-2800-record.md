---
# 复制自 _exempt/_TEMPLATE.md。文件名用分支名（squash 下 PR 号在判据运行时还不存在，sha 每轮 re-sync 会变）。
exempt_for: backfill-2800-record
reason: 本 PR 只做一项收尾——把 #2800 的执行记录 openspec/records/fix-s2v-auto-start-preflight.md 的「远程同步」行由 PENDING 回填为 PASS，并删除该文件 frontmatter 的三个 sync_* 登记项（销账动作本身）。没有行为变更，也没有新的门禁需要自检；为一次销账再写一篇执行记录会变成"关于记录的记录"，故按判据出路②显式豁免。
---

## 豁免说明

- 本 PR 的全部变更 = 1 个记录文件的行内改写 + 删 3 行登记项，以及本豁免文件，共 2 个文件。**共享根当时另有其他会话未提交的改动，故本 PR 只按显式路径取这 2 个文件，不用 -A。**
- 回填证据一律可离线重跑，非凭记忆：
  - merge SHA 与时间取 `git log origin/main --grep='(#2800)$' --format=%H|%cI` → `4647f21bcae02ab17d71f858be2f7ddb37d7db6f | 2026-10-03T00:37:53Z`；
  - 远端分支删除取 `git ls-remote --heads origin fix-s2v-auto-start-preflight` → **0 行**；同一次取证对 `main` 的正控返回 **1 行**
    （正控不可省：`ls-remote` 失败也可能表现为空输出，那读起来与"分支已删"一字不差）；
  - CI 收敛取合并当刻 `gh pr view 2800 --json statusCheckRollup` → **20 SUCCESS / 1 SKIPPED / 0 红**；
  - 关联单 #2796 自动关闭 → `state=CLOSED stateReason=COMPLETED closedAt=2026-10-03T00:37:55Z`（与合并同一秒）。
- **修复效果另有两项不依赖 CI 的现场**（数字写进被回填的那一行，本文件不重复）：
  最坏主机档 `STORY2VIDEO_MAX_CONCURRENT_RUNS=1` 下整文件 23/23 绿；无 env 干预的桌面全量 423 文件只有
  `feedback.test.js` 的 Windows symlink `EPERM` 一个红（既有已知，已在 pristine main 逐字复现）。
- 行尾纪律：该记录文件检出后是**全 CRLF**（42 个 CR，LF-only 0）。回填按 Buffer 精确替换；
  脚本对文件级断言 CR 总增量恰为 **-3**（只等于删掉的三个 CRLF 整行）且改写后 LF-only 仍为 0。
  **这条守卫本次真拦下一次错误**：第一版把行尾的 `\r` 连同整行一起替换掉了，增量算出 -4 直接抛错 ——
  替换区间若含 `\r`，新文本必须补回 `\r`，否则 CRLF 行被写成 LF 行（与 #2791/#2795 记的是同一颗坑，
  这次的新形态是"行内替换吃掉行尾"，不是"整文件重写"）。
  两口径对账 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 同为 `1 4`。
- 销账耦合由门禁自己守住：删登记项却不改状态行的中间态，`check-gate-record-debt` 报「缺登记字段」；
  本 PR 完成后它回到 rc=0。
- 「待清理豁免」计数说明（本 PR **不做**清理，理由写在这里以免下一个人以为漏了）：
  `scripts/check-pr-exec-record.js` 的 `consumedExempts` 判据是"分支已不在远端的豁免文件 ≥3 才要求删除"，
  且它现在仍是 `--mode=advisory`。本 PR 落地后该目录含 `backfill-2793-record`、`backfill-2797-record`、本篇共 3 个文件，
  其中被消费的 = 2（本篇的分支在远端，不计）⇒ 未达阈值。
  此外共享根当时另有**其他会话未提交的** `.quality-gates.md` 回填与 `gate-record-debt-ledger.json` 销账改动，
  顺手把它们一起提交属于"把别人的在制品算进自己的 PR"，故一并回避。
