## 1. 条目模型单一实现

- [x] 1.1 新增 `scripts/changelog-entries.js`：`HEADING_RE`（canonical，逐字取自 growth）、`isEntryHeading`、`splitEntries`、`groupByTitle`、`pickKeeper`、`countByTitle`、`dedupe`；`.gitignore` 补 `!scripts/changelog-entries.js` 反选
- [x] 1.2 `scripts/check-changelog-growth.js` 改为 require 共享模型，删除本地重复实现；对外导出面保持不变（`FILE/HEADING_RE/collect/compareMultisets/headingsOf/readBlobText/main`）以免动 owner 的断言
- [x] 1.3 `scripts/check-changelog-duplicate-entries.js` 改为 require 共享模型，条目域由 `# [未发布]` 收敛到 canonical（实测 1,158 → 1,184）
- [x] 1.4 实跑两把锁的全部既有测试（11 + 14 条）；若因域收敛变红，**按实测改正实现或夹具，禁止改期望值让它过**

## 2. 授权例外（默认关闭）

- [x] 2.1 定义 `scripts/changelog-dedup-authorization.json` 的字段：`applies_to_base`、`reason`、`owner_pr`、`expected_titles_reduced`、`expected_entries_after`
- [x] 2.2 growth 内实现例外判据四条件（恰好 1 份 / 保留块逐字节等价 / distinct 标题全包含 / 生效必出声），并在 `main()` 输出里写明「例外由授权触发」
- [x] 2.3 授权文件必须**相对 base 新增**：base 已含同名文件 ⇒ 例外不生效（防后续 PR 白蹭）
- [x] 2.4 `applies_to_base` 与本次 merge-base 不等 ⇒ 例外不生效且报红（坐标系错位是本仓反复踩过的形态）
- [x] 2.5 授权 JSON 不可解析 / 缺字段 / 期望数与实际不符 ⇒ fail-closed rc=1，不得退化成"没授权"而静默通过

## 3. 测试先行（TDD）

- [x] 3.1 老断言零改动验证：无授权文件时，`真仓库四档…副本删一份=红` 等 11 条必须原样全绿
- [x] 3.2 新增行为锁：授权 + 三合取成立 ⇒ rc=0
- [x] 3.3 负控四组各红一条：少一个 distinct 标题 / 保留块被改写过 / 某标题削到 2 份 / `applies_to_base` 不符
- [x] 3.4 新增「base 已含授权文件 ⇒ 例外不生效」与「授权 JSON 坏 ⇒ rc=1」两条
- [x] 3.5 共享模型锁：同一份 blob 上两把锁的条目总数必须相等（把 1,158≠1,184 这次分裂钉成回归）
- [x] 3.6 变异反证（逐条「基线全绿 → 变异 → 指定文件变红 → 逐字节还原」）：摘掉 distinct 包含判据、摘掉逐字节等价判据、把「相对 base 新增」改成「存在即生效」、把出声打印改成静默

## 4. 执行清理与无损对账

- [x] 4.1 落授权文件，跑 `--dedup --apply`
- [x] 4.2 独立回读对账（不复用去重脚本自己的结论）：~~diff 新增行数 == 0~~ **该判据本身是错的，已按实测改正** —— 去重会把幸存块挪到"该标题首次出现的槽位"，行级 diff 实测 `+133 / −47,929`（其中 28 行是本 PR 那条台账），"纯删除"这一句被独立对账器判红后撤回（见记录 F-A 行）。实际守住的不变量是**块级**：每个保留块逐字节等于 merge-base 同标题的某一块（raw 字节，非 CR 归一）∧ 留下的就是 `pickKeeper` 选的那份 ∧ base 的 346 种标题一个不少 ∧ head 每标题恰好一块；行数/条目数当场打印，**head 字节数不写进任何会被本 PR 改写的文件**（写下去就因这次写下而失效）
- [x] 4.3 `--dedup` 再跑一次必须 `removed=0`（幂等）；两把锁对新 merge-base 复跑均 rc=0

## 5. 交付

- [x] 5.1 写 `openspec/records/changelog-history-dedup.md`（含 QM-5 五步、QM-6 处置、frontmatter 登记 `sync_*`）
- [x] 5.2 QM-6 双模型外部评审（>200 行 ⇒ 判定器定档 `dual`）；Critical 必修，Warning 逐条处置
- [x] 5.3 `openspec validate --strict` 通过；`check-docs-sync` / `check-gate-record-debt` / `check-pr-exec-record` / `check-unwired-tests` / `check-step-failfast` / `classify-docs-only` 本地全绿 —— 2026-10-07 在本 worktree 逐条实跑：`validate` 输出 `Change 'dedup-changelog-history' is valid`；`docs-sync` 输出「仅文档/流程变更，无需额外同步」；`gate-record-debt` 输出「远程同步行 248 条 / 已登记欠账 9 条 … OK」；`pr-exec-record` 输出「本 PR 变更文件 19 个（A=13 M=6）… OK」；`unwired-tests`「检查域内测试文件 64 个 … OK」；`step-failfast`「含 ≥2 条测试命令的 run 步骤：6 个 … OK」；`classify-docs-only` **docs-only=false**（files=19，混合 PR，按完整门禁走，不借道）
- [x] 5.4 PR → CI 全绿 → 按 AGENTS.md 判据自动 squash 合并 → 同一次提交回填远程同步并删 `sync_*` —— 2026-10-09 按 main 实况纠勾：merge SHA `88669579b`（`git log origin/main --grep='(#3059)$' --format=%H|%cI` ⇒ `88669579b…|2026-10-07T18:24:58+08:00`）；`openspec/records/changelog-history-dedup.md` 的「远程同步」行为 `PASS` 且 frontmatter `sync_*` 残留 **0** 条（即回填与销账确实同一次发生）
- [x] 5.5 在 #3037 记录最终口径（含「17,891 行是窄口径、canonical 口径需重测」的更正）—— **这半已做**：#3037 第 4 条评论（2026-10-07T08:19:17Z）按最终 merge-base `6fb99307b` 实测写清 `1,187 条 / 346 种 / 冗余 841 → 347 / 347`，并声明本 PR **不改** owner 的两条断言、以及 12 种异构标题副本的遗留。**未做的那半**：worktree 按 R1–R5 收尾（需用户确认后才动，故本条保持未勾）。**本轮（2026-10-10）按实况补做第二半并纠勾**：worktree 收尾条件已成立——`git worktree list` 对 `D:/Data/projects/mp-worktrees/mp-changelog-history-dedup` **0 命中**，且该目录 **不存在**（`[ -d ]` 判 False）。如实声明：这不是本会话执行的删除（由原执行会话或清理轮完成），本条勾选的依据是**实况**而非动作归属。

> 实跑偏差记录：3.6 的「反证驱动」首版因取失败用例名的正则被空格截断，把 M1/M3/M4 误报成"没打中"；
> 改正取名方式后重跑，七条全部 PASS（结果与教训记在 openspec/records/changelog-history-dedup.md）。
> 1.3 落地后条目域由 1,158 收敛为 canonical（坐标系以授权文件的 `applies_to_base` 为准，合并前最后一次钉 `06073943b`，当场实测 canonical **1,188** / 前缀口径 **1,158**，差 30 条；开发期间还读过 `cbce32541`=1,185 与 `6fb99307b`=1,187，均为漂移读数），故 4.2 的行数以重测为准，未沿用 proposal 初稿里的窄口径数字。**本轮实测还抓到一条现场证据**：main 合进来的 `# [unreleased] gate(docs): …Gate 12c…`（小写 `[unreleased]`）对前缀口径完全隐身 —— 分裂不是历史洁癖，正在产生新盲区。

## 收尾（2026-10-08，retire-changelog-dedup-auth）

- [x] 授权已在 88669579 消费完毕（841 份副本清理，269 个多副本标题各剩 1 份）
- [x] 授权文件保留在 main 上作为登记证；坐标系随 base 前进而退休
- [x] 退休条款由 openspec change: retire-changelog-dedup-auth 落地（evaluateAuthorization 新增已消费退休分支，祖先成立且形状匹配时放行）

## 6. 收尾：授权件的生命周期结束（2026-10-09）

- 本 change 的一次性书面授权 `scripts/changelog-dedup-authorization.json`（随 `88669579` 落库）**已随清理完成而作废**，
  并由 `retire-dedup-auth-file` 这次改动从仓库删除。**授权通路本体与默认判据一字未动**：未来确需再清一次历史副本时，
  由 `scripts/changelog-dedup-regen.js` 在**同一个清理 PR** 里现生成一份（base 无、head 有 ⇒ 通路成立），用完随该 PR 一起消失。
- 加了一条**生命周期锁**防它重新变成常驻文件：`check-changelog-growth.test.js` 末尾的「一次性去重授权不得作为常驻文件留在仓库里」，
  外加配对的结构锁「退的是授权件不是通路」——断言 `AUTH_PATH` 字面量、`regen.regenerate`、`evaluateAuthorization`、`checkDedupShape`
  四样都还在，防止有人为了消除红而把通路整个删掉。两条反证已实测：把文件放回 ⇒ 前者红；改路径字面量 ⇒ 后者红；还原后全绿。
- 本 change 的 `5.5` 仍**保持未勾**：那半是「worktree 按 R1–R5 收尾」，归属其原执行会话，不由本次改动代勾。
