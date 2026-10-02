---
# 复制自 _exempt/_TEMPLATE.md。文件名用分支名（squash 下 PR 号在判据运行时还不存在，sha 每轮 re-sync 会变）。
exempt_for: backfill-2779-record
reason: 本 PR 只把 #2779 的执行记录 openspec/records/asar-loose-resources-tests.md 的「远程同步」行由 PENDING 回填为 PASS，并删除该文件 frontmatter 里的三个 sync_* 登记项；没有任何新的行为变更，也没有新的门禁需要自检。为这个销账动作再写一篇记录会变成"关于记录的记录"，故按判据出路②显式豁免。
---

## 豁免说明

- 本 PR 变更 = 2 个文件：① `openspec/records/asar-loose-resources-tests.md` 的行内回填（删 3 行 `sync_*` 登记字段 + 改写 1 行「远程同步」），全部发生在**已存在的记录文件内部**（`check-pr-exec-record` 的 A/M/D 判据正是为此区分：改别人的记录不等于自己写了记录）；② 本豁免文件自身。**没有第三处改动**，也没有任何运行时代码/配置/依赖面。
- 被回填的那条记录随 #2779（merge `ae6512d10f912b425a8e492b0494bcbed4b2bd89`）交付，含 QM-5 五步、14 条变异反证、真实字节的改前/改后产物对照（三个由其他会话独立打出的产物报 179/189/189 红 vs 本产物 0 绿），以及 QM-6 **规定通道未跑成**的两手一手报错（codex = `127.0.0.1:15721/v1/responses` 502；claude = `exited with status 1`）与替代通道（opencode `-free`）的逐条处置。本豁免文件不改变其中任何一条。
- 证据：`git diff --numstat origin/main...HEAD` 与 `--ignore-cr-at-eol --numstat` **两口径逐文件相等** = `1 4 openspec/records/asar-loose-resources-tests.md` + 本豁免文件；删除数 4 全部是刻意删掉的三个 `sync_*` 登记行 + 被替换的那条 PENDING 行，不是行尾翻转造成的幽灵行（工作区那份是 CRLF、blob 是 LF，回填按**逐行保留各自行尾**搬运）。`node scripts/check-gate-record-debt.js` → rc=0 并点名「记录文件登记字段无残留」。
- 该分支合并后会被删除；本文件计入「待清理豁免」可见计数，累计到阈值时由下一个会话删除本文件放行。
