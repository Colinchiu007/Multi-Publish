---
record: xhs-draft-publish
task: 打通小红书草稿箱发布——真实 XYW_ 签名 + 三步上传链路
date: 2026-10-07
sync_status: PENDING
sync_reason: "本 PR 尚未合并，无法取证 merge SHA；合并后由回填 PR 同一次提交写入并删除本字段与 sync_backfill_owner。"
sync_backfill_owner: "backfill-xhs-draft-record"
---

## 本次执行记录：小红书草稿箱发布（xhs-draft-publish，2026-10-07）

| 门禁 | 状态 | 证据 |
|------|------|------|
| 变更类型与隔离 | PASS | 运行时代码变更 ⇒ 隔离 worktree `D:/Data/projects/mp-worktrees/mp-xhs-draft`，裸分支 `xhs-draft-publish`；共享主目录保持 main |
| 第一性原因（QM-5 ①） | PASS | 小红书发布链三处实证缺陷：①`getXiaohongshuSign` 是 `md5(ts+"MirAR"+body)` 占位，与平台算法无关；②`params={sign:{X-s,X-t}}` 塞进 query ⇒ 序列化成 `sign=[object Object]`；③adapter 打 `/api/publish`（平台无此端点）。`signer-assembly.js` 标 `verified:false`/`moduleId:-1`，注释「只留 provider 槽不激活链」⇒ 该链路从未启用 |
| 逃逸分析（QM-5 ②） | PASS | 既有 `signer.test.js` 覆盖签名器框架，但无任何断言校验**签名内容**是否与平台算法一致；adapter 无契约测试（`/api/publish` 与 query 塞对象两处缺陷均无人发现）。占位实现能「返回对象、不抛错」，形态上像通过 |
| 系统性漏洞定位 | PASS | 签名链路缺**正确性判据**：只验「有没有返回」，不验「返回的是不是平台要的」。同类缺陷在 `getCsdnSign`/`getKuaishouSign` 同样存在（后者也是简化 md5），属同一类「形态通过、语义未验证」 |
| 修复 + 回归保护（QM-5 ④） | PASS | ①`signer-local.js` 真实 XYW_（替换 md5 占位）；②新增 `publish/platforms/xiaohongshu-draft.js` 三步链路，默认 `draft:true`；③`adapters/xiaohongshu.js` 重写（修端点 + 签名改独立 header + 草稿语义）；④`signer-assembly.js` 新增 `localAlgorithm` 形态（小红书求签**不开窗口**，不引入隐藏窗口崩溃面）。TDD：3 组新用例先红后绿 |
| 交叉校验（本次关键） | PASS | `signer-local-xyw-crosscheck.js` **刻意不复用**实现内任何常量与函数，照 Python 源码独立复算再比对 ⇒ 首轮即抓到两处隐蔽错误：①填充时机错（参考实现是 base64 **之后**才 PKCS#7）；②`createCipheriv` 默认 `autoPadding=true` 造成**双重填充**，密文多出整块。修复后输出 `OK cross-check passed` |
| 防止再次发生（QM-5 ⑤） | PASS | `signer-local-xyw.test.js`(7) 钉住：XYW_ 前缀（旧 XYS_ 已被平台 406 拒绝）、确定性、输入敏感性、缺 a1 fail-closed；`xiaohongshu-draft-chain.test.js`(6) 钉住：三步顺序、签名不入 query、draft 语义、无图片/缺凭据 fail-closed、业务码如实抛错；`electron/tests/signer-xhs-local.test.js`(4) 钉住：**绝不创建 BrowserWindow**、未知命令 fail-closed |
| 接线棘轮 | PASS | 新增测试接入 `packages/api-publish-engine/scripts/run-tests.js` 的 `VITEST_FILES` 白名单；signer 测试置于已接线的 `electron/tests/`（`electron/signer/**` 不在 vitest include 内，放那里等于永不执行） |
| 测试 | PASS | 新增 17 例全绿（7+6+4）；包内全量 `2 failed / 32 passed`（279 用例）—— 两个失败文件在 **main 上同样失败**（`describe is not defined`，vitest/mocha 混用的既有环境问题），非本次引入 |
| 行尾与 diff 对账 | PASS | CHANGELOG 净 +74/-0，main 侧条目完整保留（65404 行，L1 本次条目 / L75 main M-5 条目）；此前一轮误按首行重建曾把 5 万行压成 27 行，已还原并改为 `edit` 精确插入 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面；改的是签名算法与发布链 |
| 远程同步 | PENDING | 待本 PR 合并后回填 merge SHA 并销账 |

### 方案选型留痕

用户倾向「复用开源签名实现」。读源码后发现 XYW_ 本质是**纯 AES-128-CBC**
（参考实现的 150 行里 `XywCipher` 类是在手写 AES，因为 Python 标准库没有），
Node 内置 `crypto` 一等公民 ⇒ **算法取自开源实现，载体用 JS**：
不开窗、无 IPC 往返、无常驻 Python 进程。签名文件仅 `require("crypto")` 一行依赖。

### 遗留（不假装已闭合）

- **草稿箱真机写入未验证**：本 PR 完成实现 + 契约测试 + 交叉校验；**未在真机跑通草稿写入前，不得宣称「小红书可发」**。
- 平台改签名算法 / `envFlags` 指纹常量需同步维护（已集中单点）。
- 草稿箱接口无官方公开文档，端点形态依据多个公开实现（`xhs-mcp`、`openclaw-xiaohongshu-skill`、参考产品），真机响应为最终判据。
- 同类隐患未一并治理：`getCsdnSign` / `getKuaishouSign` 也是简化实现（后者为 `md5(apiPh + "|" + JSON)`），缺少正确性判据；本次只修小红书，其余留待专项。