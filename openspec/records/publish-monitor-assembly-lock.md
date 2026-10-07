---
record: publish-monitor-assembly-lock
task: 为 publish-monitor（发布后回查分派/终态/跳过）补第一个测试文件，运行态装配锁 + 五条变异反证
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；远端分支也未删除
sync_backfill_owner: 下一个会话（docs-only 回填 PR，回填即删除本段三个 sync_* 字段）
---

## 本次执行记录：publish-monitor 运行态装配锁（publish-monitor-assembly-lock，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 隔离 worktree `D:/Data/projects/mp-worktrees/mp-publish-monitor-assembly-lock`，裸分支 `publish-monitor-assembly-lock`（start-mp-task.ps1 建区，产物以 `git worktree list` 实证）；共享根保持 main clean |
| 第一性原因（QM-5 ①） | PASS | 不是代码 Bug，是**测试面缺失**：`publish-monitor.js` 自建立起无测试文件；#2927/#2968 的锁都建在被调模块自己那侧（`bilibili-audit-check.test.js` 直接调用函数），装配入口从未被执行 ⇒ 「分派点存在但没人跑过」 |
| 逃逸分析（QM-5 ②） | PASS | 单元层：无该模块测试；集成层：两侧模块级测试各自 new 依赖，不经 `createMonitorTask`；真机层：B 站投稿链路此前产不出 postId（#2968 已修）；分类＝**无测试 + 测试不执行** |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `publish-monitor.test.js` 8 条（T1-T8）：真实现 + 本机 loopback 回显服务，只换 host 保留 path/query。全绿 8/8；`vitest run electron` 全量见下行 |
| 防止再次发生（QM-5 ⑤） | PASS | ①`docs/PUBLISH-MONITOR-ASSEMBLY-LOCK-2026-10-07.md` 记录 jsdom/XHR 丢 Cookie 头的现场与 `adapter:'http'` 正解；②T8 由变异反证逼出「请求在途时 stop」形态，防"守卫存在≠守卫有效" |
| 反证（锁真的在跑） | PASS | 五条变异逐个实跑变红，每条收尾断言源文件与备份逐字节相同、并以 `git status` 证无残留改动：M1 摘 `listUrl` 透传 ⇒ T2 红；M2 B 站不再专用分派 ⇒ T1+T2+T4 红；M3 摘 checker 无凭证守卫 ⇒ T4 红；M4 `stop()` 的 `cancelled` 置位改 no-op ⇒ T8 红（**第一轮 T8 写法抓不住这条，已按反证结果改写**）；M5 通用链丢 Cookie 头 ⇒ T7 红 |
| 全量测试 | PASS | `vitest run electron` 全量实跑：`Test Files 1 failed \| 463 passed \| 1 skipped (465)`、`Tests 1 failed \| 8783 passed \| 1 skipped (8785)`；唯一红＝既有 `electron/services/feedback.test.js` 的 Windows `fs.symlinkSync` EPERM（本机权限态，与本 PR 零关联：本 PR 只新增测试/文档文件，未改任何生产代码）；新文件在全量日志里出现 6 次（含 8 例通过）⇒ 证明确实被执行，不是「文件存在」 |
| 行尾与 diff 对账 | PASS | 三个新文件均为纯新增（`git diff --cached --numstat` 删除数=0），strict 与 `--ignore-cr-at-eol` 两口径逐文件相等；测试文件由 Write 落 LF，git 按 `attr=text=auto` 在索引侧归一化 |
| 接线棘轮 | PASS | 新文件由 `apps/desktop/vitest.config.js` 的 `include: electron/services/**/*.test.js` 收集；实跑日志出现该文件名且测试数 8 > 0（非只 `node --check`） |
| QM-1 打包 / QM-4 视觉 | N/A | `apps/desktop/package.json` `build.files` 显式含 `"!**/*.test.js"` ⇒ 测试文件不进 asar；本 PR 零生产代码改动（`git diff --name-only` 只含测试与文档），产物字节不变。视觉：无 UI 变更 |
| QM-6 CCG 双模型评审 | N/A（如实登记） | 触发条件均针对实现变更（主进程服务逻辑/IPC/引擎包）。本 PR 只新增测试文件，其正确性由上表五条变异反证承担；未跑外部模型评审，原因是变更面为零生产代码，非疏漏 |
| 远程同步 | PENDING | 本条自己的欠账：PR 合并后由后续 docs-only PR 回填 merge SHA 与远端分支删除证据，并删除本文件 frontmatter 三个 `sync_*` 字段 |

### 遗留（不假装已闭合）

- 通用分支（微博/头条/知乎/小红书）的状态词表仍是未取证的猜测形态；本锁只保证「形状不被无意改动」，不等于形状正确。
- B 站端到端观测仍需一次真实投稿（未消耗授权）。
