---
record: fix-xhs-draft-false-success
task: 小红书草稿假成功修复——内容未写入却报 success:true
date: 2026-10-07
sync_status: PENDING
sync_reason: "本 PR 尚未合并，无法取证 merge SHA；合并后由回填 PR 同一次提交写入并删除本字段与 sync_backfill_owner。"
sync_backfill_owner: "backfill-xhs-draft-false-success"
---

## 本次执行记录：小红书草稿假成功修复（fix-xhs-draft-false-success，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码变更 ⇒ 隔离 worktree `D:/Data/projects/mp-worktrees/mp-draft-truth`，裸分支 `fix-xhs-draft-false-success` |
| 第一性原因（QM-5 ①） | PASS | 真机 E2E 实证：`publishBatch([{platform:'xiaohongshu'}])` 返回 `code:0`、history 记 `status:success`、`rpa-publish-ok mode:dom`，但应用活日志显示标题/正文/标签三项全是WARN（`title field not found` / `content editor not found among 3 candidates` / `tag input not found`）——**页面什么都没写进去**。根因二处：①`rpa-view-platforms.js` draftOnly 分支末尾**无条件** `return {success:true}`；②`draftSaved` 判定正则为 `/编辑于\|已保存\|草稿/`，其中裸「草稿」二字在小红书创作者页是侧边栏「草稿箱」常驻文案 ⇒ 恒真，等于没有判据 |
| 逃逸分析（QM-5 ②） | PASS | 该函数**无任何测试**（`grep draftOnly\|draftSaved\|draft-only --glob '*.test.js'` 零命中）。既有测试只覆盖 publish_btn 路径，草稿分支从未被断言过。假成功能通过是因为没有任何东西检查它 |
| 系统性漏洞定位 | PASS | 「草稿/保存」类判据缺少**否定样本**：判定条件用的是页面常驻文案的子集，任何一个宽泛词都能让它恒真。同一模式今天已出现三次（视频号假失败、抖音假失败、小红书假成功）⇒ 系统性问题是**成功判据普遍偏宽**，不是单点疏漏 |
| 修复 | PASS | ①新增 `fillReport`（标题/正文/标签各自 `{ok, error}`），三处填写点分别记录成功/失败（含重试耗尽与选择器未匹配两种形态）；②draftOnly 分支先判「内容真的写进去了吗」：文章带了标题就必须写进去、带了正文就必须写进去，任一失败即 `success:false` + `errorCode:'PUBLISH_DRAFT_CONTENT_NOT_FILLED'`，**不得退化成只改错误文案**；③标签是增强项，失配只 warn 不阻断；④`draftSaved` 正则收紧为`/编辑于\s*\S{1,12}\|已保存\|保存成功\|自动保存/`，去掉裸「草稿」分支，并把 `fillReport` 一并回传供排查 |
| TDD | PASS | 7 例先写。**首轮 7/7 全红，但全部是在抵达被测逻辑前就 TypeError**（`_dismissPostNavDialogs` 未桩，该调用位于 draftOnly 分支之前）——零证据，不可据此判断修复对否 |
| 测试自身三轮修正（重要教训） | PASS | 三轮红项**全部是测试侧**问题，生产修复始终有效：①补 `_dismissPostNavDialogs` 桩（生产在 draftOnly 分支前调用它）；②「只有标签失配」用例的桩按字符串比较 `sels === '#tag-never'`，但源码 `:382` 传的是**数组** `['#tag-never']` ⇒ 恒假，导致正文也resolve 不到，测的语义错了；③「draftSaved 正则」用例读源码文本比对，而该段是 JS 字符串字面量（源码里是**双反斜杠** `\\s*\\S{1,12}`），测试正则写 `/编辑于\\s\*\\S/` 只匹配单反斜杠，差一层转义；另 `new URL(..., import.meta.url)` 在 vitest4+jsdom 下非 `file:` scheme 被 fs 拒收，改用 `path.resolve(process.cwd(), ...)` |
| 变异反证 | PASS | 注入 `if (hardFailures.length > 0 && false)` ⇒ **恰好 3 例转红**（标题失配 / 正文未找到 / 填入抛错，三条都落在 `expect(res.success).toBe(false)`），其余 4 例仍绿；还原后 **7/7 全绿**，核验 `mutation_present=false`、`hardFailures_guard=true` |
| 覆盖边界 | PASS | 7 例同时钉住正反两面：内容未写入必须失败（1/2/3）、内容写入必须放行（4）、标签失配降级不阻断（5）、文章本就无正文时不误判（6）、落库正则不含裸「草稿」（7）。**第 4 例尤其重要**——只写「必须失败」的闸门会把真成功也打成失败 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面；改的是 RPA 填词后的成功判定 |
| 远程同步 | PENDING | 待本 PR 合并后回填 merge SHA 并销账 |

### 本次只解决假成功，不解决「API链从未执行」

真机同时暴露 `publisher-router.js:44` 把 `xiaohongshu` 硬编码为 `{mode:'rpa_vm'}`，而 `ApiPublisher` 仅在 `mode==='api'` 时实例化 ⇒ PR #3009 实现的 permit → ros-upload → note 三步链，**桌面发布路径根本走不到**。

这是产品决策（要不要把小红书切到 API 链），不属本次范围。已如实记录，不假装已解决。

### 遗留（不假装已闭合）

- **DOM 路径的选择器本身失效**：标题/正文/标签三组选择器在真机上全部匹配不到。本次修的是「没写进去却报成功」，**没有**让小红书图文真的能写进草稿箱 —— 修好后同一条发布任务应当如实报失败，而不是继续假成功。
- `draftSaved=false` 仍返回 `success:true`（内容已写入但未观测到保存信号属「不确定」）。这是有意取舍：把不确定如实标记为 `draftSaved=false` 回传，而非直接判失败。若下游需要据此区分，应在 `publisher-router` 的返回映射里把该字段透出（当前会被丢弃）。
- 「成功判据偏宽」是系统性问题，今天已在三个平台各暴露一次（视频号、抖音、小红书）。本次只修了小红书这一处，其余平台的选择器/判据需专项复查。