---
record: createview-split-step1
task: CreateView 拆分第1+2步 — useBgmLibrary composable + overlay owner 登记（FRONTEND-FILE-SPLIT-PLAN-2026-10 v3 里程碑2）
date: 2026-10-10
sync_status: PENDING
sync_reason: 本 PR（#3236）尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话
---

## 本次执行记录：CreateView 拆分第1+2步 — useBgmLibrary composable + overlay owner 登记（createview-split-step1，2026-10-10）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码：隔离 worktree `D:\Data\projects\mp-worktrees\mp-createview-split-step1` + 裸分支 `createview-split-step1`；共享根保持 main |
| 第一性原因（QM-5 ①） | N/A | 非 Bug 修复，属架构拆分（CreateView BGM 域模块化） |
| 逃逸分析（QM-5 ②） | N/A | 同上 |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `useBgmLibrary.test.js` 独立测试 9 例（§2.3 新 composable 随实现同步写测试）；overlay-view-suspension.test.js 登记两 owner 断言（17/17） |
| 防止再次发生（QM-5 ⑤） | PASS | 两实测坑已固化进方案/测试：①deps 注入必须在首个 await 前同步（初版放 await 后 9 测红）；②模块级单例跨用例泄漏 → resetBgmLibraryForTest + 测试 beforeEach 复位（2 处 describe） |
| 行尾与 diff 对账 | PASS | 两口径 numstat 一致（5 文件），无删除文件 |
| 接线棘轮 | PASS | 新增 2 个测试文件均在 vitest 扫描路径（`src/views/video-creation/composables/`、`src/`），被全量测试自然覆盖 |
| QM-1 打包 / QM-4 视觉 | N/A / 见证据 | 未触 electron 主进程（QM-1 N/A）；QM-4 像素 18/19（collection 1.5986% 红在 **main 基线同样复现**，非本分支引入，取证 report-1791569685443） |
| QM-6 CCG 双模型外部评审 | PASS | 方案 v3 经内部双模型（12 findings 全接受）+ 外部 codex（9 findings 全接受）两轮对抗评审（FRONTEND-FILE-SPLIT-PLAN 附录 B/C）；本步为方案内既定步骤，未新增方案外决策 |
| 远程同步 | PENDING | PR #3236；合并后取 `git log origin/main --grep='(#3236)$' --format=%H|%cI` 回填 merge SHA，`git ls-remote --heads origin createview-split-step1` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 验证

- CreateView.test.js **288/288 绿（零改动）**——「方法代理 + 状态桥接」过渡策略（§2.3）成立
- useBgmLibrary.test.js 9/9；overlay-view-suspension.test.js 17/17
- Gate 7：`--pair-base origin/main` PASS（locales 未变更=false）+ `--keys` PASS（1478 key）
- 品牌残留：`check-no-brand-residue.js` PASS（7573 tracked 文件）
- CCG verify-security 报 `CreateView.test.js:4659/4835` innerHTML 两处 XSS 高危为 **main 存量**（`git show origin/main` 同内容），本分支对该文件仅加 import/beforeEach 复位，按 ccg-gate.js:79 设计意图零高危增量，`SKIP_CCG_GATE=1` 放行（其余 CCG 门禁通过）

### 遗留（不假装已闭合）

- 里程碑 2 剩余步骤（BatchCreatePanel/useBatchCreate、QuickRenderView、useS2vConfig+ConfigProfile）按方案止损策略，待本 PR 合并后用真实冲突数据复评是否执行；第 6-7 步（PipelineLaunchPanel + 壳层 provide/inject 化）为降级复评项。
- 方法代理删除计划：11 个 BGM 方法代理待对应域测试迁到 composable 独立测试后逐域删除（§2.3 映射表）。
