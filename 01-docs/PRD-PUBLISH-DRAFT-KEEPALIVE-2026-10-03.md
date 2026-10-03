# PRD：发布页草稿在路由切换时保持（keep-alive）

- 变更标识：`publish-draft-keepalive`
- 日期：2026-10-03
- 类型：Bug 修复 / 体验补强（运行时代码，渲染层 App.vue + Publish.vue）
- 关联代码：`apps/desktop/src/App.vue`（主工作区 router-view 加 keep-alive）、`apps/desktop/src/views/Publish.vue`（defineOptions name + onActivated 预填）
- 关联测试：`apps/desktop/src/publish-draft-keepalive.test.js`、`apps/desktop/src/views/Publish.test.js`（新增 keep-alive 预填用例）
- 前置：PR #2764（`publish-tab-state-keepalive`）已修「切账号标签丢草稿」（v-if→v-show）。本 PR 修**另一条独立通路**——「在首页里点左侧菜单/模块导航离开发布页再回来」丢草稿。

---

## 1. 背景与现象

PR #2764 修复后，「首页固化标签 ↔ 账号标签」来回切换已不再丢草稿。但仍有一条**独立的**丢失通路：

- 用户在发布页（`/publish`）选定视频、填了标题/描述/封面/平台等；
- 在**同一个首页标签内**点左侧主菜单或模块导航切到别的页面（如「首页」「账号」「采集」），再点回「发布」；
- 发布页表单**被清空**（视频、标题、描述等全部丢失）。

这不是标签切换，而是 **SPA 路由切换**：`/publish → /xxx → /publish`。

## 2. 根因

`apps/desktop/src/App.vue` 主工作区用 `<router-view>` 渲染当前路由组件，**没有 `<keep-alive>`**。vue-router 默认在路由切换时**卸载**旧路由组件、**挂载**新路由组件。`Publish.vue` 的表单状态是**组件局部** `reactive article`（含 `video_path`）+ `videoFileMeta`/`imageFileList`/`coverFileList`/`selectedPlatforms`/`selectedAccounts`/`activeMode` 等 ref（见 Publish.vue），一旦组件被卸载即销毁，重挂载归零。

PR #2764 的 `v-show` 只解决「账号标签激活时 router-view 被 v-if 卸载」这一条；路由切换是 router 自身换组件，与 v-show/v-if 无关，所以 `v-show` 修不到本通路。

## 3. 方案选型

| 方案 | 做法 | 取舍 |
| --- | --- | --- |
| **A. keep-alive（选定）** | 主工作区 `<router-view>` 用 `<keep-alive :include="['Publish']">` 只缓存发布页 | 改动小、天然保留发布页**全部**局部状态；只缓存 Publish，其余页面维持「重挂载取最新数据」语义，不引入陈旧数据 |
| B. 草稿入 store | 把 article 等状态迁到 Pinia store，重挂载后恢复 | 隔离于 shell，但要改 ~10 处状态声明、Publish.vue 行数吃紧、需自管重置语义，改动面更大 |

选 A：最小、最完整、符合 Vue 惯用法。

## 4. 实现

### 4.1 App.vue 主工作区结构（保留 v-show 语义）

```vue
<router-view v-slot="{ Component }">
  <keep-alive :include="['Publish']">
    <component :is="Component" v-show="!isLoginTab" />
  </keep-alive>
</router-view>
```

- `include=['Publish']`：仅缓存发布页；`Home`/`Accounts` 等仍每次重挂载。
- `v-show="!isLoginTab"` 从 router-view 移到实际渲染的 `<component>` 上，**PR #2764 的「隐藏而非卸载」语义不变**（回归锁 `publish-tab-state-keepalive.test.js` 仍绿）。

### 4.2 Publish.vue

- `defineOptions({ name: 'Publish' })`：keep-alive 的 `include` 按组件名匹配，显式声明避免依赖文件名推断的 `__name`（构建配置变化时不稳）。
- **`applyHistoryVideoQuery()` 从只在 `onMounted` 改为 `onMounted` + `onActivated` 都调用**：keep-alive 缓存后，从结果页/历史「去发布」带 `?video_path=` **再次进入**时 `onMounted` 不再触发，预填必须挂 `onActivated`（每次激活都跑）；无 `video_path` query 时该函数自行早退，不会覆盖缓存中的既有草稿。非 keep-alive 上下文（内嵌主页实例 `mp-home-shell` 分支）`onActivated` 不触发，仍由 `onMounted` 覆盖。

## 5. 交互逻辑与显示项（修复后）

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 首页标签 ↔ 账号标签切换 | 已不丢（#2764） | 不丢 |
| 发布页 ↔ 其他页（左侧菜单/模块导航） | 表单清空 | 视频/标题/描述/封面/平台/账号/模式**全部保留** |
| 从结果页「去发布」带新 `?video_path=` 进入 | 预填新视频 | 预填新视频（onActivated 生效，不残留旧草稿） |
| 编辑草稿后离开、无 query 回来 | 清空 | 保留编辑内容 |

显示项与提示文字**无变化**（沿用既有 locales）。

## 6. 数据校验

本 PR 不新增/修改任何校验规则。发布前必填校验（视频模式必须有 `video_path`）、视频选择校验（500MB 拦截、路径不可解析清空）均不变；keep-alive 只保证「已填内容跨路由不丢」，不改变校验。

## 7. 验收标准（Given/When/Then）

1. Given 发布页已选视频+填标题，When 点左侧菜单到「账号」再点回「发布」，Then 视频与标题仍在（Publish 实例未被销毁，setup 只执行一次）。
2. Given 发布页被缓存，When 从结果页带 `?video_path=B` 进入发布，Then 表单视频为 B（onActivated 重新预填，不残留 A）。
3. Given 发布页被缓存且无 query，When 离开再回来，Then 不触发预填早退、保留用户既有草稿。
4. Given 普通浏览器/账号标签切换，When 来回，Then PR #2764 的隐藏语义不回退。
5. 回归：`publish-draft-keepalive.test.js`（2）+ `Publish.test.js` keep-alive 预填用例（1）全绿；两处反证（摘 keep-alive / 摘 onActivated）各自变红（已实测）。

## 8. 回归保护与反证（QM-5 ④⑤）

- **App 级**：`publish-draft-keepalive.test.js` 真挂载 App.vue + 双路由 + KeepAlive，`/publish → / → /publish` 来回断言 Publish 实例不被销毁、草稿保留。**反证**：把 App.vue 退回普通 `<router-view>`（去 keep-alive）→ `setupCalls` 变 2 → 红（已实测）。
- **组件级**：`Publish.test.js` 新增「keep-alive 重进入 query 预填」用例，缓存后带新 `?video_path=B` 回来断言预填为 B。**反证**：移除 `onActivated` 的 `applyHistoryVideoQuery()` → 停在旧值 A → 红（已实测）。
- **邻接**：`publish-tab-state-keepalive`（v-show）、`shell-mode-6a/6b`、`tab-independent-home`、`overlay-view-suspension`、`Publish.test.js` 全量（90）同批跑通（合计 130 passed）。

## 9. 测试逃逸链（为什么之前没测出来）

- 单元：`Publish.test.js` 直接挂组件、不经 App.vue 的 router-view，测不到「路由切换即重挂载」。
- App 级：`publish-tab-state-keepalive.test.js`（#2764）只覆盖 isLoginTab 的 v-show 通路，未覆盖 router 换组件。
- 既有 App 测试是源码契约，不测实例存活。
- 系统性漏洞：**测试覆盖漏洞**——缺少「发布页在路由切换中存活」的行为级锁。本 PR 以 keep-alive 测试补齐。

## 10. 遗留 / 边界

- 只缓存 `Publish` 一页；若后续其它页也有「跨路由保草稿」需求，按需扩 `include` 清单（注意每加一页都要评估其 query 预填/数据刷新是否需 onActivated 适配）。
- keep-alive 下 Publish 的 `onBeforeUnmount`（仅 `releaseAiCoverOverlay`）改由缓存驱逐时才触发；AI 封面浮层的挂起/释放由 `watch(showAiCoverDialog)` 驱动，正常路径不受影响。
