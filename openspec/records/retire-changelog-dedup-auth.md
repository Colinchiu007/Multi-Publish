---
record: retire-changelog-dedup-auth
task: 退役已消费的 CHANGELOG 去重授权——解除后续 PR 的坐标系死锁
date: 2026-10-08
---

## 本次执行记录：CHANGELOG 去重授权退役（retire-changelog-dedup-auth，2026-10-08）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 门禁判据改动 ⇒ 隔离 worktree `mp-clog-auth`，裸分支 `fix-changelog-auth-retirement`；**用户明确选 B（openspec change 路线）后执行** |
| 第一性原因 | PASS | 死锁成因：授权文件 `88669579` 合入 main 后，CI 的 HEAD 是 merge ref（`refs/pull/<n>/merge` = PR head ⊕ main tip），**承载 main 合入的授权文件** ⇒ 门禁判「head 相对 base 新增授权文件」成立 → `evaluateAuthorization` 的 `applies_to_base(23822b73) ≠ merge-base(f210f191)` → fatal「坐标系不等」。实测 PR #3076（日志 L1267-1268），该 PR 未触碰 CHANGELOG |
| 第一版设计被测试击穿（重要） | PASS | 首版方案「删授权文件 + 纯形状退役（base 多副本+head 单份即放行）」被既有测试精确击穿：`真仓库四档`/`核心不变量` 两用例用 `B×2→B×1` fixture 断言必须红，形状判据把它们放行（30 例中 2 红）。**形状无法区分「已授权的那次清理」与「任何人随手删副本」** ⇒ 回滚 v1（30/30 还原），改 v2 授权坐标系退休方案 |
| v2 设计 | PASS | 授权文件**留在 main**（它是那次清理的登记证与防滥用锚点）。`evaluateAuthorization` 新增已消费退休分支：`applies_to_base` 是本次 base 的**祖先**（merge-base --is-ancestor 探测）⇒ 不是"坐标错位"而是"坐标已退休"，granted:true + retired:true；非祖先仍维持原 fatal 逐字不变 |
| 防滥用推演 | PASS | ①祖先探测失败（假 sha/无关系）⇒ fatal；②head 条目数 ≠ `expected_entries_after` ⇒ collect 层原 fatal 保留（数字是判据不是注释）；③head 标题少了 base 去重后应有的 ⇒ 默认判据抓；④授权文件在 base 已存在 ⇒ 原防白蹭 fatal 保留；⑤同坐标（applies_to_base === baseSha）走原通路、**不得标 retired**（用例 5 锁住） |
| TDD | PASS | 新增 `scripts/check-changelog-growth-retire.test.js` 5 例：祖先放行/真错位 fatal/evaluateAuthorization 层放行（数字核对在 collect）/防白蹭保留/同坐标非 retired。30 条既有断言**一字未改**且 30/30 全绿 |
| 变异反证 | PASS | 把"祖先成立即放行"变异为"祖先也 fatal" ⇒ 退休用例 5 例中 2 例转红（用例 1 + 用例 5），还原后 5/5 全绿；`git diff` 仅含 v2 本身 |
| 真实数据验证 | PASS | 用真实 blob 验证判据：base `23822b73fecc`（清理前：1189 条/348 种/**269 个多副本标题**）→ head `88669579b1dc`（清理后：349 条/349 种/0 多副本），标题集合 missing=0；**授权声明的 expected_titles_reduced=269 与真实 blob 完全一致** |
| QM-6 CCG 双模型评审 | 未执行 | 本机无 `codeagent-wrapper` 可执行文件（`X --version` 实测失败，与 2026-10-07 记录一致）；待环境可用后补评，不以自审冒充 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面与运行时代码；改的是 CI 门禁判据 |
| 行尾与编码 | PASS | `bareLF=0`（CRLF 保持）；**本轮再次踩中全角逗号**（`retiredReason` 与 reason 两行尾 `,` 写成 `，`）⇒ `node --check` 即时抓住；脚本改写 + 只读回读 + 强校验的流程全程执行 |
<<<<<<< Updated upstream
| 远程同步 | PASS | merge SHA `a356572678e6375368a43ad19418286f89811552`（2026-10-08T17:35:38+08:00）。取证：`git log origin/main --grep='(#3151)

### 与既有承诺的关系

`dedup-changelog-history` 的提案承诺「默认判据与现有 11 条断言一字不动」。本 change **兑现**该承诺：30 条既有断言（含授权通路的全部 fatal 与默认判据的全部负控）一字未改且全绿；新增的退休分支只在「授权坐标系已是 base 祖先」这一**事后状态**下生效——它放行的不是"新的清理"，而是"已被授权的清理在 main 上的既成事实"。

### 遗留（不假装已闭合）

- `expected_entries_after=349` 与 main 当前 359 条的差 10 条是**清理之后**的正常新增，退休分支放行的只是"那次清理造成的缺失"，两者不混淆（当前用例未显式覆盖"清理后又有新增"的场景，若后续出现需补用例）。
- PR #3076（小红书 permit 形态对齐）与 #3091（learnings 编码修复）在本 change 合并后重跑 CI 应转绿，需实际验证。 --format=%H|%cI` → `a3565726…11552|2026-10-08T17:35:38+08:00`；`git ls-remote --heads origin fix-changelog-auth-retirement` 返回 0 行（远端分支已删） |
=======
| 远程同步 | PASS | 已合并 #3151 = `a356572678e6375368a43ad19418286f89811552`（squash，committer 2026-10-08T17:35:38+08:00）。取证：`git log origin/main --grep='(#3151)$' --format=%H|%cI` 唯一命中；`git ls-remote --heads origin` 对应分支返回 0 行。补记：本文件为 #3164 批量回填的漏项，由本次回填 PR 就地闭合 |
>>>>>>> Stashed changes

### 与既有承诺的关系

`dedup-changelog-history` 的提案承诺「默认判据与现有 11 条断言一字不动」。本 change **兑现**该承诺：30 条既有断言（含授权通路的全部 fatal 与默认判据的全部负控）一字未改且全绿；新增的退休分支只在「授权坐标系已是 base 祖先」这一**事后状态**下生效——它放行的不是"新的清理"，而是"已被授权的清理在 main 上的既成事实"。

### 遗留（不假装已闭合）

- `expected_entries_after=349` 与 main 当前 359 条的差 10 条是**清理之后**的正常新增，退休分支放行的只是"那次清理造成的缺失"，两者不混淆（当前用例未显式覆盖"清理后又有新增"的场景，若后续出现需补用例）。
- PR #3076（小红书 permit 形态对齐）与 #3091（learnings 编码修复）在本 change 合并后重跑 CI 应转绿，需实际验证。