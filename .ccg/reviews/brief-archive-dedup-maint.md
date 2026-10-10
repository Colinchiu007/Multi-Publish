审查一个 openspec 主规格（纯规格/文档 PR，无代码变更）。

工作区根：当前目录（Mulpub worktree，分支 archive-dedup-changelog-history）。

被审对象：
- `openspec/specs/changelog-ledger-integrity/spec.md`（新增主规格，4 条 Requirement / 20 个 Scenario）
- `.ccg/reviews/archive-dedup-spec.diff`
- 对照阅读：`openspec/specs/ci-path-gating/spec.md`、`openspec/specs/openspec-integration/spec.md`、仓库根 `AGENTS.md`

轴：**规格可消费性与集成风险**（不是代码风格）。找这三类：
1. **无法证伪 / 不可验收的措辞**：Scenario 的 THEN 写成了状态描述而非可判定条件，或引用了不存在的脚本名、测试名、命令。
   逐个核对规格里点名的符号/文件是否真在仓库里（`git ls-files` 或读文件）。
2. **口径重复或互相矛盾**：同一判据在两份主规格里各写一遍、或新规格与 `ci-path-gating` / `openspec-integration`
   既有要求冲突（例如「谁守门」「白名单扩项前提」「一次性授权的生命周期」）。
3. **误导性强度词**：SHOULD/MUST/MUST NOT 用错档，会让后续会话把建议读成硬约束（或反之）。

输出：JSON 数组写到文件 `.ccg/reviews/archive-dedup-maint.json`，每项
`{severity:"Critical|Warning|Info", file, line, issue, fix}`，最多 8 条，宁缺毋滥；无发现写空数组，并在 stdout 逐条简述。
不要建议改门禁判据或代码——本 PR 明确一字未动判据。
