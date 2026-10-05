---
record: changelog-growth-gate
task: 给 CHANGELOG.md 加「条目标题多重集只可增长」棘轮，接进 quality-gate.yml 的 changes job
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；回填者＝下一个会话，回填后必须删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（取 git log origin/main --grep='(#NNNN)$' 的 merge SHA 与时间）
---

## 本次执行记录：CHANGELOG 只可增长棘轮（changelog-growth-gate，2026-10-05）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | 运行时代码（门禁脚本 + CI） | worktree `D:/Data/projects/mp-worktrees/mp-changelog-growth-gate`，裸分支 `changelog-growth-gate`，base `fd28e782f`（= #2898 的 squash 落地提交）；三连实证 toplevel / branch / head 全对（`git worktree add` 后立即 `rev-parse --show-toplevel`） |
| 第一性原因（QM-5 ①） | 已定位 | 丢失提交 `b531bdfe7`（PR #2884，2026-10-04T16:42:41Z）。逐提交量 `git cat-file -s <sha>:CHANGELOG.md`：`7,474,293 → 9,155` 是 25 次触达里唯一一次数量级下跌；该提交 `--name-status` 的新增文件全是 `rewrite-ai-taste-*` 代码与 PRD，**没有任何归档文件** ⇒ 整份替换而非搬家 |
| 逃逸分析（QM-5 ②） | 五层全空，逐层给因 | ①单元测试层：全仓无任何测试读 CHANGELOG 的规模/条目（本 PR 前）；②门禁层：`check-docs-sync.sh` 只判「diff 里有没有白名单文档」，删空文档照样满足；③`check-max-lines` 的 `SCAN_DIRS=['apps/desktop/src','apps/desktop/electron','packages','ops-center/backend']` + `SOURCE_EXTS` 不含 `.md` ⇒ 根级 CHANGELOG **不在扫描域**（本 PR 前实跑该门禁：超限=98 挂账=98 ✅，与它无关，正好证明它看不见）；④`check-gate-record-debt` 只查执行记录两源，不查 CHANGELOG；⑤审查层：diff 里"删 6 万行"混在一个 40+ 文件的功能 PR 中未被当作异常 |
| 系统性漏洞（QM-5 ③） | 门禁缺失漏洞，具体到文件 | 缺「append-only 台账的单调性判据」。落点必须是被 docs-only **短路不到**的位置：`CHANGELOG.md` 命中 `scripts/classify-docs-only.js` 的 `CI_IGNORED_PATHS` 根级 `*.md`，若把校验放在被 `docs-only != 'true'` 门控的 `static-gates`，等于给自己关掉校验（AGENTS.md「进白名单前提锁」，`gate-record-debt-ledger.json` 先例） |
| 修复 + 回归保护（QM-5 ④） | 已落地并实跑 | 新增 `scripts/check-changelog-growth.js`（判据 `collect()` 与 IO 分离，可注入假 git）+ `scripts/check-changelog-growth.test.js`（8 例，`node --test` 全绿）。判据 = **base 的条目标题多重集必须被 head 包含**。用多重集不用集合：main 上 1,137 条标题只有 302 个不同值（267 种重复、最多 4 份），集合口径会把「4 份删到 3 份」读成通过 —— 测试里那条「等条数换内容也必须报丢」与「副本删一份必须报丢」就是在排除这两种弱判据 |
| 防止再次发生（QM-5 ⑤） | 自动化门禁已接线 | 接进 `quality-gate.yml` 的 `changes` job（Gate 2c3），且 `gate-result` 的聚合表里含 `needs.changes.result`、`Gate Result` 是必需检查 ⇒ 本条红**拦得住**合并，不是只报告不判定。接线由 `check-unwired-tests.js` 当场验过（"检查域内测试文件 55 个 / OK"） |
| 反证（锁本身必须能红） | 已实跑 | ①**真事故复现**：`node scripts/check-changelog-growth.js --root=D:/Data/projects/Mulpub --base=b531bdfe7^ --head=b531bdfe7` ⇒ `FAIL：少了 296 种条目（base 1133 条 -> head 3 条，字节 7474293 -> 9155）`；②**摘掉接线行**：把 workflow 里那行 `node --test scripts/check-changelog-growth.test.js` 删掉 ⇒ `check-unwired-tests` **rc=1** 并点名本文件（还原后 rc=0，文件按 blob 核对与 HEAD 相同）；③**判据改 no-op**（`lost` 恒空）⇒ 套件 **3 红 / 5 绿，rc=1**；④**摘掉 fail-closed**（零标题也放行）⇒ **恰好 1 红**，正是 `fail closed：base 读出 0 条标题必须抛`，另两条红用例（blob 读不到）不受影响 —— cause-match 成立。③④ 变异后均按字节还原核对（`还原逐字节相同 = true`，还原后 8/8 绿）。**注意**：首次测 ③ 时我把 `cmd \| grep -c` 的管道尾段退出码当成 rc，得到「7 条红」的错数 —— 正解是先把套件输出重定向到文件再读，`$?` 才是被测命令的 |
| fail closed | ✅ | base blob 读不到 ⇒ 抛「读不到 BASE:CHANGELOG.md」；base 读出 **0 条标题** ⇒ 抛「空遍历不得判为零丢失」（与 `check-gate-record-debt.js` 的 `rowCountAll===0` 出口同源）。两条都有独立用例 |
| 行尾与 diff 对账 | ✅ | 标题判据先 `.replace(/\r/g,'')` 归一再比（本仓工作树 CRLF、blob LF；未测先验：`origin/main:CHANGELOG.md` blob CR=0）。归一不判据"行尾是否被改"，只判"条目是否不见"；两口径对账在提交前跑 `git diff --numstat` vs `--ignore-cr-at-eol --numstat` |
| 接线棘轮 | ✅ | 新文件 `scripts/check-changelog-growth.test.js` 在同一 PR 里被 `node --test` 显式点名（`check-unwired-tests.js` rc=0）。`.gitignore:106 scripts/*.js` 默认忽略新脚本 ⇒ 补了 `!scripts/check-changelog-growth.js`（`check-ignore` 复核：test 文件走 `!scripts/*.test.js` 通配，无需逐条） |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/`，未触 UI；改动面为 `scripts/` 门禁 + `.github/workflows/` + `.gitignore` + 本记录 |
| QM-6 CCG 双模型外部评审 | 未执行 | 本机 QM-6 通道本会话未验证（`gh` 在 Git Bash 下 rc=0 零输出，token 仅经 node 的 `execFileSync('gh',['auth','token'])` 可取；CC Switch :15721 存活未测）。**如实写「未执行」，不以自审冒充通过** |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin changelog-growth-gate` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 本 PR 不含 CHANGELOG 条目（刻意的）
本 PR 是混合 PR，CI 实测 25–30 分钟 ≥ main 前进间隔；顶插 `CHANGELOG.md` 会让每次 re-sync 都撞同一个位置（上一轮 axios 就是这个形态连撞三轮）。条目挪到后续 docs-only 回填 PR（实测 0.6–7.2 分钟）。

### 遗留（不假装已闭合）
- **只判「条目不见了」，不判「条目变小了」**：条目正文被改短、字节数倒退都不红。这是有意取舍 —— 后续 PR 修订自己那条 CHANGELOG 是既有习惯，把它判红会造出一个人人想关掉的红门禁。要收紧必须先给「合法修订」留出机制，别直接抬判据。
- **1,137 条里只有 302 种标题**（267 种重复、最多 4 份）：本次只把多重集判据建起来，**没有**去重。去重会让"副本删一份"这一类回归锁失去基线，所以顺序必须是「先建棘轮（本 PR）→ 再谈去重（独立 PR，且必须另给判据说清保留哪一份）」。
- `scripts/check-changelog-growth.js` 的默认 base 是 `HEAD^`：本地手动跑若不加 `--base=origin/main`，在"多个提交一次推"的场景下只比最后一个提交，判据面会窄于 CI。CI 侧显式传 PR base sha，不受影响。
