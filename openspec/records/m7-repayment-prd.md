---
record: m7-repayment-prd
task: 超大文件门禁补「点名还账」与「测试文件纳管」，并修正 PRD 三处与现状脱节的记载
date: 2026-10-07
---

## 本次执行记录：超大文件门禁点名还账 + 测试文件纳管（M-7，m7-repayment-prd，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码 + CI 配置 + 文档 ⇒ 隔离 worktree。`D:\Data\projects\mp-worktrees\mp-m7-repayment`（D 盘）、裸分支 `m7-repayment-prd`，基线 `db51cc16`；共享主工作区未写入 |
| 第一性原因（QM-5 ①） | PASS | `evaluate()` 五条判定无一条要求存量下降；每条挂账另有「登记值+200」容差。**实测 45/98 个挂账文件的当前行数已高于登记值**，最大 20 个里 12 个已漂移（`Collection.vue` +195、`publish-api-server.js` +181、`story2video-stages.js` +140）。另：`EXCLUDE` 的 `rel.includes('test')` 子串匹配把 **1024 个测试文件全部顺带排除**，>500 行 102 个、>1500 行 13 个，最长 `CreateView.test.js` 6574 行 > 被测源码 5656 行 |
| 逃逸分析（QM-5 ②） | PASS | ①门禁层：`LEDGER_GREW` 的阈值是 `登记值+200`，静默漂移落在阈值内就**永远不响**；②评审层：`--update` 的 `blockedRaise` 会把漂移打印成人人看得到的一行警告，但它是**非阻断**的，且默认不跑 `--update` 的人根本看不到；③测试层：既有测试全部用构造数据，**没有一条断言「登记值与现实一致」**，基线失真无人发现 |
| 修复 + 回归保护（QM-5 ④） | PASS | ①`targets` 点名还账（20 个，容差 0，优先于墓碑，`--prune` 连带摘除）；②排除名单（bundle/locales/design-system.css，避免 i18n 每次新增都红）；③`scanTestFiles()` 测试通道（1500 上限 + 独立挂账 + `--prune-test` + 扫描根加 `apps/desktop/tests`）。回归锁：`check-max-lines.test.js` **27/27**（既有 17 + 新增 10）。**反证四条**：`CreateView.vue`+2 行 → `TARGET_GREW`；新建 1521 行测试 → `TEST_OVER_LIMIT`；`locales/zh.js`+2 行 → **不报**；`--update` 后键集合一致 |
| 防止再次发生（QM-5 ⑤） | PASS | 新增 `isTargetable()` 并由生成器与判据**共用同一口径**（避免「生成器认为可点名、门禁认为不可」的分叉）；`writeBaseline`/`computeUpdate` 显式搬运四个新键；实测类 `realRepoEvaluate()` 集中喂参，防止「门禁主断言漏喂 testData ⇒ 整条测试通道变死代码且仍绿」 |
| 行尾与 diff 对账 | PASS | 两口径 numstat 一致 |
| 接线棘轮 | PASS | 未新增测试文件（追加进既有 `check-max-lines.test.js`，已由 workflow 点名） |
| QM-1 打包 / QM-4 视觉 | N/A | 纯门禁脚本与文档，无 `apps/desktop/electron/`、`packages/rpa-engine/` 运行面改动 |
| QM-6 CCG 双家族外部评审 | **已执行（1/2 家族出结论）** | 见下节 |
| 远程同步 | PASS | merge SHA 2f0bf1dc（PR #3081，2026-10-08T09:01:23Z）；git ls-remote 证远端分支 m7-repayment-prd 已删（0 行输出） |

## QM-6：外部双家族评审（opencode/deepseek 已出结论；claude/anthropic 未产出）

**跨家族组合已打通**——此前三轮判定「外部双审核不可执行」是错的：后端一直都在，
根因是 `opencode` 的真实 exe（`D:\Program Files\npm-global\node_modules\opencode-ai\bin\opencode.exe`）
不在 PATH 上（PATH 上只有 npm 生成的 `.ps1` shim，Go 的 `exec` 解析不了，报
`cannot run executable found relative to current directory`）。补 PATH 后两个后端均能启动并返回 Session-ID。

- **opencode（deepseek/hy3 家族）**：产出 11 KB 实质评审，抓到 1 个 🔴CRITICAL + 多个 🟠MAJOR。
- **claude（anthropic 家族）**：进程启动并返回 Session-ID，但未产出模型正文（文件停在 262 字节的 wrapper 横幅）。

### opencode 抓到的 🔴CRITICAL（已修）

`--update` / `--update --rewrite` 只重建 `//,limit,growthAllowance,files,pruned` 五个键，
跑一次就把 `testLimit` / `targets` / `testFiles` / `testPruned` **静默抹掉** —— 门禁当场退回
「只挡新增、测试文件全不管」的旧行为且**零报错**。

自查（门禁主断言 + 4 条反证 + 27 条测试）**未覆盖 `--update` 这条路径**。这正是外部评审的增量。
已修 `computeUpdate()` / `writeBaseline()` 显式搬运四个新键 + 补 2 条回归锁（含「缺省必须是空对象
而非 undefined」）。复验：`--update` 后 targets 20 / testFiles 13 / testLimit 1500 全部保留。

### opencode 抓到的 🟠MAJOR（已修 2 条，留待处理 3 条）

| 评审意见 | 处置 |
|---|---|
| 首批 targets 混入 **esbuild 产物 / locales / 设计令牌 CSS** —— 给它们 0 容差等于任何一次 i18n 新增都让 CI 红 | ✅ 已加 `TARGET_EXCLUDE_RE` + `isTargetable()`，反证「locales/zh.js +2 行不报」 |
| `--prune` 不清 `targets` ⇒ 已还债文件被 0 容差永久盯着，成僵尸目标 | ✅ `--prune` 连带摘除 `targets`/`testFiles` 同名条目 |
| `targets` 分支的 `continue` 会跳过账本检查，可能让 prune 过的文件借 targets 逃逸 NEW_OVER_LIMIT | ⬜ 未处理：当前 `continue` 后仍会走到下方 `ledger` 循环，但需补一条针对性回归锁确认边界 |
| `files` 与 `targets` 长期不一致（14 条历史漂移被 ratify），`computeUpdate` 的 `blockedRaise` 会持续误报警 | ⬜ 有意保留：`blockedRaise` 的「持续提示」正是逐步收敛的观察窗；`files` 不抬高是为了不抹掉漂移证据。已在 PRD §7 写明 |
| 文件头仍写「四条硬规则」、usage 块缺 `--prune-test` | ✅ 已更新 usage 注释 |

### 未闭合

- **claude（anthropic）侧未产出评审正文**：进程启动成功但输出未落盘。本 PR 的 QM-6 只能算
  **单家族（opencode）评审 + 自查**，不是真正的双家族交叉。这一点如实记录，不按「已双审」上报。
- `targets` 与 `files` 的长期一致性机制未建立（依赖人工维护）。

## PRD 同步（本 PR 一并修正的三处与现状脱节的记载）

| 位置 | 原记载 | 更正为 |
|---|---|---|
| §17.2 QM-3 / §17.3 测试基线（4 处重复区块） | 「本轮串行全量 357 files / 6120 tests passed」 | **768 files / 13974 tests passed**（2026-10-07 `vitest run --coverage` 实测，耗时 2001s，零失败） |
| §17.3（新增段） | 无覆盖率口径记载 | 记入 `src/**/*.vue` 纳入覆盖率的事实、四项实测值与「阈值不变」的结论，并链到 Gate 15c |
| §8 内容采集（4 处重复区块） | 该节 `失败/超时/卡/重试/兜底/中断` 零命中——**批量采集的失败兜底行为完全没写** | 新增 §8.3.1：连续失败 10 次（≈20s）/ 总时长 10 分钟两条独立判据、成功即清零、已采集数据保留、两个 i18n key 与提示语义、为何不是 3 次 |
| 头部功能文档索引 | 未收录本次 | 收录 [PRD-MAX-LINES-REPAYMENT-2026-10-07.md](./PRD-MAX-LINES-REPAYMENT-2026-10-07.md) |