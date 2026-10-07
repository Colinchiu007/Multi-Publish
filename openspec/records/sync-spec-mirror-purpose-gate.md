---
record: sync-spec-mirror-purpose-gate
task: 修 main 上一条由 #3114 遗留的 vendored 契约镜像漂移（真源加了第 12 条 Requirement，镜像没跟），它正卡住全部 open PR
date: 2026-10-08
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（PR 号由 `gh pr list --repo Colinchiu007/mulpub --head sync-spec-mirror-purpose-gate --json number,state,headRefOid` 在开 PR 后当场回读取入本行与「远程同步」行，不凭印象填；合并后按 git log origin/main --grep='(#<该号>)$' --format=%H|%cI 取 merge SHA，回填并整段删除本 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：同步 vendored 契约镜像（sync-spec-mirror-purpose-gate，2026-10-08）

- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）⇒ 见下表
- 保留门禁：变更类型与隔离声明 ✅ | 行尾/编码对账 ✅ | 品牌残留 ✅ | 文档同步 ✅ | 远程同步 PENDING（本条自己的欠账）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯规格/流程文件（`.quality-rhythm/integrations/openspec/spec-contract.md` + 本记录），零运行时代码。仍在隔离 worktree `D:/Data/projects/mp-worktrees/mp-sync-spec-mirror-purpose-gate`（裸分支 `sync-spec-mirror-purpose-gate`，base `088cdfb22` = 当时 origin/main）做；共享根保持 main clean |
| 归属：这条红**不是本 PR 引入**（按 AGENTS.md 标准路径判定） | PASS | ① 现场：PR #3113 的 `QG Static` 红在 `scripts/quality-rhythm-spec-mirror.test.js:67`（`镜像不得自行发明或漏掉 Requirement`），而 #3113 的 diff 只有 1 张 PNG + 3 份 md，**不含该测试读的任何输入**；② 在本地把两侧 Requirement 清单按 ref 逐个比：`HEAD` live=11 / mirror=11（同步）、`origin/main` live=**12** / mirror=11（漂移）、`cd5ba8e48` live=12 / mirror=11、其父 `28f9d5143` live=11 / mirror=11 ⇒ **漂移由 `cd5ba8e48`（#3114「归档 spec-purpose-tbd-gate 并把 1 条 Requirement 同步进主规格」）引入，且已落在 main**；③ CI 之所以在别的 PR 上也红，是因为 `actions/checkout` 取的是 merge commit，含 main 的漂移 |
| 影响面（为什么要现在修） | PASS | 该锁在 `QG Static` 上，而 `QG Static` 是 required context ⇒ main 红的那一刻起，**全部 open PR 都合不进去**（当场实测 open PR 13 个，含 #3113）。且经全量扫描确认**没有任何 open PR 在修它**：逐个 `gh pr diff <n> --name-only` 查 `spec-contract.md`，命中 0 |
| 修复内容 | PASS | 把真源新增块**逐行**搬进镜像：`### Requirement: 主规格的 Purpose 完整性必须有门禁` + 其 **8 条 Scenario**，共 68 行。提取规则与锁本身**同一条**（从标题起到下一个 `/^#{1,3} /` 行为止，尾部空行弹出），不是另写一份"看起来一样"的摘要 —— 镜像的定义是逐行全等副本（锁的第 3 例就是按行比）。镜像 140 → 208 行 |
| 反证（不需要人造变异） | PASS | 修复前的 main 状态**就是**这条锁的真实红样本：CI 日志 `# fail 1` + `not ok 2 - 镜像不得自行发明或漏掉 Requirement`，且 expected/actual 差的那一项名字就是 `主规格的 Purpose 完整性必须有门禁`。修后本地 `node --test scripts/quality-rhythm-spec-mirror.test.js` ⇒ **5 pass / 0 fail**（四例：解析非空 / 清单一致 / 逐行全等 / Scenario 一致 / vendored 脚本副本逐字节一致） |
| 行尾与编码 | PASS | 动手前实测：真源 `openspec/specs/openspec-integration/spec.md` = crlf 209 / lf-only 0；镜像 = crlf **0** / lf 140。两份 eol 档**本来就不同**，因此按「镜像保持自己原有的 LF」写回（提取时统一 `\n`，写出 LF），**没有**做任何"统一行尾"操作；修后镜像 crlf=0 / lf=208。`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径对账见「本地门禁汇总」行 |
| 为什么**不**加 CHANGELOG | 已决定 | 本 PR 只同步一份 vendored 副本，零运行行为、零用户可见变化；而 CHANGELOG 是 13 个 open PR 的置顶冲突源，加一条无信息量的条目等于给别的会话制造冲突。docs-only 模板里 CHANGELOG 收口是「如适用」，本条判为不适用 |
| 本地门禁汇总 | PENDING | 提交后统一复跑并回填：`classify-docs-only` / `check-no-brand-residue.js` / `check-pr-exec-record.js --mode=enforce` / `check-gate-record-debt.js` / `check-docs-sync.sh` / `.github/scripts/check-max-lines.js` + 两口径 numstat |
| 远程同步 | PENDING | 本条自己的欠账：PR 号由 `gh pr list --head sync-spec-mirror-purpose-gate --json number` 回读后填入；合并后由回填 PR 改写为 PASS + merge SHA，并**同一次提交**删除本 frontmatter 的三个 `sync_*` 字段；新载体不在 `gate-record-debt-ledger.json` 建键 |
| QM-1 / QM-2 / QM-4 / TDD / QM-6 | N/A | docs-only 通道：零运行时文件、零逻辑分支；QM-6 的触发条件（M+/中高风险运行时逻辑）不成立 |

## 明确留在场上的边界（不假装已闭合）

1. **本 PR 只补了这一条漂移**。镜像与真源之间今天由那把锁逐行守住，但锁只覆盖 `openspec-integration` 这一份规格；其余 150 份主规格没有 vendored 镜像，也就没有"镜像漂移"这件事可言。
2. **上游为什么会漏**：`openspec archive` 把 Requirement 同步进主规格（#3114 的动作）与「同步 vendored 镜像」是两个手工步骤，中间没有任何东西强制后者。可做的收口是让归档流程本身提示/检查镜像，那属门禁改动，**本 PR 不做**，只在此点名。
3. 本 PR 合并前，`#3113`（暗色基线重建）除 `QG Static` 外其余 required 检查的状态由它自己的 run 判，不由本 PR 代答。
