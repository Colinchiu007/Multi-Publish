---
record: s2v-worst-host-budget-coverage
task: 把「最坏主机档」的独占覆盖钉成常规用例，并以实测为依据正式否决独立 CI 车道
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（回填 PASS 时整段删除上面三个 sync_* 字段）
---

## 本次执行记录：最坏主机档不进车道、改钉常规用例（s2v-worst-host-budget-coverage，2026-10-05）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（测试面在 CI 执行）⇒ 独立 worktree `D:/Data/projects/mp-worktrees/mp-s2v-worst-host-budget-coverage` + 裸分支 `s2v-worst-host-budget-coverage`（基线 `origin/main` = `06b1619`）；共享根未落盘运行时文件；`--no-verify` 未使用 |
| 第一性原因（QM-5 ①） | PASS | 待办 #35 的原假设是「最坏主机档没进 CI ⇒ 有一整类主机依赖缺陷逃得过」。实测否证了它的一半：`env=1` 走的分支与 `deps.maxConcurrentRuns=1` 是同一条（`pipeline-engine.js:740-743` 的三元表达式，差别只在预算**来源**），而 budget=1 的行为链（第二条被拒 / 取消释放槽位 / resume 占槽）早已是常规单测（`resume-orchestration.test.js:403-443`）。真正没被覆盖的只剩「env 解析出的值恰好是 1」这一格 —— 环境变量开关 describe 原本只测 2 / 非法 / 99 |
| 逃逸分析（QM-5 ②） | PASS | 该格取值逃过的原因不是测试质量，是**跑法**：它原本只有手工带 `STORY2VIDEO_MAX_CONCURRENT_RUNS=1` 跑整仓时才会被构造出来。同时量化了「接成车道」的代价：`quality-gate` 一次 main push run `37250937816` = 27m52s，`Desktop tests shard` 单片 1487s/1519s（job `timeout-minutes: 40`），桌面全量不拆片 ≈47min ⇒ 超预算，接它必须先拆片、机器分钟翻倍 |
| 系统性漏洞（QM-5 ③） | PASS | 两条：① 「一条只在手工枚举跑法下才被构造的取值」没有任何东西保证它进入常规 CI；② **本轮新暴露**：给资源自适应类默认值写锁时，判据可能**恰好等于本机自适应值**从而在本机恒真 —— 本机实测 `os.freemem()` = 1.03GB ⇒ `computeDefaultMaxConcurrentRuns()` = 1，与 `env=1` 是同一个可观测状态 |
| 修复 + 回归保护（QM-5 ④） | PASS | `resume-orchestration.test.js` 新增「设 1（最坏主机档）→ 上限为 1 且第 2 条被拒、取消后释放槽位」，并在同一条用例里先取 `env=3` 断言 `maxConcurrentRuns === 3`（与任何自适应取值不可能重合），使「env 分支整条失效」这类变异在**任何**主机上都会红。顺带把 `registerConc` 夹具从 describe 内提到模块级（声明 1 处、调用点 5 处，避免两份夹具测出两种行为）。实跑 27 passed（原 26 + 新 1） |
| 防止再次发生（QM-5 ⑤） | PASS | 文档 `docs/s2v-test-concurrency-budget-host-independence.md` 追加 §7：成本实测表、收益实测（独占覆盖只剩一格取值）、T1a 等价变异的成因与「补一个不可能与默认值重合的档位」这条通用判据、以及 §7.4 全域结构锁的清点否决依据（771 个桌面测试文件 / 11 个含 `startOrchestrated(` / 被标记 5 个 / 其中 3 个必须不钉 ⇒ 例外清单与判据同规模） |
| 行尾与 diff 对账 | PASS | `resume-orchestration.test.js` 与 `docs/s2v-…md` 均为 CRLF（文档实测 83/83），追加/插入一律逐行 CRLF，禁统一行尾；文档改后自检「原 83 行逐字节保留=True、行数=CR 数=135」 |
| 接线棘轮 | N/A | 本 PR 不新增测试文件（只往已接线的 `resume-orchestration.test.js` 加用例），`scripts/` 与 `.github/scripts/` 下无新增 `*.test.js` ⇒ `check-unwired-tests` 域不变 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/` 运行时代码路径与任何 UI 文件（改的是该目录下的 `tests/`，产品模块 `services/pipeline-engine.js` 一行未动，变异驱动收尾断言其逐字节还原） |
| QM-6 CCG 双模型外部评审 | N/A | 触发条件（M+/跨模块/主进程服务/IPC/引擎包/安全/持久化）均不命中：改动 = 1 个测试文件的 1 条新用例 + 1 段文档 + 本记录。按 AGENTS.md「纯文档/测试面不强制」处理，**未执行**，不以本地自审冒充外部评审 |
| 远程同步 | PENDING | 合并后按 `openspec/records/_TEMPLATE.md` 的口径回填：merge SHA 与时间取自 `git log origin/main` 按本 PR 号行尾匹配的 `--format=%H|%cI` 唯一命中；`git ls-remote --heads origin s2v-worst-host-budget-coverage` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 反证（实跑，判据 = rc≠0 且预期那条在红行内；收尾断言被测文件逐字节还原）

| 变异 | 结果 | 说明 |
|---|---|---|
| T1a `envLimit > 0` → `> 1` | **本机 GREEN** ⇒ 判定为本机条件下的等价变异 | 本机自适应恰为 1，「忽略 env」与「env=1」在本机是同一可观测状态。推导其在自适应 3/4 的主机上必红（`toBe(1)` 会拿到默认值），该推导取自被锁代码的同一三元表达式，**未**在强主机实跑，故不写成实测 |
| T1b `envLimit > 0` → `> 8`（env 分支整条失效） | **RED**，rc=1，2 条红（新用例 + 「设 2」既有锁） | 新用例里的 `env=3` 对照正是为这一类变异准备的：它不依赖主机 |
| T2 `Math.min(8, floor)` → `Math.max(2, floor)`（下限被抬） | **RED**，rc=1，2 条红（新用例 + 「封顶 8」既有锁） | 与主机无关，任何自适应值下 env=1 都会解析成 2 ⇒ `toBe(1)` 红 |

### 遗留

- **未**在 CI 上验证「强主机自适应=3/4 时 T1a 必红」这一推导：需要一台空闲内存 ≥2GB 的机器跑同一条变异，或给 `computeDefaultMaxConcurrentRuns` 加可注入缝（后者属产品改动，本轮不做）。
- 全域「必须钉预算」结构锁经 §7.4 清点后否决。若将来 `startOrchestrated` 的消费者继续增长且出现**第二次**因未钉预算导致的红，判据规模会重新划算，届时按 §7.4 的清单起锁。
- 本机 1.03GB 空闲内存是一台真实「最坏主机」的现场：本仓若有其它以「自适应默认值」为前提的锁，都应照 §7.3 补一个不重合档位，而不是相信本机。
