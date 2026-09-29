## Why

**质量节拍的工作大量做在了机器检不到的位置。** 近 3 天约三分之一的非文档 PR 没有把执行记录落在唯一可被检查的地方（`.quality-gates.md`），而 CI 对此完全无声。

实测（窗口 `2026-09-26T00:00:00Z` 起，`origin/main` 上 first-parent 提交 = squash 后的 PR 落地提交；本仓 squash 是单亲提交，用 `--merges` 过滤会几乎查不到）：

> **这些数字是时点数，不是常量。** 同一判据先后测得 41 与 47，差值全部来自 main 继续前进；而两次测量**都没有记下当时的 `origin/main` sha**，所以它们目前不可精确复现。实施时 MUST 重新测量并把 `origin/main` 的 sha 一并写回本文件，MUST NOT 把下面的数当基线用。窗口起点与判据（下表"手法"列的命令）是可直接复跑的。

| 判据 | 数量 | 手法 |
| --- | --- | --- |
| 窗口内 PR 落地提交 | 132 | `git rev-list --first-parent --since=… origin/main` |
| 未碰 `.quality-gates.md` | 70 | `git diff-tree --no-commit-id --name-only -r <sha>` |
| 其中非 docs-only | **47**（同日上午为 41，差值是 main 在两次测量之间继续前进；两者在各自时点都对） | 复用 `scripts/classify-docs-only.js` 导出的 `CI_IGNORED_PATHS` / `isDocsOnly`，不建第二份白名单 |

对这 47 条逐条查 PR 正文与评论（`gh pr view --json body,comments`），按不同口径分别计数，避免用判据口径放大结论：

| 正文/评论口径 | 命中 |
| --- | --- |
| 同时出现「本次执行记录」与「远程同步」（严格记录形态） | **1**（#2601，走 #2553 的评论承载出口） |
| 出现「执行记录 / 质量门禁 / 质量节拍」任一指代词 | 7 |
| 出现门禁表或 `QM-n` 字样（宽口径：确有登记门禁内容） | **32** |
| 出现「远程同步」字样 | **2** |

抽样三条核对（不是推断）：#2599 正文写了「本地门禁：unwired / failfast / max-lines OK」与「QM-6 本轮未执行，如实登记」；#2589 写了 QM-4 基线同源根因与"刻意非阻断"的理由；#2620 有 `## 质量节拍` 小节和一张表。**三者的门禁内容是真实存在的，缺的都是同一件东西——`远程同步` 那一行**。

结论因此不是"三分之一的会话跳过质量工作"，而是：**工作做了，但落在了检查不到的位置；而恰好落在检查不到的那一项，正是既有门禁唯一会去验的那一行（`远程同步`）**。

既有机制看不见这一形态是设计使然：`scripts/check-gate-record-debt.js`（#2561 建、#2570 扩）的两条强制判据分别是「已存在的 `远程同步` 行是否收口」与「最顶部那篇记录必须带行」，前提都是「记录存在于那个文件里」；#2570 自己在「遗留与已知漏洞」里写明这条未闭合。

为什么现在做：本仓的 Fresh 证据与 QM-5 逃逸分析只有落在可检查位置才会被继承；实测过"同一根因被不同会话重复诊断"的代价（AGENTS.md 门禁断言同步条目）。#2595（merge `3aa1466e`，本会话自己造的）是极端形态——三处皆无；但更普遍的形态是上面那 32 条。

## What Changes

- **执行记录的正式载体改为「每 PR 一篇独立文件」**：`openspec/records/<slug>.md`，内含门禁表、一行 `| 远程同步 | … |`，以及**该记录自身的欠账登记字段**（frontmatter：状态/原因/回填者）。既有 `.quality-gates.md` 保持原样，不迁移、不改写。
  选它而非「强制改单文件」的两条实测代价：① 单文件置顶合并本仓实测 8 轮撞车/PR、约 37 分钟/提交且每轮整条 CI 作废；② 更关键的是，**只要还需要往一个共享清单里登记欠账，撞车面就没有真正消失**——#2570 第三轮 re-sync 的唯一冲突文件就是 `scripts/gate-record-debt-ledger.json`（两个 md 反而被 git 自动合上了）。因此登记项随记录文件走，聚合清单改为**派生产物**，共享写归零。
- **新增存在性判据（forward-only）**：本 PR 的变更集 MUST 包含一篇新增记录文件；不含则 MUST 携带一篇豁免文件（同样按 PR 独立成文件）；两者皆无即红，并输出两条可执行出路。判据 MUST 复用既有"取本 PR 变更集"的实现，不新建第三份 diff 口径。
- **豁免按 PR 独立成文件，消费后自动进入待清理计数**：豁免被使用后不要求同 PR 删除（合并即删分支，同 PR 删除不可实现），改为「可见计数 + 超阈值才拦截」，删除动作零冲突（删的是它自己那个文件）。
- **收口检查输入源扩为两源**：`check-gate-record-debt.js` 继续读 `.quality-gates.md`（历史，只读），新增读 `openspec/records/`。每篇记录成为独立可寻址单元后，**「强制面只能覆盖最顶部一篇」这一 #2570 的妥协不再必要**——每篇都可单独检查。
- **存量登记为一次性写入的独立文件**，不追加进任何共享清单；MUST 由脚本从 git 历史与 PR 元数据派生，禁止手抄。

非 BREAKING：不删除、不改写 `.quality-gates.md` 的任何历史行。使用者唯一可观察变化：新 PR 若既无记录文件又无豁免文件，CI 变红。

## Capabilities

### New Capabilities
- `quality-gate-execution-record`: 执行记录的载体（每 PR 一篇 `openspec/records/` 文件，登记信息随文件走）、存在性强制的判据与边界（forward-only、按本 PR 变更集、复用既有 diff 口径）、豁免的独立文件形态与"消费后可见、超阈拦截"的收束语义、以及记录 `远程同步` 收口检查在「历史单文件 + 新记录目录」两源下的统一口径。

### Modified Capabilities

（无。）已做基线差异审计：`openspec/specs/` 全树对 `check-gate-record-debt`、`远程同步`、`Gate 2c` 命中均为 0；`ci-quality-gate-parallel` 只规格化并行 job 结构 / 触发去重 / 契约测试同步，不含记录存在性 ⇒ 不存在"既有 requirement 被修改"。#2561/#2570 已交付行为（闭合词表、shrink-only、键漂移双报）**不在本 change 重复规格化**，只声明其输入源扩展。

## Impact

- 新增：`openspec/records/`（记录目录 + `_TEMPLATE.md`）、`openspec/records/_exempt/`（按 PR 独立的豁免文件）、`openspec/records/_legacy-absent.md`（存量一次性登记）、`scripts/check-pr-exec-record.js` 与其测试。落点是否并入既有 checker 由 design D1 决定（受姊妹轴共存与"不得出现第二份 diff 口径"约束）。
- 修改：`scripts/check-gate-record-debt.js`（两源读取 + 由记录文件派生登记）、`scripts/classify-docs-only.js`（若需把"取本 PR 变更集"提为可复用导出，MUST 只增不改其判定语义）、`.github/workflows/quality-gate.yml`（`Gate 2c` 显式点名；含 ≥2 条测试命令的 `run:` 块 MUST `shell: bash`）、AGENTS.md 质量节拍段、`.gitignore`（须用 `git check-ignore -v` 当场证明新目录与新脚本不被第 106 行 `scripts/*.js` 之类规则静默排除）。
- 不触碰 `apps/desktop/electron/`、`packages/*` 与任何 UI ⇒ QM-1 / QM-4 不适用。实现 PR 自身改了 `scripts/` 与 `.github/`，按 classify 判为**混合 PR**，走完整必需检查。
- 姊妹轴边界：另一会话在 AGENTS.md 预告的 `openspec/changes/gate-coverage-ratchet/`（"覆盖率只被计数、不强制增长"）经 `ls` 核实 main 与本地均不存在、尚未落地。本 change 判据是**存在性**，非增量棘轮；若对方先落地，D1 落点与"派生聚合"的归属须按其实装调整，MUST NOT 复制第二份词表或覆盖其判据。
- 前置文档已读并引用为约束、不重述：`openspec/changes/docs-only-ci-shortcircuit/design.md:45` 要求"判定证据（文件清单）必须写入 `.quality-gates.md` 记录"——本 change 属该要求的**载体替换**，其"保留哪些门禁不豁免"的结论不变；需在该 change 归档时同步该措辞（列入 tasks）。
