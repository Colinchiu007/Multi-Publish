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
| 变更类型与隔离 | ✅ | 混合 PR（`.github/workflows/` + `scripts/` 判据本体）；worktree `D:/Data/projects/mp-worktrees/mp-spec-mirror-wiring-fix`，裸分支 `spec-mirror-wiring-fix`，base `c1f373c89` |
| 第一性原因（QM-5 ①） | ✅ | 「进白名单的前提锁」只写在 `AGENTS.md`/spec 里，**没有任何判据核对接线所在的 job**：`check-unwired-tests.js` 旧口径是整份 workflow 可执行正文的子串匹配，`static-gates`（被 `if: needs.changes.outputs.docs-only != 'true'` 整片门控）与 `changes` 在它眼里等价 |
| 逃逸分析（QM-5 ②） | ✅ | 单元层：镜像锁跑在 `static-gates`，纯文档 PR 上该 job 被短路 ⇒ 一次都没执行；集成层：无；视觉层：不适用；审查层：自审按"记录里写了前提锁"判合规。现场：#3114 PR 侧 `QG Changes=pass` / `QG Static=skipping` 合入后，main push run 37716816985 step `Gate 2b` 报 `not ok 2 - 镜像不得自行发明或漏掉 Requirement` |
| 系统性漏洞（QM-5 ③） | ✅ | 判据的**粒度**错：只问"点名了没有"，不问"点名住在会不会被跳过的 job"。同类漏点此前由 `#2718` 用人工纪律补过一次（账本 JSON），说明这不是偶发遗忘而是判据本身测不到 |
| 修复 + 回归保护（QM-5 ④） | ✅ | Gate 2b2 接进 `changes` job；镜像锁自身加 2 条锁（自接线 + 依赖面只能 node 内置）⇒ 5→**7 条**；`check-unwired-tests.js` 加 `MUST_LIVE_IN_UNGATED_JOB` 登记表 + `listJobBlocks` + `collectUngatedCheck` ⇒ 测试 12→**20 条**，含 6 条夹具锁与 1 条真实仓库棘轮 |
| 防止再次发生（QM-5 ⑤） | ✅ | ①判据本体（登记表只能缩小、项须带"销账"条件、解析退化即抛错）；②`AGENTS.md` 新增一段把口径与"拒绝启发式"的实测精度一起写明；③spec delta `openspec/changes/spec-mirror-wiring-gate/specs/ci-path-gating/spec.md` 把纪律升格为 Requirement（6 个 Scenario） |
| 行尾与 diff 对账 | ✅ | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件相等**：`quality-gate.yml` 16/0、`check-unwired-tests.js` 110/4、`check-unwired-tests.test.js` 193/0、`quality-rhythm-spec-mirror.test.js` 89/0；四个被改文件实测 crlf=339/511/208/1476、lfOnly=0（无混行尾改写） |
| 接线棘轮 | ✅ | 无新增测试**文件**（两条新锁落在既有文件），而 Gate 2b2 在同 PR 点名 `scripts/quality-rhythm-spec-mirror.test.js`；`node scripts/check-unwired-tests.js` ⇒ `检查域内测试文件 67 个 / OK`；`check-step-failfast.js` ⇒ 6 个多测试步骤全 fail-fast |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/`、`packages/rpa-engine/` 或任何前端文件；改动面为 CI 判据与门禁测试 |
| 反证（QM-5 配套） | ✅ | 9 条变异 W1–W9 逐条实跑全部 `PASS`，`RESTORE_ISSUE=0`、逐条 `restored_byte_identical=true`；跑完 `git status --porcelain` 只剩本次真实改动文件。**其中 W3 首跑 `NOT_RED`**：原注入"去掉 `!cur.sawSteps`"没实现所称危害（step 级 `if:` 在 6/8 空格缩进，`^    if:` 命不中，该守卫本就冗余）；顺"这条变异到底改变了哪个可观测行为"追出**反方向的真洞**（`if:` 写在 `steps:` 之后被读成不被门控 ⇒ 假绿），修法＝删位置守卫、只按缩进判，并补测试 4.4 与新变异 W9；W3 同时换成能真正产出所称危害的注入（放宽缩进判据）⇒ 红对应锁 |
| 真实仓库解析现场 | ✅ | `listJobBlocks` 解析 26 个 job：14 被 job 级 `if:` 门控 / 12 不被门控（棘轮下界取 ≥20 / ≥8）；该镜像锁的承载 job 断言为**不被门控的 `changes`** |
| QM-6 CCG 双模型外部评审 | PENDING | 混合 PR + 改门禁判据本体 ⇒ 必须执行；原件落盘后逐条处置并回填本行 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin spec-mirror-wiring-fix` 返回 0 行证远端分支已删；回填后删除 frontmatter 三个 `sync_*` 字段 |

### 逐条处置（外部评审）

（评审完成后填写：发现项 / 判定 / 处置 / 证据）

### 决策层评审吸收（本机无 CCG 引擎，走替代通道）

- 采纳：登记表 + stale 判据 + 只能缩小；依赖面锁（`changes` job 无 Install deps）；回滚面收敛为两文件单点 revert；
  一次性人工清点固化进 AGENTS.md 并写明"再做的触发条件"。
- 否证并给出证据：启发式自动判据（精度实测 1/6，见 proposal「刻意不做」）；Node 版本字符串断言（既坏又非必要）。

### 遗留（不假装已闭合）

- 登记表当前 1 条登记项来自**逐条人工核对**，不是完备全域清点：命中白名单输入却仍只住在可跳过 job 的其它锁，
  若不登记则本判据不会主动发现 —— 这是拒绝启发式的对价，靠 `AGENTS.md` 新增纪律补，而不是靠判据。
- 本 change 归档时只写 `ci-path-gating` 的 Requirement；`scripts/quality-rhythm-spec-mirror.test.js` 镜像的真源是
  `openspec-integration/spec.md`，二者无交集 ⇒ 归档不会触发镜像漂移红（已核对锁的 `LIVE_SPEC` 常量）。
- 「归档器把 TBD 写进新增主规格」这一 Gate 12d 活体场景仍未构造（需一次真正新增能力的 change）。
