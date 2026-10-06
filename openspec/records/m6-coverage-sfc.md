---
record: m6-coverage-sfc
task: 把 Vue 单文件组件纳入覆盖率门禁的统计范围，并加装防「静默缩范围」的结构门禁
date: 2026-10-07
# ↓ 下面三个字段只在「远程同步」尚无法收口时填写；回填成 PASS 后必须整段删除。
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（合并后立即开回填 PR 收口）
---

## 本次执行记录：覆盖率门禁纳入 Vue SFC（M-6，m6-coverage-sfc，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码 + CI 配置变更 ⇒ **必须隔离 worktree**。全程在 `D:\Data\projects\mp-worktrees\mp-m6-coverage`、裸分支 `m6-coverage-sfc`，基线 `cfaafb85`；共享主工作区未写入。`scripts/verify-worktree-deps.js` 输出「消费方解析通过 11 项…OK」 |
| 第一性原因（QM-5 ①） | PASS | `apps/desktop/vitest.config.js:67-82` 的 `coverage.include` 共 13 条，**全部为 `*.js` glob**，零 `.vue`。`src` 下 146 个 `.vue` 对覆盖率贡献恒为 0。根因不是阈值太松，而是**量错了对象**——旧门禁的真实含义是「我不看你测了多少界面代码」 |
| 逃逸分析（QM-5 ②） | PASS | ①门禁层：CI 跑 `pnpm --filter @multi-publish/desktop test:coverage`，`Gate Result` 只看 job 退出码；coverage 数字达标即绿，而**排除 SFC 恰恰会让数字更好看**，没有任何一处会红。②测试层：视图测试存量其实很厚（`CreateView.test.js` 961 行、`ResultView.test.js` 954 行、`Accounts.test.js` 743 行、`Collection.test.js` 560 行），但「测试存在」与「测试被计入」是两件事，无人做交叉核对。③评审层：`include` 是一段看起来无害的路径列表，diff 里 13 条 `*.js` 混在 14 条里极易滑过 |
| 修复 + 回归保护（QM-5 ④） | PASS | 修复：`coverage.include` 增 `src/**/*.vue`（+6 行含注释）。回归保护：Gate 15c `check-coverage-include-sfc.js` + `.test.js` **11 用例全绿**，接进 `quality-gate.yml`（`static-gates` job，紧随 Gate 15）。**反证已做**：撤掉 `src/**/*.vue` → 门禁 exit 1，点名「13 条全是 `*.js`」+「146 个 `.vue` 未被覆盖」；恢复 → PASS 146/146。红→绿闭环完整 |
| 防止再次发生（QM-5 ⑤） | PASS | Gate 15c 的四条断言里，第 2 条（glob 必须**实测命中到文件**）与第 4 条（thresholds 存在且为正）专门防「配置看着对、实际是空转」。新增目录没被 glob 带上由第 3 条兜住。门禁本体与回归锁都在 `static-gates`，而本 PR `docs-only=false`（实测分类器输出），故该 job 不会被 docs-only 短路 |
| 行尾与 diff 对账 | PASS | `git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径完全相同：`check-coverage-include-sfc.js` 177/0、`check-coverage-include-sfc.test.js` 155/0、`quality-gate.yml` 16/0、`vitest.config.js` 6/0。无 CRLF 噪声 |
| 接线棘轮 | PASS | 新增的 `check-coverage-include-sfc.test.js` 已被 `quality-gate.yml` 的 Gate 15c 显式 `node --test` 点名（结构锁见测试第 11 条）。既有 `workflow-contract.test.js` 32/32 通过 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行面：无 `apps/desktop/electron/` 与 `packages/rpa-engine/` 改动；`check-max-lines.js` 98/98 挂账未变、无新增超大文件 |
| QM-6 CCG 双模型外部评审 | 未执行 | 见「遗留」 |
| 全量实测 | PASS | `vitest run --coverage --maxWorkers=1 --no-file-parallelism`：768 文件 **767 通过 / 1 跳过**，13974 用例 **13971 通过 / 3 跳过**，**零失败**，耗时 2001s |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin <branch>` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 关键数据：阈值为什么一个都不用改

| 口径 | 文件数 | statements | branches | functions | lines |
|---|---|---|---|---|---|
| 旧口径（13 条 `*.js` 实际命中） | 495 | 55834 / 76.71% | 51416 / 67.61% | 8039 / 78.37% | 47617 / 78.91% |
| SFC 部分（本次新增） | 146 | 16260 / 76.02% | 16143 / 68.87% | 4282 / 66.60% | 13849 / 79.52% |
| **合计（新口径）** | 641 | 72094 / **76.55%** | 67559 / **67.91%** | 12321 / **74.28%** | 61466 / **79.05%** |

- 现有阈值 55 / 40 / 60 / 55 **全部保持不变**：实测四项均远高于阈值。
- 门禁文件集实际膨胀：statements **+29%**、functions **+53%**。
- 唯一真正下降的比率是 functions（78.37% → 74.28%）——SFC 带来 4282 个函数而其中仅
  66.60% 被覆盖。这不是新出现的债，而是**过去被排除在外、因此看不见的那部分真实缺口**。
- SFC 覆盖率并不比 `.js` 差（statements 76.02% vs 76.71%，几乎持平）。

### 一次被数据推翻的预设（如实记录）

动手前的预设是「补 SFC 会显著拉低总覆盖率，阈值必须下调」——**这个预设是错的**。
SFC 部分的覆盖率与 `.js` 基本持平，于是「先补 include 记基线、再定阈值」的两步走
自然收敛成了一步：第一步做完，数据自己回答了第二步要不要做。

若当时照预设先去调阈值，那就是拿猜测覆盖证据。门禁的价值不在于数字好看，
而在于它量的对象是对的。

### 一处自曝的失误

第一轮全量跑测失败 423 条，根因是 `Electron failed to install correctly` ——
本 worktree 漏跑 `node scripts/ensure-electron.js`（AGENTS.md 要求 install →
ensure-electron → verify-worktree-deps 三步，我做了第 1、3 步，跳过第 2 步）。
失败是环境性的、与 `.vue` 改动无关，但该轮数据作废已整轮重跑。补跑后抽查 3 个
先前失败的文件（54 用例）全绿，才重启全量。

### 遗留（不假装已闭合）

- **QM-6 CCG 双模型外部评审未执行**：本次改动虽含运行时代码与 CI 配置，但 `pre-commit`
  的 CCG 门禁判定 `0 个源文件 / S 复杂度低风险`（改动集中在配置 glob 与门禁脚本本身），
  按决策矩阵不调外部模型。本记录不以自审冒充通过，如实标注未执行。
- **阈值通过是算术判定而非重跑判定**：取数时用 `--coverage.thresholds.*=0` 覆盖了阈值，
  实测值均高于配置中的 55/40/60/55，而 vitest 仅在实际值低于阈值时判红。**未再用真实
  配置重跑一遍复验**，该结论由算术得出。
- **阈值只有下限、没有爬升计划**：本次确认 76.55% 有大量余量，但仓库没有任何机制要求
  覆盖率随时间提高。真正的保护来自 Gate 15c（保证文件集不被静默缩小），而不是数字本身。
- **M-4（`reportError` 未处理的 Promise 拒绝）** 确认无法在 vitest 覆盖，需要 Electron
  主进程环境，仍未处理。