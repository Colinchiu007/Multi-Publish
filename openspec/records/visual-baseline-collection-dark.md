---
record: visual-baseline-collection-dark
task: 重建过期的暗色像素基线 collection-dark.png（main push 基线新鲜度门禁红 237 px / 0.011%），并把「PR 侧看不见暗档」这一结构性盲区登记在案
date: 2026-10-08
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（本记录所属 PR 号见「远程同步」行，由 `gh pr list --repo Colinchiu007/mulpub --head visual-baseline-collection-dark --json number` 在 PR 创建后当场回读取入，不凭印象填；合并后按 git log origin/main --grep='(#<该号>)$' --format=%H|%cI 取 merge SHA，回填本行并整段删除本 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：重建暗色基线 collection-dark.png（visual-baseline-collection-dark，2026-10-08）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 二进制基线在 `apps/desktop/**` 下 ⇒ 按 AGENTS.md 属**运行时代码域**（不是 docs-only 通道），走隔离 worktree `D:/Data/projects/mp-worktrees/mp-visual-baseline-collection-dark`，裸分支 `visual-baseline-collection-dark`，base `28f9d5143`。建区以产物实证（`git worktree list` 出现该路径 + 分支名），未采信入口 rc（该入口 rc 与副作用不一致是已知坑）。共享根保持 main clean |
| classify-docs-only | PASS（判 false，未借道） | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）⇒ `docs-only=false`，因唯一实体改动是 `apps/desktop/tests/visual-testing/base-screenshots/collection-dark.png`。因此重型门禁照跑，不享受短路 |
| 漂移已归因（重建的前置条件） | PASS | 「漂移未归因禁止重建」是既有纪律，先归因后动手。三条独立证据：① 逐像素严格相等求差集，包围盒 `(232,100)-(484,134)`＝采集页顶部标签条；② 裁图对照，基线是 `内容采集 \| 文案库`、CI 渲染是 `内容采集 \| 文案库 \| 博主监控`；③ `git log` 到基线文件本身 —— `collection.png`（浅）最后由 `6bc65b3be`（#3053）刷新，`collection-dark.png`（暗）最后由 `ed3e41d62`（#2815，2026-10-04）刷新 ⇒ #3053 在自己的 PR 里只重建了浅色那一档。**结论：不是 UI 回归，是同一 PR 的两档基线只交付了一档** |
| 判据可离线复现（修复前/修复后成对） | PASS | 用红 run `37640317864` 的 artifact（`visual-test-reports/tests/visual-testing/screenshots`）当 `--renders`，同一条 `node scripts/check-baseline-freshness.js` 分别指两棵基线树：旧树 ⇒ `检查 41 / 违规 1`，点名 `❌ collection-dark.png 237 px (0.011%) 来源=pixel-gate`，**退出码 1**（与 CI 那行逐字相同）；新树 ⇒ `检查 41 / 违规 0 / CI 无渲染 3 / 本次跳过 0` + `✅ 全部 38 张有渲染的基线逐像素等于本次 CI 渲染`，**退出码 0**。成对跑的意义：证明变红的那条判据确实被本次改动翻转，而不是换了一个更宽的口径 |
| 基线来源合法（QM-4 第 7 条） | PASS | 新基线**逐字节等于** CI artifact 里的 `collection-dark-current.png`（`cp` 自 artifact，未跑过任何本机 `test:visual:update-baseline`）。复用该 artifact 的前提已量过而非假定：`git diff --name-only 92802f8df origin/main` 共 10 个文件、命中 `apps/` 的 **0 个** ⇒ 那次 run 的渲染输入与本 head 逐字节相同 |
| 自证：本 PR head 上的同一次 CI 渲染 | PENDING | 上面那行仍是「新基线 == 它自己那张渲染」的同义反复，跨 run 确定性要由 CI 判：`gh workflow run visual-test.yml --ref visual-baseline-collection-dark` → 该 run 的 `Baseline freshness gate` 必须报 `违规 0`。合并前回填 run id 与现场数字，**不绿不合并** |
| 结构性盲区登记（不在本 PR 顺手改） | 已登记 | `test:visual:pixel:dark` 只存在于 `visual-test.yml`（push main / dispatch），`quality-gate.yml` 的 `visual` job 只跑浅色 ⇒ Gate 7b 在 PR 侧拿不到暗档渲染，`--partial` 把它记进 `skipped` 后照常放行。**暗色基线的漂移在 PR 上永远不可判**，只能等 main push 才红（本次正是这条路径）。补齐需 PR 侧多跑一遍暗色像素套（同一次 Vite，约 +2–3 min），属**门禁改动 ⇒ 需人工过目**，本 PR 不改，只在 `docs/visual-capture-settle-and-attribution.md` §9.3 登记 |
| QM-5 五步（本条按「基线数据缺陷」裁剪） | PASS | ① 第一性引入点＝`6bc65b3be`（#3053）改了 `Collection.vue` 的标签条却未重建暗档基线；② 逃逸链：像素套浅色 6% 全页容差对 0.011% 失明 + PR 侧根本不产暗档渲染 + 唯一说话的新鲜度门禁只在 push main 才跑 ⇒ 三层同时漏过；③ 系统性漏洞＝**采集面与判定面不同源**（判定域含 19 张暗档，PR 采集面只产浅色），具体文件 `.github/workflows/quality-gate.yml` 的 `visual` job；④ 回归保护＝新鲜度门禁本身即锁（本记录已做 BEFORE rc=1 / AFTER rc=0 成对反证）；⑤ 预防措施＝`docs/visual-capture-settle-and-attribution.md` 新增 §9（含「pixelmatch 输出图不能定位 bbox」这条度量口径）+ 本记录把盲区点名到文件 |
| 行尾与 diff 对账 | PASS | 追加 §9 前实测目标文档行尾基线：`docs/visual-capture-settle-and-attribution.md` = crlf 393 / lf-only 0；`CHANGELOG.md` = crlf 18210 / lf-only 0；既有 `openspec/records/*.md` = 全 CRLF。因此新增内容一律按 `\r\n` 落盘（脚本转换），**未做任何"统一行尾"操作**。提交后 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐文件对账，现场见下一行 |
| 品牌残留 | PASS | `node scripts/check-no-brand-residue.js` 结果回填于「本地门禁汇总」行 |
| 本地门禁汇总 | PASS（提交 `28f1fbce4` 后实跑） | `classify-docs-only --base=origin/main --head=HEAD` ⇒ `docs-only=false / files=4`（未借道，重型门禁照跑）；`check-no-brand-residue.js` ⇒ `PASS（扫描 7251 个 tracked 文件，无品牌残留；已豁免第三方签名服务域名）`；`check-pr-exec-record.js --base=origin/main --mode=enforce` ⇒ `OK: 本 PR 携带执行记录或带原因的豁免`（现场 `变更文件 4 个（A=1 M=3 D=0）｜新增记录 1 篇`）；`check-gate-record-debt.js` ⇒ 顶部 `OK`，计数行 `远程同步行 251 条 / 执行记录 453 篇 / 已登记欠账 8 条 / 记录文件 95 篇`（本篇计入 95，未新增未登记欠账、未建 ledger 键）；`.github/scripts/check-max-lines.js` ⇒ `limit=500 growthAllowance=200 超限文件=98 挂账=98 墓碑=1 ✅ 无新增超大文件，挂账清单与现实一致`；`check-changelog-duplicate-entries.js` ⇒ `冗余份数 0 -> 0；本 PR 新增副本=0`；`check-changelog-growth.js` ⇒ `PASS：base 353 条（353 种标题）全部在 head 354 条（354 种）里，字节 2105073 -> 2108008`；`check-docs-sync.sh` ⇒ `✅ 文档同步检查通过！代码变更已同步更新文档`。eslint **未跑**：本 PR 零 JS 文件改动（`git diff --name-only` 只有 1 张 PNG + 3 份 md）。行尾两口径 `git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件完全相同**（`22/0`、`75/0`、`37/0`，PNG 为 `- -`）⇒ 无幽灵行 |
| 一处取证脚本口径（既有，非本 PR 引入） | 已登记 | `bash scripts/check-docs-sync.sh --base=origin/main --head=HEAD` 会在脚本内部再拼一次前缀，变成 `fetching origin/origin/main` ⇒ `fatal: couldn't find remote ref refs/heads/origin/main`。正解是 `--base=main`；本记录用的是本地 `main`（`cbce32541`，比 `origin/main` 落后 4 个提交），因此变更清单**偏宽**仍通过。该坑已在项目记忆里，本轮再次现场命中，如实留痕，不在本 PR 修脚本（改校验脚本属混合 PR 域） |
| QM-1 打包 | N/A | 触发条件是改 `apps/desktop/electron/**` 或 `packages/rpa-engine/**`；本 PR 零 JS 改动，唯一实体改动是一张 `tests/visual-testing/base-screenshots/*.png`，不进 asar 参与路径（`files` 数组不含 tests） |
| QM-2 代码必检项 | N/A | 零代码行变更（无 require/IPC/preload/模板改动） |
| QM-4 视觉 | PASS（判据在 CI，不在本机） | 本 PR 就是视觉基线本身。按 AGENTS.md「视觉中性结论只在 QG Visual（CI）成立时才算数」，**未把本机像素跑当证据**：本机渲染与 CI 渲染本就不同源（这正是本 PR 修的东西），拿本机图判本机图无意义。CI 侧证据＝「自证」行那条 dispatch |
| TDD | N/A | 无新增逻辑；判据已由 `scripts/check-baseline-freshness.js` 与其测试（CI 里 `node --test scripts/check-baseline-freshness.test.js`）持有 |
| QM-6 CCG 双模型外部评审 | N/A（判定过程如实登记） | 触发条件是 M+/中高风险运行时逻辑。本 PR 是**一张二进制基线 + 文档**，零逻辑分支；风险面是「这张图该不该换」，而该问题已由 BEFORE/AFTER 成对判据 + 三条件归因闭合，外部模型拿不到比这更多的信息。跨模型评审留给 §9.3 那条真正需要人过目的门禁改动 |
| 远程同步 | PENDING | 本条自己的欠账：PR 号在 `gh pr create` 之后由 `gh pr list --head visual-baseline-collection-dark --json number` 回读并填入本行（**不凭印象写号**）。合并后由回填 PR 改写为 PASS + merge SHA（取证：`git log origin/main --grep='(#<该号>)$' --format=%H\|%cI` + `git ls-remote --heads origin visual-baseline-collection-dark` 为 0 行），并**同一次提交**删除本 frontmatter 的三个 `sync_*` 字段；新载体不在 `gate-record-debt-ledger.json` 建键（建了会报「陈旧登记」） |

## 明确留在场上的边界（不假装已闭合）

1. **只有一张图被重建**。本 PR 让全 41 张基线在那次渲染下 0 违规，但「其它 40 张在**未来**某次 UI 变更后是否也会被漏掉暗档」没被修 —— 那是 §9.3 那条门禁改动，不在本 PR。
2. **跨 run 确定性仍是假设**，只是这次由 CI 判（「自证」行）。若该 dispatch 报非 0，说明暗档采集本身不可复现，本 PR 不得合并，须回到归因而非重建。
3. **`CI 无渲染 3 张`** 是既有 `KNOWN_UNCOVERED`（`settings-general` / `login-form` / `analytics-overview`，仅 autonomous-loop 管线引用），本 PR 未触碰、未扩大。
4. 本记录里的 run id / PR 号 / merge SHA 均在**动作发生后**回读取入；「本地门禁汇总」「自证」「远程同步」三行在收口前是 PENDING，读到 PENDING 就是没做完。
