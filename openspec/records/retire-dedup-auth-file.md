---
record: retire-dedup-auth-file
task: 删除已消费的一次性 CHANGELOG 去重授权文件并加生命周期锁；把 retire-changelog-dedup-auth 的 artifacts 对齐实际落地形态后归档
date: 2026-10-09
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后按 `git log origin/main --grep='(#NNNN)$'` 取证回填
sync_backfill_owner: 本会话（若被压缩则由下一个会话接手本 slug）
---

## 本次执行记录：退役已消费的一次性去重授权（retire-dedup-auth-file，2026-10-09）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 混合 PR（`scripts/**` 测试 + 删除 `scripts/*.json` + `openspec/**` + CHANGELOG），按 AGENTS.md 必须在隔离工作区：worktree `D:/Data/projects/mp-worktrees/mp-retire-dedup-auth-file`、裸分支 `retire-dedup-auth-file`、base `0cee85597`；建区后立即 `git rev-list --count HEAD..origin/main` = **0**（防"从滞后 origin/main 建分支"） |
| 第一性原因（QM-5 ①） | 已定位 | 授权件 `scripts/changelog-dedup-authorization.json` 随清理 PR #3059（`88669579`，2026-10-07T18:24:58+08:00）落库后**没人退**。追溯该文件引入意图：它只为那一次清理服务（`applies_to_base=23822b73`、`expected_entries_after=349`）；后续 #3151（merge `a3565726`）落地了「祖先坐标系即已消费」的退休判据，但**同样没有删这份文件**，也没有回填它所属 change 的 tasks —— 于是留下"一次性授权常驻"的语义残留 |
| 逃逸分析（QM-5 ②） | 逐层给因 | ①单元层：`check-changelog-growth.test.js` 与 `...-retire.test.js` 全部用**内联夹具**喂授权内容（`AUTH_CLEAN` 字符串），从不读磁盘上那个真文件 ⇒ 文件在不在仓库里对测试不可见；②门禁层：门禁本体也是经 `readBlobOrNullText(runGit, <sha>, AUTH_PATH)` 读 **git blob**，不是 `fs.existsSync` ⇒ 常驻与非常驻对它同形；③CI 层：无步骤检查"仓库里不该有活动授权"；④记录层：#3151 的执行记录只写了它实现的退休分支，未写"授权件仍未退"；⑤审查层：`grep -c changelog-dedup-authorization` 在 `scripts/` 有 4 处命中（真源常量 + regen 写点 + 测试夹具字符串），看起来"机制还在用"，实际那个数据文件已无人引用。**结论**：这类"数据文件的生命周期"没有任何东西在看，属测试场景缺失 + 审查盲区 |
| 系统性漏洞（QM-5 ③） | 具体到文件 | `scripts/check-changelog-growth.test.js`（现 518 行，35 条断言）里**没有**一条断言"授权件不得常驻"，也没有一条断言"通路仍完整"——所以"删文件"和"顺手删通路"这两种相反的错误改法在当时都不会变红 |
| 修复 + 回归保护（QM-5 ④） | PASS | ①`git rm scripts/changelog-dedup-authorization.json`。②新增锁 1「一次性去重授权的生命周期：不得在已落 main 的情况下继续被携带」——判据是 **base 与 head 同时成立**，不是「任何地方有就红」：`base 有 + head 有 ⇒ 红`（已落 main 还被继续携带 = 常驻未退）、`base 无 + head 有 ⇒ 绿`（合法的一次性新增，豁免通路照旧可用）、`base 有 + head 无 ⇒ 绿`（本 PR 这种"退役 PR"形态）、`head 有但不在 AUTH_PATH ⇒ 红`（改名/换位这两种逃法）。base 坐标系可用 `MP_CHANGELOG_BASE_REF` 注入（反证与本地复现靠它），算不出即红（fail closed，不得读成「没有 base」放行）；两份清单各有 `> 1000` 的规模下界断言，防"清单解析退化成空集合"把锁变恒真。③新增锁 2「退的是授权件不是通路」（`AUTH_PATH` 字面量未改名 + `regen.regenerate` 是函数 + `regen.AUTH_PATH === AUTH_PATH` + `evaluateAuthorization`/`checkDedupShape` 仍在）。**默认判据与授权通路代码一字未动**，既有 30 条断言一字未动（实测：单文件 30→32；两文件合计 35→37；changelog 族三文件合跑 **56 pass / 0 fail**） |
| 防止再次发生（QM-5 ⑤） | PASS | 锁 1 就是防再犯机制本身（常驻即红），落点在**已接线**的测试文件内（不新增测试文件 ⇒ 不触发 `check-unwired-tests` 的接线义务）；`dedup-changelog-history/tasks.md` 新增「## 6. 收尾：授权件的生命周期结束」写明未来正确做法（同一清理 PR 内用 `changelog-dedup-regen.js` 现生成、用完随 PR 消失） |
| TDD 红→绿 | PASS | 先写锁 1 → 实跑 `node --test scripts/check-changelog-growth.test.js` ⇒ **31 pass / 1 fail**（红在该用例，非别处）；`git rm` 后再跑两文件 ⇒ **37 pass / 0 fail** |
| 变异反证（分两阶段，全实测） | PASS |阶段一（无条件存在性断言版本）：M1 把授权件按 `origin/main` 原字节放回工作树⇒锁点名红；M2 把 `check-changelog-growth.js` 的 `AUTH_PATH` 字面量改成 `-v2.json`⇒锁 2 点名红；M3 把它挪到 `01-docs/`、`scripts/store/` 两个不同目录并 `git add`⇒加强后的锁两次都点名红。三轮均断言索引指纹（`git ls-files -s`）与 `git status --porcelain` 与反证前**逐字相同**、还原后全绿。阶段二（QM-6 前端路指出生死矛盾后，改成 base∧head 判据并重做四条边界，`BAD_COUNT=0`）：`P0_retirement_form_green`（本 PR 现状 base有/head无 ⇒ 绿）、`P1_permanent_carrying_is_red`（base有 + head也带 ⇒ 红）、`P2_legit_one_time_is_green`（base 取清理前的 `23822b73fecc` + head 带规范路径 ⇒ **绿**，这一条正是旧锁做不到的）、`P3_relocated_is_red`（同一 base + head 只有 `01-docs/` 版本 ⇒ 红）、`P4_unresolvable_base_fails_closed`（base 给一个不存在的 ref ⇒ 红）、`INDEX_RESTORED` / `WORKTREE_RESTORED` / `FINAL_GREEN_ON_REAL_STATE` 三项均 true |
| openspec 对账 | PASS | `retire-changelog-dedup-auth` 的 3b 设计**从未实施**：实际由 #3151 落地"祖先即已消费"判据。本次把这段现实写回 change（proposal 顶部新增「实际落地对账」节，tasks 顶部新增「处置对账」表，逐条标明 1.x/2.x 以何形态落地、3.1/3.2/4.1/4.2/5.x 由本 PR 完成，并保留两条真遗留：原 5.3 的 #3076 坐标复放改判为不适用、3b 不该实现）。归档用 **`git mv`** 而非 `openspec archive` —— 后者会应用该 delta 并写出仓库中并不存在的判据；核对 `git diff --cached --name-only` 中 `openspec/specs/` 命中 **0** |
| 否证的两条本 change 原前提 | 已写进 change | ①「清理合入后所有早分叉 PR 卡死」不成立：实测 #2992（10-06 开，早于清理）**8 pass / 11 skipping / 0 fail**，因为默认判据卡的是**标题丢失**而清理保留了每个标题一份；②「授权机制从落库起锁死 main」措辞过强：真实后果是语义残留，且它声明的 `expected_entries_after=349` 与今天 main 台账 **365** 条（门禁 `HEADING_RE` 口径；`grep -c "^# "` 会粗数出 369，因为文件里有 4 处 `# CHANGELOG` 标题不是条目——本行最初就抄了这个粗数，已由 `check-changelog-growth.js` 现场输出纠正：base 365 条 / 365 种，head 366 条 / 366 种）已不可能重合 |
| 接线棘轮 / 记录债 | PASS | 未新增测试文件、未改 workflow ⇒ `check-unwired-tests` 域不变；本记录走新载体（frontmatter 三字段），**不往 `scripts/gate-record-debt-ledger.json` 加键** |
| 行尾与 diff 对账 | PASS | 动手前 `git ls-files --eol` 实测受影响文件均 `i/lf w/crlf attr/text=auto`（索引是 LF，工作副本 CRLF 由 checkout 转换，所以写入 LF 行是安全方向）。两口径对照**逐个提交都做了**：主提交 `git diff --numstat HEAD~1 HEAD` 与 `--ignore-cr-eol` 版 md5 相同（`f5b25d913d8d…`，11 文件 20/0+22/1+58/0+11/1+34/0+22/0+0/7+0/36 等）；口径纠正提交同样相同（`ee08a022e50f…`，3 files changed, 3 insertions(+), 3 deletions(-)）。删除数归因：`0/7` 是被删的授权文件本身、`0/36` 是 tasks.md 被 git 判为"删除+新建"的旧位置（rename 相似度 69%/77% 那两条），**没有任何既有行为行被改写** |
| QM-6 CCG 双模型外部评审 | PASS（替代通道，两路不同底模，共 17 条发现） |后端 `opencode/nemotron-3-ultra-free` ⇒ `.ccg/reviews/retire-auth-logic.json`：Critical 0 / Warning 1 / Info 3。前端 `opencode/ling-3.1-flash-free` ⇒ `.ccg/reviews/retire-auth-maint.json`：**MAJOR 4 / MINOR 9**（它用的是自己的词表，不是我给的字面量，按其定义 MAJOR≈必修）。**四条 MAJOR 全部成立并已处置**：① 锁 1 原本是无条件存在性断言 ⇒ 它把自己的恢复路径锁死：未来任何"同一清理 PR 现生成一份授权"的合法用法都会在 `Gate 2c3` 与锁同步红的同一步骤里变红，即**通路代码还在但流程层已死**，且锁自己的提示语推荐的正是它会打红的操作。处置＝改成 base∧head 判据（见上面两行）+ P0-P4 五条边界实测；② CHANGELOG「一次性豁免通路仍然完整」在 ① 未修前是失实声明 ⇒ 已改成带条件的可核措辞（写明只禁哪种形态、并指向本记录）；③④ 归档的 `design.md` 与 `specs/changelog-growth-retirement/spec.md` 是 100% 原样搬迁、没带对账横幅，而 openspec 语义里「归档即已实施」⇒下个会话会把从未实施的 3b 当现状规格引用（且它的触发条件与实际实现**正好相反**）。处置＝两份文件顶部各加同款横幅，指向真实落地的祖先判据位置与回归锁。后端那两条 Info 是对本记录结论的**独立印证**（门禁读 git blob 不读工作树 ⇒ 删文件零运行时影响；`evaluateAuthorization` 里只有祖先判据、不存在按形状放行的代码路径）。后端第 4 条 Info 说我记录里的测试计数有偏差：核对后**它对了一半**——实测单文件 30→32、两文件 35→37、三文件 56，我误写「32→34」已改；它自己估的「约 40 条」未实跑，不作为依据。**通道局限**：两路同经 opencode harness（原 harness 依赖的 CC Switch `:15721` 本机仍无监听），跨家族独立性打折。
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/**`、`packages/rpa-engine/**` 与任何前端文件 |
| 合并纪律 | 适用 | 本 PR 属 AGENTS.md「改谁守门」范畴 ⇒ **不自动合并**，CI 全绿后停在这里等用户过目 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin retire-dedup-auth-file` 返回 0 行证远端分支已删；回填与删除上述三个 `sync_*` 字段必须同一次提交 |

### 遗留（不假装已闭合）

- **3b 那套"两侧都无授权文件时按清理前后形状放行"的判据未实现，也不该实现**：它放宽门禁，而它想救的死锁已被祖先坐标系判据与 re-sync 双重解决。若将来真要再清一次，正解是那次清理自带一份新生成的授权件。
- `dedup-changelog-history` 的 `5.5`（worktree 按 R1–R5 收尾）仍**未勾且真未做**，归属其原执行会话。
- 本 change 归档后，`openspec/changes/` 仍有 23 个未归档目录；其中 `dedup-changelog-history` 的 delta 能力 `changelog-ledger-integrity` **尚未进主规格**（`openspec/specs/` 下无 changelog 规格），归档它会新建规格文件并触发 `TBD - created by archiving change …` 那句占位——那正是 Gate 12d 至今没取到活体现场的场景，需单独一次带 Purpose 手填的交付来做，不塞进本 PR。
