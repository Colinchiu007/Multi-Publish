---
exempt_for: backfill-2928-record
reason: 本 PR = 他人记录的远程同步回填（M openspec/records/exec-record-backfill-exit.md）+ CHANGELOG.md 顶插 #2928 条目；出路④被 CHANGELOG（非载体文件）按定义打破，出路①等于给一次 meta 回填再造 PENDING 欠账（三阶递归），本分支无也不需自己那篇记录；diff 无任何运行时行为变更。
---

## 豁免说明

- 出路④（纯回填）要求变更集全部为载体文件的 M 且至少含一篇记录文件的 M；CHANGELOG.md 是刻意排除的非载体文件，该收紧是对的，本豁免是显式承认而非绕过。
- 合并后本文件可按 prune-consumed-exempt-records.md 流程清理。
