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
| 测试 | PASS | 新增 17 例全绿（7+6+4）；包内全量 `node scripts/run-tests.js` → **exit=0**，Vitest 34 文件 294 用例全过（首次提交前记录为「2 failed」，根因见下方「CI 回归修复」第 2 条，已修正） |
| CI 回归修复（提交 `a2c4bf12`） | PASS | 首轮 CI 红 5 项（Gate Result / QG Coverage / QG Desktop Shards 1·2 / QG Unit Tests），两处根因：①重写 `adapters/xiaohongshu.js` 时删掉 `uploadVideo`/`uploadCover`，破坏统一入口契约（`adapters-interface.test.js` 逐平台遍历断言对空输入返回 `null`），已加回；②`signer-local.test.js` 5 例红于 `a1 cookie is required (fail-closed)`——**测试仍在断言旧的 md5 占位实现**（断言 `X-s` 长度 32 hex）。查证调用链：生产走 `xiaohongshu.x-s-browser` → `buildXiaohongshuSignHeaders`（带真 cookie），`getXiaohongshuSign` 仅被 registry 键 `xiaohongshu.x-s` 引用且**除测试外无生产调用方** ⇒ fail-closed 是正确行为，**改测试不改实现**。补 3 条用例锁契约：缺 a1 必抛错、不同 a1 签名相异、绝对 URL 路径 |
| 自我纠错（今日第 2 次） | PASS | 首轮把 `run-tests.js` 的 exit=1 归因为「既有问题 `describe is not defined`」，**该结论错误**：`run-tests.js` 跑 vitest 时带 `--globals`（`scripts/run-tests.js:105`），而我手工跑 `vitest run` 漏了该参数 ⇒ `describe` 未注入。改对后该报错消失，并顺带暴露了上面第 ② 条真问题。教训：**「复现不出失败」时先怀疑自己的复现口径，而不是先判定为既有问题** |
| CI 回归修复（第二轮，Desktop Shards 1/2） | PASS | 第二轮 CI 红 `QG Desktop Shards (1/2)`（4 例 / 3 文件），三处根因：①`preload/index.bundle.js` 与 `home-shell-preload.bundle.js` 是**入库构建产物**，加 `accountCredentialNames` 后未重新生成 ⇒ `build-preload.test.js` 报「提交态 bundle 与源码暴露的 API 路径不一致」（缺 `accountCredentialNames`）。已 `pnpm run build:preload` 重建，3/3 转绿。②`preload.test.js` 两处**硬编码方法数**断言（account 49、合并 api 335）因新增 1 个方法而失配 ⇒ 改为 50 / 336，并加 `toContain('accountCredentialNames')` 防止「改了数字但方法没接上」。③`signer-assembly.test.js` 原断言「小红书绝不 verified」被本 PR 的 `localAlgorithm` 形态打破（见下一行）。 |
| 闸门粒度细化（小红书 verified 红线） | PASS | 原断言「小红书绝不置 verified」的**红线意图**是：verified 一旦放行，renderer 经 `signer:invoke` 会让 manager 创建隐藏页并导航未激活平台活页（触达未取证域）。取证：`invokeSign`（`signer-page-manager.js:113`）只做 verified 闸门 + 调 `signFn`，**不创建页面**；页面创建在 `getOrCreatePage`，属 `signFn` 内部路径。而 `signFn`（`signer-assembly.js:276`）在 `localAlgorithm` 模式**直接 return `signXiaohongshuLocal(payload)`**，不调 `assembly.sign`（第 279 行）、不调 `getOrCreatePage` ⇒ 原红线担心的副作用面不存在。故闸门按形态细化：断言从「绝不能 verified」改为「localAlgorithm 必须 verified」，并**新增变异反证用例**锁住真正的不变量「求签必须短路、绝不开窗」——已注入变异把第 276 行改回 `assembly.sign(...)`，该用例如期转红（19 例中仅此 1 例红），还原后 19/19 全绿，实现文件零 diff。 |
| 变异反证有效性 | PASS | 反证用例经实跑验证：改实现 → 转红；还原 → 全绿。若不验这条，「变异反证」只是一句注释，锁不住任何东西 |
| 行尾与 diff 对账 | PASS | CHANGELOG 净 +74/-0，main 侧条目完整保留（65404 行，L1 本次条目 / L75 main M-5 条目）；此前一轮误按首行重建曾把 5 万行压成 27 行，已还原并改为 `edit` 精确插入 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面；改的是签名算法与发布链 |
| 远程同步 | PENDING | 待本 PR 合并后回填 merge SHA 并销账 |

### 方案选型留痕

用户倾向「复用开源签名实现」。读源码后发现 XYW_ 本质是**纯 AES-128-CBC**
（参考实现的 150 行里 `XywCipher` 类是在手写 AES，因为 Python 标准库没有），
Node 内置 `crypto` 一等公民 ⇒ **算法取自开源实现，载体用 JS**：
不开窗、无 IPC 往返、无常驻 Python 进程。签名文件仅 `require("crypto")` 一行依赖。

### 遗留（不假装已闭合）

- **草稿箱真机写入未验证**：本 PR 完成实现 + 契约测试 + 交叉校验；**未在真机跑通草稿写入前，不得宣称「小红书可发」**。AT 凭据诊断接口（`account:credential-names`，只回 cookie 名、绝不回 value）已随本 PR 实现，但**必须合并后才可用于真机取证**。
- 平台改签名算法 / `envFlags` 指纹常量需同步维护（已集中单点）。
- 草稿箱接口无官方公开文档，端点形态依据多个公开实现（`xhs-mcp`、`openclaw-xiaohongshu-skill`、参考产品），真机响应为最终判据。
- 同类隐患未一并治理：`getCsdnSign` / `getKuaishouSign` 也是简化实现（后者为 `md5(apiPh + "|" + JSON)`），缺少正确性判据；本次只修小红书，其余留待专项。