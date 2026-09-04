# 桌面端 UI 布局规格

> **状态**：生效中
> **版本**：v1.0
> **日期**：2026-09-03
> **适用范围**：`apps/desktop/src` 渲染层 + `apps/desktop/electron` 主进程 WebContentsView 管理
> **关联提交**：`959d65cff` (fix: prevent WebContentsView from overlapping left sidebar)

---

## 1. 总体布局框架

### 1.1 根组件 (App.vue)

桌面应用采用 **左侧固定侧边栏 + 右侧主体区域** 的经典布局，由 `App.vue` 的 `.yixiaoer-shell` 容器承载。

```
┌─────────────────────────────────────────────────────┐
│  .app-root                                          │
│  ┌────────────────────────────────────────────────┐ │
│  │  .yixiaoer-shell (flex row, height: 100%)       │ │
│  │  ┌──────────┬─────────────────────────────────┐│ │
│  │  │ 侧边栏    │  .yixiaoer-shell-main            ││ │
│  │  │ Sidebar  │  ┌─────────────────────────────┐││ │
│  │  │          │  │ TabBar (浏览器式标签栏)       │││ │
│  │  │ 固定宽度  │  ├─────────────────────────────┤││ │
│  │  │ 200px    │  │ NavBar (导航/URL 栏)          │││ │
│  │  │          │  ├─────────────────────────────┤││ │
│  │  │ 不可滚动  │  │ YixiaoerModuleNav (模块导航) │││ │
│  │  │ 不可移动  │  │ 仅首页标签时显示              │││ │
│  │  │          │  ├─────────────────────────────┤││ │
│  │  │          │  │ .yixiaoer-workspace          │││ │
│  │  │          │  │ (flex: 1, overflow: auto)    │││ │
│  │  │          │  │ → <router-view />            │││ │
│  │  │          │  └─────────────────────────────┘││ │
│  │  └──────────┴─────────────────────────────────┘│ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 1.2 关键 CSS 规则

| 元素 | CSS 规则 | 说明 |
|------|---------|------|
| `.yixiaoer-shell` | `height: 100%; display: flex; min-width: 0; overflow: hidden;` | 整个外壳不可滚动，Flex 横向排列 |
| `.yixiaoer-sidebar` | `width: var(--yixiaoer-sidebar-width, 200px); min-width: var(--yixiaoer-sidebar-width, 200px);` | 固定宽度，不可压缩 |
| `.yixiaoer-shell-main` | `min-width: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden;` | 右侧主体，纵向 Flex 布局 |
| `.yixiaoer-workspace` | `min-width: 0; min-height: 0; flex: 1; overflow: auto;` | 内容工作区，独立滚动 |
| `.fullscreen-main` | `height: 100%; min-height: 0; overflow: auto;` | 全屏路由（如 `/first-run`）独立渲染 |

### 1.3 全屏路由

路由 `/first-run`（首跑引导）为全屏模式，脱离侧边栏和导航壳，独立整屏渲染。由 `isFullScreenRoute` computed 属性控制：

```javascript
const isFullScreenRoute = computed(() => route.path === '/first-run')
```

---

## 2. 左侧导航栏 (YixiaoerSidebar)

### 2.1 概述

- **文件**：`apps/desktop/src/layouts/YixiaoerSidebar.vue`
- **宽度**：200px（CSS 变量 `--yixiaoer-sidebar-width: 200px`，定义于 `src/styles/cohere-design-system.css:69`）
- **窄屏适配**：视口 ≤900px 时折叠为 68px，隐藏文字标签和部分元素
- **背景**：渐变紫色 `linear-gradient(180deg, #f4f2ff 0%, #f0efff 100%)`

### 2.2 固定行为

- 侧边栏是 Flex 布局中的固定宽度子元素
- 父容器 `.yixiaoer-shell` 设置 `overflow: hidden`，整体不可滚动
- 右侧工作区 `.yixiaoer-workspace` 独立滚动（`overflow: auto`），不影响侧边栏
- **侧边栏不会随右侧内容滚动或移动**

### 2.3 内容组成

| 区域 | 内容 | 说明 |
|------|------|------|
| Header | `ProfileMenu` + `+` 新建发布按钮 | 用户头像、许可证信息、快捷发布 |
| 主导航 | 主页、发布、账号、数据、视频创作、采集 | 6 个主要导航项，使用 `router-link` |
| 设置 | 设置按钮（齿轮图标） | 触发 `open-settings` 事件打开设置弹窗 |
| 更多菜单 | 监控、发布日历、私信评论、CLI、素材库、关键词监控、爆款分析、提示词评估、模型提供商、会员中心 | 10 个次要导航项，折叠在下拉菜单中 |
| Footer | 客户端状态指示器 + 服务状态 + 升级 Pro 按钮 | 底部固定区域 |

### 2.4 宽度同步机制

侧边栏宽度通过 `ResizeObserver` 实时同步到主进程，确保 WebContentsView 定位准确：

```javascript
// YixiaoerSidebar.vue onMounted
const el = document.querySelector('.yixiaoer-sidebar')
if (el) {
  const syncWidth = () => {
    const w = el.getBoundingClientRect().width
    if (w > 0) invokePageManager('setSidebarWidth', Math.round(w))
  }
  syncWidth()
  _sidebarObserver = new ResizeObserver(syncWidth)
  _sidebarObserver.observe(el)
}
```

**数据流**：
1. 渲染进程 `YixiaoerSidebar` → `invokePageManager('setSidebarWidth', width)`
2. Preload API `pageManager.setSidebarWidth(width)` → IPC `page-manager:set-sidebar-width`
3. 主进程 `WebviewManager.setSidebarWidth(width)` → 更新 `_sidebarWidth` → 同步到 `AuthViewManager` / `QrCodeLogin` → 调用 `_repositionAll()`

---

## 3. 模块导航栏 (YixiaoerModuleNav)

### 3.1 概述

- **文件**：`apps/desktop/src/layouts/YixiaoerModuleNav.vue`
- **显示条件**：仅当 `isHomeTab` 为 `true`（当前活动标签为首页标签）时显示
- **高度**：`var(--yixiaoer-nav-height, 70px)`

### 3.2 模块标签

| 模块 | 标签 | 路由 |
|------|------|------|
| 首页 | 主页 | `/` |
| 账号 | 账号管理、分组管理、分享链接、收藏分组 | `/accounts` |
| 发布 | 新建发布、发布记录、草稿箱 | `/publish` |

### 3.3 工具按钮

右侧工具区包含：移动端预览、客服支持、使用指南、通知

---

## 4. WebContentsView 定位

### 4.1 概述

主进程通过 `WebContentsView` 承载浏览器标签页（创作者中心页面）、登录视图（内嵌浏览器登录）和二维码扫码视图。所有 WebContentsView 必须定位在右侧主体区域，**不得遮挡左侧导航栏**。

### 4.2 定位参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 默认侧边栏宽度 | 200px | 常量 `SIDEBAR_WIDTH_DEFAULT` |
| 窄屏侧边栏宽度 | 68px | 视口 ≤900px 时由渲染进程同步 |
| 顶部偏移 (浏览器标签) | 76px | TabBar(36px) + NavBar(40px) |
| 顶部偏移 (分屏监控) | 56px | 旧版监控布局 |
| 动态宽度 | 由渲染进程通过 IPC 实时同步 | `page-manager:set-sidebar-width` |

### 4.3 三个管理器定位

| 管理器 | 文件 | 定位方法 | X 偏移 | Y 偏移 |
|--------|------|---------|--------|--------|
| WebviewManager (浏览器标签) | `electron/services/webview-manager.js` | `_repositionAll()` | `sidebarWidth` | 76px |
| AuthViewManager (登录视图) | `electron/services/auth-view-manager.js` | `_positionView()` | `sidebarWidth` | 76px |
| QrCodeLogin (扫码登录) | `electron/services/qrcode-login.js` | `_positionView()` | `sidebarWidth` | 76px |
| WebviewManager (分屏监控) | `electron/services/webview-manager.js` | `_calculatePositions()` | `sidebarWidth` | 56px |

### 4.4 浏览器标签页定位

```javascript
// webview-manager.js _repositionAll()
activeView.setBounds({
  x: sidebarWidth,                                    // 左侧留出侧边栏宽度
  y: 76,                                              // 顶部留出 TabBar + NavBar
  width: bounds.width - sidebarWidth,                 // 宽度 = 窗口宽度 - 侧边栏宽度
  height: bounds.height - 76                          // 高度 = 窗口高度 - 顶部导航
})
```

### 4.5 登录视图定位

```javascript
// auth-view-manager.js _positionView()
this.currentView.setBounds({
  x: sidebarWidth,                                    // 左侧留出侧边栏宽度
  y: AUTH_VIEW_TOP,                                   // 76px
  width: Math.max(0, bounds.width - sidebarWidth),    // 防止负值
  height: Math.max(0, bounds.height - AUTH_VIEW_TOP)  // 防止负值
})
```

### 4.6 分屏监控布局

分屏监控（旧系统）支持 1/2/3/4/6 屏布局，所有分屏区域均从侧边栏右侧开始：

```javascript
// webview-manager.js _calculatePositions()
var W = bounds.width - sidebarWidth   // 可用宽度 = 窗口宽度 - 侧边栏宽度
var H = bounds.height - NAV_HEIGHT    // 可用高度 = 窗口高度 - 导航高度
var OFFSET_X = sidebarWidth           // X 偏移 = 侧边栏宽度
```

---

## 5. 标签页系统

### 5.1 概述

桌面应用采用浏览器式标签页系统，由 `TabBar` 组件和 `TabStore` (Pinia) 管理，与主进程 `WebviewManager` 通过 IPC 通信。

### 5.2 标签类型

| 类型 | 标识 | 说明 | WebContentsView |
|------|------|------|-----------------|
| 首页标签 | `isHome: true` | 默认标签，显示 Vue 路由内容（侧边栏 + 模块导航 + 工作区） | 无 |
| 浏览器标签 | `btab-*` | 创作者中心等外部网页 | 有，定位在右侧主体区域 |
| 虚拟登录标签 | `auth-login` | 平台账号登录页面 | 有，由 AuthViewManager 或 QrCodeLogin 管理 |

### 5.3 标签切换行为

- **切换到首页标签**：隐藏所有 WebContentsView，显示 Vue 路由内容（包括侧边栏、模块导航、工作区）
- **切换到浏览器标签**：隐藏其他 WebContentsView，显示目标标签视图，定位在右侧主体区域
- **切换到登录标签**：隐藏所有浏览器标签，显示登录视图，定位在右侧主体区域
- **关闭标签**：移除 WebContentsView，自动切换到剩余标签或首页

### 5.4 窗口大小变化

窗口 resize 事件触发所有视图重新定位：

```javascript
// window.js
mainWindow.on('resize', () => {
  authViewManager._onWindowResize()
  webviewManager.resize()
  qrCodeLogin._onWindowResize()
})
```

---

## 6. 数据校验

### 6.1 侧边栏宽度校验

| 校验项 | 规则 | 位置 |
|--------|------|------|
| 宽度范围 | 0 ≤ width ≤ 600px | `WebviewManager.setSidebarWidth()` |
| 类型校验 | `typeof width === 'number'` | `WebviewManager.setSidebarWidth()` |
| 无效值处理 | 日志警告，忽略更新 | `log.warn('WebviewManager', 'Invalid sidebar width ignored: ' + width)` |
| 重复值跳过 | 宽度未变化时跳过更新和重排 | `if (this._sidebarWidth !== width)` |

### 6.2 WebContentsView 边界校验

| 校验项 | 规则 | 位置 |
|--------|------|------|
| 主窗口存在 | 必须存在 `mainWindow` | `_repositionAll()` 开头 |
| 宽度非负 | `Math.max(0, bounds.width - sidebarWidth)` | `AuthViewManager._positionView()` |
| 高度非负 | `Math.max(0, bounds.height - AUTH_VIEW_TOP)` | `AuthViewManager._positionView()` |
| 视图存在 | `if (activeView)` 检查 | `_repositionAll()` |

### 6.3 IPC 安全校验

| 校验项 | 规则 | 位置 |
|--------|------|------|
| Sender 校验 | 所有 IPC handler 必须通过 `withSenderCheck` 包装 | `webview-manager.js` |
| 参数类型 | 宽度参数必须是 number 类型 | `page-manager:set-sidebar-width` handler |

---

## 7. 交互逻辑

### 7.1 账号管理中打开创作者中心

1. 用户在账号管理页面点击账号卡片（或点击"去登录"按钮）
2. 触发 `open-creator` 事件 → `openCreatorCenter(account)` 函数
3. 获取平台对应的创作者中心 URL（`PLATFORM_DASHBOARD_URLS[account.platform]`）
4. 如果平台不支持创作者中心，显示警告提示：`accountsPage.creatorUnsupported`
5. 调用 `tabStore.createTab({ url, platform, accountId, title })` 创建新浏览器标签
6. 主进程创建 `WebContentsView`，使用账号持久化 session 分区（`persist:account-{accountId}`）
7. 恢复已保存的 Cookie 和 localStorage（保持登录态）
8. 视图定位在右侧主体区域（`x: sidebarWidth, y: 76, width: windowWidth - sidebarWidth, height: windowHeight - 76`）
9. 侧边栏保持可见，不被遮挡

### 7.2 重新登录账号

1. 用户点击账号卡片的"重新登录"按钮
2. 触发 `relogin` 事件 → `reloginAccount(account)` 函数
3. 调用 `accountActions.openLogin('browser', account.platform)` 打开登录视图
4. 主进程创建登录 `WebContentsView`（`AuthViewManager`）
5. 视图定位在右侧主体区域（同创作者中心）
6. 登录完成后自动提取 Cookie/localStorage/IndexedDB 并保存
7. 登录视图关闭，恢复之前的标签

### 7.3 添加新账号

1. 用户点击"添加账号"按钮
2. 弹出 `AccountLoginDialog` 对话框
3. 选择平台和登录方式（浏览器登录 / 扫码登录）
4. 点击"打开登录页" → 创建登录视图或扫码视图
5. 视图定位在右侧主体区域
6. 登录完成后保存凭证

---

## 8. 显示项与提示文字

### 8.1 侧边栏

| 显示项 | 文字 | 说明 |
|--------|------|------|
| 客户端状态 | `sidebar.clientStatusUnknown`（未知） | 待实现客户端状态检测 |
| 服务状态 | 服务运行中 | 硬编码中文，待国际化 |
| 升级按钮 | ⭐ 升级 Pro | 非 Pro 用户显示 |
| 更多菜单 | 更多 | 展开/收起次要导航项 |

### 8.2 账号管理

| 提示文字 | Key | 说明 |
|----------|-----|------|
| 不支持创作者中心 | `accountsPage.creatorUnsupported` | 该平台尚未支持创作者中心 |
| 创作者中心标签标题 | `accountsPage.creatorTabTitle` | 标签栏显示 "{platform}创作者中心" |
| 卡片悬停提示 | `accountsPage.creatorCardHint` | "点击卡片打开该账号的创作者中心" |
| 登录完成 | `accountsPage.saved` | 账号登录信息已保存 |
| 登录失败 | `accountsPage.saveFailed` | 账号登录信息保存失败 |

### 8.3 登录对话框

| 显示项 | Key | 说明 |
|--------|-----|------|
| 标题 | `accountsPage.addAccount` | 添加账号 |
| 平台选择 | `accountsPage.selectPlatform` | 选择平台 |
| 登录方式 | `accountsPage.loginMethod` | 登录方式 |
| 浏览器登录 | `accountsPage.browserLogin` | 浏览器登录 |
| 扫码登录 | `accountsPage.qrLogin` | 扫码登录 |
| 取消 | `accountsPage.cancel` | 取消 |
| 打开登录页 | `accountsPage.openLoginPage` | 打开登录页 |
| 扫码不可用 | `accountsPage.qrUnavailable` | 当前平台不支持扫码登录 |

---

## 9. 视觉规范

### 9.1 设计 Token

| Token | 值 | 用途 |
|-------|-----|------|
| `--yixiaoer-sidebar-width` | 200px | 侧边栏宽度 |
| `--yixiaoer-nav-height` | 70px | 模块导航高度 |
| `--yixiaoer-primary` | #5048e5 | 主色调 |
| `--yixiaoer-muted` | #8b8e9a | 次要文字色 |
| `--yixiaoer-nav-border` | #e8eaf2 | 导航边框色 |

### 9.2 响应式断点

| 断点 | 侧边栏宽度 | 行为 |
|------|-----------|------|
| > 900px | 200px | 完整显示，含文字标签 |
| ≤ 900px | 68px | 仅显示图标，隐藏文字和部分元素 |
| ≤ 700px | 68px | 模块导航精简，隐藏部分工具按钮 |

---

## 10. 错误处理

### 10.1 侧边栏宽度同步失败

- **现象**：`invokePageManager` 返回 `undefined`（API 不可用）
- **影响**：主进程使用默认宽度 200px，与 CSS 默认值一致，布局不受影响
- **降级**：默认值 200px 保证基本布局正确

### 10.2 WebContentsView 定位失败

- **现象**：`mainWindow` 为 null 或视图不存在
- **处理**：`_repositionAll()` 开头检查 `if (!this.mainWindow) return`，静默跳过
- **影响**：视图保持上次定位或默认位置，不会崩溃

### 10.3 无效侧边栏宽度

- **现象**：渲染进程传入非数字、负数或超过 600px 的值
- **处理**：日志警告 `Invalid sidebar width ignored`，保持当前宽度不变
- **影响**：避免异常宽度导致视图定位错误

---

## 11. 相关文件

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/App.vue` | 根组件，定义整体布局框架 |
| `apps/desktop/src/layouts/YixiaoerSidebar.vue` | 左侧导航栏组件 |
| `apps/desktop/src/layouts/YixiaoerModuleNav.vue` | 模块导航栏组件 |
| `apps/desktop/src/components/TabBar.vue` | 浏览器式标签栏 |
| `apps/desktop/src/components/NavBar.vue` | 导航/URL 栏 |
| `apps/desktop/src/stores/tab.js` | 标签页状态管理 (Pinia) |
| `apps/desktop/src/api/electron-bridge.js` | IPC 桥接层 |
| `apps/desktop/src/styles/cohere-design-system.css` | 设计 Token 定义 |
| `apps/desktop/electron/services/webview-manager.js` | WebContentsView 标签管理 + 分屏监控 |
| `apps/desktop/electron/services/auth-view-manager.js` | 内嵌浏览器登录管理器 |
| `apps/desktop/electron/services/qrcode-login.js` | 二维码扫码登录管理器 |
| `apps/desktop/electron/preload/page-manager.js` | Preload API 定义 |
| `apps/desktop/electron/window.js` | 窗口创建与事件绑定 |
| `apps/desktop/src/features/accounts/components/AccountManagementCard.vue` | 账号卡片组件 |
| `apps/desktop/src/views/Accounts.vue` | 账号管理页面 |

---

## 12. 变更历史

| 日期 | 版本 | 变更内容 | 关联提交 |
|------|------|---------|---------|
| 2026-09-01 | v1.0 | 初始版本：WebContentsView 定位偏移侧边栏宽度 | `959d65cff` |
| 2026-09-03 | v1.1 | 补充完整 UI 布局规格文档 | 本文档 |
| 2026-09-05 | v1.2 | 修复流水线详情页底部操作条与内容区重叠： 从  改为正常流 ，新增  可滚动内容区 | #1405 |
## 13. 已知问题修复

### 13.1 左侧菜单随内容滚动（2026-09-03 修复）

**根因**：`.app-root` 缺少 `height: 100%`，导致 CSS 百分比高度链断裂。

**影响**：`.yixiaoer-shell` 的 `height: 100%` 无法解析为视口高度，退化为 `auto`（由内容撑开），整个页面随工作区内容滚动，侧边栏随之移动。

**修复**：
- `.app-root` 添加 `height: 100%; display: flex; flex-direction: column;`
- `.yixiaoer-shell` 改为 `flex: 1; min-height: 0;`
- `.fullscreen-main` 改为 `flex: 1; min-height: 0;`
- `html, body` 添加 `overflow: hidden;`
- `.yixiaoer-sidebar` 添加 `flex-shrink: 0; overflow-y: auto;`

**关联 PR**：[#1371](https://github.com/Colinchiu007/Multi-Publish/pull/1371)
