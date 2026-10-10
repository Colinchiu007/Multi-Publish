---
record: archive-dedup-changelog-history
task: 归档 openspec change dedup-changelog-history，先与实现逐条对账再把台账完整性规格同步进主规格；顺带否证并精确化 Gate 12d 占位场景的旧结论
date: 2026-10-10
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后按 `git log origin/main --grep='(#NNNN)$'` 取证回填
sync_backfill_owner: 本会话（若被压缩则由下一个会话接手本 slug）
---

## 本次执行记录：归档 dedup-changelog-history（archive-dedup-changelog-history，2026-10-10）【docs-only】

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 📝 纯规格/文档变更（`openspec/**` + `CHANGELOG.md`），规模 🌿 中等（M）。仍走隔离工作区而非共享根就地编辑，**原因实测**：共享根本地 main 落后 origin/main **195 个提交**（`git status -sb` 报 `## main...origin/main [behind 195]`），在它上面编辑「归档」会得到错的基础态。`bash scripts/session-init.sh archive-dedup-changelog-history` ⇒ `D:/Data/projects/mp-worktrees/mp-archive-dedup-changelog-history`，裸分支 `archive-dedup-changelog-history`；建区后 `git fetch` + `merge --ff-only` ⇒ `Already up to date`，head == origin/main == `8604d0dd7`（判据用 `git worktree list` 1 命中 + `rev-parse`，不看 rc）。依赖就绪由入口自己跑完（`verify-worktree-deps OK`） |
| docs-only 判定 | PASS | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` ⇒ **`docs-only=true`（files=11）**，全部落在 `CI_IGNORED_PATHS` 内（`CHANGELOG.md` + `openspec/**`）。按 AGENTS.md 该结论**必须在提交后取**，否则会把未入库的工作树状态读成 docs-only=false。CI 侧的对应现场另在合并前从 `QG Changes / Detect docs-only changes` 那一步的输出行核对，不靠「重型 job skipped」反推 |
| 归档前提：逐条对账（本 PR 的价值所在） | PASS | 先证「规格点名的东西真的在」：`scripts/changelog-entries.js` / `check-changelog-growth.js` / `check-changelog-duplicate-entries.js` / `changelog-dedup-reconcile.js` / `changelog-dedup-regen.js` 五个 `git cat-file -e origin/main:<f>` 全 **EXISTS**；两把锁各 `grep -c changelog-entries` = **3/3** ⇒ R1「只有一份实现」成立。再抓到两处**规格落后于实现**的偏差（见下一行）。做法方向：规格服从实现，**默认判据、授权通路代码与额度校核一字未动** |
| 偏差一（判据比规格宽） | 已写回 | 规格原写「`applies_to_base` **等于**本次 merge-base」才走例外。读 `evaluateAuthorization` 原文实证：不相等时还有一条出口——`git merge-base --is-ancestor` 成立 ⇒ 返回 `{granted:true, retired:true}` 并改核「消费后形状」（head 条目数须等于 `expected_entries_after`），非祖先才 fatal。⇒ delta 补同名 Scenario `坐标系被越过（祖先）不叫错位，改核「消费后形状」`，并把判据句改写为「等于**或为其祖先**」 |
| 偏差二（规格缺了已存在的东西） | 已写回 | #3225 退役了常驻授权件并加了**生命周期锁**，delta 完全没有 ⇒ 若不写，主规格会描述一个「授权件可以长期留在仓库」的世界。新增第 4 条 Requirement「一次性授权 MUST 有生命周期，不得作为常驻文件留在仓库」，五条 Scenario：base∧head 才红 / **退役形态必须绿** / **未来合规一次性必须绿** / 改名换位不放行 / 顺手删通路由另一条锁红。两条「必须绿」是刻意的——只写「有就红」的规格会把锁自己的恢复路径钉死，这是 #3225 里 QM-6 前端路抓到的同族教训 |
| 规格规模变化与校验 | PASS | 归档前 delta 实测 `Requirement 3 / Scenario 14`（脚本当场打印 before 值，非记忆），改写后 **4 / 20**，行尾仍均匀 CRLF（`lf_only=0` 断言）；锚点纪律：每个替换锚点命中恰好 1 次否则不动盘。`openspec validate dedup-changelog-history --strict` ⇒ `Change 'dedup-changelog-history' is valid` |
| 归档动作本身 | PASS | `openspec archive dedup-changelog-history -y` ⇒ rc 正常，输出 `changelog-ledger-integrity: create`、`+ 4 added`、`archived as '2026-10-10-dedup-changelog-history'`。产物核对：新主规格 `### Requirement:` **4** 条、`#### Scenario:` **20** 条、`## ADDED Requirements` 头残留 **0**、`TBD` 出现 **0**；归档目录 8 个文件（含 `reviews/` 三份 QM-6 原件）随 move 一起进 archive |
| **否证一条旧结论（Gate 12d 的占位场景）** | 已取证并更正 | 旧记录（#3135 `spec-mirror-gate-archive`）写「那句占位的活体场景仍未构造（**需要一次真正新增能力的 change**）」。本次真的新增了一份主规格，而 `node scripts/check-spec-purpose.js` ⇒ **扫描 153 份主规格，违规 0** ⇒ 该充分条件不成立。**根因实测**：openspec 1.8.0 的 archive 会把 **delta 自带的 `## Purpose` 原样同步**进主规格（本 change 的 delta 在 propose 期就写了 Purpose）。为把「是不是死代码」问到底，在 `%TEMP%` 搭最小 openspec 树做**有界探针**：delta **不带** Purpose 时归档确实写出 `TBD - created by archiving change no-purpose. Update Purpose after archive.`，再以 `require('check-spec-purpose.js').check({root:探针树, minSpecs:0})` 判定 ⇒ `ok:false`，点名 `openspec\\specs\\beta\\spec.md` + `reason:"TBD"` + detail 原句。**更正后的口径**：触发条件是「delta 没写 Purpose」，与「是否新增能力」无关；12d 不是装饰门禁，但其触发面比旧记录描述的窄。探针留在 `D:/tmp/mp-openspec-purpose-probe`（仓库外，不进提交），复现步骤写在下一节。**历史快照不改写**，本行为最新锚点 |
| 未把别人的红认领成自己的 | PASS | `openspec validate --all` 本侧 **173 passed / 7 failed**；用 `git archive origin/main openspec \| tar -x` 在 `%TEMP%` 抽出** pristine 基线**跑同一条命令 ⇒ **同为 173 / 7，失败集合逐条同名**（`collect-video-platforms`、`fix-parity-concurrency-noise-bound`、`fix-scheduled-publish-gaps`、`harden-batch-schedule`、`platform-side-schedule`、`real-machine-scheduled-publish-verification`、`verify-scheduled-publish-completeness`，全是他人未完成的 change）⇒ 本次归档新增失败 **0**。另核对没有任何东西钉住主规格份数：`grep -rl "152 份\|152 个主规格\|=== 152" scripts openspec/specs` 命中 **0**，`DEFAULT_MIN_SPECS = 50` 是下界不是等式 |
| tasks 5.5 纠勾 | PASS | 原句后半「worktree 按 R1–R5 收尾（需用户确认后才动，故本条保持未勾）」按实况勾上：记录声明的 `D:/Data/projects/mp-worktrees/mp-changelog-history-dedup` 在 `git worktree list` **0 命中**且目录 **ABSENT**。**归属如实声明**：该删除不是本会话执行的，勾据是实况而非动作归属。勾后该 change 未勾选项 **0** 条 |
| 变更集与 rename | PASS | `git status --porcelain`：8 个 `D`（旧 change 目录）+ 2 个 `??`（archive 目录、新主规格）——openspec CLI 做的是**文件系统移动**而非 `git mv`，故必须 `git add -A` 让 git 自己判 rename；净变更集对 `origin/main` 应为一组 rename + 1 份新主规格 + 1 篇记录 + CHANGELOG 顶部 28 行（插入行数由脚本断言 `== ENTRY.length`） |
| 防止再次发生 | PASS | 主规格 `changelog-ledger-integrity` 自此成为「台账完整性由哪几把锁持有」的单一规格来源，未来任何清理/退役 PR 的判据都有一条**已对账**的规格可引；并把「存在性锁必须建模 base∧head」这条教训从 AGENTS.md/记忆层面**落到规格层**（Scenario 级），不再只靠口头纪律 |
| TDD 红→绿 | N/A | 纯规格/文档交付，无代码变更；受影响的两把锁与门禁本体是**回归复跑**而非新写（见下面「受影响锁」） |
| 受影响锁 | PASS（全绿，原始输出如实抄录） | ①`node --test scripts/check-changelog-growth.test.js scripts/check-changelog-growth-retire.test.js` ⇒ `tests 37 / pass 37 / fail 0`；②`node --test scripts/check-spec-purpose.test.js` ⇒ `tests 23 / pass 23 / fail 0`（其中含「Purpose 仍是归档器留下的 TBD ⇒ 红，并点名是哪个文件、哪句」与「换措辞的占位（TBD / 待补充 / TODO）同样拦」两条——**这就是本次判 12d 不是死代码的依据**，它自己早有用例，缺的只是仓库内活体现场）；③`node --test scripts/quality-rhythm-spec-mirror.test.js` ⇒ `tests 8 / pass 8 / fail 0`（它镜像的真源是 `openspec-integration/spec.md`，与本次新增的 `changelog-ledger-integrity` 无交集 ⇒ 不触发漂移红，已核对锁内 `LIVE_SPEC` 常量）；④`node scripts/check-unwired-tests.js` ⇒ `检查域内测试文件 71 个 / OK: 全部测试均已接线或按欠账登记`；⑤`node scripts/check-gate-record-debt.js` ⇒ `OK`（本记录走新载体 frontmatter 三字段，**未**往 `scripts/gate-record-debt-ledger.json` 加键）；⑥`node scripts/check-no-brand-residue.js` ⇒ `PASS`（文档里写的是「openspec」「CC Switch」等自有/流程名，无竞品品牌） |
| 行尾与 diff 对账 | PASS | 动手前实测四个受影响文件**行尾均匀 CRLF**（`spec.md 97/97`、`proposal.md 52/52`、`tasks.md 57/57`、`CHANGELOG.md 19080/19080`，`lf_only=0 / loneCR=0 / dblCR=0 / NUL=0`）⇒ 本次 `split('\r\n')/join('\r\n')` 是字节安全的；**这条判据必须先量再动手**，因为本仓 CHANGELOG 历史上是混行尾，统一回写会造出幽灵行。索引侧 `git ls-files --eol` = `i/lf w/crlf attr/text=auto`。提交后（head `dddff0fb1`）对 `origin/main` 跑两口径对照 ⇒ `git diff --numstat` = **267 增 / 2 删**，`git diff --ignore-cr-at-eol --numstat` = **267 增 / 2 删**，**逐字相同** ⇒ 本次没有把任何文件整体改写行尾（rename 计数：8 个文件里 `.openspec.yaml`/`design.md`/三份 `reviews/` 为 `R100` 逐字未变，`proposal.md R078`、delta 规格 `R064`、`tasks.md R094` 就是那三处原地改写） |
| QM-1 打包 / QM-2 代码必检项 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/**`、`packages/rpa-engine/**` 与任何前端文件（`git diff --name-only origin/main` 全部落在 `openspec/**` 与 `CHANGELOG.md`） |
| QM-6 CCG 双模型外部评审 | 视情 | AGENTS.md：纯文档/流程变更**不强制** QM-6。但本 PR 写的是**规范工件**（主规格文本会被后续会话当现状引用），故仍走替代通道复核规格措辞与判据一致性（`codeagent-wrapper` 两路绑 CC Switch `:15721`，本机无监听 ⇒ 沿用 `opencode run --model opencode/<*-free>`，模型名唯一真源 `~/.claude/.ccg/config.toml`）；结论与逐条处置写进 PR 正文，不在这里预填 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin archive-dedup-changelog-history` 返回 0 行证远端分支已删；回填与删除上面三个 `sync_*` 字段必须同一次提交 |

### 探针复现步骤（Gate 12d 触发面，仓库外）

```
mkdir -p <tmp>/openspec/specs/alpha <tmp>/openspec/changes/no-purpose/specs/beta
# alpha 写一份 Purpose 已填好的既有主规格；beta 的 delta 只写 "## ADDED Requirements"，故意不写 "## Purpose"
cd <tmp> && openspec validate no-purpose --strict     # ⇒ valid（CLI 不要求 delta 带 Purpose）
openspec archive no-purpose -y                        # ⇒ 生成的主规格 Purpose == "TBD - created by archiving change no-purpose. …"
node -e "const g=require('<repo>/scripts/check-spec-purpose.js');console.log(g.check({root:'<tmp>',minSpecs:0}))"
# ⇒ { ok:false, bad:[{file:'openspec\\specs\\beta\\spec.md', reason:'TBD', detail:'TBD - …'}] }
```

对照组（本 PR 的真实路径）：delta **带** `## Purpose` ⇒ 归档后 `违规 0`。⇒ 「归档必然造出 TBD」是错的，「delta 不带 Purpose 才造出 TBD」才是实测口径。

### 遗留（不假装已闭合）

- **Gate 12d 的「活体 TBD」在真实仓库里仍未出现过一次**。本次构造的是仓库外探针，不是 PR 现场。若要让它在仓库里真出现一次，得提交一份不带 Purpose 的 delta 并归档——那是**故意留一条违规主规格**，代价大于收益，故不做；改为把探针配方与判据条件写进本记录（可重跑）与主规格对账节。
- `openspec validate --all` 那 7 条失败属他人未完成的 change，本次只证明「不是我引入的」，没有认领修复。
- 归档后 `openspec/changes/archive/2026-10-10-dedup-changelog-history/` 里 `5.5` 的勾是按实况补的；若原执行会话另有口径（例如意图保留该 worktree 以便再跑一次清理），以本条证据为准并提出更正，本记录就是它的现场。
- **归档打破了 4 处路径引用，逐处按性质分类处置（实测 `grep -rna "changes/dedup-changelog-history"`，排除 archive 目录自身）**：
  ① `scripts/changelog-dedup-regen.js:75` 是**活代码**——它把 `openspec/changes/dedup-changelog-history/` 写进生成授权件的 `reason` 字段，归档后该路径失效。
  **本 PR 不顺手改**：改 `scripts/` 会让 PR 从 docs-only 变成混合 PR（完整门禁 + 强制 QM-6），且 AGENTS.md/质量节拍 Step ③ 明令禁止在一个交付里混两类变更。
  已核实这一行是**零风险改动**——`regen.js` 无自己的测试文件，`check-changelog-growth.test.js:154` 只在**注释**里提到该 change 名（不是钉字符串的断言），
  门禁读的也只有 `applies_to_base` / `expected_titles_reduced` / `expected_entries_after` 三个字段 ⇒ 另开一笔一行修（把路径改成 `openspec/changes/archive/2026-10-10-dedup-changelog-history/`）。
  ②③④ 是三处**历史快照**：`.ccg/reviews/retire-auth-maint.json`（#3225 的模型评审原件）、`CHANGELOG.md:1042`（#3059 那次清理的条目，append-only 台账不得改写，改了撞 growth 棘轮）、
  `openspec/records/changelog-history-dedup.md:12/200`（那次执行的记录）——一律**不改写**，本记录即取代它们的最新锚点。
