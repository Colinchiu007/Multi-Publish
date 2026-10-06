---
record: fix-tencent-video-verify
task: 视频号发布成功却判 verification timeout（假失败）——补齐成功文案形态
date: 2026-10-07
sync_status: PENDING
sync_reason: "本 PR 尚未合并，无法取证 merge SHA；合并后由回填 PR 同一次提交写入并删除本字段与 sync_backfill_owner。"
sync_backfill_owner: "backfill-tencent-video-record"
---

## 本次执行记录：视频号假失败（fix-tencent-video-verify，2026-10-07）

| 门禁 | 状态 | 证据 |
|------|------|------|
| 变更类型与隔离 | PASS | 运行时代码 ⇒ 隔离 worktree `D:/Data/projects/mp-worktrees/mp-tv-fix`，裸分支 `fix-tencent-video-verify` |
| 第一性原因（QM-5 ①） | PASS | E2E 日志原文：`RpaView [tencent_video] publish verification timeout endpoint=... responses=1`。**同一份诊断快照里页面文本写着「视频57 注册51」「视频ID: sphOuKJ6GWCmZLB」「发布并登记完成」** —— 即发布其实成功了。通用 DOM 成功判定正则只列了「发布成功\|投稿成功\|发布完成\|提交成功\|作品已发布\|已发布」，视频号用的是「**发布并登记完成**」，匹配不上 ⇒ 一路落到超时分支 ⇒ **把成功上报成失败** |
| 逃逸分析（QM-5 ②） | PASS | `rpa-view-platforms.test.js` 等 RPA 测试覆盖了发布流程，但**没有任何用例拿视频号的真实成功文案去喂判定正则** —— 正则新增词形不会被发现缺失 |
| 系统性漏洞定位 | PASS | 成功判定靠**手工枚举文案形态**的硬编码正则，缺「新增平台文案」的机制化校验；平台改文案即静默退化为假失败 |
| 修复 + 回归保护（QM-5 ④） | PASS | 正则补 `发布并登记完成\|提交并登记完成\|登记完成`。**只加词不放宽**：failure 仍优先短路，且未引入「已完成/登记信息」等可能出现在未发布页面的宽泛词（假成功比假失败更危险） |
| 防止再次发生（QM-5 ⑤） | PASS | `tencent-video-verify-success.test.js`（5 例）。关键设计：**从生产源码抽正则**而非在测试里重写一份 —— 后者会在「测试自己写对了、实现没改」时全绿而生产仍坏（同源于 learnings 记录的「单测漏掉与真实实现的连通性」）。用例用 E2E 真实快照文本，并反向钉住「宽泛词不得命中」「failure 优先短路」「视频ID 单独不构成成功证据」 |
| 变异反证 | PASS | 从生产源码删掉三个新词形 ⇒ 用例当场红；还原后 5/5 绿 |
| 测试 | PASS | RPA 相关 5 个文件合计 **94/94 通过** |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面 |
| 远程同步 | PENDING | 待合并后回填 merge SHA 并销账 |

### 一处测试自身被纠正的记录

初版断言把 `视频ID: sphOuKJ6GWCmZLB` 列为「应单独命中成功」——**这是错的**：该字段是成功页的伴随标记，编辑态页面也可能残留，单独命中会造成假成功。已改为「与成功文案同现才判成功」。测试自己写错时同样要拦。

### 遗留（不假装已闭合）

- **修复未经真机复跑验证**：判定逻辑已改且回归保护齐备，但「视频号发布现在会被判成功」这一结论需下一轮 E2E 实证。
- **同类隐患未普查**：其它平台的成功文案形态是否也有未覆盖项，本次未逐一核对。
- **douyin `publish timeout`**：根因独立（疑似提交后未等到任何信号），未纳入本 PR。