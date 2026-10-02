---
# 复制自 _exempt/_TEMPLATE.md。文件名用分支名（squash 下 PR 号在判据运行时还不存在，sha 每轮 re-sync 会变）。
exempt_for: backfill-2793-record
reason: 本 PR 只做两项收尾——①把 #2793 的执行记录 openspec/records/coverage-gate-electron-prepare.md 的「远程同步」行由 PENDING 回填为 PASS，并删除该文件 frontmatter 的三个 sync_* 登记项（销账动作本身）；②纠掉 #2778 的记录 openspec/records/fix-stage-runtime-flatten.md 里两处把会话级 scratch 当成可核查地址的证据引用。没有行为变更，也没有新的门禁需要自检；为一次销账再写一篇执行记录会变成"关于记录的记录"，故按判据出路②显式豁免。
---

## 豁免说明

- 本 PR 的全部变更 = 2 个记录文件的**行内改写** + 本豁免文件 + 5 个已消费豁免文件的删除（删除是判据本身要求的清理，见末条）。
- 回填证据一律可离线重跑，非凭记忆：
  - merge SHA 与时间取 `git log origin/main --grep='(#2793)$' --format=%H|%cI` → `8f3029121b0040859cc4b4cb61cc340fbd109752 | 2026-10-02T19:18:33Z`；
  - 远端分支删除取 `git ls-remote --heads origin coverage-gate-electron-prepare` → **0 行**，同一次取证里对 `main` 的正控返回 **1 行**（证"0 行"是分支确已删除，不是命令失败被静默当成空集）；
  - CI 收敛取合并当刻 `gh pr view 2793 --json statusCheckRollup` 的 **20 全绿 / 0 红**；
  - 本 PR 的**因果判据**在真实 runner 上被现场看过一次：`gh api .../runs/37050379937/jobs` 里 `QG Coverage` 的 `Ensure Electron binary = completed/success`、`Gate 5 - Test coverage check` 在其之后完成 ⇒ 装配顺序不是在本地 yaml 里成立而已；
  - 合并后 main push run 的复核结果（`Downloading Electron binary` 命中数）写在被回填的那条记录的「远程同步」行内，本文件不重复。
- 行尾纪律：两个记录文件在检出后都是**全 CRLF**（57 / 79 个 CR，LF-only 行 0），回填按 Buffer 精确子串替换、逐行保留各自行尾；
  脚本对每个编辑点断言"CRLF 守恒或整行删除"，对文件级断言 CR 总增量恰为 **-3**（只等于删掉的三个 CRLF 整行）；
  并用 `git diff --numstat` 与 `git diff --ignore-cr-at-eol --numstat` 两口径对账一致（`0 3` / `3 3`）。
  这一条是 #2791 的直接教训：那次先用"前缀之后的第一个 `\n`"判行尾，把 CRLF 行写成 LF，被 CR 守卫当场拦下（82→78 而非 79）。
- 顺带执行「待清理豁免」销账：`scripts/check-pr-exec-record.js` 的 `consumedExempts` 实测已堆积 **5 条**（阈值 3，且自该判据落地起仓库历史里 `--diff-filter=D -- openspec/records/_exempt/` 无任何删除记录，即从未被清理过）。
  这 5 个文件自身正文都写着"本文件计入可见计数，累计到阈值时由下一个会话删除本文件放行"，其 `exempt_for` 分支名经上面同一次 `ls-remote`（11 个 head）逐个核对**均不在远端** ⇒ 全部已消费，按判据文案删除；
  它们的实质取证内容本就重复于各自回填的那条记录的「远程同步」行内，删除不丢证据（git 历史亦保留原文）。删除后清单只剩本 PR 新增的这一条，其分支存在于远端 ⇒ 不计入 consumed，积压归零。
