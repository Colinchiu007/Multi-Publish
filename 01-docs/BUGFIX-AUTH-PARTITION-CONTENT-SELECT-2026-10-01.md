# BUGFIX：auth 分区兜底只按「字典序末位」定位 ⇒ 一次失败/取消的登录遮断该平台凭证兜底（#2734）

日期：2026-10-01　分支：`fix-auth-partition-content-select`　issue：#2734（#2701 的近邻缺陷）

## 1. 现象与用户侧症状

账号管理里登录过某平台（快手/视频号等），之后发布却报「未登录」。API 轨日志只有一句
`API publish cookie fallback empty (no platform cookies in auth partition)`；RPA 轨
`_restoreAuthPartitionCookies` 补充 0 条 cookie。**重试、重启都不会好**。

## 2. 第一性原因（QM-5 ①）

不是"忘了处理某平台"，而是**选址规则把「时间上最新」当成了「有登录态」**。

`apps/desktop/electron/services/auth-partition.js` 的 `findAuthPartitionDir` 对每组前缀做
`names.filter(prefix).sort()` 后**只取最后一个**，且不检查该目录里到底有没有该平台可用的 Cookie。
而 `openLogin` / `openSavedAccount` / `qrcode-login` **每次都新建一个带 `Date.now()` 的分区**，
所以"较新的那一份"完全可能是一次失败或取消的登录留下的空壳。真正持有登录态的较旧分区仍在盘上，
只是因为时间戳较旧而**永不被读**。

追溯引入点：末位口径由 kuaishou-w3-live-fix（D1）引入 `auth-partition.js` 时从
`rpa-view-session` 的早期实现抄来，当时 `openLogin` 的分区名还带账号 id（一个账号一份），
"最新即有效"恰好成立；`Date.now()` 会话化改造之后该前提就失效了，但规则没有跟着改。

放大问题的是 #2701 的回收端：`reclaimLoginSession` 在 `close()` 时把刚关闭的分区名当作
`activePartitionNames` 传给 sweep，于是那个空壳**既不会被清也不会被删**，而它正是字典序末位。

## 3. 逃逸分析（QM-5 ②）——每一层为什么都没拦住

| 层 | 为什么漏 |
| --- | --- |
| 单元测试 | `auth-partition.test.js` 的夹具把所有分区 mock 成**同一份 cookie**（`mockPartitionCookies(cookies)` 不看 name），且候选数只有 1–2 份 ⇒ "新旧两份内容不同"这个形状在测试里根本不可表示 |
| 集成测试 | 走的是同一条 mock 接缝，同样恒等 |
| E2E / 视觉 | 发布兜底属主进程取数路径，UI 只在失败时显示一句通用文案；且需要"先失败登录再成功登录"的跨会话时序，现有场景集没有 |
| 代码审查 | QM-2 有「登录态只被正/负证据改写」这类**状态**规则，但没有「按名字择新 ≠ 按内容择新」这条**选址**规则 |
| #2701 自己的回归锁 | 它钉的是"回收前后 `findAuthPartitionDir` 返回同一分区名"（读中性）——这条在旧规则下**恒真**，因此对新规则毫无防御力；同一条锁的夹具（同组两份、旧的一份含凭证）恰好就是本 bug 的复现基础，却没被用来断言选址结果 |

## 4. 系统性漏洞定位（QM-5 ③）

**测试场景缺失**（主因）+ **审查盲区**。更深一层是：`#2701` 把"定位端只读末位"当成公理去做删除豁免，
于是**回收保留数**和**定位探测窗口**成了同一个决策的两端，却分别写死在两个文件里——这类耦合没有名字，
下一次改动只会再一次踩中。

## 5. 修复方案（QM-5 ④）

三条判据，缺一不可：

1. **按内容择新**：新增 `selectAuthPartition()`，同组**从新到旧**逐份打开，判据是
   `isPlatformCookieDomain`（共享实现，不另写一份），取第一个**真含该平台 Cookie** 的；命中即停。
2. **窗口单一真源**：探测上限 `PROBE_LIMIT = 5` 定义在 `auth-partition-reclaim.js` 并由
   `auth-partition.js` 再导出；**回收端每组保留最近 K 份**（原来是 1 份）。
   回收保留数必须等于定位探测窗口，否则回收会把定位端的候选自己吃掉——这条耦合由
   `auth-partition-reclaim.test.js` 的「回收前后 `listAuthPartitionCandidates` 完全相同」
   与「两处是同一个常量」两条锁住。
3. **日志三分**：`no-candidate`（一个候选都没有）/ `all-empty`（探过 N 份，都没有该平台 Cookie，
   并列出探过的目录名）/ `probe-failed`（探测本身失败）。旧口径把这三件事写成同一句话，
   排障者无法区分"真的没登录过"与"被空壳遮断"。

`findAuthPartitionDir` 删除（无生产调用方，留著就是第二份口径），消费方改为：
`collectAuthPartitionCookies`（API 轨）与 `rpa-view-session._restoreAuthPartitionCookies`（RPA 轨）
都走同一个 `selectAuthPartition`。RPA 轨仍注入该分区**全部** cookie（含 BDUSS 这类父域），语义不变。

磁盘上界仍是硬的：每组最多 K 份，不会回到 #2701 立项时的无界增长。

## 6. 回归保护与反证

`auth-partition.test.js` +9 条（主场景、命中即停、跨平台不串味、窗口上限、all-empty 留痕、
无候选与 all-empty 可区分、单份抛错不中断、probe-failed 不谎报、常量单一真源），
`auth-partition-reclaim.test.js` 迁移 + 新增 26 条。两文件 44 passed；四个消费方文件 62 passed。

反证 5 条，全部实测**变红**且跑完逐字节还原：

| 变异 | 结果 |
| --- | --- |
| M1 定位退回「无脑取最新一份」 | 4 failed |
| M2 摘掉探测上限 | 1 failed |
| M3 回收退回「每组只留末位」 | 11 failed |
| M4 探测失败谎报 all-empty | 1 failed |
| M5 「无候选」与「探过都空」合成一条日志 | 1 failed |

## 7. 预防措施（QM-5 ⑤，已落到文件）

1. `AGENTS.md` QM-2 新增「兜底/回退类选址必须按内容判据择新，且与保留窗口同源」条目。
2. 本文件 + `01-docs/learnings.md` 记录根因与教训。
3. 回归锁随 vitest workspace 收集，无需额外 CI 接线；反证脚本另存于本次 PR 说明。
4. 夹具纪律：本仓有一条同族教训——**mock 若对所有输入返回同一份数据，"按输入区分"的整类缺陷对该测试结构性免疫**。
   新增选址/路由类判据时，夹具必须让**不同输入返回不同内容**，并至少有一条"旧的才是对的"的反直觉用例。

## 8. 未覆盖 / 留痕

- 空壳分区本身仍不会被主动删除（它是末位、且 `close()` 把它标为 active）。本 PR 修的是**读**，
  不是**清**。按内容删除需要"这个分区确实没有可用凭证"的可靠判据，而 `isPlatformCookieDomain`
  对个别平台偏窄（有把真凭证误判成空、进而删目录=抹掉不可恢复凭证的风险）——所以保留窗口 +
  按内容择新是当下的正确折中。若要彻底清理空壳，需要逐平台会话标记取证后再收紧，属另一件事。
- `silent-auth-*`（登录态定时检查）不在兜底定位的前缀集内，不参与本问题。
