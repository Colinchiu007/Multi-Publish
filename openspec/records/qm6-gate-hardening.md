---
record: qm6-gate-hardening
task: 把 QM-6 评审对三个已合并门禁 PR 的 7 条发现的处置，作为一个后续 PR 落地
date: 2026-10-05
---

## 本次执行记录：QM-6 三条门禁 PR 的后续加固（qm6-gate-hardening，2026-10-05）

> **这个 PR 的存在本身就是一条要如实记的现场**：它承载的三个修复，原本写在 #2901 / #2904 / #2905
> 各自的 PR 分支上，但那三个 PR 在我推送之前被 auto-merge 收走了。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | 运行时代码（门禁脚本 + CI workflow + 依赖安全用例） | worktree `D:/Data/projects/mp-worktrees/mp-qm6-gate-hardening`，裸分支 `qm6-gate-hardening`，base `1c98294a8`（= 当前 origin/main，即 #2901 的 squash 落地提交）。三连实证 toplevel / branch / head 全对，`matches-base=True`。依赖就绪：`pnpm install --frozen-lockfile` rc=0（21.3s）+ `verify-worktree-deps.js` rc=0（消费方解析通过 11 项） |
| 为什么另开一个 PR（实测，不是推测） | 竞态败给了 main | 三个源 PR 的合并时刻与我的提交时刻：#2904 merged `a565e0f8d` @03:55:05Z（我的提交 04:03:27Z）、#2905 merged `2296c869b` @04:01:31Z（提交 03:51Z 但未推送）、#2901 merged `1c98294a8` @04:01:34Z（提交 03:39Z 但未推送）。**判据不看时刻表，看 main 的内容**：`git show origin/main:scripts/check-changelog-growth.js` 仍是 `HEADING_RE = /^# \[/`；`git show origin/main:scripts/check-dep-audit.js` 里 `PARSERS` 出现 **0** 次；`origin/main` 的 `production-dependency-security.test.js` 里 `hasUpperBound` 出现 **0** 次 ⇒ 三条修复都不在 main。这正是记忆里那条量化过的赛跑：**代码 PR 的 CI 25–30 分钟 ≥ main 前进间隔**，"改完再推"在 auto-merge 已武装时不成立 |
| 承载内容 | 3 个 cherry-pick，文件面互不相交 | `1ab80ccdc`（#2901 后续：HEADING_RE 形状 + CI 坐标系）/ `5696d232e`（#2905 后续：override 有界写法单一真源）/ `05f8281d1→1550e63a7`（#2904 后续：解析器显式映射 + 多段 patched 逐段判 + 三条 Info）。三次 `cherry-pick` 全 rc=0 无冲突（源分支的父提交内容与 squash 进 main 的内容一致 ⇒ diff 可平移），落盘后逐文件核对四处修复都在工作树里（`contains[(?!CHANGELOG]` / `contains[git merge-base]` / `contains[const PARSERS = {]` / `contains[function hasUpperBound]` 全 True） |
| QM-6 通道实况（本 PR 的来由） | 部分执行：三路两败一成 | `codeagent-wrapper --backend codex` rc=0 但只有一句中间话、**无 findings 产物**；`--backend claude` 报 `completed without agent_message output` rc=1；**替代通道 `opencode run --model opencode/*-free` 产出真产物**（7 条：0 Critical / 4 Warning / 3 Info，`.qm6-findings-fe2.json`，评审 diff 绑到我三个 PR 的合并 diff）。回声核验：评审用语在我发出的 prompt 与其喂入的 diff 里 `grep -c` 均 0（仅 `自相矛盾`、`两域齐全` 各 1 次命中，且命中的是被审代码自身的注释文本）⇒ 判为评审方产出。**收口判据**：评审 CLI rc=0 不算跑过，判据是 findings 落盘或自身 stdout 有正文 |
| 7 条发现的处置去向 | 逐条实测成立，全部有落点 | **① #2901 HEADING_RE 只认 `# [`（Warning，活盲区）** → `1ab80ccdc`；**② #2905 文案推荐 `~` 而判据只认 `^`（Warning，活互斥）** → `5696d232e`；**③ #2904 解析器 else 兜底（Warning）** → `1550e63a7`；**④ #2904 多段 patched 只比第一段（Warning）** → `1550e63a7`；**⑤⑥⑦ 三条 Info**（「两域」注释、测试里同条件重复断言、绿文不披露 `--omit=dev`）→ `1550e63a7`。七条**无一条被驳回**，也无一条"评估后不改"——改不了的都没有：四条 Warning 里两条是活的、两条是潜在的（潜在那两条的实测现状写在各源记录里：基线 25 条里多段 patched **0 条**） |
| 更正已合并记录里的一句过时陈述 | 本 PR 内完成 | main 上的三份记录（`openspec/records/{changelog-growth-gate,dep-audit-opscenter-domain,undici-fasturi-bounded}.md`）都写着 **QM-6「未执行」** —— 那是推送早于评审产物落盘的分支内容，写的时候为真，合并时已不为真。本 PR 把三份记录的 QM-6 行改为「部分执行 + 7 条 + 逐条处置」，并各自补上本轮新增的反证档数与用例数。⛔ **不改写已合并的 CHANGELOG 条目**（那是历史事实快照），改的是记录文件的实况陈述，且以"取代"而非"抹除"的写法：保留通道失败那两路的原始描述 |
| 反证（每条新判据都能红且可归因） | 已实跑，逐档核对 | #2901 侧：TDD 先红（新 2 例在旧实现下 **2 红 8 绿 rc=1**）→ 改后 **11/11**；接线锁 4 档 M1/M2 变红且红在「CI 接线锁」、M1b/M2b 摘掉对应断言后**回绿**（证明红来自那两条而不是别的断言顺带）。#2905 侧：M1（判据退回只认 `^`）/ M2（调用点退回内联正则）/ M3（文案退回硬写 `^/~`）三档各命中预期的那条锁，`hits=1 mutated=true bytes 前后` 逐档打印。#2904 侧：R1（只取第一个上界）/ R2（只比第一段）/ R3（else 兜底 + 去掉校验，**两刀一起**以免崩成 TypeError 那种红得不可归因）/ R4（绿文不披露）四档全命中。**十一次变异结束后各自按字节还原，`restored=true` 全真** |
| 消费者并集（不是"我改过的文件"） | 已按规则跑 | 被改模块的测试并集 = `check-changelog-growth.test.js` + `check-dep-audit.test.js`（37 例，rc=0）；`quality-gate.yml` 的真实读者另跑 `workflow-contract` / `autonomous-loop-workflow` / `check-asar-test-files` / `classify-ci-failure` / `check-pr-exec-record` / `check-test-egress-ledger` / `classify-docs-only`（在 #2901 那一刀处 175/175）；api-publish-engine 侧 `pnpm --filter @multi-publish/api-publish-engine test` **290 passed**，且新 7 例的**用例名逐条出现在 runner 通过清单里**（不是"文件存在"） |
| 真仓实跑 | ✅ | `node scripts/check-changelog-growth.js --base=<merge-base> --head=HEAD` ⇒ **PASS，base 1148 条（307 种标题）= head 1148 条**。这个 1148 本身就是形状判据生效的证据（旧判据读 1140）。`node scripts/check-dep-audit.js` ⇒ rc=0，分布 `npm=24 npm-opscenter=0 pip=0 命中=24 挂账=25`，绿文含 prod 口径披露 |
| 静态门禁组合 | ✅ | `check-max-lines` rc=0（超限=98 挂账=98，无新增超大文件）/ `check-no-brand-residue` rc=0（6833 个 tracked 文件）/ `check-unwired-tests` rc=0 / `check-step-failfast` rc=0（4 个多测试步骤全 fail-fast）/ `check-gate-record-debt` rc=0 |
| 行尾与 diff 对账 | ✅ | 每个 worktree 内改动前后 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件相等**；落盘脚本一律带「改后逐字节扫 CRLF / bareLF / loneCR / NUL 并断言与预期同构」的后置断言（本轮多次实测 `bareLF=0 loneCR=0`，`quality-gate.yml` 保持纯 CRLF 工作树 / `i/lf` 索引） |
| classify-docs-only | false（混合 PR，不得进快速通道） | 改动含 `.github/workflows/quality-gate.yml` 与 `scripts/`、`packages/` 下文件 ⇒ 完整质量节拍，不借道 |
| QM-1 打包 / QM-4 视觉 | N/A | 未改 `apps/desktop/electron/`、未改运行时依赖区间（本 PR 不动 lock）、未触 UI 文件 |
| 本 PR 不含 CHANGELOG 条目（刻意的） | ✅ 并在此声明代价 | 代码 PR 顶插 `CHANGELOG.md` 会让每次 re-sync 撞同一位置（上一轮实测连撞三轮）。条目由合并后的 docs-only 回填 PR 带上（实测 0.6–7.2 分钟）。**代价如实写**：main 的 CHANGELOG 暂时读不到这次加固 |
| 远程同步 | PASS | 已合并：squash 落地 `8600dd214e5481a9b04b9a2a615bb19f7d67b4e9`（PR #2910，2026-10-05T04:56:35Z）。取证（2026-10-05 现取，采集时 origin/main=8600dd214）：`git log origin/main --grep='(#2910)$' --format=%H|%cI` 得该 SHA 与时间；`git ls-remote --heads origin qm6-gate-hardening` 返回 **0 行**证远端分支已删。其 CHANGELOG 条目由本回填 PR 带上。 |

### 遗留（不假装已闭合）

- **#2908 当前 DIRTY**：docs-only 回填 PR 的 `CHANGELOG.md` 与 main 冲突（实测 `git merge-tree` rc=1，仅 CHANGELOG.md 一处；两口径 numstat 均 `14 17`）。正解是按记忆里那条「以 main 的 blob 为底 + 只把我的块字节前插」（`Buffer.concat`，禁一切 split/join），**不是**取并集也**不是**把整份文件统一行尾。
- **main 上仍留着本次要修的那三处旧形态**，直到本 PR 合并为止：`/^# \[/` 的形状判据、`--base=PR base sha` 的坐标系、以及 else 兜底 + 只比第一段的依赖审计判据。也就是说**这一整个时间窗内新合入的 PR 不受这四处加固保护**。这是竞态的代价，不是可选忽略的细节。
- **`--update` 写基线的域完整性**、**dev 域公告是否收进判定**、**「存在修复版 ⇒ 不允许挂账」的更强判据**、**CHANGELOG 1,148 条里 307 种标题的去重**：四条都在各源记录里挂着，本 PR 不夹带。
