# PRD-BUGFIX：固化标签切回后发布页草稿状态丢失（视频文件等信息不保存）

- 变更标识：`publish-tab-state-keepalive`
- 日期：2026-10-02
- 类型：Bug 修复（运行时代码，渲染层 App.vue 模板条件渲染）
- 关联代码：`apps/desktop/src/App.vue`（主窗口工作区 `<router-view>` 条件渲染）
- 关联测试：`apps/desktop/src/publish-tab-state-keepalive.test.js`

---

## 1. 问题现象（用户报告）

在应用的**固化标签**（标签栏第 1 个「首页」标签）下的「一键发布 · 视频发布」页：

1. 用户点击「点击选择」/拖拽，选定一个本地视频文件并确认后，页面正常显示已选视频：
   - 上传区下方出现文件名回显（如 `01.mp4`）；
   - 出现绿色「已选择视频文件」卡片，含文件名、大小（如 `909.88 KB`）、格式徽标（`MP4`）、
     以及「更换视频」「移除」操作与提示文案「如需更换，可重新拖拽文件到上方区域，或点击「更换视频」」。
2. 用户点击**另一个标签**（此前已打开的某个自媒体平台页，例如「抖音 创作者中心」，属于**账号标签**）。
3. 用户再**点击切回**第 1 个「首页」固化标签。
4. **预期**：之前选定的视频文件信息仍在（草稿未保存前应原样保留）。
   **实际**：视频文件回显、绿色「已选择视频文件」卡片**全部消失**，页面回到「未选择视频」的空态。
   同理，标题、视频描述、封面、已选平台/账号等**所有未保存的表单草稿**都会丢失（用户最先注意到的是视频）。

---

## 2. 根因分析（第一性原因）

### 2.1 标签体系与首页承载方式

- 「首页」固化标签是一个**虚拟标签**（`tabId: 'home'`，`isHome: true`），它**不创建** `WebContentsView`，
  而是由主窗口渲染进程的 Vue SPA 通过 `<router-view>` 直接渲染当前路由页面（发布页即 `Publish.vue`）。
- 其它标签（浏览器标签 / 账号标签 / 登录标签）是主进程 `WebContentsView` 原生图层，
  定位在 TabBar(36px)+NavBar(40px)=TOP 76px、右侧起点为侧边栏宽度之下，**覆盖**在工作区内容矩形之上。
- 切换标签只经 `tabStore.switchToTab()` 发 IPC 通知主进程显示/隐藏对应原生视图，
  **不会**触发渲染进程 vue-router 的路由跳转（首页路由保持不变）。

### 2.2 触发丢失的确切代码点

`App.vue` 主窗口分支（`<template v-else>`）的工作区内容区曾写作：

```vue
<main class="mp-workspace cohere-main" data-testid="mp-workspace">
  <RouteLoadError v-if="routeLoadError" ... />
  <router-view v-if="!isLoginTab" />   <!-- ← 问题行 -->
</main>
```

其中 `isLoginTab` 的定义（`App.vue`）为：

```js
const isLoginTab = computed(() => {
  const tab = tabStore.activeTab
  return tab?.isLogin === true || (tab?.accountId != null && !tab.isHome)
})
```

即：**只要活动标签是「认证登录标签」或「带 accountId 的账号标签」，`isLoginTab` 即为 true。**

- 当用户切到「抖音 创作者中心」这类**账号标签**时 `isLoginTab` 变 true；
- `v-if="!isLoginTab"` 于是把 `<router-view>` **整棵子树从 DOM 卸载**；
- `Publish.vue` 组件被销毁，其**组件局部状态** `article = reactive({ ..., video_path: '' })`
  与 `videoFileMeta = ref(null)`（见 `Publish.vue`）随之销毁；
- 切回首页时 `v-if` 重新为真，`<router-view>` **重新挂载一个全新的 `Publish.vue` 实例**，
  `article.video_path` 回到初值 `''` → 视频文件信息「消失」。

### 2.3 为什么当初用 v-if

该 `v-if` 是为解决「登录视图内嵌主窗口时与首页工作区内容重叠」的问题而加（见
`apps/desktop/electron/services/auth-view-manager.test.js` 注释：「重叠问题由 App.vue isLoginTab 时隐藏 router-view 解决」）。
但「隐藏」被实现成了「卸载」——卸载顺带销毁了组件状态，构成副作用。

### 2.4 影响边界

- **仅账号/登录标签**触发（`isLoginTab` 为 true 时）。普通浏览器标签（无 `accountId`、非 `isLogin`）
  下 `isLoginTab` 为 false，`<router-view>` 一直挂载，不会丢状态。
- 丢失的是**所有未保存草稿**（视频、标题、正文、封面、平台/账号选择等），视频只是最直观的一处。

---

## 3. 修复方案

把「隐藏」与「卸载」解耦：`App.vue` 工作区 `<router-view>` 由 `v-if="!isLoginTab"` 改为
`v-show="!isLoginTab"`。

```vue
<main class="mp-workspace cohere-main" data-testid="mp-workspace">
  <RouteLoadError v-if="routeLoadError" ... />
  <router-view v-show="!isLoginTab" />   <!-- 隐藏而非卸载，保住 SPA 草稿状态 -->
</main>
```

### 3.1 为什么 v-show 是正确的

- `v-show` 只切换根元素 `display: none`，**组件实例保持挂载**，其 `reactive`/`ref` 局部状态原样保留。
- 登录/账号标签激活时，内嵌 `WebContentsView` 原生图层本就**覆盖**工作区内容矩形；
  `display: none` 与「从 DOM 移除」在**视觉与布局上等价**（都不占位、都不绘制），
  因此「隐藏 router-view 以避免重叠」的原始意图被完整保留，重叠问题不回退。
- 唯一差异是组件生命周期：`v-show` 期间组件仍存活、其 `watch`/`computed` 继续有效——
  这正是我们需要的（切回即见原状），且切换标签不改路由，不会触发任何多余副作用。

### 3.2 修复后行为（功能逻辑 / 交互逻辑）

1. 首页固化标签选定视频 → 切到账号标签（工作区隐藏，但 `Publish.vue` 实例存活）
   → 切回首页 → 视频回显、绿色「已选择视频文件」卡片、标题/描述/封面/平台/账号等草稿**全部原样保留**。
2. 账号标签激活期间，工作区被隐藏（`display:none`）；账号标签自身的 `WebContentsView` 正常显示，
   NavBar 的「保存账号」入口不受影响。
3. 普通浏览器标签切换行为不变（此前即不丢状态）。

---

## 4. 显示项与提示文字（保持不变，仅列明不受影响）

修复不改动任何文案与显示项，以下为发布页视频区既有显示项，修复后在切回时**应完整重现**：

| 显示项 | 内容 / 文案（zh） | 承载状态 |
| --- | --- | --- |
| 上传区文件名回显 | 选定文件的文件名（如 `01.mp4`） | `article.video_path` |
| 已选卡片标题 | 「已选择视频文件」 | `article.video_path` 非空 |
| 文件名 | 如 `01.mp4` | `videoFileMeta.name` |
| 大小 | 如 `909.88 KB` | `videoFileMeta.size` |
| 格式徽标 | 如 `MP4` | `videoFileMeta` 派生 |
| 操作 | 「更换视频」「移除」 | 常驻 |
| 提示 | 「如需更换，可重新拖拽文件到上方区域，或点击「更换视频」」 | 常驻 |
| 支持说明 | 「支持 MP4/MOV/AVI，最大 500MB。选择视频后可自动提取首帧作为封面」 | 常驻 |

> 文案来源为 `apps/desktop/src/locales/zh.js` / `en.js`（成对维护，CI Gate 7）。本次修复不新增/修改文案。

---

## 5. 数据校验（本次修复不改变，但明确既有约束，避免回归时误伤）

- 视频文件选择校验在 `Publish.vue` 的 `handleVideoFileChange` 中，与本次修复正交：
  - 超过 500MB 在选择前拦截、不覆盖旧选择、toast 带实际大小；
  - 路径无法解析时清空 `video_path` 并提示；
  - 首次选择/替换/重选同一文件分别给不同提示。
- 发布前 `handlePublish` 对视频模式的必填校验（`isVideoMode && !article.video_path` → 提示「请先选择视频文件」）不变。
- 本修复只保证「切标签不丢已选值」，不改变任何校验规则。

---

## 6. 验收标准（Given/When/Then）

1. **Given** 首页固化标签的发布页已选定本地视频 `01.mp4`，**When** 切到任一账号标签再切回首页，
   **Then** 视频回显与「已选择视频文件」卡片仍在，`article.video_path` 仍为所选路径。
2. **Given** 同上，**When** 切到账号标签（`isLoginTab` 为 true），**Then** 工作区 `<router-view>`
   处于隐藏态（根元素 `display: none`）而非被移除，DOM 中仍存在工作区内容节点。
3. **Given** 首页发布页填了标题/描述/选了平台，**When** 切到账号标签再切回，**Then** 这些草稿同样保留。
4. **Given** 切到**普通浏览器标签**（无 accountId、非登录），**When** 再切回首页，**Then** 状态不丢、
   工作区始终可见（`isLoginTab` 为 false 不触发隐藏）。
5. 回归测试 `publish-tab-state-keepalive.test.js` 全绿；把 `App.vue` 改回 `v-if` 时该测试必须变红（反证已实测）。

---

## 7. 回归保护与防再犯（QM-5 步骤④⑤）

- **回归保护测试**：`apps/desktop/src/publish-tab-state-keepalive.test.js`（真挂载 `App.vue` + 真实 tab store，
  驱动 home→账号标签→home 一次来回，断言工作区路由组件实例**从未被销毁**：`setup` 计数恒为 1、
  草稿值原样保留、隐藏期间仅 `display:none`）。
- **反证**：把 `App.vue` 的 `v-show` 改回 `v-if` 后，该测试第 2 条在「组件必须仍挂载」断言处变红（已实测），
  证明锁真实生效、非装饰性。
- **防再犯（源码级不变量 + 注释）**：`App.vue` 该处已加注释说明「此处必须 `v-show` 隐藏、禁止 `v-if` 卸载，
  否则丢 SPA 草稿」；`shell-mode-6a.test.js` 等既有 App.vue 模板契约测试同批跑通，未回归。
- **learnings**：在 `01-docs/learnings.md` 记录根因与教训（「隐藏」被实现成「卸载」导致组件局部状态丢失；
  原生覆盖层之上，`v-show` 与 `v-if` 视觉等价但生命周期不同）。

---

## 8. 测试逃逸链（为什么此前没测出来）

- 单元层：`Publish.vue` 的测试直接挂载该组件，从不经过 `App.vue` 的 `isLoginTab` 条件，无法表示「切标签即卸载」。
- App 层：既有 `tab-independent-home.test.js` / `shell-mode-6a.test.js` 是源码契约测试，覆盖 NavBar/占位行/home-shell 分支，
  未覆盖「账号标签激活时工作区是否被销毁」。
- 集成/E2E：无「选视频→切账号标签→切回→断言仍在」的端到端用例。
- 视觉层：像素门禁只截静态视图，不驱动标签切换。
- 审查层：`v-if` 在孤立看时「确实隐藏了重叠」，其销毁状态的副作用未被识别。

系统性漏洞归类：**测试覆盖漏洞**——缺少「工作区组件实例在登录/账号标签切换中存活」的行为级回归锁。本次以
`publish-tab-state-keepalive.test.js` 补齐。
