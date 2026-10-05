---
record: openspec-closeout-ipc
task: 归档 4 个已完成 change（3 个发布进度/频率 + fix-settings-roundtrip-contract）、按「#2899 已合并」重评其 8 条收尾任务并补中央技术债台账、新起 change fix-ipc-namespace-contract（CRITICAL-1 命名空间错配 + preload 反向契约测试）
date: 2026-10-05
---

## 本次执行记录：OpenSpec 收口 + IPC 契约 change 立项（openspec-closeout-ipc，2026-10-05）

> 分支：`openspec-closeout-ipc`（worktree `D:/Data/projects/mp-worktrees/mp-openspec-closeout-ipc`，`scripts/start-mp-task.ps1 -TaskName openspec-closeout-ipc` 建区，`verify-worktree-deps.js` OK 11 项）
> 范围：📝 纯文档/流程收口。`git diff --cached --name-only` 31 个文件全部落在 `openspec/**` 与 `01-docs/**`，**未触碰 `apps/`、`packages/`、`ops-center/`、`config/`、`.github/` 任何运行时代码** ⇒ 走 docs-only 快速通道（豁免 QM-1 打包、QM-2 代码必检、QM-4 视觉、TDD、QM-6 双模型评审）。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 隔离 worktree 内编辑（非共享主工作区就地编辑）：`git rev-parse --abbrev-ref HEAD`=`openspec-closeout-ipc`；共享主工作区全程未落本任务任何文件，其上原有一份他会话未提交的 `docs/frontend-deep-review` 工作，本 PR 未触碰（该会话自行收口并推了 `docs-frontend-deep-review` 分支）；落地走 PR，非直推 main |
| 第一性原因（QM-5 ①） | PASS | 本次要修的不是一个 bug，而是**收尾任务的状态模型缺一态**：change 的 tasks 只有「完成 / 未完成」两态，没有「前提已失效」。`fix-settings-roundtrip-contract` 的 9.4 / 11.3 / 12.3 判据全部绑定「PR 在途」这个会随合并而消失的状态——#2899 已于 2026-10-05 12:47 squash 合并为 `10d2a8202`，这些任务既无法执行、也无法被判失效，于是永久挂在 46/54。12.3 引用的 `7bbe33e6b` 是 squash 前的 worktree 提交，合并后 `git cat-file -t` 直接报 `Not a valid object name` |
| 逃逸分析（QM-5 ②） | PASS | 单元/集成/E2E/视觉四层均 N/A（未触运行面）。逃逸发生在**流程层**：`openspec list` 一直把该 change 显示为「46/54 tasks」而非「已完成」，但没有任何机制去复核「未完成的那几项前提是否还存在」，于是长期无人认领。审查层同样有缺口：`openspec/records/fix-settings-roundtrip.md` 把实现 PR 的门禁记录得极完整（QM-6 8 条变异、逃逸链、merge SHA），但**记录的是实现门禁，不覆盖 change 的收尾闭环**——记录存在 ≠ 闭环成立 |
| 修复 + 回归保护（QM-5 ④） | PASS | 8 条逐条重评并把结论写回 `tasks.md` 行尾（54/54 收口）。其中 12.3 不照抄失效前提，改为**在新 head `10d2a8202` 上真实验**：基线 `settings-roundtrip-contract.test.js` = 17 passed；变异 #10（结构锁）注入修复前真实原形 ⇒ 恰「ops-center-sync.js 不得再用 String(getSetting(...)) 的误判口径读配置」1 failed / 16 passed；变异 #12（装配锁）注入未转发的 `getProbeObject` ⇒ 恰「对象语义读取入口的未转发清单只能缩小」1 failed / 16 passed。两个被变异文件按 md5 逐字节还原（`28DF9CC015D9` / `61282D8334C7`），收尾复跑 17 passed 且 `git status --porcelain` 为空 |
| 防止再次发生（QM-5 ⑤） | PASS | ① 12.4 的三个 Warning 此前只登记在 `docs/settings-persistence-contract.md` §8、中央台账检索不到 → 本次补入 `01-docs/tech-debt.md`（行损坏抹 Key / 信任锚不重验签 / 窄包装未转发 `getSettingObject`），使后续切片可被独立检索；② 归档前后跑 `scripts/openspec-sync-check.js` 并**逐条差分**：14 条 → 14 条，零新增违规（基线为 archive 目录既有历史债，本次不假装已清）；③ 新 change `fix-ipc-namespace-contract` 的 spec 明确两条防复发要求——对账失败必须**阻塞级**而非 advisory、扫描域必须带**棘轮自检**，直接针对「测试写了但不是必检 / 新文件静默失去守护」这两个已知逃逸面 |
| 行尾与 diff 对账 | PASS | 31 个文件 `git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` **逐文件两口径一致**，无 CRLF 噪音；删除数为 0（本次全为新增与目录移动，`openspec/changes/<name>/` → `openspec/changes/archive/2026-10-05-<name>/` 由 `openspec archive` 搬运，非内容删除） |
| 接线棘轮 | N/A | 本次**未新增任何 `*.test.js`**。新建 change 里规划的 `apps/desktop/electron/tests/ipc-exposure-contract.test.js` 尚未实现，其"必须被 workflow 显式点名"已作为 tasks 5.1 落到 change 里，不在本次交付范围 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行面。31 个变更文件全在 `openspec/**` 与 `01-docs/**`；`apps/`、`packages/`、`ops-center/`、`config/`、`.github/` 零改动 |
| QM-6 CCG 双模型外部评审 | 未执行（docs-only 豁免） | docs-only 快速通道豁免 QM-6；且本机 `codeagent-wrapper` 通道此前实测不干净（前端路两次空转、后端路 stdout 截断且无 rollout）。**不以自审冒充外部评审通过** |
| 远程同步 | PASS | PR #2943 squash 合并 `829f1be6ea422fcf460eab4cfb2bcc795498aba0`（2026-10-05T21:06:04+08:00，取证 `git log origin/main --grep='(#2943)$' --format=%H|%cI`）；`git ls-remote --heads origin openspec-closeout-ipc` 返回 0 行，证远端分支已删；本条由本次 docs-only PR 就地回填，frontmatter 的 sync_* 三字段在同一次提交删除 |

### 归档明细（本 PR 的实际动作）

| change | 归档前 | 归档后 | 备注 |
|---|---|---|---|
| `publish-progress-ux` | 36/36 | `2026-10-05-publish-progress-ux` | 创建 `openspec/specs/publish-progress-feedback/spec.md`（+6 ADDED） |
| `publish-frequency-control` | 30/30 | `2026-10-05-publish-frequency-control` | 创建 `openspec/specs/publish-frequency-control/spec.md`（+6 ADDED） |
| `publish-progress-panel-refine` | 23/23 | `2026-10-05-publish-progress-panel-refine` | **首次归档失败**：`publish-progress-feedback` 目标 spec 当时不存在，而其 delta 含 MODIFIED ⇒ 报 `target spec does not exist` 且 `Aborted. No files were changed.`；待 `publish-progress-ux` 先创建该 spec 后重试成功（+1 ADDED / ~4 MODIFIED）。**归档顺序有依赖，教训记录在此** |
| `fix-settings-roundtrip-contract` | 46/54 → 重评后 54/54 | `2026-10-05-fix-settings-roundtrip-contract` | 创建 `openspec/specs/desktop/settings-persistence/spec.md`（+3 ADDED） |

### 遗留（不假装已闭合）

- `fix-ipc-namespace-contract` 的 tasks 1.1 未做前，**真实缺陷存量规模未知**。报告称同形状有 9 份独立 `getApi()` 与 6 个绕过桥接层的文件，但未经本会话实测；若 1.2 判定真实缺陷 > 8，该 change 需按 tasks 1.3 拆分。
- 本 PR 只产出规划工件。按 `openspec-propose` 的规划边界，**未进入实现**；`src/api/publisher.js` 的 C-1 缺陷此刻**仍然是活的**（影视单镜重试仍永久失效且界面零报错），须另起 apply 会话。
- `openspec/active-tasks.json`（AGENTS.md 要求的中央登记）本仓从未建立，本次 9.4 判定为 N/A。若后续并发任务变多，应补建。
- `scripts/openspec-sync-check.js` 的 14 条历史债（11 ERROR + 3 VIOLATION，全在 `openspec/changes/archive/` 下）**未清**，不在本次范围。
