---
record: xhs-note-e2e
task: note 步页内整发（pageInpage）+ 真机取证（端点域不匹配根因）+ learnings 五条沉淀
date: 2026-10-10
---

## 本次执行记录：小红书 note 页内整发（xhs-note-e2e，2026-10-10）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码 ⇒ 隔离 worktree `mp-xhs-note-e2e`（标准入口 start-mp-task），裸分支 `xhs-note-e2e`（基线 `origin/main`=`840ccd370`）|
| TDD | PASS | `xiaohongshu-note-inpage.test.js` 6 用例先红后绿（桥路径/签名透传/401 fail-closed/业务错误/零回归/noteOrigin 页内生效）|
| 修复 | PASS | ①`submitNote` 新增 `pageInpage.sendNote` 桥（页内 fetch credentials:"include"，错误语义与 http 路径一致）；②probe `bindSignerCookie` 注入 + `provider.__getAssemblyForProbe` 构造 sendNote 桥（准备失败降级 http 只进日志）；③note-inpage 接入 VITEST_FILES 白名单 |
| 测试 | PASS | api-publish-engine 全量 run-tests exit=0（vitest 318 含 6 新 + direct 组 0 失败）；apps/desktop signer 全量 51/51 + ESLint 0；shared-utils scheduler 49 passed |
| 真机验证 | PASS（部分）| probe 全链到达**业务层**：note 响应 `{code:-1, success}`（此前 406/401 为网关/认证层拒绝）⇒ 页内整发机制生效、登录态注入生效 |
| 第一性原因（遗留根因） | PASS | 页内取证：creator 域登录态完整（AT/galaxy session 在）；页内无 AT 重放 note → 401（edith 不吃 creator 会话）；probe（+AT 头）→ code:-1（AT 跨域半认可）⇒ **端点域不匹配**：真实草稿保存接口需抓页面交互流量定位（凭记忆猜端点两次落空）|
| 文档同步 | PASS | `01-docs/PRD-XHS-DRAFT-PUBLISH-2026-10-07.md` 增补 8/9/10 章（签名代差事实链 6 条/pageInpage 数据校验+流程+功能逻辑+交互回传面+显示项与提示文字+安全边界/真机现状与下一刀）；`01-docs/learnings.md` 沉淀五条踩坑（#3261）|
| QM-6 CCG 评审 | PASS | pre-commit 判定器覆盖（判定落盘 .ccg/reviews/）|
| 远程同步 | PASS | #3257 = `15535d56c1f62a030287c232d1069d447b67dec3`（14:27:22）、#3261 = `0c5d70ed6deeb0ca8d20069e8b60aa77a45207f9`（14:27:26），均为 squash；`git ls-remote --heads origin xhs-note-e2e docs-learnings-xys` 返回 0 行；worktree R1-R5 删除（worktree gone: True，R7 基线 M/D=0）|

### 遗留（不假装已闭合）

- **note 端点域不匹配**：真实草稿保存端点需抓「登录后手动存草稿」的页面交互流量（CDP 拦截）定位。页内整发机制、cookie 注入、签名通道已全部就绪，端点定位后替换 NOTE_PATH 即闭环。
- X-S-Common 页内生成入口未逆向（anti_hp_sign_config 混淆）——页内整发方案已绕开该需求。
