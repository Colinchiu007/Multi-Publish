# INVESTIGATE: 公众号登录页二维码「刷很久才显示」—— 排除项定案 + 出码计时插桩

> 日期: 2026-09-25 | 分支: `auth-qr-instrument` | 基点: origin/main `4f2cf3cf`→`4fbc1835`
> 性质: **诊断插桩**，行为零变更、零新增用户可见文案（locales zh/en 无变化）
> 同日相关链: BUGFIX-LOGIN-QR-STALE-COOKIE-2026-09-16.md（#1888）→ FEATURE-LOGIN-NETWORK-DIAG-2026-09-16.md（#1887）→ 本篇

---

## 1. 症状与入口

账号管理 → 「添加账号」选微信公众号 → 内嵌全屏登录标签加载 `https://mp.weixin.qq.com/` →
**二维码区域反复刷新，很久之后才显示出来**（不是「加载失败」，最终能出现）。

入口确认为 `mode='browser'` 的 `auth:open-login`，即 **AuthViewManager.openLogin** 路径。
这一条与 #1888 修的「打开登录页 / 批量登录」（`persist:account-*`）**不是同一条链路**。

## 2. 调用链（带行号）

```
Accounts.vue:796  addAccountForPlatform → selectedLoginMode='browser'
Accounts.vue:771  waitForAuthorizationGuide()（首次未确认时是硬阻断）
Accounts.vue:774  accountActions.openLogin → publisher.js:109 → preload/account.js:44
ipc-handlers/account.js:367  authViewManager.openLogin(platform)
auth-view-manager.js:248  accountId = `auth-${platform}-${Date.now()}`   ← 每次点击全新分区
auth-view-session.js:17   persist:auth-${accountId}（cache:true）
auth-view-session.js:186  createAuthView —— 未设 backgroundThrottling:false
auth-view-manager.js      loadURL(PLATFORM_LOGIN_URLS['wechat_mp'])
```

## 3. 已用实测排除的假设

| 假设 | 实测证据 | 结论 |
|---|---|---|
| **本机代理（Clash Verge 127.0.0.1:7897）拖慢微信链路** | CN 站点出口 IP 直连与走代理**完全相同**（111.167.202.75 天津联通）→ CN 规则命中 DIRECT；`tun.enable: false`，fake-ip 不在路径上 | ❌ 排除 |
| **代理隧道掐断二维码长轮询** | `l/qrconnect` hold 时长：走代理 **15.183s** vs 直连 **15.180s**，均返回 `wx_errcode=408`（微信「继续等」信令，本就 15s 一轮） | ❌ 排除 |
| **`res.wx.qq.com` 静态资源被代理拖慢** | 真实 200 资源：代理 33–100ms vs 直连 43–106ms。曾观测到 8–9s，A/B 复核确认只发生在 **404 路径**且直连同样 1–8s → 微信 CDN 对 miss 自身限速 | ❌ 排除 |
| **浏览器层差异（app 比 Chrome 慢）** | Edge headless 系统代理 vs 强制直连渲染登录页，**DOM 字节完全一致**（均 41788B） | ❌ 排除 |
| **#1888 旧身份 Cookie 导致 getqrcode 空体** | 本入口分区名带 `Date.now()`，每次点击都是**全新空分区**，结构上不可能携带 `wxuin` | ❌ 排除（且 #1888 的 cleanSession 本就未覆盖此路径） |
| **`networkidle` 30s 卡顿**（account-manager.js:115） | 该 Playwright 路径只被 `FirstRun.vue:216` 的 `account:add` 调用，账号管理页不走 | ❌ 排除 |

## 4. 剩余两个 app 侧嫌疑（本次插桩即为判定它们）

1. **一次性冷分区**：`auth-view-manager.js:248` 每次点击新建 `persist:auth-auth-<platform>-<ts>`，
   零 HTTP 缓存 / 零 TLS 会话复用，且全仓无 `persist:auth-*` 清理逻辑（仅
   `identity-auth-window.js:263` 清自己的），分区目录永久堆积。
2. **后台节流**：`createAuthView`（`auth-view-session.js:186`）未设 `backgroundThrottling:false`，
   而 `tab-lifecycle.js:107`、`rpa-view-session.js:30`、`playwright-manager.js:125` 三处都显式关了。
   若出码窗口落在视图 hidden 时段，iframe 定时器与重绘被节流。

## 5. 插桩内容与日志读法

### 5.1 补齐 #1887 §7 遗留项：auth 分区挂诊断

`auth-view-manager.openLogin` 在 `createSession` 之后、`loadURL` 之前挂
`attachLoginNetworkDiagnostics(authSession, { platform, accountId })`。
此前 `attachLoginNetworkDiagnostics` 全仓只有 `tab-lifecycle.js:43` 一个调用点，
只覆盖 `persist:account-*`，因此「添加账号」路径是**日志黑洞**。
挂接为旁路：try/catch 包裹，失败只 warn，不得成为新故障点。

### 5.2 出码计时（新增，`login-network-diagnostics.js`）

只跟踪 `getqrcode`（二维码字节本体的获取端点），**刻意不含 `l/qrconnect`**
——那是 15s 一轮的长轮询，计入会无限刷屏并掩盖「首码到底几秒到达」这个问题。

```
[LoginNetDiag] [wechat_mp/auth-wechat_mp-<ts>] qr response #1 after 8420ms status=200 contentLength=0
[LoginNetDiag] [wechat_mp/auth-wechat_mp-<ts>] qr response #2 after 11033ms status=200 contentLength=7632
```

- `after Nms`：相对**挂接点**（≈ loadURL 前一刻）的耗时
- `contentLength=0` + `status=200`：即 #1888 记录的微信**静默拒绝**特征
- `#n` 递增：反复刷新的次数本身就是症状
- 上限 6 条（`QR_IMAGE_LOG_LIMIT`），防长时间停留刷屏

### 5.3 首屏与可见性（`auth-view-manager.js`）

```
[AuthView] login page finished after 3120ms platform=wechat_mp visibility=visible
[AuthView] login view setVisible=false platform=wechat_mp visibility=hidden
```

### 5.4 判定规则（复现后按日志读）

| 观察 | 结论 | 对应修法 |
|---|---|---|
| `login page finished` 很快（<1.5s）但 `qr response #1` 在 8s+ | 首屏不慢，**出码迟到** | 查 `#n` 与 `contentLength`；=0 则属服务端拒绝方向 |
| `qr response #1 after` 小但 `contentLength=0`，之后多次 #n 才出真码 | 身份/会话被服务端静默拒绝（#1888 同族） | 登录视图也走干净会话/清 Cookie |
| 出码窗口内出现 `setVisible=false visibility=hidden` | **后台节流**成立 | `createAuthView` 补 `backgroundThrottling:false` |
| 第二次点击（本应仍冷）与首次耗时一致，且 `login page finished` 就慢 | 冷分区成本成立 | 分区改稳定复用名 + 生命周期清理 |

复现取证命令：

```bash
grep -E "LoginNetDiag|login page finished|login view setVisible" \
  "$LOCALAPPDATA/Temp/multi-publish-logs/app-$(date +%F).log"
```

## 6. QM-5 五步

| 步骤 | 内容 |
|---|---|
| ① 根因溯源 | 追溯到 `d28cabaa`(#1887) 引入诊断时把 auth 分区挂接列为「未来扩展」未做；`645b8668` 把认证视图改内嵌时未沿用 tab-lifecycle 的 `backgroundThrottling:false` |
| ② 逃逸链 | **单元测试**：无「auth 分区是否挂上诊断」的断言，`auth-view-manager.test.js` 从未断言可观测性 → 缺口不可见；**集成/E2E**：登录页二维码是第三方 iframe，无任何用例；**视觉回归**：只比对外层 DOM，二维码 iframe 迟到表现为「空白区域」，基线对比不判失败；**代码审查**：QM-2 清单无「登录视图分区可观测性/节流口径」条目 |
| ③ 系统性漏洞 | 类型=**流程缺失 + 测试场景缺失**。新链路（`persist:auth-*`）接入时，既有观测机制默认「沿用」，实际从未验证；三处 `backgroundThrottling:false` 与一处缺失并存，说明该口径无单一来源 |
| ④ 回归保护 | `auth-view-manager.test.js` 新增 4 例（诊断挂接+filter 精确断言、首屏耗时+可见性、可见性切换、挂接失败不阻断）；`login-network-diagnostics.test.js` 新增 5 例（出码计时格式、200 空体特征、无响应头边界、6 条上限与序号序列、长轮询不刷屏）。均走真实诊断模块，仅 electron 被桩替 |
| ⑤ 预防措施 | 见 §8 |

## 7. 测试桩变更（需注意）

`test-setup.js` 的 `session.fromPartition` 原为**恒返回同一个 `defaultSession`**。
诊断模块的幂等标记写在 session 实例上（`ses.__loginNetDiagAttached`），
共享单例会让「监听注册恰好一次」的断言依赖用例顺序 —— 属假红/假绿温床。
改为每次返回新 session 对象（贴近真实 Electron：分区即独立 session），
并补 `webRequest`/`resolveProxy` spy 容器与 `getVisibilityState`。
经确认仓库内 0 个测试引用 `defaultSession`，该改动无既有依赖。

## 8. 预防措施落地

- [ ] `AGENTS.md` QM-2 增条目：**新增登录承载方式必须同步挂 `attachLoginNetworkDiagnostics`，
      并显式声明 `backgroundThrottling` 取值**（口径要求见 §4.2）
- [ ] `01-docs/learnings.md` 记录 pitfall：诊断类旁路机制被标注为「未来扩展」时，
      必须在同一 PR 覆盖全部承载路径，否则新路径长期是日志黑洞
- [ ] 全量单测纳入 CI（既有 vitest 流水线自动覆盖新增用例）

## 9. 未覆盖 / 边界

- 本机无已登录 profile，无法在此复现「真实出码」，本文判定规则待应用侧复现后回填。
- `waitForAuthorizationGuide`（`Accounts.vue:771`）在首次未确认授权指引时会**硬阻断**登录视图创建，
  用户感知也可能是「很久才出来」——属另一条独立成因，本次未插桩。
- `qrcode-login.js`（对话框「扫码」模式）未改动：本次入口不涉及，避免扩大爆炸半径。
  该路径另有 `did-finish-load` 后才开始检测 + 2s 轮询无首扫的结构性延迟。

---

## 10. 真机首次取证结果（2026-09-26，插桩上线后）

插桩随 `#2394`（squash `48ffcafc`）进 main 后，`mp-app-live` 实例（11:52 启动）产出第一条真实数据：

| 时间 (UTC) | 事件 |
|---|---|
| 03:53:52.620 | `auth:open-login enter platform=wechat_mp` |
| 03:53:52.634 | `LoginNetDiag ... proxy for open.weixin.qq.com → PROXY 127.0.0.1:7897` |
| 03:53:53.280 | `AuthView login page finished after 656ms` |
| 03:53:53.694 | `LoginNetDiag ... qr response #1 after 1072ms status=200` |

**结论一：本次不慢。** 首屏 656ms、二维码字节 1072ms 到达 → §4 的两个 app 侧嫌疑（冷分区、后台节流）在该次复现中都不成立；按 §5.4 判定表属于「首屏与出码都快」一档。

**结论二：修正 §3 的代理表述。** 应用内 auth 分区解析出的代理是 `PROXY 127.0.0.1:7897`，即 **Clash Verge 确实在路径上**；此前"CN 出口 IP 与直连相同"证明的是它对 CN 域名**直通**，不等于"不在路径上"。定性不变（未增加可测延迟），措辞以本节为准。

**结论三：「刷了很久」的观感来源另有其项。** 该次登录窗口内每约 5 秒重复一轮失败请求，全部是微信登录页**自身探测本机微信 PC 客户端**：

```
https://localhost.weixin.qq.com:13013|13014|13015|14013|14014|14015/api/check-login
https://support.weixin.qq.com/cgi-bin/mmsupportmesh
https://mp.weixin.qq.com/mp/fereport?action=csp_report
```

6 个端口逐个试、失败即重来，页面在此期间持续转圈。属微信页自身行为，应用侧无法改变，也不应为此改代码。

**结论四：本次修复的由来。** 同一行里的 `visibility=unknown` 暴露出 §4.2 的探针读的是宿主上不存在的 `getVisibilityState()`（Electron 43 d.ts 中出现 0 次），故节流维度**当时无法判定**；已由 `auth-login-visibility-fix` 改为 `drawn=` / `bgThrottle=` 并补三条宿主 API 归属契约锁（详见 CHANGELOG 同节与 learnings `dead-probe-green-mock-blindness`）。§4.2 在拿到新数据前保持未决。

**读日志的正确姿势（补 §5.4）**：判定"慢不慢"只看 `login page finished after Nms` 与 `qr response #1 after Mms` 两个数；`localhost.weixin.qq.com` 的批量失败是微信自身探测，不要当成本应用的故障。日志落在 `D:\tmp\Multi-Publish-debug-profile\logs\app-YYYY-MM-DD.log`（调试 profile），而 `%LOCALAPPDATA%\Temp\multi-publish-logs\` 那份是**单测**写的，二者不要混。
## 11. 第二轮真机数据与两处新发现（2026-09-26 午后）

§10 之后又捕获一次登录（同一构建，仍带 `visibility=unknown` 死探针）。日志源仍是 `D:\tmp\Multi-Publish-debug-profile\logs\app-2026-09-26.log`。

| UTC | 事件 |
|---|---|
| 04:04:54.747 | `auth:open-login enter platform=tencent_video` |
| 04:04:56.162 | `AuthView login page finished after **1394ms**`（首个文档） |
| 04:05:00.8 → 04:05:03.8 | `localhost.weixin.qq.com:13013/13014/13015/14013/14014/14015/api/check-login` 逐个 `ERR_FAILED` + `ERR_CONNECTION_CLOSED`，约 5s 一轮 |
| 04:05:06.935 | `AuthView login page finished after **12167ms**`（同视图**第二次** `did-finish-load`） |
| 04:05:15.034 | `auth:complete-login ok 耗时=74ms` |

### 11.1 「刷了很久」的量级终于对上了，但仍不在应用侧

从 `open-login` 到 `complete-login` 共 20.3s，其中**首个文档只花 1.4s**，后面 10.8s 是登录页自己的跳转链：`channels.weixin.qq.com/login.html` 连开两次即 `ERR_ABORTED`、两个 2560×864 背景 `mp4` 与 `weixin_v3.ttf`（`ERR_CACHE_MISS`）被中止，再叠上 §10 结论三的 6 端口本机客户端探测。`did-finish-load` 要等子框架与资源收敛，所以第二个数才是用户眼里的"转圈时长"。

**判据修正**：§5.4 的判定表此前默认只看一条 `login page finished`。同一视图出现**多条**时，应以**首条**为"文档可达性"、以**末条**为"用户观感时长"；两者差值大即说明页面在自我跳转/加载外链资源，而非我们 `loadURL` 慢。

### 11.2 出码计时对非公众号路径不覆盖（已知缺口，暂不扩范围）

本次 `tencent_video` 全程 **0 条** `qr response #` 日志：`QR_IMAGE_MARKER = 'getqrcode'` 只匹配 `mp.weixin.qq.com/cgi-bin/scanloginqrcode?action=getqrcode`，腾讯视频登录走的是 `open.weixin.qq.com/connect/qrconnect`，二维码字节不经该端点。因此「出码几秒」这一指标目前**只对公众号入口成立**；`§4` 判定表中依赖它的那两行对其它平台不可用。

决定：不在本次修复里扩端点白名单——没有需求方要求量化其它平台的出码耗时，且扩大 `URL_FILTERS` 会同时收紧 `auth-view-manager.test.js` 里"filter 精确等于 `URL_FILTERS`"那条锁，属独立决策。缺口如实登记于此。

### 11.3 顺带查出：本 PR 自己的契约锁是装饰性的（已修）

同一次全量跑里 stderr 出现 `electron.d.ts 不可用，跳过宿主 API 前提锁` —— 定位用 `path.join(__dirname, '..', '..', 'node_modules', ...)`，从 `apps/desktop/electron/services` 数两级 `..` 只到 `apps/desktop`，而本仓 `node-linker=hoisted`，electron 在**仓库根** `node_modules`。结果两条依赖 d.ts 的锁（前提锁、通配锁）在本地与 CI **从未执行过任何断言**。

连带撤回一条 §10/CHANGELOG 的旧结论："注入 bogus 名后契约锁 2 failed" 的红其实来自**日志格式断言**。修复：改为逐级上溯查找 + 找不到即红 + 声明集规模下界（实测 410）；三条变异反证各自变红（源码改调不存在方法 / `findDts` 指向不存在包 / 成员正则退化）。详见 learnings `decorative-contract-lock`。

## 12. §4.2 后台节流嫌疑：已证伪（2026-09-26 18:26 真机第三次复现）

探针随 #2420（squash `9cbe3a14`）落 main 后，`mp-app-live` 实例于 16:21 重启并加载新代码（该树 `HEAD=9af97b1c`、`dirty=0`、`git merge-base --is-ancestor 9cbe3a14 HEAD` 为真）。本次**不重启用户会话**，改经 CDP 端口 11415 调 `window.electronAPI.authOpenLogin(wechat_mp, null)` 复现，随后 `authClose` 收口（`auth:close ok 耗时=6ms`，`auth:open-login cancelled 耗时=115719ms`）。

```
[2026-09-26T10:26:43.511Z] AccountIPC auth:open-login enter :: platform=wechat_mp accountId=<none>
[2026-09-26T10:26:44.523Z] AuthView login page finished after 983ms platform=wechat_mp drawn=true bgThrottle=true
[2026-09-26T10:26:45.028Z] LoginNetDiag [wechat_mp/auth-wechat_mp-1790418403514] qr response #1 after 1497ms status=200 contentLength=redacted
```

按 §5.4 判定表第 3 行的口径读这一行：

- `bgThrottle=true`：后台节流**确实处于开启**（我们没关它）—— 该维度第一次被真实读到，此前一直是 `unknown`。
- `drawn=true`，且 1497ms 后二维码到达时仍为 drawn 态：视图全程处于"应绘制"状态，Chromium 后台节流**没有可作用的隐藏窗口** ⇒ 在本路径上无可观测影响。
- 结论：§4.2 嫌疑**证伪**。`createAuthView` 补 `backgroundThrottling:false` **决定不做** —— 无证据支持，且会给登录热路径加一处无收益的行为变更。

三次同档测量合并看：公众号 11:53 `656ms`/`1072ms`、18:26 `983ms`/`1497ms`；`tencent_video` 12:04 首文档 `1394ms` + 末次 `did-finish-load` `12167ms`（§11.1）。支持本篇主结论：**首屏与出码都不慢，"刷了很久"来自微信登录页自身行为**（§10 结论三 + §11.1）。

**覆盖限制（如实登记）**：`authClose` 走销毁路径、不经 `hide()`，因此关闭时**不会**产生 `login view setVisible=false drawn=…` 那一行。要正面观测「出码窗口落在未绘制时段」，需在登录页保持打开时切到别的标签再切回（`hide()`/`show()` 路径）。本次未做，因为上述结论不依赖该观测。

## 13. 真机配对 A/B 终局取证（2026-09-27 04:08–04:26，`mp-app-live` + 用户 debug-profile）

### 13.1 取数方式与为什么必须配对

`mp-app-live` 快进 ff 到 `origin/main`（`655acd0c`，已含 §11/§12 的 `f3a0bf11`），依赖门禁 `verify-worktree-deps.js` = OK、`ensure-desktop-deps.js --check` = `DESKTOP_DEPS_OK`。登录页由 CDP 对 vite 页面 target 发 `Runtime.evaluate`（`awaitPromise:false`）调 `window.electronAPI.authOpenLogin('wechat_mp', null)` 驱动，测完 `authClose`；`auth:open-login enter` 与 `auth:close enter` 各 **15** 条，配平证明没有把登录视图留给用户。计时一律取 `<profile>/logs/app-2026-09-27.log`（§10 的两份 decoy 日志已避开）。

- 每次 `openLogin` 的 `accountId = auth-<platform>-<Date.now()>` ⇒ 分区 `auth-auth-<platform>-<ts>`（落在 `<profile>/session/Partitions/`）**每次全新且空**。这对 A/B 是好事：无 cookie 泄漏、每轮冷分区；代价是分区无 GC（本轮 15 次约 **130MB**，收尾按精确名逐个删除，更早会话的 21 个未动）。
- 第一轮实测两档顺序执行后，**开启档全部慢于默认关档**（789–8408 vs 721–1242ms）。但这批数据里两档各只对应一次开机、且开启档在前，属典型时间趋势混淆 ⇒ 改造成**配对设计**：两档交替重启，每档只取「该次开机后的第一次 `openLogin`」，得 4 组配对样本。

### 13.2 结果

| 配置 | 样本数 | 首屏 `login page finished after` | `qr bytes #1 after` | `encodedDataLength` | 二次导航 |
| --- | --- | --- | --- | --- | --- |
| 默认关 | 8 | 721 / 852 / 853 / 917 / 940 / 1116 / 1239 / 1242 ms（中位 928） | 1282–1592 ms | 5789–5921 | 0/8 |
| `MP_LOGIN_NOISE_CANCEL=1` | 7 | 789 / 795 / 870 / 897 / 1531 / 3502 / 8408 ms（中位 897） | 1158–8704 ms | 5813–5861 | 0/7 |

配对差（同簇内 开−关，首屏）：**−145 / −20 / +17 / −453 ms**，均值 **−150ms**；`qr` 指标 3 负 1 正（−147 / +55 / −49 / −434 ms）。开启档每轮稳定命中 6 条 `LoginNoise cancel`（默认关档 0 条）——**开关确实在运行态生效**，不是配了没跑。

### 13.3 结论

1. **(b) 达成**：CDP 只数字节的观测在生产路径拿到了真实字节（`encodedDataLength=5789…5921`），这正是 webRequest 层 `contentLength=redacted` 永远拿不到的量；此后判「200 + 空体」的服务端静默拒绝有了一手依据。
2. **(c) 维持默认关**：均值 −150ms 完全落在微信侧抖动量级内，且被单个 −453ms 离群点主导；开启档那两个长尾（3502ms、8408ms）**出自同一次开机的同一簇**，不是独立观测，不能反过来归因于开关，也不能归因于网络——它只说明"n 太小"。
3. **不得转默认开的第二理由是不可证伪项**：被取消的 `support.weixin.qq.com/cgi-bin/mmsupportmeshnodelogicsvr-bin/cube?biz=3512&label=connect.qrconnect&action=connect` 每轮 6 次，它**可能**参与微信侧 QR 会话登记。本机 15 次全部未扫码，**没有任何证据能证明取消它不影响扫码成功**；要证伪必须真机手机扫码。"没测出问题" ≠ "无副作用"。

### 13.4 局限与污染（如实登记）

- 单机、单日、单网络（Clash Verge 在路径上、对 CN 域名直通）；只覆盖 wechat_mp 一路。`tencent_video` 的 12s 二次导航本轮**未复现**（0/15），不得据此宣称该分支已收敛。
- 取数结束后本机时钟被外部快进约 7 小时（共享根 `main` 在 04:30 / 05:08 两次 ff）。所有数值均为同进程内 `Date.now()` 差，取数窗口（04:08–04:26）内无跳变，故不受影响；但**日志里的绝对时间戳与文件 mtime 跨过了这个跳变**。
- 应用在 04:26 自行跑了一轮周期检测，把真源 `accounts.json` 全 8 条的 `last_validated` 刷成当次时间（sha256 前缀 `3df752c0…` → `011f35b5…`）。轨迹：`checkLocalCredentials: OK encrypted` ×8、`effectiveStatus=active`、`statusSource=backend` ⇒ **无状态翻转、无改名、无凭证写入**（15 次 `openLogin` 全部以 `cancelled` 收口）。这是应用自身的正常行为，但由本次启动触发，记为污染。

### 13.5 顺手挖出的两处与本文档相关的事实

- **`MP_CDP_ALLOW_ALL_ORIGINS=1` 没有落到 electron 命令行**：`mp-applive-launcher.ps1` 确实设了该变量，但两次实测主进程 `CommandLine` 里**都没有** `--remote-allow-origins` ⇒ 文档口径「必须设该变量，否则外部 CDP 客户端 403」与运行态不符。本次是靠**WebSocket 请求不带 `Origin` 头**连上的（带上就 403）。属独立的启动链缺陷，未在本 PR 修。
- **`Runtime.evaluate` 顶层 `await` 静默返回 undefined**：`'JSON.stringify(await x())'` 不报错也不返回值，必须写 `(async()=>…)()`；且异常在 `msg.result.exceptionDetails` 而非 `msg.result.result.exceptionDetails`，读错字段会把语法错误误判成「宿主 API 不存在」。

### 13.6 仍未做

- 真机手机扫码下的 cancel 对照（唯一能证伪 §13.3-3 的实验，需要用户手机）。
- `tencent_video` 同法复测（其出码标记 `getqrcode` 不覆盖该平台，§11 已记）。
- `persist:auth-*` 分区 GC 与 asar 打进 439 个 `*.test.js` 两项遗留（另案）。
## 14. §13.5 登记的启动链缺陷已修（2026-09-30，`fix-dev-launcher-cdp-origins` / PR #2695）

§13.5 写的「`MP_CDP_ALLOW_ALL_ORIGINS=1` 没落到 electron 命令行」当场被归因成"WMI 不继承环境变量"，**那个归因是错的**。真取证只有一条命令：

```
git grep 'remote-allow-origins' origin/main -- '*.js' '*.ps1' '*.mjs'   →  0 命中
```

即 `dev-launcher.js` 里**从来没有实现**这条 Chromium 开关，而 `.agents/skills/start-app/SKILL.md`、本文档链上的 `PRD-VIRAL-PAGE-FULL-UTILIZATION-2026-09-21.md`、`TEST-PLAN-VIRAL-LIBRARY-INTEGRATION-2026-09-22.md` 与 `learnings.md` 四处都写着「dev-launcher.js 已加该开关，不设则 CDP 403」。**文档承诺了一个不存在的特性**，于是"按文档设了变量照样 403"会把每一个后来人重新引向同一条错误归因 —— 这正是本轮要收的口。

### 14.1 修的内容

- `apps/desktop/scripts/dev-launcher.js`：新增 `resolveAllowAllOrigins(env)`（默认关；`trim` 后必须恰好为 `'1'`）；`buildElectronArgs` 增 `allowAllOrigins` 形参，开启时追加 `--remote-allow-origins=*`，且追加位置必须在 `desktopDir` **之前**（既有测试钉住"数组末位是应用路径"）。
- `apps/desktop/scripts/dev.js`：**单次**读取该值 → 传给 `buildElectronArgs` → 在 `electron.on('spawn')` 里打印现场。`trim` 是为了兼容 `cmd /c set "VAR=1 "` 折进值里的尾随空格（本仓在 `ELECTRON_USER_DATA_DIR` 上真踩过）；只认 `'1'` 是为了让"默认关"不能被 `true`/数字绕过。

### 14.2 证据

- `node --test` 四个 CI 点名文件（`dev-ports / dev-launcher / dev-exit-log / electron-runtime-env`）→ **tests 50 / pass 50 / fail 0**。
- 四条变异反证，各只让对应那条锁变红：dev.js 不传参 → 1 红；删掉追加行 → 1 红；判据退化成 `!!raw` → 1 红；删掉留痕 → 1 红。还原后 10/10 绿，三个文件与备份**字节级一致**。
- 真机 A/B（同 worktree、隔离 profile、专属 bridge 端口 8453/16553/8033/8022/8014，避免应答到别人实例的 8299）：

| `MP_CDP_ALLOW_ALL_ORIGINS` | electron argv | 不带 Origin | 带 Origin | 带恶意 Origin |
| --- | --- | --- | --- | --- |
| `0` | 无该开关 | OPEN | **HTTP 403** | **HTTP 403** |
| `1` | `--remote-allow-origins=*` | OPEN | **OPEN** | **OPEN** |

  不带 Origin 两档都 OPEN ⇒ 差异维度被隔离在这条开关本身，不是进程、不是时序。这也解释了 §13 当时为什么必须"不发 Origin 头"才连得上。

### 14.3 边界与交付拆分

- 开关**默认关**，开启后任意站点都能连该进程的 DevTools WebSocket（origin 校验存在正是为此），所以它只用于本机排障，不得进 CI/生产默认值。
- 只动 dev 启动链，未改 `apps/desktop/electron/` 与打包配置 ⇒ QM-1 前提不成立。
- **QM-6 双模型外部评审未执行**：两条 arm 本机均不可用，一手错误已登记进 `.quality-gates.md` 本轮记录 —— `codex exited with status 1`，底层 `codex exec` 真因为 `404 ... CC Switch local proxy failed while handling Codex endpoint /responses`（路由到的 provider 无 Responses API）；`claude exited with status 1`，直接 `claude -p` 零输出。
- **CHANGELOG 条目不在本 PR**：置顶型 `CHANGELOG.md` 在开发期间被并发会话连续撞车（两次 `CONFLICTING`），按既有止血口径把该条目移出本 PR 以把冲突面降到 0，内容保留在提交 `5d4b3215` 里，由后续 docs PR 与 `远程同步` 回填同批带上（同时销账 `scripts/gate-record-debt-ledger.json` 的登记项）。

