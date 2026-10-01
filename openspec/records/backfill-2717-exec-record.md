---
record: backfill-2717-exec-record
task: 回填 #2717 的执行记录并销账 + 第 6 组 runner 证据入账 + 纠正"D8 已被测试钉住"的过宽表述
date: 2026-10-01
sync_status: PENDING
sync_reason: 本 PR 自身尚未合并，merge SHA 与远端分支删除状态此刻不存在（这正是 PENDING 的语义）
sync_backfill_owner: 下一个会话（回填后删除本段三个 sync_* 字段）
---

## 本次执行记录：#2717 记录回填与 runner 证据入账（backfill-2717-exec-record，2026-10-01）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯流程/规格变更（只碰 `openspec/`），按 AGENTS.md 分层口径就地编辑共享主工作区 + 经 PR 落地，不进 worktree；共享根先 `merge --ff-only origin/main` 对齐再动手，改前 `git status --porcelain` 行数 0、改后仍停在 main |
| 第一性原因（QM-5 ①） | PASS | 不是"忘了回填"。#2717 落地后 `openspec/records/gate-record-presence-impl.md` 仍顶着 `PENDING` + 三个 `sync_*` 登记字段，而这个载体**唯一的收口压力来自 `check-gate-record-debt` 对未收口行的检测**——它此刻判 OK（因为已登记），所以没有任何东西会催这条回填；"已登记"把"待办"变成了合法的永久状态 |
| 逃逸分析（QM-5 ②） | PASS | 单测层：14 条测试全在驱动 CLI 自身，不读记录文件内容；`check-gate-record-debt`：登记即放行（设计如此，它管的是"未登记"）；`check-pr-exec-record`：advisory 恒退出 0；人工层：PR 标题写了"advisory 第一步"，读起来像"这活儿到此为止"。结论——**登记字段的删除没有到期机制**，本条属设计已知代价，正解就是"下一个会话回填并删字段" |
| 修复 + 回归保护（QM-5 ④） | PASS | ① `gate-record-presence-impl.md` 的 `远程同步` 改 PASS 并整段删除三个 `sync_*` 字段（清单收敛实证）；② `tasks.md` 的 5.4/6.1/6.2 勾选并写入 runner 现场原文（`变更文件 13 个（A=6 M=7 D=0）`、`MODE=advisory（尚未接进判定…）`、`# pass 14 / # fail 0`），8.1 勾选；③ 7.1 改写为带**可机械核对触发条件**的延后项，并新增一条它必须顺带补的锁 |
| 防止再次发生（QM-5 ⑤） | PASS | 本次实测纠正了一处**我自己上一轮写下的过宽表述**：workflow 注释与 5.3 都声称"advisory 标记被 `check-pr-exec-record.test.js` 钉住，所以不会长期停在人工核查"。逐条读那 14 条测试证伪——没有一条读 `.github/workflows/quality-gate.yml`，被钉住的只是脚本能跑 advisory 这一能力，**接线状态无人检测**。已把该事实写进记录「遗留」与 7.1（转阻断必须同 PR 补一道读 workflow 的结构锁）。另把"延后"钉成一句话判据（在途 open PR 为空或全部带记录），避免它退化成第二个 release-gate 视觉项 |
| 行尾与 diff 对账 | PASS | 两文件均为 `i/lf w/crlf`（`git ls-files --eol` 实测），改前后各文件内无混行尾；提交后按两口径 numstat 对账，结果记在本行下方"回填补记" |
| 接线棘轮 | N/A | 本 PR 不新增测试文件，也不改 workflow；既有锁的接线状态由 `check-unwired-tests.js` 与 `check-step-failfast.js` 复跑证明（各自 rc=0） |
| QM-1 打包 / QM-4 视觉 | N/A | 未触碰 `apps/desktop/electron/`、`packages/rpa-engine` 与任何 UI |
| QM-6 CCG 双模型外部评审 | 未执行 | 本机无 `codeagent-wrapper`，按门禁口径如实登记，不以自审冒充通过；本 PR 变更面为两份 openspec 文本，无运行行为 |
| 远程同步 | PENDING | 合并后由下一个会话按既有 PASS 口径回填：merge SHA 与时间取 `git log origin/main --grep` 该 PR 号，远端分支删除取 `git ls-remote --heads origin backfill-2717-exec-record` 返回 0 行；回填后**删除本文件 frontmatter 的三个 `sync_*` 字段** |

### 回填补记（判定必须在 commit 之后跑，否则 fail-closed 判成 docs-only=false，故单列一段）

- `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → `docs-only=true`，`files=3`（`tasks.md` + 本文件 + `gate-record-presence-impl.md`）
- 两口径 numstat 完全相同：`6 6`、`29 0`、`3 5`；删除 11 行全部可归因——`gate-record-presence-impl.md` 的 5 = 3 个 `sync_*` 字段 + 1 条旧 PENDING 远程同步行 + 1 条被两条新条目替换的「遗留」项；`tasks.md` 的 6 = 6 行就地改写的勾选（5.4 / 6.1 / 6.2 / 7.1 / 7.4 / 8.1）。三个 blob 内 `CR` 计数均为 0（`git show HEAD:<file>` 逐文件实测），工作区里两个既有文件 `w/crlf`、新建文件 `w/lf`，提交侧口径一致
- 其余保留门禁实跑 rc=0：品牌残留（扫描 6591 个 tracked 文件）、文档同步（**`--base` 必须传裸分支名 `main`**，脚本内部自己拼 `origin/` 前缀；传 `origin/main` 会得到 `fetching origin/origin/main … couldn't find remote ref` 且 rc=128）、`check-gate-record-debt`（记录文件 3 篇、无陈旧登记、登记字段无残留）、`check-unwired-tests`（域内 53 个测试文件全接线）、`check-step-failfast`（4 个多命令步骤全 fail-fast）、`check-max-lines`、`check-debt-budget`
- 存在性判据以 **enforce 模式**自证本 PR 合规：`本 PR 变更文件 3 个（A=1 M=2 D=0） ｜ 新增记录 1 篇 / 新增豁免 0 篇 ｜ 待清理豁免 0 条` → `OK` rc=0。注意这只是本地自证，CI 上该步仍是 advisory；把它变成必需检查正是被推迟的第 7 组

### 遗留（不假装已闭合）

- **登记字段没有到期机制**：本条回填靠"下一个会话记得做"。载体设计用"文件名即键 + 登记随文件走"消灭了外部清单要同步删条目的漂移，但"何时该删"仍是人治。若要根治，需要一个"记录已 PASS 却带 `sync_*`"之外的正向检查——现状是反向检查（PENDING 必须带字段），二者不是一回事。
- **转阻断被推迟**：技术前置（第 6 组证据）已成立，推迟纯粹是并发成本考虑（2026-10-01 实测在途 7 个 PR 的新载体携带数为 0）。触发条件已写进 tasks 7.1；在条件满足之前，观察期每合并一个 PR 就多一条零记录落地，这部分代价是显式接受的。
- **本次没改 workflow 注释里那句被证伪的表述**：改它必然碰 `.github/workflows/` ⇒ 本 PR 从 docs-only 变成混合 PR（全量 CI 约 60 分钟），而那句话本来就要在 7.1 删参数时整段重写。留到那里做，并已在 7.1 里点名。
