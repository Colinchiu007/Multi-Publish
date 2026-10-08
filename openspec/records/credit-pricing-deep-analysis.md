---
record: credit-pricing-deep-analysis
task: 新增积分/算力计费体系深度分析报告（代码级取证 + 成本建模 + 定价测算）
date: 2026-10-08
---

## 本次执行记录：积分/算力计费体系深度分析报告（credit-pricing-deep-analysis，2026-10-08）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | **纯文档**：就地编辑 + 经 PR 落地，未创建 worktree（AGENTS.md 分层策略：纯文档变更不需要独立 worktree）；未直推 main |
| 第一性原因（QM-5 ①） | N/A | 纯新增文档，无缺陷修复 |
| 逃逸分析（QM-5 ②） | N/A | 纯新增文档 |
| 修复 + 回归保护（QM-5 ④） | N/A | 未触运行面 |
| 防止再次发生（QM-5 ⑤） | ✅ | 报告 §6.4 C 登记 5 处口径漂移（含 1 处同名文件冲突），并给出「先改代码再回写文档」的顺序，避免二次漂移 |
| 行尾与 diff 对账 | ✅ | `git diff --numstat` = `795 0`，`--ignore-cr-at-eol --numstat` = `795 0`，两口径相等；删除数 0（纯新增） |
| 编码完整性 | ✅ | 全文 U+FFFD 零命中（`grep -c $'\xef\xbf\xbd'` = 0）；UTF-8；末字节 `0a` |
| 接线棘轮 | N/A | 未新增 `*.test.js` |
| 品牌残留 | ✅ | `node scripts/check-no-brand-residue.js` → PASS（扫描 7259 个 tracked 文件）。报告如实引用多家模型厂商与竞品名，均不属该门禁的拦截词表 |
| docs-only 判定 | ✅ | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → `docs-only=true`，files=2 |
| 文档同步 | ✅ | `bash scripts/check-docs-sync.sh --base=main --head=HEAD` → 「仅文档/流程变更，无需额外同步」。注：该脚本入参是 `--base=main` 而非 `--base=origin/main`（脚本内部自行拼 `origin/`） |
| CHANGELOG 收口 | N/A | 纯分析报告，无运行时代码变更 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/` |
| QM-6 CCG 双模型外部评审 | 未执行 | 本环境无 `codeagent-wrapper`；本 PR 为纯文档，不以自审冒充通过 |
| 远程同步 | PASS | PR #3120 已 squash 合并为 `ac0612f200e5fca77d735341470708d689f0a4d0`（2026-10-08T10:50:18+08:00，取证 `git log origin/main --grep='(#3120)$' --format=%H\|%cI`）；`git ls-remote --heads origin credit-pricing-deep-analysis` 返回 0 行，证远端分支已删（`--delete-branch` 生效）。CI：19 checks 收敛于 8 success / 11 skipped / 0 failure，skipped 系 docs-only 通道对重型 job 的预期短路。frontmatter 的三个 `sync_*` 字段在同一次回填提交中删除 |

### 取证基线说明

报告动笔时 `origin/main` 已从 `4e8092b` 推进到 `b8ed51d`。**重新 fetch 并逐行核验了 `packages/api-publish-engine/src/auth/plan-matrix.js` 的价格真源（`:16` 版本号、`:23-24`/`:36-37`/`:50-51` 价格、`:31`/`:45`/`:59` 积分数值）——最新 main 上一行未变，报告内所有 `文件:行号` 引用在合入时点仍然有效。**

同时按「导入前全树搜目标路径」纪律用 `git ls-tree -r HEAD | grep -iE "credit|pricing|积分|算力"` 检索，确认仓库内不存在同主题的既有报告，避免重复入库或版本倒退。

### 遗留（不假装已闭合）

- **L1 · 5 处口径漂移未在本次 PR 修**（报告 §6.4 C）。第 1 项最严重：`ops-center/docs/pricing-strategy.md` 与 `01-docs/pricing-strategy.md` **同名不同内容**，前者停在 v0.1（2026-07-01）的 `¥29/月 ¥199/年`，而 `PRD-GAP-ANALYSIS-2026-10-06.md:67` 引用的正是这份旧的。建议单开 PR 统一清理。
- **L2 · `ops-center/docs/pricing-strategy.md:238` 的「视频合成 纯本地处理 ¥0」是硬错误**。已有付费视频模型在跑，该假设若被当作定价依据会把视频类赠送量算成零成本。
- **L3 · 报告中的上游单价为 2026-10-08 公开挂牌价，非实际采购价**。需用近 30 天上游账单反推真实加权单价回填单价表后，赠送量才能最终定死。
- **L4 · 分支名合规性**：本分支初名 `docs/credit-pricing-deep-analysis` 含斜杠，违反 AGENTS.md「分支用裸 task 名」约定（且与 `openspec/records/` 下 99 条扁平记录命名不一致），已改名为 `credit-pricing-deep-analysis`。
