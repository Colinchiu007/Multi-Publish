# PRD：浏览器导航区图标体系与标签页加载态收口

- 文档编号：PRD-BROWSER-NAV-ICONS-LOADING-2026-09-29
- 关联变更：`tab-nav-icons-loading`（分支）
- 日期：2026-09-29
- 类型：🎨 UI/UX 变更（图标体系）+ 🐛 Bug 修复（标签加载态）
- 影响面：`apps/desktop` 渲染层 2 个组件 + 1 个 store + 主进程 `webview-manager` 2 个模块 + `preload/page-manager.js` 注释；无数据库、无网络协议、无 IPC 通道新增

---

## 1. 背景与问题

### 1.1 用户报告的现象

应用顶部的「浏览器导航区」包含后退、前进、刷新、返回首页四个按钮，其下方是「标签栏」。用户反馈两件事：

1. **图标丑**：后退/前进/刷新三个按钮，以及标签上那个橙色转圈，看起来粗糙。
2. **转圈逻辑错**：标签内的网页**并没有在加载中**（页面内容早已完整渲染并可交互），但标签上仍然一直显示一个转圈的加载图标。用户并猜测「转圈的动态效果是不是因为这是一个 gif 动图」。

### 1.2 现场取证

截图现场为快手创作者中心 `https://cp.kuaishou.com/article/manage/video`：页面「视频管理」列表已完整渲染（含 1 个作品条目），但对应标签「快手 创作者中心」右侧仍在转圈。

### 1.3 对「gif」这一猜测的澄清（重要）

**不是 gif。** 全仓 `apps/desktop/src/assets` 与 `public` 下不存在任何 `.gif` 文件。该转圈是一个 **Unicode 文本字符 `⟳`（U+27F3）**，由 CSS `animation: spin 1s linear infinite` 旋转而成：

| 位置 | 原实现 | 性质 |
| --- | --- | --- |
| `TabBar.vue` 标签徽标 | `<span v-if="tab.loading" class="tab-spinner">⟳</span>` | 文本字符 + CSS 旋转 |
| `NavBar.vue` 导航栏右侧 | `<span v-if="loading" class="nav-loading">⟳</span>` | 文本字符 + CSS 旋转 |
| `NavBar.vue` 后退/前进/刷新 | 按钮文本内容直接是 `←` `→` `⟳` | **纯文本字符，根本不是图标** |

也就是说：导航三键之所以「丑」，是因为它们从来不是图标资源，而是依赖系统字体渲染的裸字符——字号、基线、粗细、颜色全部由字体决定，且在不同 Windows 字体回退下形态不稳定。

---

## 2. 根因（QM-5 第 1 步：第一性原因）

标签转圈卡死由**两个独立缺陷叠加**造成，任一单独存在都不足以产生截图中的现象。

### 2.1 缺陷 D1（渲染层断链，主因）

`apps/desktop/src/stores/tab.js` 中，主进程广播的加载事件订阅**只改写 `navigation`，从不改写 `tabs[]`**：

```js
// 修复前
api.on('tab-loading', (data) => {
  if (data?.tabId === activeTabId.value) navigation.value.loading = true
}),
api.on('tab-finished-loading', (data) => {
  if (data?.tabId === activeTabId.value) navigation.value.loading = false
}),
```

而 `TabBar.vue` 的徽标读的是 `tab.loading`（即 `tabs[]` 里那一条），**不是** `navigation.loading`。`tabs[].loading` 唯一的来源是 `_refreshTabs()` → `getAllTabs()` 的全量快照，而 `_refreshTabs()` 只在「建标签 / 关标签 / 切标签」时被调用。

**结论：标签转圈徽标自诞生起就从未被任何实时事件熄灭过。** 页面加载完成后主进程状态早已是 `false`，但渲染层那一条 `tabs[i].loading` 仍停在「上一次全量快照」抓到的 `true`，直到用户切换标签才偶然纠正。这是典型的「装饰性接线」——事件有、订阅有、徽标有，中间断了一环。

### 2.2 缺陷 D2（主进程事件不配对，潜伏）

`apps/desktop/electron/services/webview-manager/tab-lifecycle.js` 的 `_setupNav` 中，`loading` 的置位与收口挂在了**不配对**的两个事件上：

```js
// 修复前
view.webContents.on('did-start-loading', ...)  // state.loading = true
view.webContents.on('did-finish-load', ...)    // state.loading = false ← 收口点选错
```

按 Electron 官方类型声明（`node_modules/electron/electron.d.ts`，本机实测 7 处声明）：

| 事件 | d.ts 原文注释 | 触发条件 |
| --- | --- | --- |
| `did-start-loading` | "Corresponds to the points in time when **the spinner of the tab started spinning**." | 整页（含子框架）开始加载 |
| `did-stop-loading` | "Corresponds to the points in time when **the spinner of the tab stopped spinning**." | 整页停止加载，**含失败/中止路径** |
| `did-finish-load` | "the promise will resolve when the page has finished loading" | **仅主框架「成功」加载完成** |

`did-start-loading` / `did-stop-loading` 才是官方语义上成对的一组「标签转圈」事件。`did-finish-load` 在主框架导航**失败或被中止**（`did-fail-load`、`ERR_ABORTED`、重定向链终止于下载等）时**永不调发**，于是 `state.loading` 永久停在 `true`——即便 D1 修好、渲染层每次实时同步，也会从这个全量快照里读到假的 `true`。

修复前全仓 `did-stop-loading` 使用次数为 **0**（实测 grep），即该正确原语从未被使用过。

### 2.3 缺陷 D3（第三套 loading 口径，同源）

`tab.js` 的 `onNavigationChanged` 处理器把 `navigation.loading` **无条件硬编码为 `false`**，而主进程 `_broadcastNav` 的载荷里**根本没有 `loading` 字段**。这意味着任何一次 `did-navigate` / `did-navigate-in-page`（含 SPA 路由切换）都会把「正在加载」误熄灭。同一状态字段存在三套互不一致的写法（事件订阅 / 全量快照 / 导航广播猜测），是本缺陷族的结构性成因。

### 2.4 第一性引入点（git blame 实证）

| 证据 | 结论 |
| --- | --- |
| `git log -S "did-start-loading"` | 最早引入于 `941b17f1`（2026-08-10） |
| `git log -S "tab-spinner"` | 最早引入于 `941b17f1`（2026-08-10） |
| `git blame` `TabBar.vue:19` / `tab.js:154-163` / `NavBar.vue:13,79` | 全部指向 `941b17f1` |
| `git blame` `tab-lifecycle.js:303-320` | `069bb07d8`（2026-09-24，1735 行单体拆 10 模块的**纯重构**） |

即：**徽标、订阅、主进程收口三者在同一次提交 `941b17f1` 中诞生，而那次提交就没有把它们接通**。`069bb07d8` 只是把既有实现原样搬进新模块（重构前单体第 1406 行同样是 `did-finish-load` 收口），不构成本缺陷的引入点。该提交的对齐目标是「参考产品」的浏览器式标签栏——按门禁要求此处不写品牌名。

缺陷存续时长：2026-08-10 → 2026-09-29，约 **50 天**。

---

## 3. 逃逸链与系统性漏洞（QM-5 第 2、3 步）

### 3.1 Bug 逃逸链（逐层为什么没拦住）

| 层级 | 是否拦住 | 具体原因 |
| --- | --- | --- |
| 单元测试 — 渲染层 store | ❌ 测试场景缺失 | `tab.test.js` 有 10 处 `loading: false`，**全部是构造 mock 返回值时的夹具字段**，没有一条断言 `tab-loading` / `tab-finished-loading` 会改变 `tabs[].loading`。「事件 → 状态」这条映射从未被测。 |
| 单元测试 — 组件层 | ❌ 测试场景缺失 | `TabBar.test.js` 的两个标签夹具都是 `loading: false`，**从未构造 `loading: true`**，因此 `.tab-spinner` 分支一次都没有渲染过。正向路径都缺，遑论收口。 |
| 单元测试 — 主进程 | ❌ 测试质量不足 | `webview-manager.test.js` 触发 `did-finish-load` 只是为了驱动「凭证补注入」，断言的是注入行为，**没有一条断言 `state.loading` 的变化**；而且从不触发 `did-start-loading`，所以「start 之后没有 finish」这一致命组合在测试夹具里**不可表示**。把「回调被调用」当成了「行为正确」。 |
| 集成 / E2E | ❌ 测试场景缺失 | 无跨「主进程事件 → IPC → store → 组件」的链路用例。 |
| 视觉回归 | ❌ 结构性失明 | CI 实际执行的 `pixelTests` 注册表共 19 条，**无一条打开浏览器标签**（`grep nav-bar/tab-bar` 命中 0）；标签栏在像素基线里恒为「首页态、无转圈」。即便有，图标/徽标占整页面积 < 0.1%，远低于 `PIXEL_THRESHOLD` 的百分比天花板——像素门禁对图标回归本身失明。 |
| 代码审查 | ❌ 审查盲区 | AGENTS.md QM-2 必检项清单里没有「宿主事件必须成对收口」「状态订阅必须写回实际被渲染的那份状态」这两条。 |

### 3.2 系统性漏洞定位（四类分类）

1. **测试场景缺失**（类型 A）：「有事件订阅但没有断言事件改变了状态」这一整类从未进入测试场景脑暴模板。落点：`tab.test.js`、`TabBar.test.js`。
2. **测试质量不足**（类型 B）：把宿主事件回调当作**测试夹具的触发器**使用，只验证副作用链、不验证该回调自身语义。落点：`webview-manager.test.js`。
3. **流程缺失**（类型 C）：QM-2 代码审查必检项缺「宿主事件成对收口」条目。落点：`AGENTS.md`。
4. **审查手法缺失**（类型 C 补充）：同一状态字段被多处写入时，缺少「口径必须收敛到一处」的审查动作。本案同一 `loading` 有三套写法。

---

## 4. 解决方案

### 4.1 加载态状态机（功能逻辑）

主进程每个浏览器标签持有一份状态 `{url, title, loading, canGoBack, canGoForward, ...}`。`loading` 的完整状态机：

```
                    did-start-loading
   ┌────────────┐ ────────────────────► ┌────────────┐
   │ loading=   │                        │ loading=   │
   │  false     │ ◄───────────────────── │   true     │
   │ (idle)     │   did-stop-loading     │ (loading)  │
   └────────────┘   （成功/失败/中止      └────────────
        ▲            一律触发）               │
        │                                    │ render-process-gone
        │                                    ▼
        └──────────────────────────  就地收口 loading=false
                            （崩溃后不会再有任何加载事件）
```

**四条不可绕过的口径：**

1. **`loading` 的唯一收口点是 `did-stop-loading`**。`did-finish-load` **不得**再写 `state.loading`——它在失败路径上永不触发，用它收口必然卡死。
2. `did-finish-load` 保留与加载指示无关的两项职责：解除 `initialRedirectPhase`、调度 `_maybeScheduleAutoSave`。这两项**只在主框架成功加载时**才有意义，因此留在原事件上，不随收口点迁移。
3. **`render-process-gone` 必须就地收口**（仅在 `state.loading === true` 时广播，避免无意义的冗余写）。
4. 收口时同步刷新 `canGoBack` / `canGoForward`（与 `did-start-loading` 对称），并广播 `tab-finished-loading {tabId, url, loading:false}`。

**残留限制（如实声明，不掩盖）**：若站点存在永不结束的挂起子资源（长连接、永不 settle 的 iframe），`did-stop-loading` 不会到达，转圈会持续。这与 Chrome/Edge 的行为一致，属**如实反映**而非缺陷。**刻意不引入超时兜底**——超时后强行熄灭会让指示器在「真在加载」时说谎，那比「多转一会儿」更糟。

### 4.2 数据流与接线（流程）

```
主进程 webview-manager
  tab-lifecycle._setupNav
    ├─ did-start-loading  → state.loading=true  → broadcast 'tab-loading'        {tabId,url,loading:true}
    ├─ did-stop-loading   → state.loading=false → broadcast 'tab-finished-loading'{tabId,url,loading:false}
    └─ render-process-gone→ state.loading=false → broadcast 'tab-finished-loading'（仅当原为 true）
  event-bus._broadcastNav → broadcast 'navigation-changed' {tabId,url,title,canGoBack,canGoForward,loading,...}
                                        │
                          preload/page-manager.js（原样透传 payload.data，无字段投影）
                                        ▼
渲染层 stores/tab.js
  ├─ _applyLoading(data)          ← tab-loading / tab-finished-loading 共用出口
  │    ① _recordTabUpdate(data)   记入版本化 live-update（防过期快照复活）
  │    ② tabs[i].loading = data.loading        ← 驱动 TabBar 徽标（D1 的断点在此接上）
  │    ③ 若为活动标签：navigation.loading = …  ← 驱动 NavBar 转圈
  ├─ onNavigationChanged          navigation.loading 按广播值收口；**载荷缺席则保持现状**（D3）
  └─ _refreshTabs / _refreshNavigation  全量快照经 _applyNewerTabUpdate 叠加 live 值
```

`_broadcastNav` 新增 `loading` 字段属**向后兼容的载荷扩展**：preload 不做字段白名单投影（已核实 `onNavigationChanged` 为 `cb(payload?.data || payload)` 原样透传），渲染层对字段缺席按「保持现状」处理，因此新旧两侧可独立发布。

### 4.3 数据校验与边界（逐条）

| 输入 / 边界 | 校验口径 | 不校验的后果 |
| --- | --- | --- |
| `data.tabId` 缺失 | 直接 `return`，不改任何状态 | 无键写入会污染列表首条 |
| `data.loading` 不是 boolean（`undefined`/`null`/字符串） | 直接 `return`，**不得**用 `!!` 猜测 | `!!undefined === false` 会把「载荷破坏」当成「加载结束」，静默熄灭真在加载的转圈 |
| `tabId` 不在 `tabs[]` 中（标签刚被关闭） | `find` 返回 `undefined` 时跳过列表写入，仍允许更新 `navigation` | 抛错外溢成未处理拒绝 |
| 过期 `getAllTabs` 快照与实时事件竞态 | 走既有版本化 `_tabLiveUpdates` 覆盖保护：`update.version > requestVersion` 才生效 | 刷新窗口期内到达的 `loading:true` 被过期快照抹成 `false`，转圈在真加载中消失 |
| SPA 路由切换（`did-navigate-in-page`）期间仍在加载 | `navigation-changed` 现携带真实 `loading`；字段缺席则保持现状 | 原实现硬编码 `false`，路由一切转圈就灭 |
| home 虚拟标签 / 登录标签 | 二者各自的静态投影恒为 `loading: false`（`tab-query.js`），不参与本状态机 | — |
| 后台（非活动）标签加载 | **仍然点亮该标签徽标**，与浏览器行为一致；`navigation` 不受影响 | 用户切回时看不到「还在加载」的信息 |

### 4.4 显示项与交互逻辑

#### 4.4.1 导航三键

| 按钮 | 原实现 | 新实现 | 尺寸 | 禁用条件 | tooltip / aria-label | 点击 |
| --- | --- | --- | --- | --- | --- | --- |
| 后退 | 文本 `←` | `ArrowLeftIcon` | 16px | `!canGoBack` | 后退 | `go-back` |
| 前进 | 文本 `→` | `ArrowRightIcon` | 16px | `!canGoForward` | 前进 | `go-forward` |
| 刷新 | 文本 `⟳` | `ReloadIcon` | 16px | 无（`isHome` 时整颗按钮不渲染） | 刷新 | `reload` |
| 返回首页 | `HomeFilled`（既有） | **不变**（见 §7 残留） | — | 无 | 返回首页 | `go-home` |

行为不变量（本次仅换视觉，不得漂移）：`data-testid` 保持 `nav-back` / `nav-forward` / `nav-reload` / `nav-home`；禁用态仍由 `canGoBack`/`canGoForward` 驱动；`.nav-bar` 高度 40px 不变（主进程 `WebContentsView TOP=76px` 契约依赖）。

#### 4.4.2 加载指示器

| 位置 | 出现条件 | 形状 | 尺寸 | 颜色 | 悬停提示 | 无障碍 |
| --- | --- | --- | --- | --- | --- | --- |
| 标签徽标 `TabBar` | `tab.loading === true` | `SpinnerIcon`（开口圆环） | 12px | `var(--color-primary)` | `t('tabBar.loadingBadge')` | `role="img"` + `aria-label`；`data-testid="tab-loading-<tabId>"` |
| 导航栏 `NavBar` | `loading === true`（即活动标签在加载） | `SpinnerIcon` | 14px | `#6b7280`（沿用原值，见 §7） | 无（原实现亦无） | 外层 `span` 保留 `aria-label="加载中"` |

- 旋转：`animation: spin 1s linear infinite`，**保持不变**（1s 线性是浏览器惯例节奏，本次只换形状）。
- **`prefers-reduced-motion: reduce` 时停止旋转**（本次新增）。开口圆环本身仍可被辨认为加载指示，不丢失信息。
- 图标内部 `<svg>` 一律 `aria-hidden="true"`（装饰性），语义由外层容器承载，避免屏幕阅读器重复播报。
- 标签徽标改为 `role="img"` + 本地化 `aria-label`（原实现为 `aria-hidden="true"`，即加载态对辅助技术完全不可见）。这是可访问性净增，不属回归。

#### 4.4.3 提示文字（locale 全表）

新增键必须 zh/en 成对（CI Gate 7 `check-locale-sync.js` 拦截）：

| 键 | zh | en | 消费位置 |
| --- | --- | --- | --- |
| `tabBar.loadingBadge` | `页面加载中` | `Page loading` | `TabBar.vue` 徽标 `title` + `aria-label` |

未新增其它文案。`NavBar.vue` 的 `aria-label="加载中"` 与 `title="后退/前进/刷新"` 为**既有硬编码中文字符串**，本次未改动其值、也未新增，故不触发渲染层 CJK 基线扫描的新增判定（见 §7 残留）。

### 4.5 图标资源规范与第三方许可

**选型结论**：采用 **Lucide（ISC License）** 的图标几何，以**内联 SVG 组件**形态落地，不新增 npm 依赖。

决策依据（三条）：

1. 项目已装 `@element-plus/icons-vue`，但其箭头为块状实心描边，与「精致」目标不符；其 `Loading` 为实心螺旋，转圈观感一般。
2. 新增 `lucide-vue-next` 依赖要改 `pnpm-lock.yaml`，并触发 AGENTS.md「生产依赖闭包」门禁（`npm pack --dry-run` + 隔离 runner 加载真实入口）；本任务只需 4 个图标，收益/代价不划算。
3. 内联 SVG 可完全掌控 `stroke-width` 与尺寸，且天然可被结构锁测试覆盖。

**统一规范（由 `nav-icons.test.js` 逐条锁定）**：

| 属性 | 强制值 | 理由 |
| --- | --- | --- |
| `viewBox` | `0 0 24 24` | 同一网格，混排不跳字 |
| `fill` | `none` | 线性图标，禁止填充 |
| `stroke` | `currentColor` | 颜色由 CSS 决定，禁止硬编码色值 |
| `stroke-width` | `2` | Lucide 标准描边 |
| `stroke-linecap` / `stroke-linejoin` | `round` | 圆头，「精致」目标的具体化 |
| `aria-hidden` | `true` | 装饰性；语义由外层容器承担 |
| `size` prop | `Number\|String`，默认 `16` | 同时驱动 `width`/`height` |
| path 集合 | 四个图标**互不相同** | 防复制粘贴出同一个形状 |

**新增文件**：`apps/desktop/src/components/icons/{ArrowLeftIcon,ArrowRightIcon,ReloadIcon,SpinnerIcon}.vue`。每个文件头部注释声明来源与许可证；`apps/desktop/THIRD-PARTY-NOTICES.md` 增补 Lucide 章节。

**Lucide 归属信息**：项目 https://lucide.dev ，许可证 ISC（permissive，要求保留版权声明）。

---

## 5. 验收标准（可验证）

| # | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | 页面加载完成后标签转圈**必须熄灭**，无需切换标签 | `tab.test.js`「加载结束事件必须熄灭对应标签徽标」 |
| AC-2 | 主框架导航**失败/中止**（无 `did-finish-load`）后 `state.loading` 必须为 `false`，且 `getAllTabs` 不再回报 `true` | `webview-manager.test.js` 两条行为用例 |
| AC-3 | 渲染进程崩溃后不得留下永久转圈的标签 | `webview-manager.test.js`「渲染进程崩溃后…」 |
| AC-4 | 后台标签加载只点亮该标签徽标，不影响导航栏 | `tab.test.js`「后台标签加载…」 |
| AC-5 | 刷新窗口期内的实时 `loading` 不被过期快照覆盖 | `tab.test.js`「列表刷新期间收到的加载事件…」 |
| AC-6 | 导航三键渲染为 `<svg>` 且按钮文本为空；禁用态与点击语义不变 | `NavBar.test.js` 三条 |
| AC-7 | 四个图标符合统一描边规范、path 互不相同、声明来源与许可证 | `nav-icons.test.js` |
| AC-8 | `prefers-reduced-motion: reduce` 下两处转圈停止旋转 | `TabBar.test.js` / `NavBar.test.js` 结构锁 |
| AC-9 | 打包产物含渲染层 `dist/index.html` 与新图标组件，启动 8 秒 stderr 无致命错误 | QM-1（见 §6） |

---

## 6. 回归保护与反证矩阵（QM-5 第 4 步）

### 6.1 测试落点

| 被测文件 | 测试文件 | 模式 |
| --- | --- | --- |
| `webview-manager/tab-lifecycle.js` | `apps/desktop/electron/services/webview-manager.test.js`（新增 describe「WebviewManager 标签转圈收口」6 例） | 单元 + 结构锁 |
| `webview-manager/event-bus.js` | 同上（结构锁） | 结构锁 |
| `src/stores/tab.js` | `apps/desktop/src/stores/tab.test.js`（新增 describe「useTabStore 标签加载态收口」6 例） | 单元 |
| `src/components/TabBar.vue` | `apps/desktop/src/components/TabBar.test.js`（新增 describe 4 例） | 组件 + 结构锁 |
| `src/components/NavBar.vue` | `apps/desktop/src/components/NavBar.test.js`（新增 describe 5 例） | 组件 + 结构锁 |
| `src/components/icons/*.vue` | `apps/desktop/src/components/icons/nav-icons.test.js`（新建） | 组件 + 结构锁 |

全部落在 vitest 已按 workspace 收集的目录内（`apps/desktop/src`、`apps/desktop/electron`），无需手工接进 CI workflow；由 `scripts/check-unwired-tests.js` 的 `WORKSPACE_COVERED` 域覆盖。

### 6.2 反证矩阵（每条锁都实跑过，非推定）

「防再犯锁」必须做一次「把锁改成 no-op 必须立刻变红」的变异。六条变异全部本机实跑：

| 反证 | 变异内容 | 期望 | **实测** |
| --- | --- | --- | --- |
| CP-1 | `did-stop-loading` 处理器不再注册 | 行为用例 + 结构锁红 | 红 4（83 中） |
| CP-2 | 把 `state.loading = false` 写回 `did-finish-load` | **只有**结构锁红 | 红 1（83 中） |
| CP-3 | `_broadcastNav` 不再携带 `loading` | 结构锁红 | 红 1（83 中） |
| CP-4 | 加载事件不写回 `tabs[]`（退回 D1 断链） | 3 条行为用例红 | 红 3（22 中） |
| CP-5 | 去掉过期快照的 live loading 保护 | 竞态用例红 | 红 1（22 中） |
| CP-6 | `TabBar` 退回裸字形 `⟳` | 「必须为 SVG」+ 字形结构锁红 | 红 2（11 中） |

**CP-2 的第一次尝试是失败的，且这次失败本身是本轮最有价值的产出**：初版结构锁用 `src.indexOf("on('did-finish-load'")` 定位，而 `tab-lifecycle.js` 里 `did-finish-load` **注册了两次**（登录补注入路径 + `_setupNav`），`indexOf` 取到第一个，切片落在错误的处理器上，于是 `not.toMatch(/state\.loading\s*=/)` 恒真——变异报「0 红」，暴露锁是装饰性的。修正口径：先按 `_setupNav (tabId, view)` 定域，再断言切片确实含 `_maybeScheduleAutoSave`（**锚点未命中不得退化成 `not.toMatch` 恒过**），最后才做负向断言。

---

## 7. 已知残留（明确不在本次范围，逐条留证据）

| # | 残留 | 为什么不顺手做 |
| --- | --- | --- |
| R-1 | 「返回首页」仍是 `HomeFilled`（Element Plus 实心），与三颗 Lucide 线性图标不同套 | 用户在范围确认时明确**未勾选**「地址栏复制/搜索与首页图标」。现状是「三颗线 + 一颗实心」，视觉上仍存不齐。后续若统一，需一并处理 `Search`/`CopyDocument`/`Check` 三颗，并重跑视觉基线。 |
| R-2 | `NavBar.vue` 的 `.nav-btn` / `.nav-loading` 仍用硬编码灰 `#6b7280`/`#9ca3af`/`#374151`，未走设计 token | 属既有技术债，且 `TabBar.test.js` 已有「去硬编码灰」的结构锁只覆盖 TabBar 未覆盖 NavBar。只迁一处会让两栏口径更不一致；应连同结构锁一起迁，独立成一次变更。 |
| R-3 | `NavBar.vue` 的 `title="后退"` 等与 `aria-label="加载中"` 是硬编码中文，未进 locales | 本次未新增、未改动这些字符串的值。迁移属 i18n 收口专项。 |
| R-4 | 视觉门禁对本次改动**结构性失明**：`pixelTests` 19 条无一打开浏览器标签，且图标占页面积 < 0.1% | 要真正覆盖需新增「浏览器标签 + 加载中」像素用例，且基线只能取自 CI 产物（AGENTS.md QM-4 规则 7）。已登记为后续项，本次不以「视觉套件绿」冒充「图标改动被视觉覆盖」。 |
| R-5 | 挂起子资源永不 settle 的站点仍会持续转圈（§4.1 残留限制） | 与浏览器行为一致；加超时会让指示器说谎。 |

---

## 8. 变更文件清单

**运行时代码（9）**

- `apps/desktop/electron/services/webview-manager/tab-lifecycle.js` — `did-stop-loading` 收口 + `render-process-gone`
- `apps/desktop/electron/services/webview-manager/event-bus.js` — `_broadcastNav` 携带 `loading`
- `apps/desktop/electron/preload/page-manager.js` — JSDoc 载荷契约同步（无逻辑改动）
- `apps/desktop/src/stores/tab.js` — `_applyLoading` / live loading 纳入版本化覆盖保护 / 导航广播按值收口
- `apps/desktop/src/components/NavBar.vue` — 三键 + 导航转圈换图标、reduced-motion
- `apps/desktop/src/components/TabBar.vue` — 标签徽标换图标、`role="img"` + 本地化提示、reduced-motion
- `apps/desktop/src/components/icons/ArrowLeftIcon.vue`（新）
- `apps/desktop/src/components/icons/ArrowRightIcon.vue`（新）
- `apps/desktop/src/components/icons/ReloadIcon.vue`（新）
- `apps/desktop/src/components/icons/SpinnerIcon.vue`（新）

**测试（5）**

- `apps/desktop/src/stores/tab.test.js`、`apps/desktop/src/components/TabBar.test.js`、`apps/desktop/src/components/NavBar.test.js`、`apps/desktop/electron/services/webview-manager.test.js`、`apps/desktop/src/components/icons/nav-icons.test.js`（新）

**文案（2）**

- `apps/desktop/src/locales/zh.js`、`en.js` — 成对新增 `tabBar.loadingBadge`

**文档（3）**

- 本文件
- `apps/desktop/THIRD-PARTY-NOTICES.md` — Lucide ISC 章节
- `CHANGELOG.md`、`01-docs/learnings.md`、`.quality-gates.md`、`AGENTS.md`（QM-2 增补条目）
