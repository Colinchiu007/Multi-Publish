---
record: archive-docs-only-shortcircuit
task: 归档 openspec change docs-only-ci-shortcircuit（勾掉 6.3 的 skipped-required 实证），并把它的 delta 落进主规格 ci-path-gating
date: 2026-10-09
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由本会话或下一个会话按 `git log origin/main --grep='(#NNNN)$'` 取证回填
sync_backfill_owner: 本会话（若被压缩则由下一个会话接手本 slug）
---

## 本次执行记录：归档 docs-only-ci-shortcircuit（archive-docs-only-shortcircuit，2026-10-09）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | 纯规格/流程变更，变更集只含 `openspec/**`（4 个 change 文件移走 + 归档目录新增 + 主规格 1 处改写 + 本篇记录）。在隔离 worktree `mp-archive-docs-only-shortcircuit`／裸分支 `archive-docs-only-shortcircuit` 完成，base `8b3d3e91f`（建区时 `git rev-list --count HEAD..origin/main` = 0，非滞后基线）；经 PR 落地，不直推 main |
| 归档动作本身 | ✅ | 首跑 `openspec archive docs-only-ci-shortcircuit -y` **中止且零改动**（`git status` 当时只有我改的 `tasks.md` 一行），输出原文：`ci-path-gating MODIFIED failed for header "### Requirement: 全量 workflow 路径门控" - current spec contains scenario(s) not present in the modified block: "文档改动 PR 触发全量检查", "文档改动不触发全量". Refresh the change spec before archiving to avoid dropping scenarios.`；随后 `openspec archive docs-only-ci-shortcircuit -y --skip-specs` ⇒ `Task status: ✓ Complete`、`Change 'docs-only-ci-shortcircuit' archived as '2026-10-09-docs-only-ci-shortcircuit'`，主规格由本次手工按 openspec 语义合并（MODIFIED 原位替换 2 条、ADDED 追加 2 条） |
| CLI 拒绝的定责（本 PR 真正的信息量） | ✅ | 不是 delta 写错，也不是主规格被别人改坏：**这条 delta 自 2026-09-28 落库起就没人跑归档**，所以主规格一直停在改动前的旧契约（原文写着"三个 workflow 都触发并执行其真实 job"），与已上线行为相反。CLI 按 **scenario 名字**做集合比对，于是把「本 change 刻意把旧场景重命名为『文档改动 PR 产生检查且重型 job 跳过』」读成"会丢场景"。旁证（真实现场）：本会话 #3143/#3135 两个纯文档 PR 上，required 并集 9 条里有 6 条为 `skipping`，PR 照 `MERGEABLE` 照合并 ⇒ 主规格那句"执行其真实 job"在事实上早已不成立，本次归档是**补上规格对现实的欠账**，不是引入新语义 |
| 6.3 实证（本 change 唯一未勾项） | ✅ | 两个独立样本，均 `docs-only=true`：PR #3135（`spec-mirror-gate-archive`，mergedAt `2026-10-08T06:00:02Z`）与 PR #3143（`freq-interval-calibration`，merge `b80429bf0`）。`gh pr checks` 各 **8 pass / 11 skipping / 0 fail / 0 pending**；#3143 的 CI 现场行打印 `docs-only=true`（不是靠 job 全绿反推），required 真源按两处读齐：ruleset `23749994` 的 6 条（**必须按 id 取**，`/rulesets` 列表的 `rules` 恒空）∪ classic protection 的 4 条。已把上述写进 `tasks.md` 6.3 并勾为 `[x]`，归档目录里未勾选项 **0** 条 |
| 主规格产物核对 | ✅ | `openspec/specs/ci-path-gating/spec.md`：Requirement 5 → **7**（新增 `docs-only 判定合同` 带 4 个 Scenario、`白名单扩项的前提锁` 带 4 个 Scenario + 一段实现强度自陈）；被 MODIFIED 的两条按 delta 全文替换 —— `全量 workflow 路径门控` 现含 4 个 Scenario（产生检查且重型 job 跳过 / 混合 PR 全量执行 / push 不触发 / 代码改动仍触发）、`忽略清单单一来源` 现含 2 个 Scenario（契约守护 / 短路接线防再犯）；旧场景名 `文档改动 PR 触发全量检查` 全文残留 **0** 处（改名是真的替换，不是并列堆叠）；`\bTBD\b` 命中 **0** |
| Purpose 同步 | ✅ | 原 Purpose 只覆盖"paths-ignore 黑名单 + 契约测试单一来源 + tag 不受过滤"，没有一句讲 job 级短路。已补一句：PR 侧不走触发级过滤，纯文档 PR 照常触发、由 job 级 docs-only 条件短路重型 job，其 skipped 结论满足 required check；判定由 `classify-docs-only.js` 单一持有，进白名单前必须先把对应校验接进不被短路的 `changes` job。这是**本 change 立下的规则回写进规格头部**，不是新决策 |
| Gate 12d（Purpose 门禁） | ✅ | `node scripts/check-spec-purpose.js` ⇒ `扫描 152 份主规格，违规 0`。主规格份数 152（本次只更新既有规格、未新增规格文件 ⇒ 不会产生 `TBD - created by archiving change …` 那句占位；该占位的活体场景仍未构造，记在下面「遗留」） |
| 受影响与相邻的锁 | ✅ | `node --test scripts/quality-rhythm-spec-mirror.test.js` ⇒ **8 pass / 0 fail**（它镜像的真源是 `openspec-integration/spec.md`，与 `ci-path-gating` 无交集，已核对锁内 `LIVE_SPEC`；其中"两份解析器必须逐 job 同结论"那条照跑，未被我的改动绕过）；`node scripts/check-unwired-tests.js` ⇒ `检查域内测试文件 71 个 / OK: 全部测试均已接线或按欠账登记`（本次没动 workflow 与登记表）；`node scripts/check-gate-record-debt.js` ⇒ `远程同步行 254 条 / 记录文件 132 篇 / 已登记欠账 8 条（都不是本会话名下）/ OK: 登记字段无残留` |
| 记录债介质 | ✅ | 本记录走**新载体**：未收口只写在文件 frontmatter 的 `sync_status/sync_reason/sync_backfill_owner` 三字段，**不往 `scripts/gate-record-debt-ledger.json` 加键**（加键会当场报「陈旧登记」红，本仓 2026-10-07 实测过）。回填时改 `远程同步` 行为 PASS **且同一次提交删掉这三字段** |
| 行尾与 diff 对账 | ✅ | 两口径 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 逐文件相等（数值见 PR 正文；四个 change 文件由 git 判为 rename，主规格与本篇为新增/修改）。纪律：动手前 `git ls-files --eol` 当场量档，未做整文件行尾统一回写 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/**`、`packages/rpa-engine/**` 与任何前端文件 |
| QM-6 CCG 双模型外部评审 | N/A | 纯归档 + 规格同步，无判据与代码变更（AGENTS.md：纯文档/流程变更不强制 QM-6）。**但**"CLI 拒绝后改用 `--skip-specs` + 手工合并规格"这个决定属于改规格面，已在上面两行给出定责与产物核对，供抽查 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin archive-docs-only-shortcircuit` 返回 0 行证远端分支已删；回填后删除上方三个 `sync_*` 字段 |

### 遗留（不假装已闭合）

- **归档工具的名字匹配判据会挡住"合法的重命名"**：`openspec archive` 用 scenario **标题**做集合差，因此任何把既有 Requirement 的场景改名/合并/拆分的 change，只要不先把主规格那份旧文案补回 delta，就永远归档不了——表现是"CLI 拒绝、零改动"，而不是"告诉你怎么改"。本次用 `--skip-specs` + 手工合并绕过，代价是**规格合并不再由工具保证语义**。可复现的收口办法（未做，需另立 change）：delta 里 MODIFIED 块应允许显式声明 `## RENAMED Scenarios`，或 CLI 在差集非空时改为提示"这些旧场景将被丢弃，确认？"而不是硬拒。
- **同一族还有 24 个未归档 change 目录**（`openspec/changes/` 下非 archive），本 PR 只收了 `docs-only-ci-shortcircuit` 一个。它们的完成度未逐个核查，不能推定"都像我这两个一样只差归档"。
- Gate 12d 的"archive 把 Purpose 写成 TBD"活体场景仍未构造（需要一次真正**新增能力**的 change 走 CLI 归档）；本次因未新增规格文件而照旧取不到该现场。
- `retire-changelog-dedup-auth`（17 项全未勾、0 实现）**不在本 PR 范围**，它是修复 `check-changelog-growth.js` 授权通路的设计缺口，属混合 PR，需单独起实现分支。
