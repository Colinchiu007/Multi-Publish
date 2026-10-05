---
record: exec-record-backfill-exit
task: 执行记录存在性门禁补第四条合法出路——纯回填型 PR（变更集全为记录/台账载体的 M）不再被误判为「未携带执行记录」
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由回填者把下行改成 PASS 并删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（取证离线：git log origin/main --grep=(#NNNN)$ --format=%H|%cI）
---

## 本次执行记录：执行记录门禁补「纯回填」出路④（exec-record-backfill-exit，2026-10-05）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（门禁脚本 + 测试）⇒ 独立 worktree `D:/Data/projects/mp-worktrees/mp-exec-record-backfill-exit`，裸分支 `exec-record-backfill-exit`；判据以 `git worktree list` + `git -C <绝对路径> rev-parse --abbrev-ref HEAD` 实证。基线起于 `331883e28`，推送前 merge `origin/main`（56d316344）保持同步 |
| 第一性原因（QM-5 ①） | PASS | 实测 #2920（回填 #2914 记录的 PR）：出路②要求 M 的文件 == `openspec/records/<headBranch>.md`，而「回填」的定义恰恰是 M **别的分支**那篇记录 ⇒ 三条合法出路对回填型 PR 全部不可用：①新增自己那篇 = 给一条 meta 变更再造一笔 PENDING 欠账（三阶递归）；③豁免堆积阈值 3、盘上已有 1 条，逼近即红。实测 `--mode=enforce` 对 #2920 报「本 PR 未携带执行记录」rc=1，CI 传 advisory 才没拦 —— 即当前该门禁对整类合法 PR 是靠 advisory 观察态掩盖的假阴性 |
| 逃逸分析（QM-5 ②） | PASS | 单元层：原有夹具只覆盖「A 自己那篇 / M 自己那篇 / 豁免」三形态，「全 M 别人的载体」不可表示。集成层：CI 一直 advisory，红了也不拦，缺口被观察态吞掉。审查层：#2920 执行时靠人工在 PR 正文自证，门禁零感知 |
| 系统性漏洞定位 | PASS | 判据把「携带记录」过窄地定义为「A 或 M 自己分支那篇」，没有为「修订公共载体」这一合法动作留出口；且 advisory 模式让这类缺口永久停在观察态（与 #2745「转阻断是单独一次有意动作」的纪律配套的，应当是观察期内把出路补齐，而不是无限期观察） |
| 修复 + 回归保护（QM-5 ④） | PASS | `evaluate()` 新增 `isPureBackfill` 判据（经 `isPureBackfillChangeSet` 纯函数：变更集**每一条**都是载体文件的 M，**且至少含一篇记录文件的 M**——QM-6 前端 C2 收紧：载体自身可承载行为变更，翻门槛/收缩账本不得白坐出路④）与 `backfillRevised`（只在走出路④时非空，与豁免出路计数互不重叠）；失败文案补出路④（定义式措辞，前端 C1）。顺手落 #2923 遗留：显式 `--head=`（空串）脚本级 rc=2 拒绝，不再经 `|| 'HEAD'` 把「取证失败」伪装成「取到了」。回归锁 `check-pr-exec-record.test.js` 34/34：出路④正控（点名 + summary 必含「回填」+ `载体M` 计数无条件打印）、夹带 M/A/D 三形态全红、**只 M 门禁清单/账本必红**、legacy 载体须伴随记录 M、A/D 不被吸收、豁免出路不重叠、M 自己+M 别人并存计数不混同、CLI enforce 端到端 rc=0/rc=1、空 `--head=` rc=2。TDD：先 RED 实测变红（4 条新锁按预期原因失败），后转绿 |
| 防止再次发生（QM-5 ⑤） | PASS | 6 条变异反证逐条实测变红并记录：M1 摘 `isPureBackfill`（出路④失效）/ M2 放松状态维（D 也算）/ M3 summary 不打印回填（暗道化）/ M4 空值拒绝退回 `|| HEAD` / M5 载体判据放宽为任意文件（行为变更可藏进回填）/ M6 摘掉「至少一篇记录文件的 M」子句（C2 收紧失效，只翻门槛可白坐）；驱动收尾断言还原后与原文件**逐字节相同** |
| 行尾与 diff 对账 | PASS | 被改两文件实测 `i/lf w/crlf attr/text=auto`，编辑逐行沿用目标行尾；`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径相等（推送前在 PR 上复核） |
| 接线棘轮 | PASS | `check-pr-exec-record.test.js` 已在既有 workflow 点名清单内（quality-gate.yml classify step `node --test`），本次未新增测试文件；`check-unwired-tests`（57 文件）/ `check-step-failfast`（5 步）/ `check-no-brand-residue` / `check-gate-record-debt` 全部实跑通过 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/`、`packages/rpa-engine/` 与任何渲染面；改动面是门禁脚本 + 测试 |
| QM-6 CCG 双模型外部评审 | PASS（带通道偏差） | 真源 `~/.claude/.ccg/config.toml`：backend=codex / frontend=claude。后端（codex）正常出产物；**前端 claude 今日已实测 3 次连续静默失败**（rc=0 无 agent_message 无产物）⇒ 按既定替代通道 `opencode run --model opencode/nemotron-3-ultra-free`，双路 findings 均落盘 `.ccg/review/qm6-{backend,frontend}-exec-record-backfill-exit.json`；处置见 PR 正文（Critical 必须清零才挂 auto-merge） |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin exec-record-backfill-exit` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 遗留（不假装已闭合）

- 出路④的载体清单（`CARRIER_RE`）是**写死的三个形态**。将来若新增第三种记录载体（例如新的台账 JSON），必须同步扩这个正则，否则新载体上的纯回填 PR 又会被误判 —— 建议与「新增载体」的 PR 同步改并在其记录里登记。
- 「转阻断」（删 CI 的 `--mode=advisory`）仍是单独一次有意动作；出路④补齐后该门禁的四条出路已覆盖已知合法形态，转阻断的前置条件比 #2745 时更充分，但转不转仍属独立决策。
- `--head` 裸 flag（`--head` 不带 `=`，解析成 boolean true）仍会被 `args.head \|\| 'HEAD'` 读成 truthy 传入 `changedFileStatuses` —— 这是既有行为，本次未动（CI 调用点恒传 `=` 形态）；脚本级参数校验整体加固另行立项。
