---
record: e2e-hot-topics-crash-and-cookie
task: 热门选题 E2E 三连修——wechat_mp/baijiahao 隐藏窗口原生崩溃 + API 直连轨 session 分区 cookie 回退
date: 2026-10-06
sync_status: PASS
---

## 本次执行记录：热门选题 E2E 三连修（e2e-hot-topics-crash-and-cookie，2026-10-06）

| 门禁 | 状态 | 证据 |
|------|------|------|
| 变更类型与隔离 | PASS | 运行时代码变更 ⇒ 隔离 worktree `D:/Data/projects/mp-worktrees/mp-app-live2`，裸分支 `app-live2`；共享主目录保持 main 不动 |
| 第一性原因（QM-5 ①） | PASS | 崩溃点由 `%TEMP%/mp-start-dev.exit.log` 定位（`electron-exit code=3221225477` = 0xC0000005 / `code=4294930435` = 0xFFFF7003），应用日志末行恒为触发点。**不假崩溃**：crashpad 每次 `not connected` 故无 minidump、Windows 事件日志无记录，靠排除法收敛 |
| 逃逸分析（QM-5 ②） | PASS | 机制是 2026-09 头条事故（`RENDER_CRASH_PRONE_PLATFORMS`）未覆盖新平台：白名单只有 `toutiao`，`wechat_mp` 与 `baijiahao` 漏网。既有测试也无「未覆盖平台」的反向约束，新增平台默认落进浏览器降级 |
| 系统性漏洞定位 | PASS | ①`HTTP_CHECK_APIS` 登记表（8 平台）漏 `baijiahao` ⇒ `tryHttpLoginCheck` 恒 null ⇒ 浏览器降级成唯一路径，每次启动必崩；②`ApiPublisher` 的 `loadAuthForTask` 只读加密凭证文件，不回退账号 session 分区，而百家号 cookie 只在分区（`checkLocalCredentials` 日志原文 `fallback from missing encrypted file`）⇒ RPA 轨成功、API 轨 `auth_missing` |
| 修复 + 回归保护（QM-5 ④） | PASS | ①`wechat_mp`+`baijiahao` 纳入 `RENDER_CRASH_PRONE_OPEN_PLATFORMS`（HTTP 无证据判 INCONCLUSIVE，绝不开窗）；②新增 `backfillPartitionCookies` 凭证为空时回退读 `persist:account-<id>` 分区 cookie，两处皆空如实返回空由调用方判 `auth_missing`，绝不臆造凭据；③`loadAuthForTask` 改 async、两处调用点补 `await`。TDD：新用例先 RED（`getContext` 被调用 / 未读分区）后转绿 |
| 防止再次发生（QM-5 ⑤） | PASS | 新增 `account-manager-wechat-render-crash.test.js`（3 例）与 `publisher-router-partition-cookie.test.js`（3 例）钉住两条不变量：命中白名单的平台绝不 `getContext`；凭证为空必读分区。`dev-launcher.js` 增 `MP_E2E_NO_SANDBOX` / `MP_E2E_SOFTWARE_GPU` 诊断旋钮（默认值不变）供受控实验复现 |
| 受控实验（否证留痕） | PASS | 24 次对照逐项证伪：并发 1 vs 3（6/6 全崩）、`--no-sandbox`/swiftshader（6/6 全崩，且抓真实命令行证明开关生效）、一次性 partition / `sandbox:false` / `show:true` / 不真导航（均无法规避；「复用 partition」首轮 2 存活、重跑 2/2 全崩 = 假象）。**并发降级方案因此撤销**，不留错误配置 |
| 测试 | PASS | `electron/publishers` 251/251；`electron/services` 6030 passed / 1 skipped，零失败。修 4 处受行为变更影响的既有断言（均在注释写明原因；两处因 `await` 引入微任务边界改用 `vi.waitFor` 等 publish 真正被调用，不猜微任务次数） |
| 行尾与 diff 对账 | PASS | 改 `publisher-router.js` 时初次误在非 async 函数内用 `await` 致 SyntaxError，模块加载面 3 个测试文件全红；经 `node -e require` 直读定位并修正为 async 函数声明 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触渲染面；改的是登录检测与凭证取数逻辑 |
| 远程同步 | PASS | squash 合并 `9a8332ad49972ada1d9d2b08983293c343067445`（2026-10-06T11:15:30Z，PR #2984）；CI 20/20 全绿（Gate Result / QG Coverage 28m54s / QG Desktop Shards 1·2 各 20m32s·16m49s / QG Browser E2E 5m17s / QG Visual 2m42s / QG Static 3m1s / QG Unit Tests / QG Autonomous / QG Business API Postgres / QG Changes / build / electron-tests / gui-test / 依赖漏洞审计 / 债务熔断 / 文档同步 / 单元测试+Lint；release 为 skipping）；`git ls-remote --heads origin app-live2` 返回 0 行，远端分支已删 |

### E2E 实证（非单测替代）

- 应用存活 165s+（修复前 8–22s 必崩）
- 真实成片：H.264 1920×1080@30fps / 139.7s / 47.8MB，3 条选题改写分别 755/1033/733 字
- 7 平台发布 **3 成功**：B站 `BV187pF63EtD`、微信 `appmsgid=100000014`、抖音内容管理页

### 遗留（不假装已闭合）

- **`accounts:list` 第二条崩溃路径**：5 测 2 崩，签名与已修的隐藏窗口路径无关（死在 `checkLocalCredentials` 读分区 Cookie 后约 0.86s）。crashpad 不产 dump，只能继续排除法。
- **另 2 条选题 failed**：`agnes-image` 返回「组织内的服务器暂时不可用」，外部服务抖动，重试即可，非代码缺陷。
- **小红书**：应用无小红书账号、项目无小红书发布链（`publish/platforms/` 仅 6 条链）。逆向资料显示参考产品用枚举名 `XiaoHongShu`（非中文，此前中文搜索零命中是搜索词问题），已定位到枚举定义待挖其发布链与签名服务。
- **发布失败 4 平台**：腾讯视频 `publish verification timeout`、头条 `publish btn not found url=`（URL 为空）、快手 `missing kuaishou.web.cp.api_ph in cookie`。均待逐个核实。
