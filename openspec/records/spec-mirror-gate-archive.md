---
record: spec-mirror-gate-archive
task: 归档 openspec change spec-mirror-wiring-gate，把「接线资格登记表」那条 Requirement 落进主规格 ci-path-gating
date: 2026-10-08
---

## 本次执行记录：归档 spec-mirror-wiring-gate（spec-mirror-gate-archive，2026-10-08）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | 纯 docs/规格变更（只动 `openspec/**` 与 CHANGELOG）；就地编辑后经 PR 落地，不进 docs-only 之外的执行面；分支 `spec-mirror-gate-archive`，base `0f1e8633d` |
| 归档动作本身 | ✅ | `openspec archive spec-mirror-wiring-gate -y` ⇒ rc=0，输出 `ci-path-gating: update`、`+1 added`、`Change ... archived as '2026-10-08-spec-mirror-wiring-gate'`；变更集：3 个 change 文件删除（移走）+ 1 个主规格修改 + 归档目录新增 |
| 同类 PR 的活体证明（本轮修复的验收现场） | ✅ | 本 PR 就是 docs-only 通道（`files=6`，全在 `CI_IGNORED_PATHS` 内）。run 37734741926（PR #3135，改动集 6 个文件全在 `CI_IGNORED_PATHS` 内）：`QG Changes` 步骤 [3] 是 docs-only 分类器、当次打印 `docs-only=true`；步骤 [9] `Gate 2b2 - Spec mirror contract (changes job)` = `completed/success`；同一 run 的 `QG Static` = `completed/skipped`。 这正是 #3114 当年漏掉的那一类 PR：漂移锁**在 PR 面上跑到了**，而不是等 main 的 push。 |
| 主规格产物核对 | ✅ | `openspec/specs/ci-path-gating/spec.md`：Requirement 4 → **5**，新增那条带 **6 个 Scenario**（逐条打印核对：可跳过 job 必红 / 点名只认 run 正文且同名不冒领 / 按缩进不按位置 / 解析退化不读成无需核对 / 清单只能缩小且带销账条件 / changes job 只能依赖 node 内置模块）；`## Purpose` 段**未被写成占位词**（文件内 `\bTBD\b` = 0 命中） |
| Gate 12d（本 change 自己立的那条） | ✅ | `node scripts/check-spec-purpose.js` ⇒ `扫描 151 份主规格，违规 0`。注意主规格份数仍是 151：本次只**更新**既有规格、没有新增规格文件 ⇒ 没有产生 `TBD - created by archiving change …` 那句占位。那句占位的活体场景仍未构造（需要一次真正新增能力的 change），如实登记在下面「遗留」 |
| 受影响的两条锁 | ✅ | `node --test scripts/quality-rhythm-spec-mirror.test.js` ⇒ 8/8（它镜像的真源是 `openspec-integration/spec.md`，与本次 `ci-path-gating` 无交集 ⇒ 不触发漂移红，已核对锁内 `LIVE_SPEC` 常量）；`node --test scripts/check-unwired-tests.test.js` ⇒ 30/30（含「登记表只能缩小」那条真实仓库棘轮，本次没动登记表） |
| 勾选纠偏 | ✅ | 归档目录里的 `tasks.md`：`- [ ] 6.3 / 6.4` 两条过期勾选按真实状态改写为 `[x]` 并附 merge SHA（#3132 → `e32210e6a`、回填 #3134 → `0f1e8633d`）与归档产物坐标；改写后未勾选项 **0** 条。手法纪律：按下标改数组行，替换串里不含 `$`（`String.replace` 的 `$'` 会注入文件尾，本仓已两次踩到） |
| 接线棘轮 / 记录债 | ✅ | `node scripts/check-unwired-tests.js` ⇒ `OK: 全部测试均已接线或按欠账登记`；`node scripts/check-gate-record-debt.js` ⇒ `OK: … 记录文件登记字段无残留`。本记录走新载体（frontmatter 三字段），**不往 `scripts/gate-record-debt-ledger.json` 加键**（加了会当场报「陈旧登记」红） |
| 行尾与 diff 对账 | ✅ | 两口径 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件相同**（本次改动集 6 个文件）：`CHANGELOG.md` 29/0、`openspec/specs/ci-path-gating/spec.md` 53/0、本篇记录 30/0，三个 change 文件被 git 判成 **rename**：`R100`（proposal 与 spec delta 逐字未变，0/0）与 `R091`（tasks.md 2/2 = 只有勾选纠偏那两行原地改写；相似度 91% 而不是 100%，正是那 2 行改写的代价）。**rename + 相似度就是「纯移动、无内容丢失」的现场证据**，比我先前打算写的「185 删 = 185 增」强得多 —— 后者只说明行数相等，说明不了内容逐字未变，而 git 的 `R100` 直接给出「一个字节都没改」。删除数归因因此不需要：diff 里根本没有删除。本行仍是 1 换 1，不会让行数漂移 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行时代码与前端文件 |
| QM-6 CCG 双模型外部评审 | N/A | 纯归档/规格同步，无判据与代码变更（AGENTS.md：纯文档/流程变更不强制 QM-6） |
| 远程同步 | ✅ | PR #3135 已 squash 合并：`git log origin/main --grep='(#3135)$' --format=%H\|%cI` 取得 `f5246a196c8971275df8c70f066a038e6568f4ed\|2026-10-08T14:00:02+08:00`；`git ls-remote --heads origin spec-mirror-gate-archive` 返回 **0 行**（远端分支随合并删除）。 CI 现场 8 pass / 0 fail / 0 pending（11 项 skipping 属 docs-only 通道；CI 侧分类器当次打印 docs-only=true，不是靠 job 全绿反推）；主规格产物复核：Requirement 5 条、新增那条 6 个 Scenario、check-spec-purpose 扫描 151 份违规 0。 |

### 遗留（不假装已闭合）

- Gate 12d 的**活体场景**仍未构造：「归档器给新增主规格写下 `TBD`」这条真实路径，需要一次新增能力（会创建新规格文件）的 change 才会出现；本轮只更新既有规格，因此该场景仍属未验证。
- 登记表当前 1 条登记项来自逐条人工核对，不是完备全域清点（继承自 #3132 的遗留，未在本轮改变）。
- `changes job 内的测试只能依赖 node 内置模块` 这条锁目前只守着被搬进该 job 的镜像锁；其余 `changes` job 内点名的测试暂无同款判据。
