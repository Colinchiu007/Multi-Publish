---
record: gate2c2-landing-correction
task: 推翻自己上一轮写进 main 的落地结论——判据应留在 changes job，失败经 required 的 Gate Result 聚合拦住
date: 2026-10-02
sync_status: PENDING
sync_reason: 本 PR 自身尚未合并，merge SHA 与远端分支删除状态此刻不存在（这正是 PENDING 的语义）
sync_backfill_owner: 下一个会话（回填后删除本段三个 sync_* 字段）
---

## 本次执行记录：7.1a 落地位置纠偏——required 是两层并集且聚合边算数（gate2c2-landing-correction，2026-10-02）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯 `openspec/` 规格变更 ⇒ 就地编辑共享主工作区 + 经 PR 落地，不进 worktree；动手前 `fetch` + `merge --ff-only origin/main`（结果 `Already up to date`，main `d70d7e7a`），改前后 `git status --porcelain` 行数分别为 0 / 3（3 个文件即本次改动面） |
| 第一性原因（QM-5 ①） | PASS | 上一轮我把"这个 context 在不在 required 清单"当成"红不红得动"的**唯一**判据，于是得出"`QG Changes` 不在清单 ⇒ 搬进去没用"。漏的是**聚合边**：`gate-result`（context `Gate Result`）`needs: [changes, static-gates, …]`、`if: always()`，判定表把 `changes` 逐条列入且 `$allowed = @('success','skipped')`、其余 `exit 1`（`quality-gate.yml` L1073-1111 实读）。required 清单里还有第二层（classic protection）我压根没读 |
| 逃逸分析（QM-5 ②） | PASS | 为什么上一轮的"逐个实测"没拦住它：我确实读了 required，但只读了 `rules/branches/main` 一个端点；并且我拿 `gh api repos/…/branch-protection` 得到 **404** 就把"另一层不存在"当成了结论——那是坐标错误（正确端点 `branches/main/protection`，实测 200 + 4 个 context）。同一次测量里还有两个自伤探针：`gh api … --json`（该子命令不接 `--json`，实测 rc=1 输出 usage，但我把 `rc=$?` 写在一条裸 `echo` 之后，真码被吃掉）、ruleset 的 context 挂在 `parameters` 不在 `rules`（按 `rules` 解析得 `contexts=[]`，差点判成"ruleset 不要求任何检查"）。三个都是**探针测不到自己要测的变量**，不是业务事实 |
| 修复 + 回归保护（QM-5 ④） | PASS | tasks 7.1a 改写为"落点回到 `quality-gate.yml` 的 `changes` job"，并写清三段依据（两层并集 9 个 context / `Gate Result` required 且聚合 `changes` / `changes` 不被短路 + `fetch-depth: 0` + base sha 在作用域内），把上一版那句"`QG Changes` 红也不拦"点名标为错误；7.1b 的结构锁随之改为"断言调用在 `changes` 正文内、非 PR 早退之前、无 `--mode=advisory`"，并新增一条**聚合边不得被摘**的锁（`gate-result` 的 `needs` 与判定表必须仍含 `changes`）；7.1c 追加"必须真让 `changes` 红一次来证聚合边有效"，因为我这次给的仍是读代码的结论 |
| 防止再次发生（QM-5 ⑤） | PASS | 把判据从"context 名在不在清单"升级为**三问连读**：清单（两层都要读）→ 该 job 的 `if:`（会不会被短路）→ 谁 `needs` 它（有没有 required 的聚合 job 兜住）。这条同时写进 `exec-record-wiring-71a.md` 的「更正」小节——那里保留原文不删，避免把"改过判断"抹平成"一开始就对" |
| 行尾与 diff 对账 | PASS | 两口径 numstat 相同（`4 3` / `18 1` / `33 0`）、三个 blob 内 `CR=0`、删除行逐条归因——数值与归因见下方「回填补记」（判定与对账必须在 commit 之后跑，故本 PR 分两次提交，证据在第二次） |
| 接线棘轮 | N/A | 未新增测试文件、未改 workflow；`check-unwired-tests` / `check-step-failfast` / `.github/scripts/check-max-lines` 作为既有锁复跑 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触碰运行面与 UI，改动面只有 `openspec/` |
| QM-6 CCG 双模型外部评审 | 未执行 | 本机无 `codeagent-wrapper`；纯规格变更按 AGENTS.md 不强制，如实登记不以自审冒充 |
| 远程同步 | PENDING | 合并后由下一个会话按既有口径回填：merge SHA 与时间取 `git log origin/main --grep` 本 PR 号，远端分支删除取 `git ls-remote --heads origin gate2c2-landing-correction` 返回 0 行；回填后**删除本文件 frontmatter 的三个 `sync_*` 字段** |

### 回填补记（判定必须在 commit 之后跑，故单列）

- `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → `docs-only=true`，`files=3`
- 两口径 numstat 完全相同：`4 3` / `18 1` / `33 0`；删除 4 行全部可归因 —— `tasks.md` 的 3 = 7.1a/7.1b/7.1c 三条就地改写（替换为 4 行，含 7.1a 的「落地位置」子条目）；`exec-record-wiring-71a.md` 的 1 = 「遗留」第 2 条被标为已推翻的那一条（替换为 1 行更正 + 末尾 17 行「更正」小节）。三个 blob 内 `CR` 计数均为 0（`git show HEAD:<file>` 逐文件实测）
- 门禁复跑 rc=0：`check-gate-record-debt`（记录文件 5 篇、无陈旧登记、登记字段无残留）、`check-no-brand-residue`（6606 个 tracked 文件）、`check-unwired-tests`、`check-step-failfast`、`.github/scripts/check-max-lines`、`check-debt-budget`；`openspec validate enforce-gate-record-presence --strict` → valid
- 一次失败的提交尝试（`commit_rc=128`，消息文件路径写错）：当时立即回读 `git log -1` 确认 HEAD 仍是 `d70d7e7a`、暂存区三文件原样未被吞，再用正确路径重跑得 rc=0 / `7dc1f1a3`。**没有**用 `--no-verify`，也没有重试前动暂存区


### 更正的对象

- `openspec/changes/enforce-gate-record-presence/tasks.md` 7.1a / 7.1b（上一版落点与"红也不拦"推论）
- `openspec/records/exec-record-wiring-71a.md` 「遗留」第 2 条 + 末尾新增「更正」小节（保留原文，仅标注被推翻）

### 遗留（不假装已闭合）

- **聚合边有效性仍是读代码得出的**。第 7 组必须跑一次真红反证（`changes` 红 ⇒ `Gate Result` 红 ⇒ 合不动），否则 7.1c 只是把上一轮"我以为钉住了"换成"我这次推理对了"——同类错误的形状一模一样。
- **本条纠正走的是 docs-only 通道**（只碰 `openspec/`），所以它自己也不会被那条被判据观察；纠偏只能靠人读到 tasks 文本。这是载体层面的既有缺口，已在 7.1a/7.1c 里把落点问题解决，但"规格文本里的错误如何被发现"没有自动化答案。
