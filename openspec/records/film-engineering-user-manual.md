---
record: film-engineering-user-manual
task: 补齐影视工程流水线（film-engineering）缺失的用户操作手册——全仓此前只有 ARCH 架构文档与两份 PRD，无任何面向使用者的操作文档
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在，回填需在合并后取 git log 证据
sync_backfill_owner: 合并后的后续 docs PR
---

## 本次执行记录：影视工程流水线操作手册（film-engineering-user-manual，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯文档变更：新增 `01-docs/USER-MANUAL-FILM-ENGINEERING-2026-10-07.md` + 本执行记录，未触及任何运行时代码路径。按 AGENTS.md「纯流程/规格/文档变更可在共享主工作区就地编辑但必须经 PR 落地」，走 `film-engineering-user-manual` 分支 → PR #3097，未直推 `refs/heads/main`（分支保护会以 GH011 拒绝） |
| 第一性原因（QM-5 ①） | N/A | 非 Bug 修复，无逃逸链可追溯 |
| 逃逸分析（QM-5 ②） | N/A | 同上 |
| 修复 + 回归保护（QM-5 ④） | N/A | 同上 |
| 防止再次发生（QM-5 ⑤） | N/A | 同上 |
| 行尾与 diff 对账 | PASS | `git diff --numstat origin/main...HEAD` 与 `git diff --ignore-cr-at-eol --numstat` **两口径完全相等**（手册 1868/0，无删除行 ⇒ 无 CRLF 幽灵行）。新文件纯 LF：`CR bytes: 0 \| NUL: 0 \| BOM: False \| 末尾换行: True` |
| 接线棘轮 | N/A | 未新增任何 `*.test.js`，不涉及 workflow 接线 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行面（纯新增 Markdown，无 UI 改动、无构建产物变化） |
| docs-only 判定 | PASS | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → `docs-only=true` |
| 品牌残留（Gate 12） | PASS | `node scripts/check-no-brand-residue.js` → `PASS（扫描 7240 个 tracked 文件，无品牌残留）` |
| TOC 锚点自检 | PASS | 按 GitHub slugger 规则重算 18 条目录锚点，0 条不一致（修掉 3 处连字符数错误：七/八/九章原写成双连字符） |
| QM-6 CCG 双模型外部评审 | **未执行（环境不具备）** | `sh scripts/deep-review.sh --check-deps` 实测：`codeagent-wrapper` 找不到（候选路径 `/workspace/.home/.claude/bin/codeagent-wrapper.exe` 是 Windows 形态，本沙箱为 Linux）；`claude`（评审主力后端）MISS；`opencode`（跨家族校验后端）MISS。脚本自述「**没有任何评审后端可用 —— 深度审查根本起不来**」。`ccg-gate.js` 另报「未找到 CCG（run_skill.js），已跳过」。按 AGENTS.md「CCG 未安装 → 告警并跳过，不阻断任务」处理，并按 _TEMPLATE.md 显式要求在此如实写「未执行」，**不以自审冒充通过** |
| 双审核替代闭环 | PASS（替代方案，非 CCG） | 因外部后端不可用，改以「独立 Agent 对抗核查」补足实质：① 两个只读调研 Agent 分别覆盖前端交互链路与 IPC 契约/入口注册；② Verifier 对 33 条技术断言做源码级核查，数据资产数字由 python3 独立重算，不采信手册自身数字。**首轮判 FAIL，报出 5 处作者自身错误并全部修正**：3 处通道计数错误（实为 16 个注册 / 15 个公开，原写 15/14）、1 处把不存在的 bug 写进「已知代码瑕疵」（batchIndex 文案「0-999」与守卫 `>= 1000` 实为自洽，真实问题是常量语义复用）、1 处章节间自相矛盾（1.4 节「三/四标签页」vs 3.4 节「三个标签页」）。C 组 17 条「未实现」声明一律用**否定式 grep 取证**（全仓零命中，排除 node_modules） |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#3097)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin film-engineering-user-manual` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 手册内容要点

- 20,627 中文字 / 1,869 行 / 21 章 + 2 附录 / 535 行表格
- 覆盖 6 阶段流水线、16 个 IPC 通道、六条完整使用路线、13 类故障症状排查、全部数值上限
- **凡规格承诺与实现不一致处显式标注差异**，单列第十四章不做美化：画布 10 项功能缺口（产物节点 / 剧本节点 / 撤销重做 / 自动布局 / 边删除 / 空态引导 / run 失败态 / provider 引导 / 角色映射 UI / 镜头状态持久化）、随包 manifest 无 `allowedHosts` 导致回收通道全量 fail-closed、流水线元数据三处不一致（主进程 6 阶段/high vs 卡片 4 阶段/low）、`upload-reference` 是 16 通道中唯一不在未登录白名单者、12 项已知代码瑕疵

### 遗留（不假装已闭合）

- **QM-6 CCG 双模型外部评审未执行**：本沙箱无 `claude` / `opencode` / `codeagent-wrapper`，且 `codeagent-wrapper` 候选路径是 Windows 形态（`.exe`），与本 Linux 环境不匹配。需在具备评审后端的 Windows 主机上补跑 `sh scripts/deep-review.sh --force`。
- **分支名被迫改扁平**：初版分支名 `docs/film-engineering-user-manual` 带斜杠，而 `check-pr-exec-record.js` 的 `RECORDS_RE = /^openspec\/records\/[^_][^/]*\.md$/` 中 `[^/]*` 禁止记录路径含子目录，二者天然冲突。已改名为扁平 slug `film-engineering-user-manual` 以匹配仓库全部既有记录的形态（`openspec/records/` 下无任何嵌套先例）。
- **建议后续**：第十四章的差异清单会随实现演进过期，建议在流水线行为变更时同步更新 4.6（六阶段）、12.4（成本口径）、第十四章三处。
