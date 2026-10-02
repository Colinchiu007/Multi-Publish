---
# 复制自 _exempt/_TEMPLATE.md。文件名用分支名（squash 下 PR 号在判据运行时还不存在，sha 每轮 re-sync 会变）。
exempt_for: backfill-2772-record
reason: 本 PR 只把 #2772 的执行记录 openspec/records/lock-budget-provenance.md 的「远程同步」行由 PENDING 回填为 PASS，并删除该文件 frontmatter 里的三个 sync_* 登记项；没有任何新的行为变更，也没有新的门禁需要自检。为这个销账动作再写一篇记录会变成"关于记录的记录"，故按判据出路②显式豁免。
---

## 豁免说明

- 本 PR 变更 = 2 个文件：① `openspec/records/lock-budget-provenance.md` 的 `+1/-4` 行，全部发生在**已存在的记录文件内部**（`check-pr-exec-record` 的 A/M/D 判据正是为此区分：改别人的记录不等于自己写了记录）；② 本豁免文件自身。**没有第三处改动**，也没有任何运行时代码/配置/依赖面。
- 被回填的那条记录本身随 #2772（merge `31958ce1`）交付，含 QM-5 五步、10/10 变异反证、四个调用点实跑，以及 QM-6 **未执行**的两条一手报错（codex = `127.0.0.1:15721/v1/responses` 连续 502；claude = `api_retry attempt=1..10 error=unknown` 耗尽）—— 那三笔补跑欠账（#2731 / #2719 / #2772）写在同一条记录的「遗留」里，本豁免文件不改变它。
- 证据：`git diff --numstat origin/main...HEAD` 与 `--ignore-cr-at-eol --numstat` **两口径逐文件相等** = `1 4 openspec/records/lock-budget-provenance.md` + `10 0 openspec/records/_exempt/backfill-2772-record.md`（删除数 4 全部是本次刻意删掉的三个 `sync_*` 登记行 + 被替换的那条 PENDING 行，不是行尾翻转造成的幽灵行）；`node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → `docs-only=true（files=2）`；`node scripts/check-gate-record-debt.js` → rc=0 并点名「记录文件登记字段无残留」。
- 该分支合并后会被删除；本文件计入「待清理豁免」可见计数，累计到阈值时由下一个会话删除本文件放行。
