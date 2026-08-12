# 需求与根因分析 — 百家号新增账号登录窗口提前消失

## 用户报告
账号管理 → 新增账号 → 选择“百家号” → 弹出网页登录，还没来及登录页面就消失了；
账号管理首页随即出现该百家号账号，给人“新增成功”的错觉。

## 复现链（2026-08-12 实测网络行为）
1. 用户选择百家号 → `auth:open-login` → `AuthViewManager.openLogin('baijiahao')`
2. 内嵌视图加载 `https://baijiahao.baidu.com/`
3. 未登录时该地址 302 → `http://baijiahao.baidu.com/pcui/register/index`
   → 最终 `https://baijiahao.baidu.com/builder/theme/bjh/login`（登录/注册页）
4. `did-navigate` 触发 `_checkLoginCompleted` → `isPlatformLoginSuccessUrl('baijiahao', url)`
   → 命中裸域名模式 `['baijiahao.baidu.com']` → 判定“登录成功”
5. 3 秒后 `_extractAuthData` 提取到预登录 Cookie（BAIDUID 等）→ `hasCapturedCredentials` 为 true
   → `_settleLogin` → 视图关闭（页面消失）
6. `auth:open-login` handler 收到结果后无条件 `AccountManager.saveCapturedAccount(...)`
   → 账号入库 → 渲染端收到 `auth:completed` → 刷新列表 → 显示“新增成功”

## 根因（Primary）
`packages/shared-utils/src/platform-definitions.js`
`PLATFORM_LOGIN_SUCCESS_PATTERNS.baijiahao = ['baijiahao.baidu.com']`
裸域名模式把同域下的登录/注册页（/pcui/register/index、/builder/theme/bjh/login）
误判为“登录成功”。`isPlatformLoginSuccessUrl` 只排除精确的登录路径 `/`，
无法排除同域登录页重定向路径。

## 促成因素（Contributing）
- `AuthViewManager.openLogin` 的 `did-navigate` 从视图打开即开始检测，
  初始 URL 自身的重定向链（发生在任何用户操作之前）也可能触发自动完成。
- `hasCapturedCredentials` 把任意 Cookie（含预登录跟踪 Cookie）视为有效登录凭证。
- `auth:open-login` IPC handler 在 `openLogin` resolve 后无条件入库并报“账号添加成功”，
  没有区分“自动完成/手动完成/取消/超时”。

## 修复方案
1. **主修复**：baijiahao 成功模式改为 `[]`（fail-closed）。登录页与创作后台同域，
   URL 嗅探不可靠 → 关闭 URL 自动完成，改由用户点击“我已完成登录”
   （`auth:complete-login` → 提取到真实凭证后入库）。
2. **机制加固**：`AuthViewManager` 与 `QrCodeLogin` 增加初始加载守卫
   （`initialRedirectPhase`），登录页首次 `did-finish-load` 之前的重定向链
   一律不判定登录成功。对所有平台生效，防止同类误判。

## 逃逸分析（为什么测试没拦住）
| 层级 | 缺口 |
|------|------|
| 单元测试 platform-definitions | 只断言精确登录 URL 非成功（`never treats a configured initial login URL`），未覆盖平台登录页的**重定向路径**（baijiahao /builder/theme/bjh/login） |
| 单元测试 auth-view-manager | 只覆盖 wechat_mp 的 URL 匹配与凭证边界，未测“登录页重定向 + 预登录 Cookie → 自动完成”场景 |
| 单元测试 qrcode-login | 导航事件未按真实时序建模（直接 did-navigate，无 did-finish-load 前置） |
| IPC 测试 account.test.js | 未覆盖“openLogin 返回无意义凭证仍入库”路径（根因在成功判定，故本次修判定层） |
| 外部验收 | 真实平台登录属外部验收，CI 不覆盖；审查时未做真实网络验证（裸域名模式被当作合理配置） |

## 回归保护
- platform-definitions：baijiahao 预登录路径全部 false
- auth-view-manager：初始加载前导航不触发；baijiahao 登录页 URL + 预登录 Cookie 不自动完成
- qrcode-login：初始加载前导航不触发提取（并修正既有测试事件时序）
