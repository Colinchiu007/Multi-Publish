# Proposal: declare-platform-session-markers（为抖音/B站/小红书声明会话凭证标记）

## Why

`PLATFORM_SESSION_COOKIE_MARKERS` 是「URL 判成登录成功」之外唯一的正向证据，但仓库里只有快手一家声明了它。
其余 7 个「成功模式是裸域名」的平台（bilibili / douyin / facebook / instagram / xiaohongshu / youtube / zhihu）
在 `hasPlatformSessionCookie()` 上处于 **fail-open**：未声明标记时该函数一律返回 `true`，四处凭证入库门禁
（`auth-view-manager.hasCapturedCredentials` / `qrcode-login` / `webview-manager/credential-saver` /
`account-manager.captureCookies`）对它们形同不存在。

实测后果（`packages/shared-utils/src/platform-definitions.js`）：`isPlatformLoginSuccessUrl('douyin', 'https://creator.douyin.com/')`
返回 `true` —— 而本次匿名实测确认，**未登录**访问 `creator.douyin.com/` 同样停在该 URL 且会种 17 个 Cookie
（`ttwid`/`s_v_web_id`/`bit_env`/`passport_csrf_token`…）。也就是说「打开登录页 = 已登录」这条假成功路径
对这三个平台依然敞开（上一轮 PR #2454 只加了登录页**路径**指纹否决层，而抖音匿名根本不跳登录路径，否决层覆盖不到）。

## What Changes

**MODIFIED**：按「匿名基线实测 + 真实登录视图分区差集」为三个平台声明标记（键名一律有实测出处，禁止猜测）：

| 平台 | 声明的标记 | A（登录视图独有）| B（匿名实测）|
|---|---|---|---|
| douyin | `sessionid` `sessionid_ss` `sid_tt` `uid_tt` | 40 个名字 | 17 个名字 |
| bilibili | `SESSDATA` `DedeUserID` | 14 | 13 |
| xiaohongshu | `access-token-creator.xiaohongshu.com` `x-user-id-creator.xiaohongshu.com` | 16 | 11 |

**MODIFIED**：泛化标记名的形态契约（`SESSION_MARKER_SHAPE`）以接纳 `uid_tt` / `SESSDATA` / `x-user-id-*`，
并新增两项负控，防止泛化把设备/埋点标识放进来。

**ADDED**：`sessionCookieNames(cookies)` 进入 shared-utils 并导出，四处门禁的 reject 日志统一用它输出
Cookie **名字**（绝不出值）。收紧门禁必须同时可归因，否则「标记收得太窄」会变成用户可见的静默登录失败。

**刻意不做**：知乎**不声明** Cookie 标记。实测其登录视图（账号 `created_at` 晚于该视图 37 秒）内 `.zhihu.com`
域 8 个 Cookie 全为匿名可读类（`d_c0`/`_zap`/`BEC`/`__snaker__id`/`gdxidpyhxdE`/`Hm_lvt_*`/`captcha_session_v2`），
A−B 唯一独有项是验证码票据 `captcha_ticket_v2`——给它声明任何 Cookie 标记都会把真实登录判成失败。
instagram / facebook / youtube 本机无账号，A 侧不存在，同样保持待取证。

## Impact

- 受影响规范：`desktop`（登录完成判定与凭证入库门禁）
- 受影响代码：`packages/shared-utils/src/platform-definitions.js` 及其测试、
  `apps/desktop/electron/services/auth-view-manager.js`（+ 测试）、`services/qrcode-login.js`、
  `services/webview-manager/credential-saver.js`、`publishers/account-manager.js`
- 行为变化面：**仅** douyin / bilibili / xiaohongshu 三平台的登录完成与凭证入库新增一条硬要求
  （命中至少一个非空标记 Cookie）。`http-login-checker` 只在 kuaishou 的 uid 提取里用该门禁，实测零影响。
- 测试夹具连带修正：`webview-manager.test.js` 有 2 处把 douyin 当「随便一个平台」而未提供登录态 Cookie，
  按该文件既有约定（声明标记的平台必须给真实登录态 Cookie）补上 `sessionid`。
