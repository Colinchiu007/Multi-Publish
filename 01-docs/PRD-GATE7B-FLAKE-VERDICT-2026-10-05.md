# PRD：Gate 7b 基线新鲜度门禁两轮有界重试终判（gate7b-flake-guard）

- 日期：2026-10-05
- 分支：`gate7b-flake-guard`（worktree `mp-gate7b-flake-guard`）
- 变更面：`scripts/check-baseline-freshness.js` / `.test.js`、`.github/workflows/quality-gate.yml`（Gate 7b 步）、`.github/scripts/workflow-contract.test.js`
- 关联：#31（Gate 7b 单张视图不可复现会卡住任意 PR）；判别现场为 PR #2914 的 CI run

## 1. 问题

PR 侧 Gate 7b（quality-gate.yml，`Gate 7b - Baseline freshness (PR-side, partial)`）是**单轮判定**：
`node scripts/check-baseline-freshness.js --partial …` rc≠0 ⇒ 整个 step 失败 ⇒ PR 被卡。
该门禁判的是「每张被跟踪基线逐像素等于**同一次 run** 的 CI 渲染」，而渲染产自 views 两套采集——
采集链上存在多种**不可复现源**（见 §2），任何一次抖动都会让一张无辜基线「漂移」，直接卡死当时正在合并的任意 PR。

## 2. 判别：flake 还是漂移（2026-10-05 实测）

**决定性证据**（按 attempt 钉住，重跑会覆盖同 job 日志，取证先于任何 rerun）：

| 证据 | run | 结论 |
|------|-----|------|
| PR #2914 quality-gate attempt=1 | 红：`create-history.png 3909 px / 0.189%`（41 张检查 / 违规 1 张 / 22 张 partial 未判定） | 初始失败现场 |
| 同 PR attempt=2（同 sha `152a6aff8`，零代码改动） | `37267645916`，runs API `run_attempt=2`，conclusion=**success** | 同代码同判据，一次红一次绿 |
| 同 sha 的 main push（`37267270642` 之外的同步 run） | Gate 7b step 级 conclusion=**completed/success** | 排除「漂移随 main 前进带入」 |

⇒ **同代码同 sha 同门禁一次红一次绿 = 采集 flake，不是基线漂移。**

第二例（main 侧同族现象，本 PR 不扩面只留档）：main push run `37267270642`（05:19:33）的
「Full visual suites (blocking gate)」红在 supplementary-views 18/19——1 例失败、无 diff 产物、
逐用例行在 `--log-failed` 里缺失（16 秒窗口只有套件汇总 3 行）⇒ 失败发生在像素比较**之前**（环境/导航类）；
同日相邻 main push（05:14:12）全绿。

**根因族谱**（采集不可复现的已知源，均有在案实证）：

1. 前序用例经 hash 导航把状态带到下一个视图（`run-pixel-tests.js:36` 套件自述）；
2. 跨视图浮层串味与入场动画相位（记忆 project-mulpub-visual-gate-registries §10/§13）；
3. 「同一路由只改 query」复用组件实例（§2，已修但同族风险仍在）。

## 3. 方案：两轮有界重试 + 交集终判

```
round 1（现行行为，干净即过，零额外开销）
   └─ rc=0 → ✅ 通过
   └─ rc≠0 ↓
round 2：自起 vite → 重跑 views 两套（权威域 <name>.png，判定域不变）→ round 2 checker
   └─ 终判 = 违规视图的**两轮交集**（--verdict-rounds=r1.json,r2.json）
        ├─ 两轮都红   ⇒ 确定性漂移，照旧 rc=1（防线不弱化）
        ├─ 单轮红     ⇒ flake-confirmed，放行但逐个留痕
        └─ round1 红但 round2 skipped ⇒ 无证据，rc=1（判据不存在时不得改变结论）
```

四条设计约束：

1. **判据单一真源仍是 checker 脚本**：workflow 只做编排（起 server、跑套件、传文件名），
   「什么是违规」「怎么终判」全部在 `check-baseline-freshness.js`，可单测、可反证。
2. **判定域不变**：round 2 仍跑 `test:visual` + `test:visual:supplement`（views 域），
   `findRender` 优先级不变；PR 侧仍 `--partial`（暗色基线照旧 skipped 不判）。
3. **fail-closed 三处**：round 2 vite 起不来 ⇒ rc=1；round 2 判定 JSON 缺失/非法 ⇒ rc=1；
   round1 违规视图在 round2 落进 skipped（套件崩溃/没采到）⇒ **无证据 ≠ 无违规**，rc=1。
4. **round 2 重采在清空后的渲染目录**：先 `mv` round1 渲染再重采，套件崩溃残留的旧渲染
   不会被误读成 round2 证据（否则「旧 flakey 渲染还在盘上」会把 flake 误判成 stable）。

## 4. checker 新能力（TDD，30/30）

- `evaluateFreshness` 返回值新增 `violated`：结构化违规视图清单
  `{name, kind: stale|dims|uncovered|dynamic-budget, driftPx?, pct?, from?}`，
  与 `violations` 字符串一一对应（有用例钉住「一边有一边没有」即红）。
- `evaluateVerdictRounds(r1, r2)` 纯函数：交集按视图文件名；
  返回 `{stable, only1, only2, noEvidence}`；输入缺 `violatedViews` 数组 / 条目缺 `name` 即抛（畸形 fail closed）。
- CLI：`--json-out=<file>`（落盘 `{checked, violatedViews, uncovered, skipped, notes}`，
  干净运行也必须落盘——round 2 需要它的空清单做交集）；`--verdict-rounds=<r1>,<r2>`（终判模式，
  只消费两份 JSON，不碰基线/渲染目录；恰好两份、缺失/非法/畸形一律 rc=1）。
- round-2 JSON 的 `skipped` 参与 `noEvidence` 判定（§3 第 4 条约束的判定面）。

## 5. workflow 侧 Gate 7b 改造

保留全部既有锚点（步名含 partial、`shell: bash`、先跑自身单测、`--partial`、
`--renders=apps/desktop/tests/visual-testing/screenshots` 字面量、禁 `continue-on-error`），
新增：round-1 `--json-out` → rc≠0 时 `pnpm.cmd exec vite`（5174）+ 等就绪（30s，进程退出即 fail）
+ 重跑 views 两套（退出码出声，不另设门禁）+ round-2 checker `--json-out` + 终判
`--verdict-rounds`。两份轮次 JSON 落 `tests/visual-testing/reports/gate7b-round{1,2}.json`
（随 `quality-gate-visual-reports` artifact 上传，供事后审计）。

## 6. 结构锁与反证

- `workflow-contract.test.js` Gate 7b 块新增三条断言：`--json-out=`、`--verdict-rounds=`、
  `exec vite --host 127.0.0.1 --port 5174` 必须在 Gate 7b 步正文里——摘掉任何一段都会静默退回单轮定生死。
- 变异反证实测：把 yml 中 `--verdict-rounds=` 拆掉 ⇒ 契约测试当场红 1 条；收尾还原后与备份**逐字节相同**。
- checker 侧 RED→GREEN：14 条新用例全部先按预期原因红（`evaluateVerdictRounds is not a function`、
  JSON ENOENT、noEvidence undefined、违反 rc 语义等）再转绿；既有 16 条用例零改动通过。
- 两口径 numstat 相等（无幽灵行）；`check-step-failfast`（bash fail-fast）/ `check-unwired-tests` /
  `check-max-lines` / `check-gate-record-debt` 全部实跑通过。

## 7. 遗留

- **main push 侧（visual-test.yml 的 Full visual suites）仍是单轮判定**：同族风险留档（§2 第二例），
  是否复用本机制属独立决策，本 PR 刻意不顺手扩 CI 面。
- 交集按视图文件名，不按漂移形状——理论上「同视图两轮各因不同原因单轮红」会被判 flake。
  按形状判会把确定性漂移误判成 flake（误放行方向），当前按「宁可少放行」取舍。
- round 2 若因「本 head 的代码让采集必挂」而同红 ⇒ stable 拦住，不无限重试（有界 = 恰好两轮）。
