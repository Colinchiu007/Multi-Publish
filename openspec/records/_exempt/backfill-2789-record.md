---
# 复制自 _TEMPLATE.md。文件名用分支名（squash 下 PR 号在判据运行时还不存在，sha 每轮 re-sync 会变）。
exempt_for: backfill-2789-record
reason: 本 PR 只是把 #2789 的执行记录 openspec/records/fix-stage-runtime-flatten.md 的「远程同步」行由 PENDING 回填为 PASS，并删除三个 sync_* 登记项（销账动作本身），未产出任何行为变更，也没有新的门禁需要自检；为该动作再写一篇记录会变成"关于记录的记录"，故按判据出路②显式豁免。
---

## 豁免说明

- 本 PR 的全部变更 = 2 个文件：`openspec/records/fix-stage-runtime-flatten.md`（`+1/-4` 行，且这 4 删 1 增都发生在**已存在的记录文件内部**）+ 本豁免文件自身。
- 被回填的那条记录随 PR #2789（merge `1291a51e`）交付，内容含 QM-5 五步、11 条变异反证逐个实跑、打包产物两维门禁 + 隔离 profile 启动实测，以及 QM-6 **只达成 1 个模型**的原始报错与逐条处置。
- 回填证据一律可离线取证，非凭记忆：merge SHA 与时间取 `git log origin/main --grep='(#2789)$' --format=%H|%cI`，
  远端分支删除取 `git ls-remote --heads origin fix-stage-runtime-flatten` 返回 **0 行**，
  CI 收敛取合并当刻 `gh pr view 2789 --json statusCheckRollup` 的 **21 全绿 / 0 红 / 0 挂起**，
  关联单 #2778 的自动关闭取 `state=CLOSED stateReason=COMPLETED closedAt=2026-10-02T17:43:29Z`（与合并同一秒）。
- 行尾纪律：该记录文件在检出后是**全 CRLF**（82 个 CR），回填按 Buffer 精确子串替换、逐行保留各自行尾，
  改后 CR=79（恰等于删掉的三个 CRLF 整行），并用 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径对账同为 `1 4`。
- 该分支合并后会被删除；本文件计入「待清理豁免」可见计数，累计到阈值时由下一个会话删除本文件放行。
