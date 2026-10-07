---
record: fix-bilibili-article-route
task: bilibili 图文任务不得路由进视频链——改 fail-closed 前置校验并自解释报错
date: 2026-10-07
sync_status: PENDING
sync_reason: "本 PR 尚未合并，无法取证 merge SHA；合并后由回填 PR 同一次提交写入并删除本字段与 sync_backfill_owner。"
sync_backfill_owner: "backfill-bilibili-route-record"
---

## 本次执行记录：bilibili 图文路由缺陷（fix-bilibili-article-route，2026-10-07）

| 门禁 | 状态 | 证据 |
|------|------|------|
| 变更类型与隔离 | PASS | 运行时代码 ⇒ 隔离 worktree `D:/Data/projects/mp-worktrees/mp-bili-fix`，裸分支 `fix-bilibili-article-route` |
| 第一性原因（QM-5 ①） | PASS | E2E 日志原文：`Executor Publish failed for bilibili: 第(1)个视频可能上传过程出现问题…`。该文案指不到根因。根因：`ROUTE_TABLE.bilibili = { mode:'api' }`，而其 api 轨**只有视频链**（upos 分片 + `/x/vu/web/add/v3`），无图文通道。图文任务无 `video_path` ⇒ 进链必败，且要**真发一次请求**才失败 |
| 逃逸分析（QM-5 ②） | PASS | 既有 `publisher-router.test.js` / `publisher-router-logging.test.js` 覆盖路由与生命周期，但**无一条断言「内容形态 × 平台能力」的匹配性** —— 路由表只记录 `mode`，不记录「该 mode 支持哪些形态」 |
| 系统性漏洞定位 | PASS | ROUTE_TABLE 缺一维：**平台 × 模式 × 内容形态**。现有结构无法表达「该平台的 api 轨只吃视频」，于是图文任务会被无差别路由 |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `VIDEO_ONLY_API_PLATFORMS`，在 `resolvePlatformArticle` 做**路由前置 fail-closed**，报错同时含「图文/视频」线索。关键实现细节：`video_path` 不在 `resolved` 顶层（在 `base` 里），判断须从 `base` + `override` 读，与 `buildPublishArticle` 口径一致 —— 首版误读 `resolved.video_path` 导致视频任务被误拦，测试当场抓到 |
| 防止再次发生（QM-5 ⑤） | PASS | `publisher-router-article-mode.test.js`（5 例）钉三条不变量：图文必被拒且报错自解释、带 video_path 的视频不受影响、其余 7 平台图文行为不变（防连带拦截）。TDD 先红（仅第 1 条红，其余 4 条既有行为绿） |
| 既有测试调整 | PASS | 两个**与内容形态无关**的既有用例（Cookie 缺失 auth_missing、取消信号）原本顺手用了 bilibili，补 `video_path` 让其走视频轨、保持原测断言；另一处误加的 `video_path` 已撤回。**不是放宽守卫** |
| 测试 | PASS | `publisher-router.test.js` + `publisher-router-logging.test.js` + 新用例 = **77/77 通过** |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面 |
| 远程同步 | PENDING | 待合并后回填 merge SHA 并销账 |

### 遗留（不假装已闭合）

- **本修复只把失败提前 + 让报错自解释，未提升 B站图文成功率** —— B站本来就没有图文直连通道，图文需求需走 RPA 轨或另找提交通道。这是有意的取舍：省掉一次必然失败的真实请求，并让错误文案指向真正的根因。
- douyin（`publish timeout`）与 tencent_video（`publish verification timeout`）两条失败**未纳入本 PR**，根因独立，需各自专项定位。
- 同类隐患未普查：是否还有其它「平台能力与内容形态不匹配」的路由组合（当前只登记了 bilibili 一个已实证项）。