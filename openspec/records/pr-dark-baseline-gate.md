---
record: pr-dark-baseline-gate
task: 让暗色基线在 PR 侧可判（QG Visual 补产暗档渲染）并归零 main 上 19 张暗档漂移（最初判为 8 张，复查时已扩散）
date: 2026-10-09
---

## 本次执行记录：暗档在 PR 侧可判 + 19 张暗档漂移归零（pr-dark-baseline-gate，2026-10-09）

- 变更类型与分层：`.github/workflows/**` + `scripts/**` + `apps/**` 基线工件 ⇒ 运行时代码级 ⇒ 隔离 worktree `mp-pr-dark-baseline-gate`（分支 `pr-dark-baseline-gate`）；`classify-docs-only` 必然 `docs-only=false`，走完整质量节拍
- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）→ 结果见下表
- 授权：改动 CI 门禁覆盖面，用户已于 2026-10-08 人工过目并授权

### QM-5 五步（本 PR 是"门禁缺失"型缺陷的收口，不是改表面）

| 步 | 产出 |
| --- | --- |
| ① 第一性原因 | 2026-09-29 把 Gate 7b 接进 PR 侧时只补跑浅色两套 views（该步骤注释自述的理由只解决了浅色判定域），暗色基线因此永久留在 `--partial` 的 skipped 名单里 |
| ② 逃逸链 | 单元不渲染 CSS → `test:visual:pixel` 只读浅色基线 → Gate 7b 把暗档记 skipped 并**放行** → main 侧 `Full visual suites` 用 6% 全页阈值吃掉局部漂移（实测 0.539% 整个隐没）→ 唯一暴露点是 main push 的 `Baseline freshness gate`，而它**不是必需上下文** |
| ③ 系统性漏洞 | `quality-gate.yml` 的 `visual` job 缺「判定域 == 渲染来源」的接线锁；`scripts/check-baseline-freshness.test.js` 此前**没有任何一条**含 `dark` 的用例（实测 grep 命中 0），所以暗档判定域从未被测过 |
| ④ 修复 + 回归保护 | 接线（Gate 7 + Gate 7b round2 两处跑 `test:visual:pixel:dark`）+ 结构锁（`workflow-contract.test.js` 新增「两处都接 + 退出码逐条打印 + partial 保留」）+ 行为锁（`check-baseline-freshness.test.js` 新增 2 条：暗档有 `<view>-dark-current.png` 时必须判、不得进 skipped；确实无渲染时才允许 skipped） |
| ⑤ 预防措施 | 结构锁所在测试文件已在 `quality-gate.yml:460` 的 `node --test` 清单里点名（实测 `grep -n` 得 460，先前我写 464 是行号漂移，前端轴评审指出后核实纠正），无需新接线；「新增暗档视图要同步哪几处」落成 `docs/visual-capture-settle-and-attribution.md` §10 的显式清单（原先只指向归因方法论章节，是留给后人的真实缺口） |

### 归因：`a43287ac7` 那一次是 8 张（推翻我最初的假设）

最初假设「#3159 漏刷暗档」。**实测否证**：`git show --name-only a43287ac7 -- .../base-screenshots` 的 29 张里这 8 张**全在**。逐张严格逐像素定位 + 颜色对取证显示：渲染侧的新色值**逐字命中该提交自己新增的 CSS 行**（`cloud-publish-dark` 最大一类 `#23232a → #232329` 占 20236 个像素，而 `#232329` 就在新增行里），仓库基线侧是旧值 ⇒ **基线是在那次 CSS 生效之前抓的（陈旧采集）**，不是漏刷。

| 视图（暗档） | 严格相等像素 | bbox |
| --- | --- | --- |
| accounts-list-dark | 42 | (1393,418)->(1399,426) |
| accounts-list-flag-on-dark | 42 | (1393,418)->(1399,426)（与上一张同坐标同面积 ⇒ 同一元素） |
| cloud-publish-dark | 113978 (5.497%) | (232,251)->(1887,852) |
| create-history-dark | 94 | (806,596)->(999,604) |
| create-result-dark | 286 | (1040,321)->(1079,333) |
| publish-form-dark | 26323 (1.269%) | (256,256)->(1652,1079) |
| publish-history-dark | 359 | (600,479)->(624,991) |
| viral-analysis-dark | 1622 (0.078%) | (1368,233)->(1842,245) |

口径注意：**严格相等与 CI 报的数字不可互校**（CI 报 cloud-publish 11176 px / 0.539%，严格相等是 113978 px / 5.497%），引用必须注明用哪个度量。

### 反证（四条变异各自实测变红，跑完逐字节还原并自证）

| 变异 | 结果 |
| --- | --- |
| N1 摘掉 Gate 7 的暗档采集 | `fail=1` 命中「Gate 7 必须跑暗档像素套」 |
| N2 只摘 round2 的暗档采集 | `fail=1` 命中 round2 分支 |
| N3 退出码行去掉 `dark=` | `fail=1` 命中「退出码必须逐条打印」 |
| N4 把 `findRender` 的 pixel-gate 回落档改名 | `fail=2`（新增两条暗档行为锁同时红，证明它们真在读该档） |
| 还原自证 | 四个文件 `byte_identical=true`；还原后 `contract fail=0 / freshness fail=0` |

### QM-6 后端轴（`nemotron-3-ultra-free`，绑 head `a68fe767a`）：1 条被否证、1 条边界留账、3 条确认

结论逐字读该模型自己的 stdout（它同样没按指令落 JSON 文件）。**每条都回原文核实后才处置**，不照单全收：

| # | 它说的 | 核实依据 | 处置 |
| --- | --- | --- | --- |
| 1 | 结构锁不会假绿：匹配的是 YAML `run` 正文而非注释；两处锚点唯一，锚点失效直接报错 | 复核 `workflow-contract.test.js` + 变异 N1/N2/N3 各自变红 | 确认 |
| 2 | 行为锁真读 `findRender` 第二档：用例只造 `home-dark-current.png`、不造 `home-dark.png`，必走 pixel-gate 回落 | 复核用例 + 变异 N4 让两条暗档锁同时红 | 确认 |
| 3 | **报缺陷**：round2 前未清空渲染目录，round1 残留会被 `findRender` 当本轮渲染 ⇒ 误判 | **否证**：`quality-gate.yml:1281` `mv screenshots → screenshots-round1`、`:1282` `mkdir -p .../screenshots` 都在 round2 暗档采集（`:1309`）**之前**；该清理正是 Gate 7b 注释里自述的既有行为 | **不采纳、不改代码**。记为"评审读漏了 round2 前的目录置换"——若照它加一次 `rm -rf`，是对已存在的清理再清一遍，还会把取证用的 `screenshots-round1` 一起纳入删除面 |
| 4 | 无死锁但有隐患：`KNOWN_DYNAMIC` 被测试钉为空，若出现"钉不住时钟"的实时值视图就变成"违反测试 or PR 永远红"二选一，缺采集层钉时钟有效性的自证 | 复核 `check-baseline-freshness.js` 的 `KNOWN_DYNAMIC = {}` 与那条"必须为空"断言属实 | **留账不改**：属采集层自证机制，另案；本 PR 不扩面 |
| 5 | 退出码只打印不进门禁的取舍没被写歪，注释与实现一致 | 复核 `:1072` / `:1309` 确实只取 `$?` 不 `exit` | 确认 |

方法学留痕：它报的唯一"缺陷"是**读漏**而不是真问题——这正说明外部评审结论必须逐条回原文核实再处置，`upheld / overturned` 要分开记账。

### QM-6 前端轴（`ling-3.1-flash-free`，同 head）：4 条全部核实为真，3 条已照改

它没有只听我说——自己跑了 `node --test` 两个套件（34/34、36/36）并去 `git show` 父提交核实「此前无 `dark` 用例」命中 0。四条逐条：

| # | 它说的 | 我的核实 | 处置 |
| --- | --- | --- | --- |
| 1 | 记录第 74 行「其余见下表」是**悬空引用**，下文没有对应的本地门禁表 | 属实——而且根因更难看：我上一次的插入把 `### 本地门禁` **这个标题本身吞掉了**（Edit 的 new_string 没回写被消耗的锚点），所以那行字是挂在一个已消失的标题下面 | 已修：补回标题 + 落成 8 行结果表（数值全部本轮实跑取，不沿用旧数） |
| 2 | 记录写结构锁在 `quality-gate.yml:464`，实际在 **460** | `grep -n workflow-contract.test.js` 实跑得 460 | 已改为 460，并在正文记下"行号漂移、评审指出后核实纠正" |
| 3 | 两条新用例与既有 `partial：…` 命名/语义一致，skipped 语义双向钉死 | 复核用例名与断言方向一致 | 无需改（确认） |
| 4 | 「新增暗档视图要同步哪几处」的清单**在任何可见处都不存在**；我写的预防措施指向的 docs 章节实为归因方法论，不含步骤 | 属实：`docs/visual-capture-settle-and-attribution.md` §1–§9 全是归因/不可复现分类，无操作清单 | 已补 **§10「新增一个暗档视图要同步哪几处」** 四条清单（含"缺了会怎样"与"谁在守"两列），并把记录的 ⑤预防措施 指向 §10 |

它同时把自己的**未验证项**标了出来（dispatch run 属远程 CI、本机不可取证；变异反证只有记录自述无产物落盘）——这个标注是对的，我没有为了好看把它抹掉。

### 不在本 PR 范围（已登记，不静默修）

- 上表第 4 条：采集层"钉时钟有效性"的自证机制。
- `ops-center` 生效看板等他人会话的在制品，不代改其执行记录。

### 本地门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 结构锁 | `node --test .github/scripts/workflow-contract.test.js` | 34 pass / 0 fail（含新增暗档锁） |
| 行为锁 | `node --test scripts/check-baseline-freshness.test.js` | 36 pass / 0 fail（含新增 2 条暗档用例） |
| 品牌残留 | `node scripts/check-no-brand-residue.js` | PASS（7450 个 tracked 文件） |
| 欠账机制 | `node scripts/check-gate-record-debt.js` | OK（登记字段无残留） |
| 超大文件 | `node .github/scripts/check-max-lines.js` | 无新增超限 |
| 测试接线 | `node scripts/check-unwired-tests.js` | 全部已接线或按欠账登记 |
| 文档同步 | `bash scripts/check-docs-sync.sh --base=main --head=HEAD` | 通过 |
| 基线自证 | 同一份 dispatch 产物跑 `check-baseline-freshness.js` | `检查 41 张 / 违规 0 张 / 本次跳过 0 张` |

### 第二刀：基线重建（**19 张**，不是最初的 8 张）

复查 main 实况时漂移已扩散：`a43287ac7` 那次红 8 张，之后 **P4C 第二批 `2b2db5c1a`** 与 **P4D 第三批 `15fd49c0d`** 两拨暗色可读性改动继续合并，main push 的 Visual Tests **连续三次红**（`15fd49c0d` 07:24 / `8b3d3e91f` 09:42 / `07550cf37` 14:08，均为 `基线新鲜度：检查 41 张 / 违规 19 张`，19 张**全部** `来源=pixel-gate`）。另有 `aecb75ab3`（#3202 三列表渲染截断 + 加载更多）改了 `Accounts.vue`/`HotTopics.vue` 的内容，把 `accounts-list-dark` 推到 44603 px（2.151%）。连我 #3113 重建的 `collection-dark.png` 也再次漂了——**这条正是"没有 PR 侧判定，修好的基线也会在下一次暗色改动后静默失效"的实证**。

重建来源与自证（QM-4 第 7 条同源要求）：

| 步骤 | 证据 |
| --- | --- |
| 取渲染 | `gh workflow run visual-test.yml --ref pr-dark-baseline-gate` → run `37945181027`（head `c67576658`，即本 PR 重建前的 head），产物 `visual-test-reports` 含 19 张 `*-dark-current.png` |
| 该 run 自身的"重建前"判定 | `基线新鲜度：检查 41 张 / 违规 19 张` —— 与本 head 的漂移清单逐张一致，证明漂移不来自我的改动 |
| 重建 | 19 张逐字节写回（`replaced=19 already_same=0 missing_baseline=0`），逐张写入后回读并断言与渲染**逐像素相等** |
| 自证 | 用**同一份产物**跑 `node scripts/check-baseline-freshness.js --renders=<artifact screenshots> --baselines=<worktree base>` ⇒ `检查 41 张 / 违规 0 张 / 本次跳过 0 张` |
| 未新建基线 | `missing_baseline=0`：本 PR 不新增任何基线，只刷新既有 19 张 |

**reuse 前提的口径修正（不得沿用 #3113 那条粗判据）**：#3113 里我写的"复用别的 run 产物要证 `git diff --name-only <run-head>..<我的 head>` 命中 `apps/` 为 0"在**本 PR 上不可满足也无需满足**——基线 PNG 本身就在 `apps/` 下且正是本次要改的对象。正确的判据是**「渲染输入不变」**：本 PR 对 `apps/desktop/src/**` 零改动，改的只有基线工件与 workflow。而且本 PR 没有"复用"：产物取自**我自己的 head** 的 dispatch run，因此自证链是闭环的（同 sha 渲染 vs 同 sha 基线）。

### 门禁②的端到端证据（本 PR 就是第一次，已实跑）

判据不写在本 PR 里靠断言，而是看本 PR 自己那次 `QG Visual` 的现场。取证的 run 是**本 PR head `bba400fb6` 自己的** `quality-gate.yml` run `37948835371` / job `QG Visual` id `113883853017`（completed / success）；日志经 `gh api repos/<owner>/<repo>/actions/jobs/113883853017/logs --allow-escape-sequences` 原样取回后剥 ANSI，四条判据各自的现场如下：

| 判据 | 现场（行号为剥 ANSI 后清洗产物内的行序） |
| --- | --- |
| 暗档像素套真的在 PR 侧跑 | `:780 $ cross-env THEME=dark node tests/visual-testing/scripts/run-pixel-tests.js` + `:782 主题: dark（读 <view>-dark.png 基线）`；`:784-820` 逐个 `[dark] <view>`，脚本数得 `dark_view_count=19` |
| 19 张暗档全部被判且通过 | `:834 像素结果[dark]: 19/19 通过，0 失败` |
| Gate 7 四套退出码成行 | `:835 [GATE-7] suite exits: pixel=0 views=0 views-supplement=0 dark=0` —— 本 PR 新增的 `dark=` 字段出现在**实际输出**里，不只是脚本正文 |
| Gate 7b 判定域含暗档 | `基线新鲜度[partial：只判本次有渲染的那些]：检查 41 张 / 违规 0 张 / 登记内动态漂移 0 张 / CI 无渲染 3 张 / 本次跳过 3 张` + `✅ 全部 38 张有渲染的基线逐像素等于本次 CI 渲染`；未判定名单只有 `analytics-overview.png` / `login-form.png` / `settings-general.png`，脚本断言 `dark_in_skipped=false` ⇒ **不含任何 `*-dark.png`** |

对照改前：main push 连续四次红（`aecb75ab3` 02:52 / `15fd49c0d` 07:24 / `8b3d3e91f` 09:42 / `07550cf37` 14:08），均为 `检查 41 张 / 违规 19 张` 且 19 张全是 `*-dark.png`；而 PR 侧改前 Gate 7b 只能把暗档记进 skipped（PR 侧从未产暗档渲染，判据不存在）。本 PR 后**同一分母 41 张**下违规归零，且归零的依据是**判定发生了**，不是判定被跳过。

**合并后 main 的第一次 push 是终局证据**：Visual Tests run `37954471616` / job `visual-test` id `113901352944`，head `8a64e3d1e`，completed / success，日志现场 `像素结果[dark]: 19/19 通过，0 失败` + `基线新鲜度：检查 41 张 / 违规 0 张 / 登记内动态漂移 0 张 / CI 无渲染 3 张 / 本次跳过 0 张` + `✅ 全部 38 张有渲染的基线逐像素等于本次 CI 渲染`。`gh run list --workflow visual-test.yml --limit 8` 的 conclusion 列现场：`8a64e3d1e`=success，其前四个 push 全 failure ⇒ 「暗色改动合并后基线静默失效、main 连红直到有人重建」这条链路在本 PR 处闭合。

**残留（不得写成已证）**：Gate 7b 的 **round2** 暗档重采在本 run **没有被运行时执行过**。round1 干净即 `exit 0`（`quality-gate.yml:1275-1282`），round2 只在 round1 报违规时作为 flake 甄别路径才可达；因此 `[GATE-7B] round2 suite exits: … dark=` 这行在清洗日志里只出现在脚本正文（`:1081`），没有对应输出。它目前的保障**只有结构锁**（`.github/scripts/workflow-contract.test.js` 断言两处 step 正文都含 `pnpm.cmd run test:visual:pixel:dark` 且 `partialCount >= 2`），运行时现场要等**下一次 round1 报违规的 run** 才会产生。这与「注册 ≠ 注入 ≠ 生效」是同一族：接线在，触发条件没到。

| 门禁 | 结果 |
| --- | --- |
| 远程同步 | PASS（PR #3221 已 squash 合并，main `8a64e3d1e4110f1d8d7b5b8790ad797babe70840` @ 2026-10-09T23:48:27+08:00；合并那一刻判据重取：`mergeable=MERGEABLE` / `mergeStateStatus=CLEAN` / 20 checks 中 pending=0 fail=0，10 个 required 上下文（ruleset 6 ∪ classic 4）逐个 pass） |
