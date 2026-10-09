---
record: official-compute-handoff
task: 新增官方算力体系交接文档（现状评估 + 安全审计 + 落地方案 + 交接 8 坑）
date: 2026-10-09
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（合并后回填）
---

## 本次执行记录：官方算力体系交接文档（official-compute-handoff，2026-10-09）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | **纯文档**：就地编辑 + 经 PR 落地，未创建 worktree（AGENTS.md 分层策略），未直推 main |
| 第一性原因（QM-5 ①） | N/A | 纯新增文档 |
| 逃逸分析（QM-5 ②） | N/A | 同上 |
| 修复 + 回归保护（QM-5 ④） | N/A | 未触运行面 |
| 防止再次发生（QM-5 ⑤） | ✅ | 文档 §7 固化了 8 个「已中过/易再中」的坑，含 PR #3066 与 `overrides` 两例同型陷阱；§7 自检段固化中文 U+FFFD 编码陷阱；§7 末固化引用纪律（本仓已出现至少 4 处引用漂移） |
| docs-only 判定 | ✅ | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → `docs-only=true`，files=1 |
| 编码完整性 | ✅ | U+FFFD 全文 1 处，**是 §7 自检段故意引用的示例行**（说明该陷阱时用），非损坏；另 1 处真实损坏已在提交前 grep 捕获并修复 |
| 品牌残留 | ✅ | `node scripts/check-no-brand-residue.js` → PASS（7428 tracked 文件）。文档刻意以「参考产品」代替竞品名 |
| max-lines | ✅ | 「无新增超大文件，挂账清单与现实一致」 |
| debt-budget | ✅ | 「所有债务指标在基线内」 |
| 行尾对账 | 见 commit | 两口径一致；纯新增，删除数 0 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/`，无 UI 变更 |
| QM-6 CCG 双模型外部评审 | 未执行 | 本环境无 `codeagent-wrapper`（详见「评审执行说明」）。**不以自审冒充通过** |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填，`git ls-remote --heads origin docs/official-compute-handoff` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 评审执行说明（重要，不得省略）

本仓的 CCG 跨家族双模型评审在当前环境**无法执行**：

- 引擎驱动 `ccg-deep-review.js` **全盘不存在**（`plan-review.sh:119-125` 的三个搜索路径 `$ROOT/scripts/` / `$CCG_ARL_DIR/` / `$HOME/.claude/skills/adversarial-review-loop/` 全部落空）
- 后端 CLI `claude` / `opencode` / `codex` / `codeagent-wrapper` **四者全部不可用**
- `node scripts/ccg-review-decider.js --print` 判定模式为 **DUAL**（命中 auth/数据库/加密 4 处敏感内容），并自行降级为 `SELF-REVIEW`

官方算力方案的前两轮对抗评审即在此降级条件下进行：由 `Verifier` 子 Agent 承担对抗角色并**实测复现**核心缺陷。两轮结论（VERDICT = FAIL）已沉淀到分支 `openspec-official-compute-credit-engine` 的 `REVIEW-CONCLUSION.md`，**该分支未合入 main**。

**本 PR 的交接文档是对那两轮评审的沉淀，不声称通过了 CCG 双家族评审。**

### 取证基线说明

分支从 `origin/main` @ `1016cd7` 切出。**文档内所有 `file:line` 引用均在该基线上复验**，包括 §3 的三条硬事实与 §4 的 7 项安全发现。§8 提供了基线前进后的复核命令清单。

期间 main 已从 `ceb99875` 推进到 `1016cd7`（跨多个 PR），因此**没有沿用前几轮的行号**。

### 遗留（不假装已闭合）

- **L1 · 三个必须由业务/架构方回答的问题**（文档 §6）：Q1 那些 AI Key 实际怎么用（若推断错误，整个官方算力方案前提作废）、Q2 Node 侧加密走哪条路、Q3 上游近 30 天账单能否提供。**答不上 Q1 不应启动任何开发。**
- **L2 · 官方算力技术方案处于冻结未通过状态**。交接文档 §2 明确标注「不要直接照它的批次表开工」，其中的表结构与取证可复用，批次顺序需按本交接文档重排。
- **L3 · 交接文档的推荐路径尚未获运营方确认**。方案 A（平台能力优先 + 积分暂不对外承诺）是我的推荐，但改变的是对外承诺口径，属于商业决策。
- **L4 · 赠送量仍基于公开挂牌价**。文档未重新计算赠送量——在供给链路未定前，这个数字不具备可承诺性。
