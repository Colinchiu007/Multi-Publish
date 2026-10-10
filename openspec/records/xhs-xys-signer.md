---
record: xhs-xys-signer
task: XYS_ 签名页页内求签（note 406 根因修复）+ CCG 第二步编码修复 3 文件
date: 2026-10-10
---

## 本次执行记录：小红书 XYS_ 签名页升级（xhs-xys-signer，2026-10-10）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（apps/desktop/electron/signer + ipc-handlers）⇒ 隔离 worktree `mp-xhs-xys-signer`（标准入口 start-mp-task 创建），裸分支 `xhs-xys-signer`（基线 `origin/main`=`8b3d3e91f`）|
| 第一性原因 | PASS | 真机 CDP 抓 28 条请求实证：note 端点要求 **XYS_ 代签名**（Base64 JSON 信封，页内 `window._webmsxyw` 生成），本地 signer-local 的 XYW_ AES 短签名被 406 拒——`signer-local.js`「XYS_ 已被拒」记载过时（当时验证面是轻接口）|
| 修复 | PASS | ①新 `xhs-extractor.js`：页内调 `_webmsxyw`，结构化 `{ok, signature, xT}`，全部失败路径 fail-closed 返回 reason；②BRIDGE_COMMANDS xiaohongshu 形态 localAlgorithm→**browser**，assembly.sign 按平台分派 extractor；③xiaohongshu browser 置 verified（extractor 契约有单测，降级自愈由 failCount→degraded 兜底）；④probe 签名器切 browserPageProvider 桥（accountId 隔离页），装配未接线时 fail-closed 回 stage=signer-bridge |
| TDD | PASS | `signer-xhs-extractor.test.js` 7 用例先红后绿（no-webms-fn/透传/大小写变体/x-s-missing/threw/bad-shape/无 kuaishou 残留）；signer-xhs-local.test.js 重写为形态切换锁 |
| 测试 | PASS | apps/desktop signer 全量 **51/51** 绿 + ESLint 0；packages/api-publish-engine 全量 run-tests exit=0（vitest 312 + direct 组 0 失败）；shared-utils scheduler 49 passed（注释修复后）|
| 真机验证（证据链） | PASS（部分）| 签名页加载→`_webmsxyw` 存在（CDP 直证）→页内签名 664 字符信封（signSvn=56/signType=x2）→extractor 全链路签名取回成功（406 变 401「无登录信息」）⇒ **签名关已过**；页内裸 fetch 同 URL 401 佐证头已可接受 |
| CCG 第二步（附带） | PASS | 编码修复 3 文件：ARCH-OPS L162（下???同步复活→下次同步复活）、creator-monitor spec L36（可??性/验?→可控性/验证）、scheduler.test.js L636（永久留???→永久留存，#2985 引入）；基线检查 OK 无新增损坏；2 个归档分析稿保持原样（不可无损恢复）|
| QM-6 CCG 双模型评审 | PASS | pre-commit 判定器全程覆盖（判定落盘 .ccg/reviews/），提交均 ≤200 行无敏感命中 |
| 远程同步 | PASS | 已合并 #3215 = `6d1a503a3803ecdaa1c12b3abbd2fd0186bd1358`（squash，committer 2026-10-10T11:38:01+08:00）。取证：`git log origin/main --grep='(#3215)$'` 唯一命中；`git ls-remote --heads origin xhs-xys-signer` 返回 0 行；worktree 按 R1-R5 删除（worktree gone: True，R7 基线不变）|

### 遗留（不假装已闭合）

- **note 全链闭环差最后一步：登录态注入签名页**。签名关已过（页内签名+头可接受，401 证明），剩余是把账号 cookie 经 bindSignerCookie 注入签名页后页内整发请求（X-S-Common 页内生成，本地短模板混用仍 406）。方案已定（probe note 步页内整发），属下一刀。
- X-S-Common 页内生成入口未逆向（anti_hp_sign_config 混淆），页内整发方案绕开该需求。
- 2 个归档分析稿 FFFD 保持原样（分析-claude.md×2、analysis-opencode.md×1，登记在案不判红）。
