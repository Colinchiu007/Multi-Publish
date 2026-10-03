---
record: fix-s2v-auto-start-preflight
task: 归因并修复 #2796 —— story2video 测试用例在低内存主机上被 PIPELINE_CONCURRENCY_LIMIT 拒掉第二次启动；测试引擎改为显式钉住并发预算，并加防再犯锁
date: 2026-10-03
sync_status: PENDING
sync_reason: 本 PR 自身尚未合并，merge SHA 与远端分支删除状态此刻不存在（这正是 PENDING 的语义）
sync_backfill_owner: 下一个会话（回填后删除本文件 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：story2video 测试引擎并发预算的主机无关性（fix-s2v-auto-start-preflight，2026-10-03）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码面（测试 realm）⇒ 独立 worktree `D:/Data/projects/mp-worktrees/mp-fix-s2v-auto-start-preflight` + 裸分支 `fix-s2v-auto-start-preflight`，由 `scripts/start-mp-task.ps1` 创建并以 `git worktree list` + `rev-parse --abbrev-ref HEAD` 实证；共享根保持 main clean |
| 第一性原因（QM-5 ①） | PASS | 不是"auto 模式失败"（#2796 正文的错误描述，本记录予以否证）。探针实测第二次 `startOrchestrated` 返回 `{success:false, errorCode:'PIPELINE_CONCURRENCY_LIMIT', errorParams:{count:1,max:1}}`，而换一个**新 engine** 跑同一份 auto 参数 ⇒ `success:true`。根因：`story2video-manual-assets.test.js::makeConfiguredEngine()` 用 `new PipelineEngine()` 不注入预算，于是落到 `pipeline-engine.js:738-743` 的**机器资源自适应**（`computeDefaultMaxConcurrentRuns`：`cpus<2 或 freeMem<2GB ⇒ 1`），而该用例在同一 engine 上连起两条 run（第一条 `autoAdvance:false` + 无执行器 ⇒ 永驻 running 并独占唯一槽位）。 |
| 逃逸分析（QM-5 ②） | PASS | 单元层：断言只写 `expect(auto.success).toBe(true)`，把带 `errorCode` 的返回值整个丢掉 ⇒ 现场读不出"被谁拒"；集成/视觉层与本案无关；审查层：该红**在 CI 上不出现**（runner 4 vCPU/16GB ⇒ 预算≥2），于是"CI 绿"长期被当成"用例没问题"，本地红被当作环境噪声。这是 AGENTS.md「同一个提交可以既绿又红」条目的又一实例。 |
| 修复 + 回归保护（QM-5 ④） | PASS | 只改测试夹具：① `makeConfiguredEngine()` 注入 `maxConcurrentRuns: 4`（同先例 `electron/tests/pipeline-engine.test.js:1206-1211`）；② 两条 `success` 断言改为携带返回值原文 `expect(x.success, JSON.stringify(x)).toBe(true)`，将来被预算拒时现场直接报 `errorCode`；③ 新增防再犯锁「工厂产出的引擎必须显式钉住预算（>=2）」。整文件在**最坏主机**（`STORY2VIDEO_MAX_CONCURRENT_RUNS=1`）下 23/23 绿。 |
| 防止再次发生（QM-5 ⑤） | PASS | ①**整类枚举技术**写进 `docs/s2v-test-concurrency-budget-host-independence.md` §3：`STORY2VIDEO_MAX_CONCURRENT_RUNS=1 pnpm exec vitest run electron`（423 文件）实测只有 2 个文件红（本用例 + `feedback.test.js` 的既有 symlink EPERM）⇒ 该类规模 = 1 个文件，无需全局重构，且证明没有别的用例偷偷依赖主机内存；②锁用例让"不注入预算"单独变红（M-1）；③反证四档逐个实跑（下表）。 |
| 反证（驱动实跑） | PASS | M-1 取消注入 + 只跑锁 ⇒ **RED** `expected 1 to be greater than or equal to 2`；M-3 取消注入 + 把锁断言拆成 `>=0` + 只跑锁 ⇒ **GREEN**（证明红来自那条断言，锁是承重的）；M-2 预算钉成 1 + 整文件 ⇒ **RED**（2 红 21 绿，现场含 `PIPELINE_CONCURRENCY_LIMIT`）；基线修复后整文件 ⇒ **GREEN** 23/23。`VERDICT=ALL_EXPECTATIONS_MET`，收尾断言文件与备份逐字节相同。驱动自身也修了一处探针缺陷：原解析只认 `Tests N failed \| M passed`，而全红时 vitest 打的是 `Tests N failed (N)` ⇒ 解析失败曾被当成结论；现按 `failed`/`passed` 分别取数，零计数一律抛 `PROBE_EMPTY`。 |
| 行尾与 diff 对账 | PASS | 本文件与 CHANGELOG 均为纯 CRLF；改动走 Buffer 精确替换（脚本报告 `crlf=789 lfOnly=0`）。两口径对账 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件完全相同**（`CHANGELOG.md 25/0`、`story2video-manual-assets.test.js 25/3`）⇒ 无行尾污染；CHANGELOG 走 Buffer 前插，CR `15921 -> 15946` 恰等于新块 25 行、原字节尾部逐字节保留。 |
| 接线棘轮 | N/A | 未新增测试文件，只在既有文件内加用例（由 vitest workspace 自动收集，无需 workflow 点名）。 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行时代码：改动只在 `electron/services/*.test.js` 一个测试文件 + 一份文档 + 一条 CHANGELOG。 |
| 桌面全量测试 | PASS（本改动 0 红） | 修复后需跑一次无 env 干预的 `pnpm exec vitest run electron` 作对拍（预期：本文件绿；`feedback.test.js` 的 symlink EPERM 为既有已知）。修复后无 env 干预重跑 `pnpm exec vitest run electron`：**423 文件 / 8196 例 = 1 failed / 8194 passed / 1 skipped**。唯一的红是 `feedback.test.js` 的 Windows symlink `EPERM`（既有已知，且此前已在 pristine main 上逐字复现）；`story2video-manual-assets.test.js` 23/23 绿 ⇒ #2796 的用例不再依赖主机内存。 |
| QM-6 CCG 双模型外部评审 | N/A（S 尺寸，附理由） | 变更是单个测试文件的夹具参数 + 断言形态 + 一条锁用例，无运行时行为、无安全/数据面；按质量节拍的规模分层不触发 M+ 双模型评审。评审价值更高的两条判断（"该不该顺手做产品侧释放槽位"、"要不要接 force=1 CI 车道"）已作为「遗留」显式登记而非静默决定。 |
| 远程同步 | PENDING | 合并后由下一个会话按既有口径回填：merge SHA 与时间取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI`，远端分支删除取 `git ls-remote --heads origin fix-s2v-auto-start-preflight` 返回 0 行（并配一条对 main 的正控）；回填后**删除本文件 frontmatter 的三个 `sync_*` 字段**。 |

### 归因纠正（对 #2796 正文）

#2796 正文写的是"auto 模式那条用例在 runStart 直接 `success:false`"。**这把相关性当成了因果**：
失败的判据是"同一 engine 上的**第二次**启动"，与 manual/auto 无关 —— 我的探针里顺序反过来（先 auto 后 manual）
时，红的那条就变成 manual。已在 #2796 下用带实测的评论撤回原描述，并把根因换成
`PIPELINE_CONCURRENCY_LIMIT` + 自适应预算的主机依赖。

### 遗留（不假装已闭合）

- **没有**把 `STORY2VIDEO_MAX_CONCURRENT_RUNS=1` 接成 CI 车道：它是枚举整类的利器，但长期跑会把"允许自适应"这条
  产品语义固化成测试约束，且全量成本 +1 轮。要接应只挑 `pipeline`/`story2video` 子集，并同 PR 声明
  "这条车道测的是主机无关性，不是并发策略"。
- **`autoAdvance:false` + 无执行器时 run 永驻 `running` 并独占槽位**属测试环境的人造状态（生产有执行器推进/暂停），
  故本 PR 不改产品行为。但"是否存在真实场景让 run 停在 running 而不释放预算"我**没有查**，
  不把它写成一句"没问题"就算收口 —— 需要时另开单取证。
- `feedback.test.js` 的 Windows symlink `EPERM` 是既有已知失败（本轮全量再次遇到两次），不在本 PR 范围。
