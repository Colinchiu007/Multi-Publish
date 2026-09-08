# PRD-ACCOUNT-LOGIN-WINDOW：账号「去登录」改为独立窗口承载

> **日期**：2026-09-08
> **类型**：Bug 修复 + 交互模式变更
> **影响模块**：`apps/desktop/electron/services/auth-view-manager.js`、`apps/desktop/src/locales/{zh,en}.js`、`apps/desktop/test-setup.js`
> **关联页面**：账号管理（`Accounts.vue`）→ 已保存账号卡片 →「去登录」
> **分支**：`fix-wechat-login-tab`

---

## 一、问题现象

在已启动的桌面应用中进入「账号管理」，点击**已保存的公众号账号卡片**上的「去登录」按钮，
打开微信公众号登录页面后，**窗口顶部出现多层内容重叠**（平台页面顶栏、应用 TabBar、NavBar、
账号管理页 header 相互挤压），截图可见顶部堆叠了若干层。

## 二、根因分析

### 2.1 直接原因：登录视图内嵌主窗口 + 硬编码坐标

`apps/desktop/electron/services/auth-view-manager.js` 原实现把登录页作为
`WebContentsView` **内嵌**到主窗口的 `contentView`：

```js
const AUTH_VIEW_TOP = 76   // 假设 TabBar(36px) + NavBar(40px)
const SIDEBAR_WIDTH_DEFAULT = 200

_positionView(bounds) {
  this.currentView.setBounds({
    x: sidebarWidth,        // 200
    y: AUTH_VIEW_TOP,       // 76  ← 硬编码
    width: bounds.width - sidebarWidth,
    height: bounds.height - AUTH_VIEW_TOP,
  })
}
// ...
this.mainWindow.contentView.addChildView(view)
```

问题在于 **76px 是一个与真实布局脱节的假设值**：

| 层 | 实际占用 | 是否计入 76px |
|---|---|---|
| 应用 TabBar | 36px | ✅ 计入 |
| 应用 NavBar | 40px | ✅ 计入 |
| 账号管理页 header / 工具栏 / 搜索栏 | 未计入 | ❌ **未计入** |
| 侧边栏宽度变化（折叠态） | 动态 | ⚠️ 用默认 200 兜底 |

账号管理页顶部还有自身的标题栏与批量操作工具栏，实际可用区域起点**远高于 76px**。
内嵌视图却从 y=76 开始绘制，于是：

- 平台登录页自身的顶部导航
- 应用 TabBar + NavBar
- 账号管理页 header

三者挤在有限的顶部空间内 → **视觉上"重叠了好几层内容"**。

### 2.2 架构原因：内嵌（浮层）模式本身是错的选择

内嵌 `WebContentsView` 的坐标**必须与主窗口 DOM 布局严格同步**。而主窗口布局会随：
页面切换（不同页面 header 高度不同）、侧边栏折叠、窗口缩放而变化。
任何一处不同步就会错位。这是**架构性缺陷**，不是单纯调参数能解决的。

同仓库 `oauth-manager.js` 也采用同一内嵌模式，存在同类风险（本次未改动，见「遗留项」）。

### 2.3 为什么不能简单改成"外部浏览器新标签页"

`Accounts.vue` 中已有 `openLoginPage()` 使用 `tabStore.createTab()` 打开新标签页，
但源码注释明确指出了它的局限（第 838-839 行）：

```js
// 使用 reloginAccount 走完整认证流程（auth:open-login），
// 而非 openLoginPage 的普通浏览器标签页（无凭证捕获机制，登录成功也无法保存）
```

**核心约束**：外部浏览器标签页**无法捕获 Cookie / localStorage / IndexedDB**，
登录成功也保存不下凭证。因此修复必须在「消除坐标重叠」与「保留凭证捕获」之间取交集。

## 三、修复方案

### 3.1 方案对比

| 方案 | 消除重叠 | 保留凭证捕获 | 改动量 | 结论 |
|---|---|---|---|---|
| A. 调大 `AUTH_VIEW_TOP` 常量 | ⚠️ 治标 | ✅ | 极小 | ❌ 换页面仍会错位 |
| B. 改用外部浏览器标签页 | ✅ | ❌ **丢失** | 小 | ❌ 登录存不下，不可用 |
| C. 由渲染进程上报真实布局高度 | ✅ | ✅ | 中 | ⚠️ 需 IPC 同步，仍有竞态 |
| **D. 独立 BrowserWindow 承载** | ✅ | ✅ | 中 | ✅ **采用** |

### 3.2 采用方案 D：独立登录窗口

登录视图仍为 `WebContentsView`（保留 session 隔离与凭证提取），
但**承载容器从主窗口改为独立 `BrowserWindow`**，登录视图铺满该窗口客户区：

```js
_createLoginWindow(platform) {
  const win = new BrowserWindow({
    width: 1180, height: 820,
    minWidth: 900, minHeight: 640,
    parent: this.mainWindow,   // 父子关系：主窗口关闭时一并回收
    modal: false,              // 非模态：用户可切回主窗口看指引
    autoHideMenuBar: true,
    title: `账号登录 - ${platform}`,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  // 登录视图铺满客户区，从 (0,0) 起算 —— 不再有任何硬编码偏移
  const syncBounds = () => this.currentView?.setBounds({ x: 0, y: 0, ...win.getContentBounds() })
  win.on('resize', syncBounds)
  win.once('closed', () => { /* 按"取消登录"结算，避免 Promise 挂起 */ })
  return win
}
```

**收益**：

1. 独立坐标系，登录视图从 `(0,0)` 铺满，**根除与主窗口 DOM 的任何重叠**
2. 主窗口页面布局变化、侧边栏折叠、窗口缩放均不再影响登录页
3. `createSession()` 隔离 session、`_extractAuthData()` 提取 Cookie / localStorage /
   IndexedDB、`attachCdpDetection()` CDP 检测**全部原样保留**
4. 用户可自由切换主窗口查看账号列表与操作指引（`modal: false`）

## 四、功能逻辑

### 4.1 打开流程（`openLogin`）

```
账号卡片「去登录」
  → Accounts.vue: reloginAccount(account)
  → accountActions.openLogin('browser', platform, accountId)
  → IPC → AuthViewManager.openLogin(platform, timeout)
       ├─ 校验 mainWindow 已初始化（否则 reject「主窗口未初始化」）
       ├─ 校验 platform 存在于 PLATFORM_LOGIN_URLS（否则 reject「不支持的平台」）
       ├─ 若已有进行中的登录 → 先 close()
       ├─ createSession(accountId)  创建隔离 session
       ├─ createAuthView(...)       创建 WebContentsView
       ├─ _createLoginWindow()      创建独立 BrowserWindow   ← 新增
       ├─ loginWindow.contentView.addChildView(view)
       ├─ syncBounds() → setBounds({x:0, y:0, 铺满})
       ├─ loginWindow.focus()
       ├─ view.webContents.loadURL(loginUrl)
       ├─ 发送 auth:view-opened → 前端显示登录状态条
       ├─ 注册 Escape 关闭 / did-navigate / did-finish-load / CDP 检测
       └─ 注册超时（默认 300s）
```

### 4.2 结算路径（不变）

| 触发 | 行为 |
|---|---|
| CDP 或 URL 检测到登录成功 | 延时 3s 提取凭证 → `_settleLogin` → `close()` |
| 用户点击「我已完成登录」 | `completeLogin()` → 提取凭证 → 无凭证则抛错提示 |
| 用户按 Escape | 结算为 `{ cancelled: true }` |
| **用户点击独立窗口关闭按钮** | **新增**：`closed` 事件 → 结算为 `{ cancelled: true }` |
| 超时（默认 300s） | 结算为 `{ timeout: true }` |

### 4.3 关闭与资源回收（`close`）

```
close()
  ├─ 清空 _activeLoginAttempt / _autoCompletionAttemptId
  ├─ 清理 _loginTimeout / _cdpExtractTimer / _urlExtractTimer
  ├─ 移除 Escape 监听
  ├─ removeChildView（宿主窗口 = loginWindow，回退 mainWindow）
  ├─ currentView.webContents.close()
  ├─ 移除 resize 监听、清空 _syncLoginViewBounds
  ├─ loginWindow.destroy()      ← 新增：销毁独立窗口，避免窗口泄漏
  └─ 发送 auth:view-closed → 前端隐藏登录状态条
```

## 五、数据校验

| 校验点 | 规则 | 失败处理 |
|---|---|---|
| 主窗口初始化 | `mainWindow` 非空 | reject「主窗口未初始化」 |
| 平台支持 | `PLATFORM_LOGIN_URLS[platform]` 存在 | reject「不支持的平台: {platform}」 |
| 凭证捕获 | `hasCapturedCredentials()`：Cookie / localStorage / IndexedDB 任一非空 | 抛错「未检测到登录凭证，请先在平台页面完成登录」 |
| 登录会话有效性 | `_isCurrentLoginAttempt()` 校验 attempt 未被取代 | 静默丢弃过期回调，防止串号 |
| Cookie 域名 | `isPlatformCookieDomain(platform, cookie.domain)` 过滤 | 非本平台 Cookie 不入库 |
| IndexedDB 快照 | ≤ 512KB（`MAX_INDEXED_DB_SNAPSHOT_BYTES`） | 超限丢弃，仅用 Cookie/localStorage |
| 初始重定向期 | `initialRedirectPhase` 为 true 时不判定登录成功 | 防止登录页自身重定向链被误判 |

## 六、交互逻辑

| 场景 | 行为 |
|---|---|
| 点击「去登录」 | 弹出独立登录窗口（1180×820，可缩放，最小 900×640），自动聚焦 |
| 登录窗口打开期间 | 主窗口**仍可交互**（非模态），账号页顶部显示登录状态条 |
| 切回主窗口 | 状态条常驻显示，提示用户在独立窗口完成登录 |
| 按 Escape | 关闭登录窗口，结算为取消 |
| 点击窗口关闭按钮 | 同 Escape，结算为取消（**不弹错误提示**） |
| 主窗口关闭 | 独立窗口作为子窗口一并回收 |

## 七、显示项与提示文字

### 7.1 账号页登录状态条（`login-state`）

显示条件：`authViewVisible === true`（收到 `auth:view-opened` 时置位）。

| 显示项 | 内容 |
|---|---|
| 平台图标 | `Monitor`（浏览器模式）/ `Cellphone`（扫码模式） |
| 平台名 | `authPlatformName`，取 `platformLabel(loginPlatform)`，兜底「账号登录」 |
| 状态文案 | 见下表 |
| 操作按钮（浏览器模式） | 「我已完成登录」（保存中显示「正在保存」）、「关闭」 |

### 7.2 提示文案（i18n，zh/en 成对）

| Key | zh | en |
|---|---|---|
| `accountsPage.loginStateBrowser` | **已在独立窗口打开登录页，请在该窗口完成登录后点击「我已完成登录」**（原：网页登录窗口已打开） | **Login page opened in a separate window. Complete login there, then click "I have completed login"**（原：Browser login window opened） |
| `accountsPage.completeLoginDone` | 我已完成登录 | I have completed login |
| `accountsPage.completeLoginSaving` | 正在保存 | Saving |
| `accountsPage.close` | 关闭 | Close |
| `accountsPage.reloginSuccess` | 重新登录成功（复用） | — |
| `accountsPage.reloginFailed` | 重新登录失败（复用） | — |
| `accountsPage.saveFailed` | 保存失败（复用） | — |

> 注：`loginStateBrowser` 文案本次随交互模式变更同步调整，避免用户仍在原页面区域寻找登录页。

## 八、测试

新增回归测试（`auth-view-manager.test.js`）：

| 用例 | 断言 |
|---|---|
| 独立窗口承载，不再内嵌主窗口 | `manager.loginWindow` 非空；**`mainWindow.contentView.addChildView` 未被调用** |
| 布局从原点铺满 | `view.setBounds` 末次调用参数 `x === 0 && y === 0` |
| 关闭后窗口销毁 | `manager.loginWindow === null`、`_syncLoginViewBounds === null`、`win.isDestroyed() === true` |

测试基建同步补齐（`test-setup.js`）：

- `BrowserWindow` mock 增加 `contentView`（`addChildView` / `removeChildView`）
- `BrowserWindow` mock 增加 `getContentBounds()`、`destroy()`；`isDestroyed()` 改为反映真实销毁状态
- `WebContentsView` mock 的 `setBounds` / `setVisible` 改为 `vi.fn`，支持布局断言

## 九、兼容性与风险

| 项 | 说明 |
|---|---|
| Electron 版本 | 依赖 `BrowserWindow.contentView`（Electron 30+）。已加防御：不可用时记录告警日志且不阻断 `loadURL` |
| 凭证能力 | 完全保留，未改动 session 隔离与提取逻辑 |
| 现有测试 | `openSavedAccount` 仍走旧的内嵌路径（本次未改动），`close()` 宿主窗口选择已做兼容 |
| 多实例 | 每次登录创建独立窗口，`close()` 必销毁，无窗口泄漏 |

## 十、遗留项（本次未处理）

1. **`oauth-manager.js`** 仍使用内嵌 `WebContentsView` 模式，存在同类坐标错位风险，建议后续统一迁移到独立窗口。
2. **`openSavedAccount()`**（打开已保存账号）仍走内嵌路径，本次聚焦「去登录」主链路，未一并迁移。
3. 若后续要彻底统一，建议抽出公共的「认证窗口」基类，供 AuthView / OAuth / 扫码三种模式复用。
