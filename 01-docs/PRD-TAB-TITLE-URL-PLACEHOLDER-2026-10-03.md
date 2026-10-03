# PRD：新标签页标题与地址栏占位跟随页面内容

> 任务：fix-tab-title-url-placeholder ｜ 日期：2026-10-03 ｜ 类型：Bug 修复（UI 交互链路）
> 用户报告原文：「应用中某些情况，点击按钮弹出的新标签网页，顶部的标签名称和网址输入框，都是显示“新标签页”。需要调整为标签名显示为具体的网页标题。网址输入框，调整为显示为空。」

## 1. 背景与问题定义

### 1.1 应用内标签体系

应用顶部是浏览器式标签栏（TabBar），三类标签并存：

| 标签类型 | 内容载体 | 标题来源 | 地址栏 |
|---------|---------|---------|--------|
| 首页固化标签（home） | 主窗口 SPA（vue-router） | 固定「首页」 | 只读占位「首页」 |
| 浏览器/登录标签（url/账号） | WebContentsView（外站网页） | Chromium `page-title-updated` 事件 | 显示真实 URL |
| **+ 新标签（home-shell）** | WebContentsView 内嵌**本应用**的独立 SPA 实例 | —— 本次修复对象 —— | —— |

home-shell 标签的本质：主进程 `createNewTabPage({ homeShell: true })` 创建一个加载本应用 dist 主页地址（带 `?mp-home-shell=1` 壳态参数）的 WebContentsView，内含一份与主窗口完全独立的 SPA 实例（双判据安全边界见 `electron/home-shell-preload.js`）。用户在 home-shell 标签内点击共享侧边栏时，主进程把路由指令定向投递给该实例（`navigateActiveHomeShell`），实例自身 `router.push`（hash 导航，壳态不结束）。

### 1.2 问题现象

在 home-shell 新标签内切换到任何应用页面（如「文案改写」）后：

1. TabBar 上的标签标题恒为「新标签页」，不随页面变化；
2. NavBar 地址栏显示占位文本「新标签页」（应为空，由页面标题作占位提示）。

## 2. 根因（QM-5 五步取证）

### 2.1 第一性引入点（git blame 链）

| 提交 | 时间 | 行为 |
|------|------|------|
| `c3c395570`「账号管理页10项质量修复」 | 2026-09-04 | `createNewTabPage` 引入 `titleLocked`：调用方传 `title` 即锁定，`page-title-updated` 从此被主进程忽略。**意图**：登录/平台标签标题不被网页标题覆盖（合理需求）。 |
| `f7e93ceba`（#2230 新标签独立主页） | 2026-09-23 | `App.vue` 的 `+` 新标签改为 `createTab({ homeShell: true, title: t('tabs.newTabTitle') })`——**把锁定语义无意带进了 home-shell 标签**。 |

从此 home-shell 标签标题被永久锁定在「新标签页」。

### 2.2 次级缺口

- home-shell 内嵌 SPA **从不更新 `document.title`**（全仓渲染层无一处 `document.title` 赋值）。即使解除锁定，`page-title-updated` 链路也无源可发。
- NavBar 地址栏的占位符绑定 `navigation.title`：标题不更新 → 占位符恒为「新标签页」；且用户期望占位**内容**为空、由占位提示承担信息展示。

### 2.3 逃逸链（为什么测试没拦住）

| 层级 | 缺口 | 分类 |
|------|------|------|
| 主进程单测 | `webview-manager.test.js:760` 断言「传 title 则锁定」——锁定行为本身被测试固化，但没有任何用例覆盖「home-shell + 传 title」这一组合的副作用 | 测试场景缺失 |
| 渲染层契约测试 | `tab-independent-home.test.js` 只断言「不硬编码 about:blank/『首页』字面量」，未断言「不传锁定 title」 | 断言不精确 |
| E2E/真机 | 无任何自动化覆盖「+ 新标签 → 侧边栏切页 → 标签标题变化」 | 测试场景缺失 |
| 代码评审 | `title` 参数跨层传递被视为无害透传，未审计「锁定」语义对动态内容标签的影响 | 审查盲区 |

## 3. 需求（验收标准）

| # | 需求 | 验收标准 |
|---|------|---------|
| R1 | 标签名显示具体网页标题 | 在 home-shell 标签内切到「文案改写」页，TabBar 标签标题显示「文案改写」；切到「发布记录」显示「发布记录」 |
| R2 | 地址栏显示为空 | 壳态（未导航外站）下地址栏输入框内容恒为空；占位提示显示当前页面标题 |
| R3 | 未匹配页面回退 | 无法识别的页面（理论上不应出现）回退品牌名「社媒管家」，绝不显示「新标签页」残留 |
| R4 | 静态标题场景不回归 | 登录标签「XX登录」、创作者中心「XX创作者中心」、批量登录标签等显式传 title 的场景，标题锁定行为完全不变 |
| R5 | 壳态自然结束不回归 | 地址栏输入外站 URL 后，地址栏显示真实 URL、标签标题跟随网页 `<title>`（既有 F5 行为） |
| R6 | 多实例/多标签安全 | 多个 home-shell 标签并存时，标题上报只影响调用方自己的标签 |

## 4. 方案（三段链路补齐）

### 4.1 链路总览

```
路由变化（home-shell SPA 内）
  → resolveRouteTabTitle()（路由 → i18n 文案）
  → ① document.title 同步（Chromium 自动触发 page-title-updated）
  → ② 显式 IPC pageManager.reportTabTitle(title)（不依赖事件时序）
  → 主进程按 sender.id 定位标签 → 更新 _tabStates.title
  → 广播 tab-title-updated
  → 渲染层 tabStore 更新 tabs[].title / navigation.title
  → TabBar 标签标题 + NavBar 地址栏占位符实时刷新
```

### 4.2 渲染层：解除锁定 + 标题上报

**`src/App.vue`**

- `onCreateTab` 改为 `createTab({ homeShell: true })`，**不传 title**。初始标题由主进程回退值（`tab-lifecycle.js` homeShell 分支默认「新标签页」，与 `tabs.newTabTitle` 同语义）承担。
- setup 内 `const tabTitleReporter = isHomeShell ? useTabDocumentTitle() : null`（仅内嵌实例启动；外层主窗口的标题栏由 OS 承担，无需此链路）。
- `onMounted` 中 `tabTitleReporter?.start()`；`onBeforeUnmount` 中 `tabTitleReporter?.stop()`（**成对释放**，防泄漏监听器）。

**`src/composables/useTabDocumentTitle.js`（新增）**

- `ROUTE_TITLE_KEYS` 精确 path 表（25 条，与 `route-registry.js` 登记路由对齐）：文案键优先复用侧边栏既有条目（`sidebar.nav.*`），页面无独立标题键时取页面级键（如 `historyPage.pageTitle`、`knowledgeBase.title`）。
- `ROUTE_PREFIX_KEYS` :param 前缀表（**独立存放，不与精确表混用**）：
  - `/board/` → `tabs.productionBoard`（素材看板）
  - `/board/…/contact-sheet` → `tabs.contactSheet`（场景审批，suffix 子路由优先级高于宿主前缀）
  - `/replay/` → `tabs.replayTimeline`（生产回放）
  - ⚠️ 开发期实测踩坑：若把 `'/'` 精确键放进前缀表，`'/'.endsWith('/')` 恒真 + 所有 path `startsWith('/')` 恒真 → 所有未知路径被误判成「主页」。故前缀匹配只查独立前缀表。
- `resolveRouteTabTitle(path)` 判定顺序：剥 query → 精确命中 → 前缀命中（suffix 优先）→ 回退 `tabs.brandTitle`（品牌名「社媒管家」）。i18n 用 `i18n.global.t`（组件上下文外可用；`useI18n()` 只能在 setup 内调用，纯函数不可用）。
- `useTabDocumentTitle()` 行为：
  - `start()`：立即上报当前 `route.fullPath`，并 `watch(() => route.fullPath)` 持续同步；
  - 每次上报：`document.title = title`（①）+ `invokePageManager('reportTabTitle', title)`（②）；
  - 全程 try/catch 静默降级——标题同步失败绝不影响页面功能；非 Electron 环境 `invokePageManager` 返回 undefined，天然退化为只改 document.title；
  - `stop()`：解绑 watch。

### 4.3 主进程：接收上报

**`electron/services/webview-manager/ipc-handlers.js`** 新增 handler `page-manager:report-tab-title`：

- `withSenderCheck` 全量包裹（CI Gate 17 显式守卫要求；新通道必须过来源校验）。
- 定位：`event.sender.id` ↔ 遍历 `_tabViews` 取 `webContents.getId()` 匹配 → 得到 tabId。多标签/多 SPA 实例并存时只影响调用方自己的标签（R6）；未知 sender：返回 `{code:0}` 但零副作用（可能是非标签视图的合法调用方）。
- 更新：`state.title !== title` 时才写 `state.title` 并 `_broadcast('tab-title-updated', { tabId, title })`（**幂等**，避免同标题重复广播导致渲染层无谓刷新）。
- 校验：空 title → `VALIDATION_ERROR`。
- **不触碰 `titleLocked`**：home-shell 标签 titleLocked 本就为 false；显式锁定的静态标题标签不经过此 handler（其渲染进程不会发起上报）。

**`electron/preload/page-manager.js`** 暴露 `reportTabTitle: (title) => invoke('page-manager:report-tab-title', { title })`；重打包 `index.bundle.js` + `home-shell-preload.bundle.js`（QM-2：改 preload 必须重打包，且以内容 grep 自证签名在产物中，line 911）。

### 4.4 地址栏空显示（R2）

既有壳态逻辑已保证：home-shell 标签在 `did-navigate`/`did-navigate-in-page` 时 `state.url` 恒为空串（`tab-lifecycle.js:356-365`），直到用户在地址栏输入外站 URL 触发壳态自然结束（F5）。因此：

- `navigation.url = ''` → NavBar 输入框 `:value` 为空（输入框**内容**为空，无残留）；
- 输入框占位符 = `navigation.title`（原来恒「新标签页」，现在跟随页面标题）→ 视觉上「地址栏显示为空、由页面标题作提示」。

本 PR 不改 NavBar 模板，仅通过标题链路修复让该期望行为自然成立；壳态 url 恒空已用回归锁固化。

## 5. i18n 变更（zh/en 成对，CI Gate 7）

| 键 | zh | en | 用途 |
|----|----|----|------|
| `tabs.brandTitle` | 社媒管家 | Social Media Manager | 未知路径回退标题（也即 index.html 原始 `<title>` 语义） |
| `tabs.productionBoard` | 素材看板 | Production Board | `/board/:projectId` 标签标题 |
| `tabs.contactSheet` | 场景审批 | Scene Review | `/board/:projectId/contact-sheet` 子路由 |
| `tabs.replayTimeline` | 生产回放 | Production Replay | `/replay/:projectId` |

`tabs.newTabTitle` 保留（zh「新标签页」/en「New Tab」）：主进程 homeShell 回退初始标题语义与渲染层 `TabBar.getTabLabel` 兜底共用该语义，不再是用户可见的最终状态。

## 6. 数据流与状态归属

- 标签标题的**唯一真源**在主进程 `_tabStates.title`；渲染层 `tabs[].title`/`navigation.title` 是其投影（`tab-title-updated` 广播 + 全量快照刷新）。
- 上报方向是「home-shell 渲染进程 → 主进程」，与既有「主进程 → 全部订阅者」广播方向正交，不引入双向写竞争。
- 两条触发路径（Chromium `page-title-updated` 事件 与 显式 `reportTabTitle` IPC）写的是**同一个字段**，主进程侧幂等（同标题不重复广播）；显式上报的存在使链路不依赖事件时序。

## 7. 测试与回归保护

### 7.1 新增测试（TDD 先红后绿）

**`electron/services/webview-manager/home-shell-title.test.js`（9 例）**——直连 `tab-lifecycle.js`/`ipc-handlers.js` 行为测试：

1. `homeShell:true` 不传 title → 初始「新标签页」且 `titleLocked=false`；
2. home-shell 页面 `page-title-updated` → 标题实时更新并广播；
3. 显式传 title → 锁定语义保持（R4 回归保护）；
4. 壳态 `did-navigate`/`did-navigate-in-page` 下 url 恒空（R2 回归锁）；
5. reportTabTitle IPC：sender 定位 + 标题更新 + 广播；
6. reportTabTitle IPC：同标题幂等不重复广播；
7. reportTabTitle IPC：空 title 拒绝 / 未知 sender 零副作用 / sender 缺失不抛错；
8. App.vue 源码契约：onCreateTab 不含 `title:`；
9. App.vue 源码契约：`tabTitleReporter.start()/stop()` 成对接线。

**`src/composables/useTabDocumentTitle.test.js`（12 例）**：路由判定表（精确/前缀/suffix/未知/空值）、映射表规模下界（≥27，防解析退化假绿）、start 立即上报、watch 持续同步、IPC 失败静默、stop 后不再上报、非 Electron 降级。

### 7.2 反证（锁确实在跑）

回滚 `App.vue` 的 `onCreateTab` 改动（重新传 title）→ 契约用例立即变红。

### 7.3 回归范围

- 定向：webview-manager（83）+ preload（372）+ home-shell-preload（6）+ tab store（22）+ TabBar（11）+ NavBar（14）+ tab-independent-home（7）+ 本 PR 新增（21）= 527/527 全绿。
- 全量：13327 通过；唯一失败 `feedback.test.js` 为 Windows symlink 权限既有环境性失败（不含本改动的基线复跑同样失败，与本 PR 无关）。
- 门禁：`check-locale-sync.js --keys` PASS（1395 key）；eslint 0 error；`check-route-registry` 语义不受影响（未新增路由）。

### 7.4 QM-1 打包

`electron-builder --win --dir --publish never` exit 0；asar 清单含 `home-shell-preload.bundle.js`；从 asar 提取后内容断言两个 bundle 均含 `report-tab-title` 签名（line 911）。

## 8. 风险与缓解

| 风险 | 评估 | 缓解 |
|------|------|------|
| 显式上报与 Chromium 事件双写标题 | 低——两者写同一字段，主进程幂等 | 同标题不重复广播；事件路径 titleLocked 语义不变 |
| 多 home-shell 实例串扰 | 低——sender.id 精确匹配 | 测试 5/7 覆盖未知 sender 零副作用 |
| 新增路由忘记登记标题 | 中——回退品牌名，不致错乱 | PRD §4.2 明示维护规则；后续可在 route-registry 门禁中加联动校验（超出本卡范围） |
| 非壳态外站标签误发上报 | 无——外站页面无本应用 preload 的 electronAPI，不可达 | 双判据安全边界（home-shell-preload.js） |

## 9. 后续可选优化（不在本卡范围）

1. 视频创作内子标签（`/create?view=history`）可按 query 细化标题（当前统一「视频创作」）。
2. `/intelligence`、`/film-engineering` 等暗路由页面缺独立 pageTitle 键，复用了侧栏/命名空间既有文案；若产品定义独立标题可补键。
3. route-registry 门禁可扩展「新增路由必须同步 ROUTE_TITLE_KEYS」结构锁。
