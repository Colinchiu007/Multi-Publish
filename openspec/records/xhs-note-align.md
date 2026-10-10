---
record: xhs-note-align
task: note 请求对齐参考产品A形态（去AT头/body重写/privacy_info草稿语义/a1轮换）+ 凭据缺主站web_session根因闭环
date: 2026-10-11
---

## 本次执行记录：小红书 note 请求对齐（xhs-note-align，2026-10-10/11）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码 ⇒ 隔离 worktree `mp-xhs-note-align`（标准入口），裸分支 `xhs-note-align`（基线 `origin/main`=`840ccd370`）|
| 调研 | PASS | ①参考产品A逆向（`packages/main/dist/index.cjs`，publish$k/buildPostData$J/getNewSign 全还原）——远端浏览器签名服务集群 + 主进程直发；②xhshow 系列开源项目（XYS_ 纯算/xyw 绕 406/x-rap-param/SSK 会话）|
| TDD | PASS | `xiaohongshu-note-align.test.js` 6 用例先红后绿（C1 头集合/C2 body 形态/C3 privacy_info/C4 draft 移除）；旧契约 3 用例同步 |
| 修复 | PASS | ①Authorization 头不发送（AT 跨域半认可实证）；②body 重写参考产品A形态（common.images 完整对象/source/business_binds/privacy_info）；③草稿语义=privacy_info.type（平台无 draft 字段）；④a1 轮换跟随；⑤全站会话 cookie 父域注入；⑥主进程直发（页内整发被否——浏览器 fetch 不能显式 Cookie 头）|
| 测试 | PASS | api-publish-engine 全量 run-tests exit=0（vitest 327 含 6 新 + direct 0 失败）；signer 51+21 绿；ESLint 0 |
| 真机验证（三轮迭代） | PASS（部分）| 轮1 旧形态 406 → 轮2 页内签名 code:-1（AT 半认可）→ 轮3 对齐形态 **code:-100「无登录信息」**——格式被平台接受，进入会话鉴权层 |
| 第一性原因（根因最终确认） | PASS | **账号凭据缺主站 web_session**（20-cookie 审计无它；参考产品A走主站登录拿全量 cookie，我们走 creator webview）——登录载体差异，非链路代码问题；修复归属登录流程改造（独立工作项）|
| 品牌残留 | PASS | 竞品名 15 处中性化（PRD/链/测试注释）+ 研究报告引用改名 competitor-research-xhs.md；门禁 PASS 7738 文件 |
| 文档同步 | PASS | PRD 第二轮增补（11 章请求形态契约/12 章三轮证据链/13 章凭据载体根因/14 章开源生态情报）随本 PR 合并；learnings 五条沉淀（#3261）|
| 远程同步 | PASS | #3280 = `ffc6fdff71cdadae097059876b1911e22102cf56`（squash，committer 2026-10-11T03:00:58+08:00）。取证：`git log origin/main --grep='(#3280)$'` 唯一命中；`git ls-remote --heads origin xhs-note-align` 返回 0 行；worktree R1-R5 删除（gone: True，R7 基线 M/D=0）|

### 遗留（不假装已闭合）

- **登录载体改造**：xiaohongshu 账号登录需支持主站会话（登录页导航 www 主站或补抓主站 cookie），完成后 probe 一跑即草稿落箱闭环。
- 候选增强：x-rap-param（发布类风控头）、SSK 会话（x6/x7）。
