# 发布后回查的运行态装配锁（publish-monitor）— 规格与踩坑记录

- 日期：2026-10-07
- 分支：`publish-monitor-assembly-lock`（worktree `D:/Data/projects/mp-worktrees/mp-publish-monitor-assembly-lock`）
- 类型：🧪 纯测试变更（**零生产代码改动**），补 `apps/desktop/electron/services/publish-monitor.js` 的第一个测试文件
- 关联：`docs/PRD-BILIBILI-PUBLISH-ID-EXTRACT-2026-10-06.md`（#2968）、`docs/audit-requery-evidence-bilibili-2026-10-05.md`（#2927）

## 一、为什么补这一层

`publish-monitor.js` 此前**没有任何测试文件**（`ls apps/desktop/electron/services/publish-monitor*.test.js` 空）。
#2927 与 #2968 把「B 站回查」两端各自建了锁，但都建在**被调模块自己那一侧**：
`bilibili-audit-check.test.js` 直接调用 `checkBilibiliAuditStatus`，`rpa-publish-id-extract.test.js` 直接调用提取器。

于是这一段从未被执行过：**monitor 拿到 postId 时，到底有没有把它和列表端点交给专用实现**。
按 AGENTS.md「注册 ≠ 注入 ≠ 生效」的口径，这是第三种落点——分派点（`publish-monitor.js:119-127`）存在、
两侧单测全绿，但没人从装配入口跑过一次。任何人把 `if (platform === 'bilibili')` 分支改坏
（例如漏传 `listUrl`、或退回通用 `GET ?id=` 猜测），CI 照绿。

## 二、锁的口径（8 条）

| # | 断言 | 为什么必须是这条 |
|---|------|----------------|
| T1 | 真实现跑完 `nav → 列表` 两跳，回调收到 `published` 且带 `raw`；**两跳顺序、Cookie、Referer 现场核对** | 分派 + 判据 + 凭证随请求带走，一条看全 |
| T2 | 改 `CHECK_URLS.bilibili` 后第二跳端点随之改变 | 钉住「pollUrl 是端点唯一来源」，防死参数回潮（#2927 QM-6 前端 Warning 的同一形态） |
| T3 | 命中但 `state` 未观测 ⇒ 不回调终态，耗尽后回调 `timeout` | 「没拿到证据不是反证」；且证明 monitor 不自己猜状态 |
| T4 | `cookies` 为空 ⇒ **零 HTTP**，且不判失效 | 无凭证不发必然失败的请求（#2927 取证结论） |
| T5 | nav 拿不到 `mid` ⇒ 零第二跳 | 不猜列表主体 |
| T6 | 未登记平台（kuaishou 已从表移除）⇒ `skipped` 且零 HTTP | 保住「诚实跳过」而非 12 连 error 污染发布历史 |
| T7 | 通用平台仍是 `GET + params:{id} + Cookie` | 防「专用化」时顺手改掉别人（微博/头条/知乎）的形状 |
| T8 | **请求在途时** `stop()` ⇒ 迟到轮询不得回调 | 见 §四，这条是被变异反证逼出来的 |

## 三、传输层接缝的做法（以及一条会静默骗人的环境事实）

`createMonitorTask` 调 `checkPublishStatus(platform, postId, cookies, pollUrl)` 时**不传 opts**，
所以注入式假 axios 进不了这条链。为了跑真实现，测试只把 `axios.get` 的 **host 换成本机回显 HTTP 服务**
（`127.0.0.1`，AGENTS.md 出站守卫放行 loopback），path/query 原样保留 —— 端点是否真的被用上，
由服务侧记录的路径判定，而不是由断言读源码判定。

**实测踩到的坑（必须记住）**：本套件的 axios 默认走 **XHR 适配器**，而 XHR 按浏览器规则
**静默丢弃手工设置的 `Cookie` 头**，并把 `Referer` 换成页面 origin。
现场：`requests[0] = { url: '/x/web-interface/nav', cookie: '', referer: 'http://localhost:3000/' }`
—— 代码明明传了 `headers: { Cookie: 'SESSDATA=abc', Referer: 'https://member.bilibili.com/…' }`。
后果不是"测试慢"，而是**所有"凭证是否随请求带走"的断言恒假红/恒假绿**：
第一轮 T1/T7 因此判红，容易被误读成"生产代码丢了 Cookie"。
正解：接缝里显式钉 `adapter: 'http'`（node 适配器），并把这条写进注释，防止下一个人换成
`jsdom` 默认跑法时又踩一遍。

## 四、变异反证逼出来的 T8 改写

第一轮 T8 写成「先 `stop()` 再推进时钟」，变异 M4（把 `cancelled = true` 改成 `false`）**没有变红**——
因为 `stop()` 还清了定时器，只改标志在那个场景里等价，测试是 vacuous 的。
改成「**请求在途时** stop()」（服务端对 nav 响应延迟 80ms，用真实 `setTimeout` 句柄，
因为 `vi.useFakeTimers()` 之后服务端里的 `setTimeout` 也是假的，会把延迟变成永不到来 → 又是一条假绿），
M4 才如实变红。这条改写本身就是本文件的立项理由：装配锁要能区分"守卫存在"与"守卫有效"。

五条变异实跑结果（收尾均断言源文件与备份逐字节相同）：

| 变异 | 变红的用例 |
|------|-----------|
| M1 摘掉 `listUrl: pollUrl` 透传 | T2 |
| M2 B 站不再走专用分派（退回通用猜测链） | T1 + T2 + T4 |
| M3 摘掉 checker 的无凭证守卫 | T4 |
| M4 `stop()` 的 `cancelled` 置位改成 no-op | T8 |
| M5 通用链丢掉 `Cookie` 头 | T7 |

## 五、QM-1 / QM-4 / QM-6 的 N/A 依据（写成事实，不写成断言）

- **QM-1 打包 N/A**：`apps/desktop/package.json` 的 `build.files` 显式含 `"!**/*.test.js"` 与
  `"!electron/tests/**"`，即测试文件根本不进 asar；本 PR 零生产代码改动 ⇒ 产物字节不变。
  （判据来源是配置事实 + `git diff --name-only` 只含测试文件，不是"我觉得不用打包"。）
- **QM-4 视觉 N/A**：无 UI/样式文件变更。
- **QM-6 双模型评审 N/A**：触发条件均针对"实现变更"（主进程服务逻辑、IPC、引擎包）。本 PR 只新增测试文件；
  其正确性由 §四 的五条变异反证承担（每条都以"改坏生产代码必须变红"为判据）。
  如实登记：未做外部模型评审，原因是变更面为零生产代码，非疏漏。

## 六、遗留

- `checkPublishStatus` 的通用分支（微博/头条/知乎/小红书）其状态词表仍是**猜测形态**（未逐平台取证），
  本文件只锁住"形状不再被无意改动"，不等于该形状正确；端点与词表取证仍按
  `01-docs/AUDIT-REQUERY-EVIDENCE-CHECKLIST-2026-10-09.md` 的欠账推进。
- B 站端到端仍需一次真实投稿才能观测（见 #2968 PRD §八），未消耗授权。
