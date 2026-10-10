审查一个 openspec 主规格 diff（纯规格/文档 PR，无代码变更）。

工作区根：当前目录（Mulpub worktree，分支 archive-dedup-changelog-history）。

被审对象：
- `.ccg/reviews/archive-dedup-spec.diff`（新增主规格 + delta 改写）
- `openspec/specs/changelog-ledger-integrity/spec.md`（最终形态，4 条 Requirement / 20 个 Scenario）

轴：**正确性与「规格 vs 实现」一致性**。逐条核对规格里点名的东西是否真在实现里：
- `scripts/changelog-entries.js`、`scripts/check-changelog-growth.js`（含 `evaluateAuthorization`、`checkDedupShape`）、
  `scripts/check-changelog-duplicate-entries.js`、`scripts/changelog-dedup-reconcile.js`、
  `scripts/changelog-dedup-regen.js`、`scripts/check-changelog-growth.test.js`（两条生命周期锁）。

重点找这三类问题：
1. 规格写了但代码**不满足**的 Scenario（尤其：新增那条「祖先即已消费」与 R4 生命周期五条 Scenario 的 THEN 措辞，
   与 `evaluateAuthorization` 返回值、锁的实际断言是否逐条对得上）。
2. 代码有但规格**没写**的判据（会不会留下「下个会话按规格办事却与门禁冲突」的缝）。
3. 措辞不可核验（写成理想化断言、无法用一条命令证伪）。

输出：把发现写成 JSON 数组到文件 `.ccg/reviews/archive-dedup-logic.json`，每项
`{severity: "Critical|Warning|Info", file, line, issue, fix}`，最多 8 条，宁缺毋滥；
没有发现就写空数组。同时在 stdout 简述每条。不要提出改代码的建议——本 PR 明确不动判据。
