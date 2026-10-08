---
record: spec-mirror-wiring-fix
task: 把「门禁接线住在哪个 job」从文档纪律升级为机械登记表，并把 vendored 契约镜像锁接进不被 docs-only 短路的 changes job
date: 2026-10-08
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（按 AGENTS.md「合并后收尾清单」回填并删除本段三字段）
---

## 本次执行记录：接线资格登记表 + Gate 2b2（spec-mirror-wiring-fix，2026-10-08）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | 混合 PR（`.github/workflows/` + `scripts/` 判据本体）；worktree `D:/Data/projects/mp-worktrees/mp-spec-mirror-wiring-fix`，裸分支 `spec-mirror-wiring-fix`；merge-base `2475fa74c`，首版实现提交 `2429ce1a3`，反哺轮在其后 |
| 第一性原因（QM-5 ①） | ✅ | 「进白名单的前提锁」只写在 `AGENTS.md`/spec 里，**没有任何判据核对接线所在的 job**：`check-unwired-tests.js` 旧口径对整份 workflow 的可执行正文做子串匹配，`static-gates`（被 `if: needs.changes.outputs.docs-only != 'true'` 整片门控）与 `changes` 在它眼里等价 |
| 逃逸分析（QM-5 ②） | ✅ | 单元层：镜像锁跑在 `static-gates`，纯文档 PR 上该 job 被短路 ⇒ 一次都没执行；集成层：无；视觉层：不适用；审查层：自审按"记录里写了前提锁"判合规。现场：#3114 PR 侧 `QG Changes=pass` / `QG Static=skipping` 合入后，main push run 37716816985 step `Gate 2b` 报 `not ok 2 - 镜像不得自行发明或漏掉 Requirement` |
| 系统性漏洞（QM-5 ③） | ✅ | 判据的**粒度**错：只问"点名了没有"，不问"点名住在会不会被跳过的 job"。同类漏点此前由 #2718 用人工纪律补过一次（账本 JSON），说明这不是偶发遗忘而是判据本身测不到 |
| 修复 + 回归保护（QM-5 ④） | ✅ | Gate 2b2 接进 `changes` job；镜像锁自身加「自接线锁 + 依赖面锁 + 与生产解析器的差分锁」⇒ 5→**8 条**；`check-unwired-tests.js` 加 `MUST_LIVE_IN_UNGATED_JOB`（结构化 `{reason, resolveWhen}`）+ `listJobBlocks` + `collectUngatedCheck` ⇒ 测试 12→**30 条** |
| 防止再次发生（QM-5 ⑤） | ✅ | ①判据本体（清单只能缩小、登记必须带销账条件、解析退化即抛错、点名只认 run 正文）；②`AGENTS.md` 新增一段把口径与"拒绝启发式"的实测精度一起写明；③spec delta `openspec/changes/spec-mirror-wiring-gate/specs/ci-path-gating/spec.md`（6 个 Scenario，其中不可执行化的那条已按外部评审删除） |
| 行尾与 diff 对账 | ✅ | 按 merge-base `2475fa74c` 起算：`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件相等**（10 个文件：`quality-gate.yml` 16/0、`AGENTS.md` 1/0、`CHANGELOG.md` 50/0、proposal 44/0、spec delta 55/0、tasks 86/0、本记录 44/0、`check-unwired-tests.js` 190/4、`check-unwired-tests.test.js` 449/0、`quality-rhythm-spec-mirror.test.js` 109/0）；删除数 4 的归因＝被替换的旧 `mentionsFile`/旧 `collectUngatedCheck` 片段，不是行尾改写 |
| 接线棘轮 | ✅ | 无新增测试**文件**（新锁全落在既有文件），Gate 2b2 在同 PR 点名镜像锁；`node scripts/check-unwired-tests.js` ⇒ `检查域内测试文件 67 个 / OK`；`check-step-failfast` ⇒ 6 个多测试步骤全 fail-fast |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/`、`packages/rpa-engine/` 或任何前端文件；改动面为 CI 判据与门禁测试 |
| 反证（QM-5 配套） | ✅ | **17 条**变异（W1–W13、W14–W17、W4b）逐条实跑全部 `PASS`，`RESTORE_ISSUE=0`、逐条 `restored_byte_identical=true`，跑完 `git status --porcelain` 只剩本次真实改动文件；另有 1 条"修复前现场"取证（摘掉 Gate 2b2 ⇒ 镜像锁第①条红）。四种"反证自己骗自己"的形态见下节 |
| 真实仓库解析现场 | ✅ | `listJobBlocks` 解析 26 个 job：14 被 job 级 `if:` 门控 / 12 不被门控（下界据实测收紧到 ≥24 / ≥10）；该镜像锁的承载 job 断言为**不被门控的 `changes`** |
| QM-6 CCG 双模型外部评审 | ✅ PASS | 本机 CC Switch `:15721` 实测未监听 ⇒ 走既有替代通道 `opencode run --model opencode/{nemotron-3-ultra-free, ling-3.1-flash-free}` 双轴，并**跑了三遍**（第一遍因通道把项目根定在共享主工作区而作废；后两遍绑定同一提交 `2429ce1a3`）。共 **20 条发现**（第一遍 logic 7 + maintainability 6，第二遍 maintainability 7；含 1 CRITICAL、5 MAJOR）；原件仓库内坐标 `.ccg/reviews/2429ce1a3-logic.json`、`.ccg/reviews/2429ce1a3-maintainability.json`；逐条处置见下两张表 |

| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin spec-mirror-wiring-fix` 返回 0 行证远端分支已删；回填后删除 frontmatter 三个 `sync_*` 字段 |

### QM-6 逐条处置（13 条，判据一律"读代码 + 跑一次"，不接受静态判读）

| # | 轴 | 级别 | 判定 | 处置与证据 |
|---|----|------|------|-----------|
| L1 | logic | CRITICAL | 部分否证 + 部分采纳 | **否证**"env 容器键下的 `if:` 被判成 job 级门控（假红）"：`env:` 子键落在 6 空格，`^    if:` 要求恰好 4 空格，结构上不可能命中；补负控用例把它钉成锁。**采纳**假绿方向：认不出的 2 空格 job 键一律抛错（否则其正文累加给上一个不被门控的 job ⇒ 伪造合法接线），变异 W10 实测红。**拒绝 js-yaml**：真解析器替我判不了 `${{ }}` 语义与 job_id 合法性，反而把"看不懂"变成异常静默；且该文件同时服务 `changes` job 的锁（无 npm 依赖） |
| L2 | logic | MAJOR | 采纳（三点全中） | 点名口径重写：只在 step 的 `run/script/command` 正文里找 + 词边界 + 歧义 basename 不回退；新增用例 3 条，变异 W12/W13/W14 各红 |
| L3 | logic | MAJOR | 否证（代价如实登记） | 反向启发式扫描我实测过：按路径字面量与白名单求交得 6 条可疑，逐条核到"是否真用 `fs` 读到仓库内那个文件"只剩 1 条为真 ⇒ 一次引入 5 个假阳的门禁结局是逼人清空登记表。既有控制：改 `CI_IGNORED_PATHS` 属 AGENTS.md「禁止自动合并、必须人工过目」类。残余写进下方「遗留」 |
| L4 | logic | MINOR | 采纳 | 规模下界 20/8 → 24/10（实测 26/12，留 2 的余量而不是贴脸值） |
| L5 | logic | MINOR | 否证 + 采纳文案 | **否证**"会误拦工具函数"：依赖面锁实测早已放行 `./`/`../` 相对 require（读码核实）。**采纳**文案：改为三级正解顺序（内置 → 仓内相对路径模块 → 最后才摘锁，摘锁必须同步改接线锁） |
| L6 | logic | MINOR | 否证 | 退出码本就分档：违规 rc=1、解析抛错走入口 catch rc=2，本轮新增 3 条 CLI 进程入口锁实测这三种码；"单测红就不跑实检"是刻意 fail-closed（先保证判据本身可信） |
| L7 | logic | MINOR | 否证（保留设计）+ 文档化 | 保留对无 `jobs:` 夹具抛错（把"解析不出 job"读成"无需核对"正是本判据要消灭的形态）；采纳其文档面：把 `collectCheck` 第 4 参缺省 `{}` = 不查接线资格写成显式不变量注释，防止后来者照三参形态抄 |
| M1 | maint | MAJOR | 采纳（我的证据确实过期） | 本记录「行尾与 diff 对账」行原先写的是 W3 返工**前**的中间态数字（110/4、193/0），与提交快照不符 ⇒ 按 merge-base 重跑两口径并刷新（见上表）。这条的价值就是新鲜证据，过期即等于没证据 |
| M2 | maint | MAJOR | 采纳 | `collectUngatedCheck` 复用 `collectCheck` 的同名串号守卫（歧义 basename 必须写全相对路径），消除两套判据的口径分裂；新增用例「同 basename 跨目录时，兄弟文件的点名不得冒领」+ 变异 W15 |
| M3 | maint | MINOR | 采纳 | 旧的"真实仓库"用例改为四参全传；只传两参时它的绿**不覆盖**接线资格判据 |
| M4 | maint | MINOR | 采纳 | 补直接调用 `listJobBlocks` 的两条退化断言（目录缺失 / 零个 yml）—— 经 `collectCheck` 走不到，会被 `readWorkflowText` 先抛 |
| M5 | maint | MINOR | 采纳（升级为互证） | 第二份解析器保留但注释改成诚实理由；新增**差分锁**：同一份 `quality-gate.yml` 上两份实现的 `{name,gated}` 序列必须逐 job 相等 ⇒ 只修一边当场红（变异 W17 实测红） |
| M6 | maint | MINOR | 采纳 | 登记值结构化 `{ reason, resolveWhen }`，测试分别断言非空并显式拒绝空洞值（`^无$` 之类）；变异 W16 实测红 |
| M7 | maint | 记录 | 采纳 | spec delta 删掉不可执行化的 Scenario 5（它属决策，留在规约里只会永远挂"未覆盖"），理由与实测精度挪到 proposal「刻意不做」与 AGENTS.md；新增「点名只认 run 正文」Scenario |

### 第二遍评审（7 条，绑定同一提交但换了绝对路径通道）与处置

| # | 判定 | 处置与证据 |
|---|------|-----------|
| P2-1 MAJOR 记录里 numstat 停在返工前 | 采纳 | 同 M1：本表「行尾与 diff 对账」行按 merge-base 重测刷新 |
| P2-2 MAJOR basename 无条件回退引入同名串号 | 采纳 | 同 M2：歧义守卫 + 用例 + 变异 W15 |
| P2-3 MINOR 「两份解析器已存在**可观测分歧**」 | **否证（实测）** | 写探针逐份比：13 份 workflow 上 `parseJobs` 与 `listJobBlocks` 的 `{name,gated}` 序列 `divergent=0`。分歧主张不成立，但它的**方向**是对的 ⇒ 把差分锁从"只比 quality-gate.yml"扩成"比全部 workflow + 份数下界 ≥10 + 对比 job 数下界 ≥20"，让"另一份文件里的漂移"以后能被接住 |
| P2-4 MINOR 两条退化分支无直接测试 | 采纳 | 同 M4 |
| P2-5 MINOR 第 4 参缺省不对称 | 采纳 | 同 M3/L7 |
| P2-6 MINOR 登记值散文 + 清单只钉 keys 不钉 values | 采纳 | 同 M6：结构化后测试对 `reason`/`resolveWhen` 分别断言，`deepEqual` 仍钉 keys；values 的非空洞性由两条断言 + 变异 W16 守 |
| P2-7 MINOR 松子串语义（`echo scripts/x.test.js` 也算点名） | 部分采纳 + 残余如实登记 | run 正文限定已吃掉 `env:`/`with:`/映射值那一类（这才是本案的真实形状）；**不**再收紧到"执行器白名单"（`node`/`bash`/`pwsh`…），因为那种收紧的方向是假红，而假红的结局是逼人删登记。残余写进下方「遗留」 |

### 反证自己的两种骗法（本轮实测，比"哪条锁红了"更值得记）

1. **变异没实现所称危害 ⇒ `NOT_RED`**：W3 首版注入"去掉 `!cur.sawSteps`"没红 —— step 级 `if:` 在 6/8 空格，`^    if:` 本来就命不中，那条守卫是冗余的。顺着"这条变异到底改变了哪个可观测行为"往下查，发现真洞在**反方向**（`if:` 写在 `steps:` 之后同样是 job 级门控 ⇒ 假绿），于是删掉位置守卫、只按缩进判，并补用例 + 新变异 W9。
2. **被改的那一行根本不是危害的成因 ⇒ 同一注入换个位置才红**：W15（取消歧义 basename 守卫）首跑 `NOT_RED`。原因不是锁没抱住，而是我把词边界写成"前置字符不得是 `/`"，于是 basename 回退支路在真实形状下**永远走不到** ⇒ 守卫成了死支路上的死代码。把前置字符放宽到允许 `/` 与 `.`（`./scripts/x` 这类写法必须能命中），守卫才重新可观测，W15 才红。**教训**：否证的对象是"危害"，不是"某一行代码"；写判据时要问"这条支路在什么输入下被执行"。
3. **防线冗余 ⇒ 单点拆一处不红**：整行注释的早退、行尾 `#` 剥离、run 正文限定三层任意一层都能挡住注释点名，所以"拆两处仍不红"不是覆盖漏洞。正解是按**要证的危害**把防线逐层拆到位（W4b 改为三层复合注入 ⇒ 14 条红、目标两条必红），并把这一事实写进注释而不是假装单点可证。
4. **探针自身的坐标会过期**：QM-6 第一次派发全部作废 —— opencode 把项目根定在 `git --git-common-dir` 所在目录（共享主工作区），于是它读的是 main 的旧副本、`grep` 我新增的符号 0 命中。判"评审没发现问题"之前必须先证明**评审读到的是被评审的代码**（改为全部传绝对路径后才有真产物）。

### 17 条变异反证现场

| # | 注入 | 必红的锁 | 结果 |
|---|------|---------|------|
| W1 | `collectUngatedCheck` 恒判合规（新门禁 no-op） | 登记表里的锁只住在可跳过 job ⇒ 红（另带 7 条） | PASS fail=8 |
| W2 | 摘掉 job 级 `if:` 判据 | 同上 | PASS fail=2 |
| W3 | `if:` 判据放宽到任意缩进 | step 级 if 不得被当成 job 级门控 | PASS fail=2 |
| W9 | 退回"位置版"判据 | job 级 if 写在 steps: 之后仍是整片门控 | PASS fail=1 |
| W5 | stale 出口删掉 | 登记项指向不存在的文件 ⇒ 判过时 | PASS fail=1 |
| W6 | 解析退化改 `return []` | job 解析退化必须抛错 | PASS fail=1 |
| W7 | 登记表被清空 | 真实仓库：清单只能缩小 | PASS fail=1 |
| W8 | 从 `changes` job 摘掉 Gate 2b2 点名 | 真实仓库：登记的锁确实住在不被跳过的 job | PASS fail=3 |
| W10 | 未知 job 键判据摘掉 | 无法识别的 job 键必须抛错 | PASS fail=1 |
| W11 | 整行注释早退被移除 | 两空格缩进的注释不得被误判成未知 job 键（4 条连带） | PASS fail=4 |
| W12 | basename 退回裸 `includes` | 互为子串的 basename 不算点名 | PASS fail=1 |
| W13 | 行尾注释不剥离 | 行尾注释里的文件名不算点名 | PASS fail=1 |
| W4b | 三层注释防线同时拆掉 | 整行与行尾两条必红（14 条连带） | PASS fail=7（驱动只记前 3 条红名） |
| W14 | 取消"只在 run 正文里算点名" | 环境变量字面量里的路径不算点名 | PASS fail=1 |
| W15 | 取消歧义 basename 守卫 | 同 basename 跨目录不得冒领 | PASS fail=1 |
| W16 | 销账条件退化为 `"无"` | 真实仓库：登记必须带非空洞销账条件 | PASS fail=1 |
| W17 | 镜像锁的解析器停止记 job 级 `if` | 差分锁：两份实现逐 job 同结论 | PASS fail=1 |

### 遗留（不假装已闭合）

- 登记表当前 1 条登记项来自**逐条人工核对**，不是完备全域清点：命中白名单输入却仍只住在可跳过 job 的其它锁，
  若不登记本判据不会主动发现。这是拒绝启发式的对价，靠 `AGENTS.md` 新增段 + 白名单变更 PR 禁止自动合并补，
  而不是靠判据。
- `mentionsFile` 允许前置 `/` 与 `.`（为了 `./scripts/x.test.js` 与绝对路径式点名能命中），
  残余是"以登记路径结尾的更长路径"仍算命中；已写进函数注释，不留成隐形口子。
- 第二遍评审 P2-7 的另一半**故意不修**：run 正文里 `echo scripts/x.test.js` 这种纯文本仍算点名。
  再收紧一层要引入"执行器白名单"（`node`/`bash`/`pwsh`/`pnpm`…），而白名单的失效方向是**假红**，
  假红的结局是逼人删登记 —— 与 L3 拒绝启发式的理由同一条。真出现那种接线风格时再按实测扩语义。
- 外部评审两路都被要求写 JSON，但第一路（logic）在共享主工作区跑偏、第二次才落对产物 ⇒ 通道特性值得单独沉淀，
  不要假设"驱动 rc=0 = 产物存在"（本轮多次实测后台通知谎报退出码，判据一律回到产物与进程存活）。
- `.quality-rhythm/**` 不在 `CI_IGNORED_PATHS` 内，属另一会话已登记的欠账，本轮未动。
