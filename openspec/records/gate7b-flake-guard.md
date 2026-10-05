---
record: gate7b-flake-guard
task: Gate 7b 基线新鲜度门禁补两轮有界重试终判——单张视图采集 flake 不再卡死任意 PR
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由回填者把下行改成 PASS 并删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（取证离线：git log origin/main --grep=(#NNNN)$ --format=%H|%cI）
---

## 本次执行记录：Gate 7b 两轮有界重试终判——采集 flake 不卡 PR（gate7b-flake-guard，2026-10-05）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | CI workflow（quality-gate.yml）+ 门禁脚本（check-baseline-freshness.js/.test.js）+ 结构锁（workflow-contract.test.js）⇒ 独立 worktree `D:/Data/projects/mp-worktrees/mp-gate7b-flake-guard`，裸分支 `gate7b-flake-guard`，依赖就绪三件套（install/ensure-electron/verify-worktree-deps）实跑通过 |
| 第一性原因（QM-5 ①） | PASS | 实测判别（2026-10-05）：PR #2914 的 quality-gate run `37267645916` attempt=1 红在 `create-history.png 3909 px / 0.189%`，**同 sha `152a6aff8` 的 attempt=2 与同 sha main push 的 Gate 7b step.conclusion=success** ⇒ 同代码同判据一次红一次绿 = 采集不可复现（flake），不是基线漂移。第二例：main push run `37267270642`（05:19）红在 supplementary-views 1 例（无 diff 产物、逐用例行在日志缺失 ⇒ 像素比较前就挂），同日相邻 main push（05:14）全绿。根因族谱见记忆/PRD §2：run-pixel-tests.js 自述「前序用例经 hash 导航把状态带到下一个视图」等采集不可复现源 |
| 逃逸分析（QM-5 ②） | PASS | Gate 7b 上线（#2866）时即为单轮判定：round 1 红即整个 step 失败，没有任何「同 sha 再判一轮」的出路 ⇒ 任何一次采集抖动都直接卡死 PR（或迫使作者盲目重跑 CI）；重跑 CI 虽然能过，但代价是整轮 25–30 分钟且掩盖了「哪张视图 flake」的信息 |
| 系统性漏洞定位 | PASS | 判定机制把「基线 ≠ 本次渲染」一刀切成「违规」，没有区分**确定性漂移**（两轮都在 ⇒ 真）与**不可复现采集**（单轮出现 ⇒ flake）；且无证据放行的反风险也没有防——round 2 若根本没采到（套件崩溃/导航失败），「交集为空」会被误读成 flake |
| 修复 + 回归保护（QM-5 ④） | PASS | ① `check-baseline-freshness.js`：`evaluateFreshness` 新增结构化 `violated` 清单（name/kind/driftPx/pct/from，与 violations 字符串一一对应，另有用例钉住）；新增 `evaluateVerdictRounds(r1,r2)` 纯函数（两轮交集 = stable 拦 / 单轮 = flake 放行留痕 / round1 红但 round2 skipped = noEvidence 拦——判据不存在时不得改变结论）与 `--json-out=<file>`、`--verdict-rounds=<r1>,<r2>` 两个 CLI 能力（文件缺失/非法 JSON/畸形结构一律 rc=1 fail closed）。② `quality-gate.yml` Gate 7b 步改两轮编排：round 1 照旧（干净即过，零额外开销）；rc≠0 时自起 vite（Gate 7 的 server 已在其 finally 被杀）重跑 views 两套（权威域不变），重采前把 round1 渲染目录 `mv` 移走（套件崩溃残留不会被误读成 round2 证据），再跑 round 2 checker 与 `--verdict-rounds` 终判。判定单一真源仍是 checker 脚本，workflow 只做编排。TDD：12+2 条新用例先 RED（实测 `evaluateVerdictRounds is not a function` / ENOENT / noEvidence undefined）后转绿 30/30 |
| 防止再次发生（QM-5 ⑤） | PASS | 结构锁加固：`workflow-contract.test.js` Gate 7b 断言新增三条（`--json-out=` 必须在 / `--verdict-rounds=` 必须在 / round2 必须 `exec vite`），并做变异反证：把 yml 中 `--verdict-rounds=` 拆掉 ⇒ 契约测试当场红 1 条，收尾还原后与备份**逐字节相同**。既有断言（步名 partial / bash / 自身单测 / `--partial` / `--renders` 字面量 / 禁 continue-on-error / 判定域锁）全部保持命中 |
| 行尾与 diff 对账 | PASS | 四个被改文件两口径 numstat 完全相等（6/0、56/3、100/7、239/0），无幽灵行 |
| 接线棘轮 | PASS | 无新增测试文件（改的都是已接线文件）；`check-unwired-tests` rc=0 / `check-step-failfast`（5 步全 fail-fast）rc=0 / `check-max-lines`（无新增超大文件）rc=0 / `check-gate-record-debt` rc=0 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面；本 PR 改的恰恰是视觉门禁的判定编排本身 |
| QM-6 CCG 双模型外部评审 | PENDING | PR 开出后执行；0 Critical 才挂 auto-merge |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin gate7b-flake-guard` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 遗留（不假装已闭合）

- **main push 侧同族风险未扩面**：`visual-test.yml` 的 Full visual suites（含同名新鲜度检查）仍是单轮判定。PR 侧先落地观察 flake 率与误放行面，main 侧是否复用同一机制属独立决策（本 PR 刻意不顺手扩 CI 面）。
- 两轮交集不是零误放行：理论上「同一视图在两轮恰好各因**不同**原因单轮红」会被判 flake 放行。交集判据按视图文件名，不按漂移量/形状——按形状判会把确定性漂移误判成 flake（两个真差异各自单轮出现的概率远低于同视图复红），当前按「宁可少放行」取舍，暂不做漂移形状比对。
- round 2 复用同一套采集管线 ⇒ 若 flake 源头是「本次 head 的代码让采集必挂」，两轮同红照旧拦（这正是 stable 语义），不会无限重试。
