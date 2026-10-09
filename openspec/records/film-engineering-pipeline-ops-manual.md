---
record: film-engineering-pipeline-ops-manual
task: 影视工程流水线深度解读与操作手册（代码取证 + 六路线操作 + 安全合同 + 排障）
date: 2026-10-09
---

## 本次执行记录：影视工程流水线操作手册（film-engineering-pipeline-ops-manual，2026-10-09）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | **纯文档**：就地编辑 + 经 PR 落地，未创建 worktree（AGENTS.md 分层策略），未直推 main |
| docs-only 判定 | ✅ | `node scripts/classify-docs-only.js --base=origin/main --head=<分支提交>` → docs-only=true（files=3：`01-docs/FILM-ENGINEERING-PIPELINE-OPERATIONS-2026-10-09.md` + 本记录 + 载体 `.quality-gates.md`，均命中文档白名单路径） |
| 品牌残留 | ✅ | `node scripts/check-no-brand-residue.js` → PASS（7431 tracked 文件） |
| 编码完整性 | ✅ | `node scripts/check-text-encoding-integrity.js` → OK 无新增编码损坏（存量 5 项均基线登记） |
| 行尾对账 | ✅ | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致（1157/0，纯新增） |
| 文档同步 | ✅ | Doc Sync Gate / QG Changes check 随 CI |
| QM-1 打包 / QM-2 / QM-4 视觉 / TDD | N/A | 未触运行面（纯新增 md） |
| QM-6 CCG 双模型外部评审 | 豁免 | docs-only 快速通道命中（与运行时无关） |
| 远程同步 | PASS | PR #3216 已 squash 合并，merge SHA `db17ab75a0ed978362ac7937dd5f28fb6778b9d6`（2026-10-09T22:48:34+08:00），取证 `git log origin/main --grep='(#3216)$' --format=%H\|%cI` 唯一命中；`git ls-remote --heads origin docs/film-engineering-ops-manual` 返回 0 行，证远端分支已删；frontmatter 三个 sync_* 字段已在本回填提交删除 |

### 内容与取证说明

- 手册约 6.4 万字符（中文约 1.6 万 + 代码/路径/表格），23 章：总览/路由/数据资产/服务层/阶段执行器/IPC/前端/六路线操作/成本闸与断点续跑/安全九防线/常量表/媒体根/排障/测试地图/边界 + 方法论精读/逐模块深读/三个实战案例/FAQ/二次开发集成/决策树/设计原则/符号索引。
- 全部功能点、限制、错误码标注 `文件:行号`，行号在基线 `main@8b3d3e91` 上复验（kit 数据规模、allowedHosts 缺失、llm:null 注入等均为 `node -e` 实测取证）。
- 显式记录 5 条「规格承诺 / 当前实现」差异（15.2），不做美化：LLM 润色未接线、回收依赖全量 kit allowedHosts、stageCount 口径、estimatedCost 口径、画布 STORAGE_KEY 注释省略号。
