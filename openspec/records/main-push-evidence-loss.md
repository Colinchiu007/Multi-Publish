---
record: main-push-evidence-loss
task: 修 #2642 —— main push 的并发组改为按 run_id 唯一，止住"排队中的旧 push 被新 push 顶成 cancelled"造成主侧执行证据永久丢失
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（回填 PASS 时整段删除上面三个 sync_* 字段）
---

## 本次执行记录：main push 排队顶替导致主侧证据丢失（main-push-evidence-loss，2026-10-05）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | CI 配置属运行层面（AGENTS.md「关联配置/CI」档）⇒ 独立 worktree `mp-main-push-evidence-loss` + 裸分支，基线 `origin/main` = `fd28e782f`；`--no-verify` 未使用 |
| 第一性原因（QM-5 ①） | PASS | 不是 `cancel-in-progress` 表达式失效 —— #2642 的更正评论已实测 25/25 被取消的 main push run **连 job 都没派发过**（jobs=0，正向对照 success run 返回 10~11 个 job）。真机制是 GitHub 并发组的排队语义：**同组只允许一个排队者**，新 push 一到就把还在排队的旧 push 置为 cancelled。旧 run 此后不会再出现 ⇒ 那条 sha 的主侧执行证据永久丢失 |
| 逃逸分析（QM-5 ②） | PASS | 逃逸的是"没有任何东西在看 group 的取值"：`workflow-contract.test.js` 只锁 `cancel-in-progress` 含 `pull_request`（第 2) 条），对 group 只断言"存在"。于是表达式正确、组错误也能全绿 —— 属"锁的方向对但测量的量不对" |
| 系统性漏洞（QM-5 ③） | PASS | 主侧 CI 结果被当作"必然存在"来消费（多条记录里写「main 已验证」），但没有任何门禁看那条 sha 到底有没有 completed 的 push run |
| 修复 + 回归保护（QM-5 ④） | PASS | ① `quality-gate.yml` / `electron-ci.yml` 的 `concurrency.group` 改成「PR 按 PR 号、非 PR 按 `github.run_id` 唯一」，`cancel-in-progress` 一行**不动**；② 先加锁再改配置：`workflow-contract.test.js` 新增 2b) 双向断言（group 必须含 `run_id` 且必须仍含 `pull_request.number`）。TDD 现场：加锁后实跑 **RED**（`actual: '${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}'`，`expected: /run_id/`，命中的正是"CI 提速契约"那条），改配置后 31/31 **GREEN** |
| 防止再次发生（QM-5 ⑤） | PASS | 2b) 是**双向**锁：把 group 退回旧写法 ⇒ 缺 `run_id` 红；把 group 整体改成按 run 唯一（连 PR 也失去互相取消） ⇒ 缺 `pull_request.number` 红。注释里写明「不要去改 cancel-in-progress 那一行」并指向 #2642 的取证口径 |
| 行尾与 diff 对账 | PASS | 两个 workflow 与契约测试均为 CRLF（逐文件实测），插入一律按 `\r\n`；脚本自检「行数 == CR 数」；两口径 numstat 一致（见本 PR 的 CI 回读） |
| 接线棘轮 | N/A | 未新增测试文件（改的是已接线的 `workflow-contract.test.js`，它跑在 Gate 2c） |
| QM-1 打包 / QM-4 视觉 | N/A | 未触任何运行时代码与 UI |
| QM-6 CCG 双模型外部评审 | PENDING | 触发条件命中「配置变更 / CI」档 ⇒ 本条应做外部评审；结果与偏差按实际填写，不得以自审冒充 |
| 远程同步 | PENDING | 合并后按 `openspec/records/_TEMPLATE.md` 口径回填 merge SHA 与时间（`git log origin/main` 按本 PR 号行尾匹配的 `--format=%H|%cI` 唯一命中），并证远端分支已删；回填后删除三个 sync_* 字段 |

### 现场取证（本轮实测，非引用旧结论）

窗口：main + push 事件最近 1000 条 run，按 `(head_sha, workflow)` 归集，workflow 取 `quality-gate` 与 `Electron CI`：

- 涉及格数 **292**；「该 sha 该 workflow 全部 run 都 cancelled」（= 主侧证据真丢）= **51 格**；
- 「取消过但被后续 run 补回」= **0 格** —— 这一条是关键：它说明取消不是"重跑就好了"，而是**永久丢失**；
- 按天分档（取消/成功/失败）：09-29 达峰（qg 23/34/7、ec 18/44/2，与 #2642 正文 40%/29% 吻合），09-30~10-02 为 0，
  **10-03 重新出现 2 格 + 10-04 出现 2 格**（`ecee7649f`、`3af9d1114`、`6ddd41c4c`）
  ⇒ #2642 设立的门禁「等被坑第二次再决定」在本轮之后**已经满足**，这才是动手的授权来源；
- 另需记录一条口径修正：main 第一父链上 25 条带 `(#NNNN)` 的提交里，docs 类提交大量 `NO_RUN`，
  那是 push 触发器的 `paths-ignore`（2026-08 起就在，见 `a48820a0e`）**按设计不跑**，不是丢证；
  运行时代码提交 8 条中 7 条双 success、1 条 NO_RUN（那条本身是 Revert 一个 docs 提交）。
  第一版探针没分这两类，把 13 格读成了"损失"，是探针口径错不是现象错。

### 代价与已知边界（不假装已闭合）

- 本改动的代价是**满载时多条 main push 会并行抢 runner**（#2642 里方向①的原有代价）。本轮不再用「排队上限」换「证据完整」，
  因为排队丢失的是**证据**而 runner 争用丢失的只是**时长**。
- **未实测并行满载下的 job 等待时长**：需要一次真实的双 push 撞车才能量化，本轮不做，留作观察项。
- 其余 11 个 workflow 未一并改（`build.yml` / `gui-test.yml` / `visual-test.yml` 等同样按 ref 分组）。
  只改被 #2642 点名的两条，是因为只有这两条承担"required 证据 / 对拍执行证据"；其余要改应各自带取证。
