# PRD：执行记录存在性门禁补「纯回填」出路④（exec-record-backfill-exit）

- 日期：2026-10-05
- 分支：`exec-record-backfill-exit`（worktree `mp-exec-record-backfill-exit`）
- 变更面：`scripts/check-pr-exec-record.js` / `scripts/check-pr-exec-record.test.js`（门禁脚本 + 回归锁）
- 关联：#2920 实测动因、#2923 遗留项（`--head` 空值回落）、AGENTS.md「执行记录里的待办状态必须有东西在检测」

## 1. 问题

`check-pr-exec-record.js`（Gate 2c2）原有三条合法出路：

1. 新增 `openspec/records/<分支名>.md`（A）；
2. 修订本分支自己那篇记录（M 且文件名 == `<headBranch>.md`）；
3. 新增带非空原因的豁免 `_exempt/<分支名>.md`（A）。

「回填型 PR」的定义恰恰是修订**别的分支**那篇记录（`M openspec/records/<别的分支>.md`），三条出路对它全部不可用：

- 出路①：新增自己那篇 = 给一条 meta 变更再造一笔 PENDING 欠账（三阶递归）；
- 出路②：文件名必须等于分支名，回填改的偏偏不是自己那篇；
- 出路③：豁免堆积阈值 3，盘上已有 1 条，逼近即红。

实测（2026-10-05）：`--mode=enforce` 对 #2920（回填 #2914 记录的 PR）报「本 PR 未携带执行记录」rc=1。CI 传的是 advisory 才没拦 —— 整类合法 PR 靠观察态掩盖的假阴性。

## 2. 方案：出路④「纯回填」（定义式）

判据（`isPureBackfillChangeSet`，独立纯函数可单测）：

- 变更集**非空**；
- 每一条都是载体文件的 **M**：`openspec/records/[^_]*.md`、`.quality-gates.md`、`scripts/gate-record-debt-ledger.json`；
- **且至少含一篇 `openspec/records/*.md` 的 M**（QM-6 收紧，见 §4）。

放行时 summary 必须点名「回填型 PR（载体修订 N 篇）」，且 `载体M=<n>` 计数**无条件**打印 —— 回填未成立时（载体 M 夹了代码）作者能直接看出差在哪。

## 3. 刻意收窄的三条边界

| 形态 | 判定 | 理由 |
|------|------|------|
| 夹带任何 A / D / 非载体文件 | 不适用出路④，仍要求记录 | 行为变更不得藏进回填 |
| 只 M `.quality-gates.md` / 账本（无记录文件） | **红** | 载体自身可承载行为变更（翻门槛 / 收缩账本）；SOP 里销账与记录更新同次发生，无记录文件的载体集不构成回填 |
| M 自己那篇 + M 别人的记录 | 放行；`revisedRecords` 与 `backfillRevised` 各自计数、互不混同 | 出路②与出路④可同时命中，语义不冲突 |

## 4. QM-6 前端评审关键条目的处置

- **C2（采纳并收紧）**：评审指出纯载体 M 一律放行会让 `.quality-gates.md` 门槛调整白坐出路④。采纳 —— 加「至少一篇记录文件的 M」子句（M6 变异反证守卫）。
- **C1（采纳）**：失败文案出路④改为定义式措辞（「满足此定义者直接放行…即不符合此定义」），避免被读成对当前 PR 的放行指令。
- **W1/W2（不采纳改名）**：`CARRIER_RE` / `backfillRevised` 沿用本项目既有「记录载体」词汇；改为补互斥性注释。
- **W4/W5/W9 + I1/I2/I3/I4（采纳）**：错误信息去 CI 专有单指、夹带测试补 A/D 形态、summary 恒打印载体 M、判据抽纯函数、测试文件名合成化、legacy 载体清单断言、双 M 并存用例。
- **I5（不采纳）**：CLI 真实远端分支集成测试 —— consumedExempts 阈值已被单元覆盖，真实远端夹具成本不成比例。

## 5. #2923 遗留顺手项：`--head=` 空值拒绝

显式 `--head=`（空串）现在 rc=2 拒绝并出声，不再经 `args.head || 'HEAD'` 回落 —— pull_request 检出下 HEAD 是合并提交，回落等于把「取证失败」伪装成「取到了」。**workflow 侧保留 `${EXEC_HEAD_SHA:-HEAD}` 兜底**：push 事件合法传字面量 HEAD（advisory + 无 base），删兜底会让每个 push run 撞新检查直接红。脚本级拒绝 + workflow 级兜底是自洽组合。

## 6. 回归锁与反证

- `check-pr-exec-record.test.js` 34/34（新增 4 条锁 + 改写 1 条旧契约）。
- 6 条变异反证（`D:/tmp/mp-mut-t33.cjs`）逐条实测变红且命中预期用例，收尾断言还原后与原文件逐字节相同。
- 周边门禁：`check-unwired-tests` / `check-step-failfast` / `check-no-brand-residue` / `check-gate-record-debt` 全绿。

## 7. 遗留

- `CARRIER_RE` 仍是写死的三形态；新增第三种记录载体时必须同步扩正则（建议与「新增载体」的 PR 同步改并登记）。
- 「转阻断」（删 CI 的 `--mode=advisory`）仍是单独一次有意动作；出路④补齐后四条出路已覆盖已知合法形态，转不转属独立决策。
- `--head` 裸 flag（不带 `=` 解析成 boolean）仍会被 `args.head || 'HEAD'` 读成 truthy —— 既有行为未动，参数校验整体加固另行立项。
