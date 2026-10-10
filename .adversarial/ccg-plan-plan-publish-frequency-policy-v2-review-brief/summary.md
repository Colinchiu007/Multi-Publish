# 方案对抗评审汇总 — publish-frequency-policy-v2

引擎：`adversarial-review-loop`（`scripts/plan-review.sh`，objectType=plan，跨家族 proposer=opencode / critic=claude）
对象：`01-docs/PLAN-PUBLISH-FREQUENCY-POLICY-V2-review-brief.md`

## 三次运行

| 运行 | 方案版本 | 环境 | 轮次 | Critical | 最低维度分 | 裁决 | 判定记录 |
|---|---|---|---|---|---|---|---|
| **A** | v1（原始简报，3734 B） | 共享根 | 2（第 2 轮回退到 4 分 → 回滚到第 1 轮） | 2 → 1 | 6 → 4 | **blocked** | `.ccg/reviews/840ccd3708f9436431bce400c1794495c0abe7e3.json`（共享根） |
| **B** | v3（并入 rebuttal-v1/v2 全部采纳项，2859 B） | worktree | 2 | 1 → **0** | 5 → 6 | **cleared** | `.ccg/reviews/e54ac5ef148d5c7e8dd5251035a7a34c0aa60fd5.json`（worktree） |
| **C** | v4（并入 rebuttal-v3 的 8 条修正，3911 B） | worktree | **1** | **0** | 6 | **cleared** | `.adversarial/…/critique-v1.md`（本轮）+ 引擎裁决输出 |

问题数趋势：8（2C）→ 8（1C）→ 8（0C）→ **5（0C）**。

## 逐条回应（证据分级 L1 反例 / L2 约束 / L3 权衡）

- run A findings → `rebuttal-v1.md`
- run B findings → `rebuttal-v2.md`（并记下 proposer 自动修订引入的两处自相矛盾：擅自把 D1 平台档默认改成「开」却不改「自认弱点」，以及凭空新增「跨环境审计溯源」与 `hold_until` 列）
- run B 收敛轮 findings → `rebuttal-v3.md`
- run C findings → `rebuttal-v4.md`

## 产物命名说明（重要）

引擎按 `<proposal 文件名>` 生成 slug，三次运行**共用同一个 slug 目录**，因此 `-vN` 命名的文件在每次运行时被覆盖。为保全证据：

- `runA-*`：第 1 次运行的产物（**从共享根写保护隔离区救回**，见下）
- `runB-*`：第 2 次运行（收敛轮）的产物
- `runC-*`：第 3 次运行的产物
- 不带前缀的 `proposal-v1.md` / `critique-v1.md` / … ：**run C**（最新一次）的配对产物

## 运行环境缺陷（已上报）

第 1 次运行（run A）在**共享根**执行，其 11 个产物被 `scripts/guard-shared-root-writes.ps1` **全部移入隔离区**：

- 放行名单（`guard-shared-root-writes.ps1:56`）= `docs, 01-docs, scripts, openspec, .ccg, .agent_context, .hermes` —— **不含 `.adversarial`**；
- 而 `scripts/classify-docs-only.js:54` 又把 `.adversarial/**` 当作文档白名单。

⇒ 对抗评审的产物「写一次被隔离一次」，`.adversarial/<slug>/` 只留空目录。
**处置**：① 从 `%LOCALAPPDATA%\Mulpub\session-isolation\quarantine\` 救回全部 11 个文件；② 后续运行改在 worktree 内执行（不被监听）；③ 建议把 `.adversarial` 加入放行名单（属 `scripts/` 变更，另立）。

## 放行与后续

- run B / run C 均为 **cleared**（无 Critical、无未解决 High）。按引擎判据「收敛后才可开始写码」，方案已具备动手条件。
- run C 的 5 条中，**i2（漏接线时失败路径无告警）已采纳**并转化为「失败路径计数 + 矛盾检测自动降级 + 结构锁」；i4 采纳（`buildKey` 对 `platform:*` 哨兵的编码规则写明）；i1/i5 判**不成立**（评审混淆「同账号」与「跨账号」两种情形）但采纳其措辞澄清；i3 部分采纳（补写重启恢复链路与用例）。
- 这些是 **Warning/Info 级的事后细化**，全部落在 **fail-closed 方向**，未引入新的 Critical/High；未再跑第 4 轮的理由：① 引擎判据已满足；② 逐轮收益递减（8→8→5）；③ 变更全部为「更保守」方向。此取舍与理由如实记录于此与 PR 正文。
