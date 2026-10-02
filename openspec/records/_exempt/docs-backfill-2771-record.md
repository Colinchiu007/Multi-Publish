---
# 复制自 _TEMPLATE.md。文件名用分支名（squash 下 PR 号在判据运行时还不存在，sha 每轮 re-sync 会变）。
exempt_for: docs-backfill-2771-record
reason: 本 PR 只是把 #2771 的执行记录 openspec/records/ep-theme-disabled-primary.md 的「远程同步」行由 PENDING 回填为 PASS 并删除三个 sync_* 登记项，未产出任何新的行为变更，也没有新的门禁需要自检；为该销账动作再写一篇记录会变成"关于记录的记录"，故按判据出路②显式豁免。
---

## 豁免说明

- 本 PR 的全部变更 = 1 个文件、`+1/-4` 行，且这 4 删 1 增都发生在**已存在的记录文件内部**（`check-pr-exec-record` 的 A/M/D 判据正是为此而区分：改别人的记录不等于自己写了记录）。
- 证据：`git diff --numstat origin/main...HEAD` 与 `--ignore-cr-at-eol --numstat` 两口径同为 `1 4 openspec/records/ep-theme-disabled-primary.md`；`node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → `docs-only=true（files=1）`。
- 被回填的那条记录本身在 #2771（merge `d0147ea4`）里已随 PR 交付，含 QM-5 五步、四条变异反证、真机 computed 值实测，以及 QM-6 **未执行**的原始报错（codex 代理 502 / claude ECONNREFUSED）。
- 该分支合并后会被删除；本文件计入「待清理豁免」可见计数，累计到阈值时由下一个会话删除本文件放行。
