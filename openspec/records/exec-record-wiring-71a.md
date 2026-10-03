---
record: exec-record-wiring-71a
task: 实测暴露 Gate 2c2 住在被 docs-only 短路的 job 里，把「搬家先于删参数」写进第 7 组；顺手回填 #2757 自己的记录
date: 2026-10-02
sync_status: PENDING
sync_reason: 本 PR 自身尚未合并，merge SHA 与远端分支删除状态此刻不存在（这正是 PENDING 的语义）
sync_backfill_owner: 下一个会话（回填后删除本段三个 sync_* 字段）
---

## 本次执行记录：执行记录判据的接线位置审计（7.1a/7.1b/7.1c）+ #2757 记录销账（exec-record-wiring-71a，2026-10-02）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯 `openspec/` 规格变更 ⇒ 按 AGENTS.md 就地编辑共享主工作区 + 经 PR 落地，不进 worktree；动手前 `git merge --ff-only origin/main` 对齐（改前后 `git status --porcelain` 均为空） |
| 第一性原因（QM-5 ①） | PASS | 不是"忘了写 7.1"。是**接线位置的资格没被核对过**：#2717 把 `Gate 2c2` 放进 `quality-gate.yml` 的 `static-gates`，只验了"这个 job 会不会跑我的脚本"（第 6 组取证 = 会跑），从未验"这个 job 对**哪类 PR** 跑"。而 `static-gates` 带 `if: needs.changes.outputs.docs-only != 'true'`（`quality-gate.yml` L70） |
| 逃逸分析（QM-5 ②） | PASS | 为什么第 6 组取证没暴露：取证用的是 #2717 自己那次 run——它改了 `scripts/` 与 `.github/workflows/`，是**混合 PR**，`static-gates` 照常执行；判据因此第一次真跑就落在"这个 job 不会跳过"的那类 PR 上，观察样本对目标人群是**有偏的**。反证来自本 PR 的对照面：#2757（三个 `openspec/` 文件，`docs-only=true`）的 check 名单里 `QG Static skipping`、`QG Changes pass` —— 纯文档 PR 上这条判据**一次都没执行过**，而"整篇没写执行记录"恰恰最发生在这一类。既有的一条同族纪律（"白名单里的数据文件，它的校验不能只待在会被短路的 job"，#2718 已为账本 JSON 立过）当时被当成"要提醒实施者"的口头待办，没有落成规格项，所以这次由实测补成 7.1a/7.1b/7.1c 三条可验收任务 |
| 修复 + 回归保护（QM-5 ④） | PASS | `openspec/changes/enforce-gate-record-presence/tasks.md` 第 7 组由 1 条扩为 4 条：7.1 保留（删 `--mode=advisory` + 触发条件）；**7.1a 搬家先于删参数**，落地位置三条资格逐个实测——`doc-gate.yml` 的 `doc-gate` job（check 名 `文档同步检查`）① `on: pull_request` 无 `paths-ignore`，② 在 ruleset `main-ci-gate` 的 required 清单内（`gh api repos/…/rules/branches/main` 实测 6 个 context），③ 其 `actions/checkout` 带 `fetch-depth: 0`（L38-40，三点 merge-base 可用）；并显式禁止搬进 `changes` job（实测 `QG Changes` **不在** required 清单，红也不拦）。**7.1b** 两道结构锁（required workflow 内 + 无 advisory；沿用 #2718 为账本立的"位置即前提"形制）。**7.1c** 取证必须在**新位置**重跑一遍再看 N 非零——否则 base 取不到时脚本 fail-closed，后果是每条 PR 都被判红而不是静默失效 |
| 防止再次发生（QM-5 ⑤） | PASS | 把"接线位置的资格"拆成三个可核对问题：**跑不跑（触发器/paths-ignore）→ 红不红得动（在不在 required 清单）→ 取不取得到证据（checkout 深度与所跑 OS）**。第 6 组当时只回答了第 1 问的一半（跑，但没问对谁跑）。这条判据同时写进 7.1b 的结构锁，防止后来者把步骤"顺手挪回" static-gates |
| 行尾与 diff 对账 | PASS | `tasks.md` 与 `backfill-2717-exec-record.md` 均 `i/lf w/crlf`（`git ls-files --eol`），新建文件 `i/lf w/lf`；两口径 numstat 对账与删除行归因见下方补记 |
| 接线棘轮 | N/A | 本 PR 不新增测试文件、不改 workflow；`check-unwired-tests` / `check-step-failfast` / `check-max-lines` 作为既有锁复跑，rc 见补记 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触碰 `apps/desktop/electron/`、`packages/rpa-engine` 与任何 UI；改动面只有 `openspec/` |
| QM-6 CCG 双模型外部评审 | 未执行 | 本机无 `codeagent-wrapper`；AGENTS.md 对纯规格/文档变更不强制 QM-6，如实登记而非以自审冒充 |
| 远程同步 | PENDING | 合并后由下一个会话回填：merge SHA 与时间取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI`，远端分支删除取 `git ls-remote --heads origin exec-record-wiring-71a` 返回 0 行；回填后**删除本文件 frontmatter 的三个 `sync_*` 字段** |

### 顺带完成的上一个会话欠账

- 回填 #2757 自己的记录 `openspec/records/backfill-2717-exec-record.md`：`远程同步` 改 PASS（merge SHA `6a51c79f`，2026-10-01T22:51:31+08:00，`ls-remote` 0 行，三个文件与分支侧 blob 逐字节相同），并整段删除其三个 `sync_*` 字段。这已经是这条链上连续两次由"下一个会话"销账，机制的收敛方向实测成立（`check-gate-record-debt` 从 PENDING 计数的口径看，登记项随文件删除而减少）。

### 遗留（不假装已闭合）

- **观察期的数字现在不可信**：既然 `docs-only=true` 的 PR 上这条判据从未执行，那"advisory 窗口里到底漏了多少条"就无法从 advisory 输出里读——只能像 #2717 那样用 first-parent 窗口离线统计。8.2 的复盘若要写"存量数字是否下降"，必须标明这个口径缺口，不得拿 advisory 计数当趋势。
- **【2026-10-02 同日晚些时候被推翻，见下方「更正」】7.1a 的落点曾选 `文档同步检查`**，理由写的是"`QG Changes` 不在 required 清单，红也不拦"。这个推论错了，落点也随之改回 `quality-gate.yml` 的 `changes` job；详见本文件末尾的「更正」小节。此处保留原文以免把"改过判断"抹平成"一开始就对"。
- **本次仍未转阻断**：按既定决定，等在途 PR 排空。本 PR 只把"排空后该怎么落地"钉清楚。

### 更正（同一会话内被自己的二次实测推翻，2026-10-02）

上面「修复 + 回归保护」行与「遗留」第 2 条里，**"把判据搬进 `changes` job 只解决不被短路、不解决红得动（`QG Changes` 不在 required 清单）"这一句是错的**，落点结论一并作废，已在 tasks 7.1a/7.1b/7.1c 改写。三条实测依据：

1. **required 是两层并集，不是一层。** ruleset `main-ci-gate` 给 6 个（`QG Static`/`QG Unit Tests`/`electron-tests`/`文档同步检查`/`债务熔断检查`/`单元测试 + Lint`），classic protection 另给 4 个（`Gate Result`/`build`/`QG Unit Tests`/`QG Coverage`），并集 9 个。我先前只读了一层，还把"另一层"判成不存在。
2. **`Gate Result` 是 required，且它 `needs: [changes, …]` + `if: always()`**，判定表逐条列 `changes` 的结果、`$allowed = @('success','skipped')`、其余 `exit 1`（`quality-gate.yml` L1073-1111 实读）。⇒ `changes` 失败会经 `Gate Result` 拦下合并。"不在 required 清单的 job 红了也没用"这个直觉，在**有聚合 job 且聚合 job 本身 required** 的仓库里不成立——判"红得动"必须连着看 `needs` 边，而不是只看 context 名。
3. **落点因此回到 `changes`**：与 #2718 为 `check-gate-record-debt` 选的形制一致（不被短路、`fetch-depth: 0`、base sha 在作用域内），且判据仍住在它自己的 workflow 里，不跨 workflow 借 context。

**我这轮在此过程中踩到的三个探针错误，都记下来（它们各自都能伪造一个结论）**：

- `gh api repos/…/branch-protection` 返回 404，被我读成"本仓没有 classic protection"。真正的端点是 `branches/main/protection`，它是活的。**404 是坐标错误的表现，不是配置不存在的证据。**
- `gh api … --json required_status_checks`：`--json` 不是 `gh api` 的旗标（那是 `gh pr view` 的）。**实测 rc=1、输出是 usage 文本**——命令本身失败得很响亮，真正的问题在我这边：那一次我把 `echo "rc=$?"` 写在一条裸 `echo` 之后，取到的是那条 `echo` 的 0，于是"它失败了"这个事实被我自己的取码写法吃掉，只留下"输出不像数据"的印象。口径：取码一律 `out=$(cmd 2>&1); rc=$?`，中间不得插任何命令。
- ruleset 的 context 挂在 `parameters.required_status_checks` 下，不在 `rules`；而 `/rulesets` 列表端点里的 `rules` 本就是空的。按 `rules` 解析得到 `contexts=[]`，我当场差点据此判"ruleset 没要求任何检查"。

**遗留追加**：7.1c 里"聚合边有效"目前是**读代码**得出的，没跑过反证。第 7 组必须补一次现场反证——让 `changes` 真红一次，确认 `Gate Result` 随之红且 PR 合不动；只看判定表文本不构成证据。

