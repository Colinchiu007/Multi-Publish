---
# 复制自 _TEMPLATE.md。文件名用分支名（squash 下 PR 号在判据运行时还不存在，sha 每轮 re-sync 会变）。
exempt_for: backfill-2767-2768-records
reason: 本 PR 只做销账——把 #2767 与 #2768 两条已合并记录的「远程同步」行由 PENDING 回填为 PASS，并删除各自的三个 sync_* 登记字段；没有新的行为变更、也没有新的门禁要自检。为一次销账再写一篇执行记录会变成「关于记录的记录」，故按判据出路②显式豁免。
---

## 豁免说明

- 全部变更 = 2 个**已存在的记录文件内部**的行（各删 3 行 frontmatter 登记字段、各改 1 行状态），外加本豁免文件自身；`check-pr-exec-record` 的 A/M/D 判据正是为区分「改别人的记录」与「自己写了记录」而设。
- 取证口径沿用账本 SOP：head 分支 → PR → `git log origin/main --grep='(#NNNN)$'` 取 merge SHA → `git ls-remote --heads origin <branch>` 返回 0 行证远端分支已删，全部离线可复核，不凭记忆写 SHA。
- 回填与销账必须同批：新载体的登记就在记录文件自身的 frontmatter 里，**删掉那三个字段本身就是销账**；留着会被 `check-gate-record-debt.js` 判「已回填却仍留登记字段」。
- 该分支合并后会被删除；本文件计入「待清理豁免」可见计数，累计到阈值时由后续会话删除本文件放行。
