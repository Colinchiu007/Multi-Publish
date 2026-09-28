# PRD：发布页封面缩略图与放大预览

> **立项日期**：2026-09-28
> **状态**：已实现（本 PR）
> **关联**：`01-docs/PRD.md` §「视频上传区交互合同（2026-09-28）」的续篇；`01-docs/PRD-OVERLAY-VIEW-SUSPENSION-2026-09-23.md`（浮层互斥合同）
> **代码位置**：`apps/desktop/src/composables/useCoverPreview.js`、`apps/desktop/src/views/Publish.vue`、`apps/desktop/src/components/CoverCropDialog.vue`

---

## 1. 问题

一键发布页选择视频后，点【从视频提取封面】或【AI 生成封面】，界面只在 `el-upload` 的文本列表里显示一行文件名（`video-co...` + 一个对勾），**没有任何图像**。

用户因此无法确认：

- 从视频里取到的是哪一帧（是不是黑帧、片头广告、字幕条）；
- AI 生成出来的是什么内容；
- 裁剪后的构图对不对。

唯一办法是去文件管理器里打开临时目录，或者盲发。这属于「系统给了结果但不给证据」，用户只能反复重试。

**根因**：`el-upload` 未设 `list-type`，默认 `text` 形态只渲染文件名；而写入 `coverFileList` 时携带的 `url` 字段是**本地绝对路径**（如 `C:\Users\...\video-cover.jpg`），不是浏览器可加载的 URL——即使改成 `picture` 形态也是破图。渲染层 CSP（`apps/desktop/src/index.html:8`）的 `img-src` 不含 `file:`，本地路径无法直接作为图片源。

## 2. 目标与非目标

### 2.1 目标

1. 封面行内显示**缩略图**，让用户一眼确认取到的是哪张图。
2. 缩略图可**点击放大**查看细节。
3. 全部**封面来源**统一生效，不按入口分别实现（见 §4 的五个写入点）。
4. 预览失败要**如实告知**，不得静默变成「没有图」。

### 2.2 非目标（明确不做，附理由）

| 不做 | 理由 |
|---|---|
| 远程「封面图片链接」（`article.cover_url`）的实时预览 | 会为渲染一张第三方图片向任意用户输入的域名发起请求，等于给对方一个可追踪信标；且 `http://` 链接会被 CSP 拦成破图。要做需单独设计（失焦防抖 + 破图降级），不在本次范围。 |
| 缩略图降采样 / 磁盘缓存 | 实测成本可忽略（见 §9），引入原生图像依赖反而更贵。 |
| 主进程 `readImageAsDataUrl` 增加体积门禁 | 同上，实测不构成风险；且改 `electron/` 会连带 preload bundle 重建与打包门禁，爆炸半径远大于收益。 |
| 草稿箱列表、发布历史列表新增缩略图 | 那是列表页性能议题，与本需求（确认刚生成的封面）不同因。 |
| 支持 `.gif` / `.bmp` 封面预览 | 受既有 `cover:read-data` 白名单限制，见 §7.3。 |

## 3. 方案选型

| 方案 | 说明 | 结论 |
|---|---|---|
| A. `el-upload` 改 `list-type="picture"` + 把 `url` 换成可加载地址 | 依赖组件内置列表样式，缩略图尺寸/交互不受控，放大查看仍要另做 | ❌ |
| B. 渲染层自行拼 `file://` | CSP `img-src` 不含 `file:`，需放宽 CSP 才能显示，安全面扩大 | ❌ |
| C. 引入 `sharp` 在主进程生成小尺寸缩略图 | `sharp` 只由 `packages/shared-utils` 声明，**桌面工作区未声明**（实测 `apps/desktop/package.json` 无 `sharp`）。按 AGENTS.md「生产依赖闭包」属违规，且牵动打包与 QM-1 | ❌ |
| **D. 复用既有 `cover:read-data` IPC 取 dataURL，渲染层自建缩略图 + `UiModal` 放大** | 该通道已被 `CoverCropDialog` 用于完全相同的目地（本地路径 → `<img>`）；CSP 已允许 `data:`；零新增 IPC、零 CSP 改动、零新依赖 | ✅ **采用** |

**关键约束**：「本地路径 → 可渲染 URL」的信封剥离（`res.data.dataUrl || res.dataUrl`）此前只存在于 `CoverCropDialog.loadImage()` 里。若在新位置再抄一份，就落入 AGENTS.md 警告的「同一剥壳逻辑抄成多份必然漂移」。因此把它收敛为**唯一实现** `useCoverPreview.js`，并让 `CoverCropDialog` 改为复用它。

## 4. 功能逻辑

### 4.1 唯一真源：`article.cover_path`

缩略图**不挂在任何按钮的回调上**，而是挂在 `article.cover_path` 这个响应式字段上。因此下列五个写入点自动全部生效，无需逐个接线（这正是需求里「AI 生成封面也要一样处理」的落地方式）：

| # | 入口 | 代码位置 | 产出的 cover_path |
|---|---|---|---|
| 1 | 【从视频提取封面】 | `Publish.vue` `handleExtractVideoCover` | `os.tmpdir()/multi-publish-covers/*.jpg` |
| 2 | 【AI 生成封面】 | `Publish.vue` `handleGenerateAiCover` | `os.tmpdir()/multi-publish-cover-ai/*.png` |
| 3 | 【裁剪封面】确认后 | `Publish.vue` `onCoverCropSuccess` | `os.tmpdir()/multi-publish-crop/*.jpg` |
| 4 | 手动选择本地封面 | `Publish.vue` `handleCoverFileChange` | 用户选的任意路径 |
| 5 | 草稿导入 / 路由参数恢复 | `Publish.vue` 草稿恢复链 | 草稿里存的原路径 |

入口 5 决定了必须 `immediate: true`——否则打开草稿时看不到封面，与「确认取到哪张图」的诉求矛盾。

### 4.2 `useCoverPreview(pathGetter)` 契约

```
输入：pathGetter —— () => string，返回封面本地绝对路径
输出：{ dataUrl: Ref<string>, error: Ref<string>, loading: Ref<boolean>, reload: () => void }
```

行为规则（逐条可测）：

| 条件 | 结果 |
|---|---|
| 路径为空串 / 非字符串 | 不发起 IPC；`dataUrl=''`、`error=''`、`loading=false`（这是正常空态，不是错误） |
| 路径非空 | `loading=true` → 调 `readCoverData(path)` |
| 返回 `code === 0` 且能取到非空 dataUrl | `dataUrl=<该值>`、`error=''` |
| 返回 `code !== 0`，或 `code === 0` 但 dataUrl 缺失/空白 | `dataUrl=''`、`error=<服务端 message>`，无 message 时回落通用文案 |
| Promise reject（IPC 异常） | `dataUrl=''`、`error=<e.message>`，message 非字符串时回落通用文案 |
| `electronAPI.readCoverData` 不存在（浏览器打开 Vite） | 不抛错，`error` 置通用文案——与项目既有「IPC 静默 fallback」风险相对齐，这里选择**出声** |
| **路径在响应回来之前又被改了** | 旧响应必须**丢弃**，不得覆盖新路径的结果（见 §4.3） |

### 4.3 竞态守卫（必须实现，不是可选）

用户可以在一次会话里连续点「提取 → AI 生成 → 裁剪」，`cover_path` 会在前一个 `readCoverData` 还没返回时再次变化。若不加守卫，迟到的旧响应会把新封面显示成上一张——用户看到的缩略图与真正要发布的文件不一致，**比没有缩略图更糟**（它是错的证据）。

实现：每次 `load()` 递增一个自增序号并捕获本地值，写状态前比对序号，不等即整段丢弃（连 `loading=false` 也不写，避免把新一轮的加载态误清）。`reload()` 同样走该序号。

### 4.4 生命周期

- 组件卸载后迟到的响应不得写状态（序号守卫同时覆盖此情形）。
- 预览弹窗打开期间 `cover_path` 发生变化 → **关闭弹窗**，不显示与真源不符的旧图。

## 5. 显示项

### 5.1 缩略图（封面行内）

| 项 | 规格 |
|---|---|
| 位置 | **`el-upload` 的兄弟节点**，不得放在 `el-upload` 插槽内部。原因：单测里 `el-upload` 被 stub 成 `<div><slot/></div>`，放插槽内的东西对测试不可见；同时组件的文件列表也会把缩略图挤乱。 |
| 尺寸 | 144 × 81（16:9 基准框） |
| 填充 | `object-fit: cover`（横竖图都不变形，超出裁切） |
| 外观 | 1px 实线边框、6px 圆角、深色底衬托透明图 |
| 光标 | `cursor: zoom-in` |
| 悬停 | 右上角出现放大镜角标 |
| 可访问性 | `role="button"`、`tabindex="0"`、`aria-label` 取 locale、`Enter`/`Space` 可触发、`:focus-visible` 有描边 |
| 稳定标识 | `data-testid="cover-thumbnail"` |

### 5.2 加载态 / 失败态

| 态 | 显示 | 说明 |
|---|---|---|
| 加载中 | 同尺寸占位框 + 文案「封面加载中…」 | 不隐藏框，避免布局跳动 |
| 成功 | 图像 | — |
| 失败 / 格式不支持 / 文件已不存在 | 同尺寸占位框 + 文案「封面预览不可用」，`title` 属性挂具体原因供排障 | **`el-upload` 的文件名行继续保留**，信息不丢；发布链路不受影响（仍按原路径发布） |

失败态刻意保留占位框而不是整块消失：整块消失会让用户以为「封面没设置上」，从而重复点击生成——正是本次要消灭的困惑。

### 5.3 放大预览弹窗

| 项 | 规格 |
|---|---|
| 载体 | `UiModal`，`size="xl"`（800px），`close-on-esc` 显式开启 |
| 标题 | 「封面预览」（locale） |
| 图像 | `max-width: 100%`、`max-height: 70vh`、`object-fit: contain`，居中，深色底衬托 |
| 附加信息 | 文件名 + 原始像素尺寸（`naturalWidth × naturalHeight`，取不到则不显示该行） |
| 关闭途径 | 右上 × / 点击遮罩 / `Esc` |
| `data-testid` | `cover-preview-dialog`、`cover-preview-image` |
| 空态保护 | `dataUrl` 为空时不渲染 `<img>`，渲染失败提示 |

### 5.4 生效范围

**两个封面行都加**（用户确认的范围）：

- 视频发布形态：`Publish.vue` 的 `.video-cover-row`；
- 图文发布形态：`Publish.vue` 的图文封面 `el-upload` 之后。

两处共用**同一份** `useCoverPreview` 实例（同一字段只拉一次），并共用**同一个**放大弹窗节点。

## 6. 交互逻辑

```
封面路径发生任何变化（五个入口之一 / 草稿恢复）
    │
    ├─ 路径为空 ────────► 缩略图区不渲染（正常空态）
    │
    └─ 路径非空 ────────► loading 占位 ──► readCoverData(path)
                                             │
                              ┌──────────────┴──────────────┐
                           成功                            失败/无 dataUrl
                              │                              │
                        渲染缩略图                   占位框 +「封面预览不可用」
                              │                        （文件名行仍在）
                     单击 / Enter / Space
                              │
                   挂起内嵌视图(publish-cover-preview)
                              │
                     打开 UiModal 放大查看
                              │
              × / 遮罩 / Esc / 封面路径又变化
                              │
                   finally 释放内嵌视图挂起 → 关闭
```

## 7. 数据校验与安全

### 7.1 渲染层侧

- 只接受**非空字符串**路径才发起 IPC；其余一律按空态处理。
- 不信任 IPC 返回值：`dataUrl` 必须是非空字符串才写入 `<img src>`。
- **禁止**把返回值兜底成空对象——那会把「契约破坏」伪装成「没有封面」（AGENTS.md 同源纪律）。

### 7.2 敏感性与外发

预览全程在本机完成：主进程读本地文件 → base64 → 渲染层显示。**无任何网络出站**，封面内容不出机器。

### 7.3 既有主进程校验（本次未改，但影响可见行为，必须记录）

`apps/desktop/electron/services/cover-cropper.js` 的 `readImageAsDataUrl`：

- 文件必须存在，否则 `图片文件不存在`；
- 扩展名白名单仅 `.jpg .jpeg .png .webp`，其余 `不支持的图片格式: <ext>`。

而封面上传框是 `accept="image/*"`，**用户可选 `.gif`/`.bmp`**。后果：这类封面会显示「封面预览不可用」，但**发布照常**。这不是本次引入的缺陷（裁剪弹窗一直如此），但本次让它变得可见，因此写入本文档以免被当成新 Bug。

### 7.4 CSP

`img-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*` 已含 `data:`，**本次零 CSP 改动**。守卫测试 `apps/desktop/src/index.test.js` 必须保持通过。

### 7.5 浮层互斥合同（AGENTS.md MUST）

放大弹窗是应用级居中模态，而内嵌 `WebContentsView`（浏览器/登录标签）是压在渲染 DOM 之上的原生图层，CSS z-index 对其无效。因此必须经 `useEmbeddedViewSuspension` 挂起/恢复：

| owner | 归属浮层 | 本次 |
|---|---|---|
| `publish-cover-preview` | 新增的封面放大弹窗 | 新增 |
| `publish-cover-crop-dialog` | `CoverCropDialog`（同封面行的裁剪弹窗） | 补登记（既有漏项） |
| `publish-ai-cover-dialog` | 发布页 AI 生成封面浮层（`position: fixed; inset: 0`） | 补登记（既有漏项） |

口径：owner 唯一、suspend/release 成对、释放一律走 `finally`、不得复用他人 owner（否则 ref-count 会吞掉别人的释放）。三者在 `apps/desktop/src/overlay-view-suspension.test.js` 各登记一条接入断言。

### 7.5.1 home-shell 内嵌实例必须跳过挂起（本次实测发现并修复）

发布页可以运行在「+新标签」创建的**内嵌主页实例**里（`App.vue` 的 `isHomeShell` 分支渲染 `router-view`），而该实例**本身就是一张 `WebContentsView`**。

主进程任一时刻只让活动标签可见——实证：全仓 `setVisible(true)` 仅 `webview-manager/layout.js:160` 一处，且只作用于 `activeView`。因此内嵌实例里的应用级模态**不会**被别的标签视图盖住，挂起是不必要的；更糟的是 `suspendEmbeddedViewsForOverlay` → `_hideAllTabs()` 会遍历 `_tabViews` 无差别 `setVisible(false)`，**把承载弹窗的那张视图自己也藏掉** —— 用户表现为「点缩略图后内容区整块空白」，且弹窗因不可见而无法点击关闭。

该危害在 `App.vue` 的 `setShellMode` 路径早已被识别并守卫（`if (isHomeShell) return`，注释原文即「会让主进程隐藏包括它自己在内的全部视图」），但**挂起路径没有对应守卫**。`home-shell-preload.bundle.js:928` 确实暴露了 `suspendEmbeddedViews`（esbuild 把 `preload/index.js` 整体内联进 home-shell bundle），所以这条路径可达，不是理论风险。

修复落在 `useEmbeddedViewSuspension.js` 本身而非各调用点：新增 `isHomeShellRuntime()` 守卫，判据**按调用时刻**读取 `window.location.search`（不得在模块导入期冻结求值，否则真实导航后守卫失效）。放在 composable 里而非各浮层里，是为了让 `AccountCloudSyncDialog`（同为路由页内的居中模态、同样可从内嵌实例到达）的既有同类暴露一并收口 —— 该收口属本 composable 契约的修正，不是本需求的附带功能。

残留限制（如实记录）：登录视图与扫码视图不在 `_tabViews` 内，理论上可与内嵌实例并存；但二者活动时活动标签已不是主页实例，用户无法在其上点击封面缩略图，故不为其另加判据。

## 8. 提示文字（locale，zh/en 成对）

新增键位于 `publishPage` 块内、紧随 `coverCrop` 之后，保持 zh/en 行位对称（CI Gate 7 `check-locale-sync.js` 强制成对）：

| 键 | zh | en |
|---|---|---|
| `publishPage.coverPreview.title` | 封面预览 | Cover preview |
| `publishPage.coverPreview.hint` | 点击缩略图可放大查看 | Click the thumbnail to enlarge |
| `publishPage.coverPreview.ariaLabel` | 放大查看封面 | Enlarge cover preview |
| `publishPage.coverPreview.loading` | 封面加载中… | Loading cover… |
| `publishPage.coverPreview.unavailable` | 封面预览不可用 | Cover preview unavailable |

约定：渲染层测试断言 **i18n 键**而非 locale 字面量（AGENTS.md「门禁断言随实现迁移同步」），文案调整不得造成假红。

## 9. 性能（实测依据，不是估计）

自动加载会把「读文件 + base64 + IPC」从「用户主动打开裁剪弹窗时才发生」变成「封面路径一变就发生」，因此必须先量成本再决定是否加门禁。本机实测（`fs.readFileSync` + `toString('base64')`，即该链路的主要开销项）：

| 封面文件大小 | 读+编码耗时 | 产生的 dataURL 长度 |
|---|---|---|
| 0.3 MB | 0.9 ms | 0.40 MB |
| 2 MB | 1.9 ms | 2.67 MB |
| 8 MB | 6.7 ms | 10.67 MB |
| 20 MB | 25.6 ms | 26.67 MB |

结论：即便 20 MB 的病态封面也只有 ~26 ms，**不构成卡顿**，故不设体积门禁。此表是本 PR 决定「不改主进程」的证据来源；若未来改为批量缩略图（列表页），该结论不适用，需重新量。

## 10. 验收标准

1. 选视频 → 点【从视频提取封面】→ 封面行出现缩略图，内容为该视频的一帧。
2. 点【AI 生成封面】并确认 → 同一位置换成生成图的缩略图。
3. 点【裁剪封面】并确认 → 缩略图更新为裁剪结果。
4. 手动选择本地图片作为封面 → 出现缩略图。
5. 打开一个带封面的草稿 → 进入发布页即能看到缩略图（无需重新生成）。
6. 单击缩略图 → 弹出居中放大预览；`Esc`、点遮罩、点 × 三种方式均可关闭。
7. 缩略图获得焦点后按 `Enter` → 同样打开放大预览。
8. 连续快速点【提取】→【AI 生成】，缩略图最终显示的必须是**最后一次**操作的封面（不得被迟到响应倒灌）。
9. 删除封面 → 缩略图与放大弹窗一并消失。
10. 预览失败（文件被外部删除 / `.gif` 等不支持格式）→ 显示「封面预览不可用」占位，文件名行仍在，发布功能不受影响。
11. 图文发布形态的封面行同样满足 4、6、7、9、10。
12. 中英文界面下所有新增文案均为对应语言，无硬编码中文。
13. 打开放大弹窗时若存在可见的内嵌浏览器/登录标签，该标签被挂起；关闭后恢复。
14. 回归锁全绿：`useCoverPreview.test.js`、`Publish.test.js`、`CoverCropDialog.test.js`、`overlay-view-suspension.test.js`、`index.test.js`（CSP）。

## 11. 测试策略

| 层级 | 覆盖 | 说明 |
|---|---|---|
| 单元 | `apps/desktop/src/composables/useCoverPreview.test.js` | §4.2 全部规则逐条 + §4.3 竞态（用受控 promise 手动放行旧请求，断言其结果被丢弃）+ 导出完整性断言 |
| 组件 | `apps/desktop/src/views/Publish.test.js`（扩展） | 五个入口写入后缩略图 src 更新；点击开合；键盘触发；失败降级；删除清空；视频与图文两个封面行各自可达 |
| 组件 | `apps/desktop/src/components/CoverCropDialog.test.js`（回归） | 改为复用 composable 后行为不变（成功出图 / `code:1` 出错误态） |
| 结构 | `apps/desktop/src/overlay-view-suspension.test.js`（扩展） | 三个 owner 各一条接入断言，含「release 走 finally」 |
| 结构 | `apps/desktop/src/index.test.js`（回归） | CSP 未被放宽 |
| 视觉 | QM-4 | 发布页缩略图为动态内容（取决于用户选的封面），**不得**新增像素基线用例；仅跑既有核心视图像素回归确认无布局回归 |

E2E 既有契约不得破坏：`tests/e2e/one-click-publish-e2e.js` 与 `real-video-publish.js` 轮询 `[data-testid="cover-state"]` 的 `dataset.coverPath` —— 该隐藏节点必须原样保留。

## 12. 决策记录

| 决策 | 理由 | 放弃的替代 |
|---|---|---|
| 缩略图挂在 `cover_path` 的响应式上，而非各按钮回调 | 五个入口一次覆盖；新增入口自动生效，不会漏接线 | 在每个 handler 里各调一次预览加载（会漏入口 5，且新增入口必漏） |
| 抽 `useCoverPreview` 并让裁剪弹窗复用 | 剥信封逻辑必须只有一处 | 在 Publish.vue 再抄一份 `res?.data?.dataUrl \|\| res?.dataUrl` |
| 复用 `cover:read-data` 取 dataURL | 零新增 IPC、零 CSP 改动、零新依赖 | `file://`（被 CSP 拦）、`sharp` 缩略图（违反生产依赖闭包） |
| 不加体积门禁 | §9 实测 | 主进程 `maxBytes`（连带 preload bundle 重建 + QM-1 打包，收益为零） |
| 失败态保留占位框 + 文件名 | 消除「以为没设置上」的重复点击 | 失败即隐藏整块 |
| 一并补登记裁剪弹窗与 AI 封面浮层的挂起 | 同一封面流程的三个模态必须一致，否则新浮层守规矩、旁边的不守 | 只给自己新增的弹窗加 |
| 不预览远程 `cover_url` | 避免可追踪信标与 `http` 破图 | 直接 `<img :src="cover_url">` |

## 13. 外部评审处置记录（QM-6，2026-09-28）

前端模型（claude）给出 6 条发现（0 Critical / 2 Warning / 4 Info）。逐条判定，**不盲从也不沉默拒绝**：

| 编号 | 发现 | 判定 | 处置 |
|---|---|---|---|
| I3 | `CoverThumbnail.vue` 模板写了 `cover-thumbnail__img`，但 CSS 用元素选择器 `.cover-thumbnail img`，类名是死的 | **成立** | CSS 选择器改为 `.cover-thumbnail__img`，消除死类名 |
| I4 | 本 PRD §5.1 规定了 `data-cover-src="local"`，实现里没有 | **成立（规格/实现漂移，责任在本 PRD）** | 该属性无任何消费者，属投机规格 → **从 §5.1 删除**，而不是为实现补死代码 |
| W1 | `coverFileList[].url` 写的是本地绝对路径，看着像 URL 却永远渲染不出来；本 PRD §1 把它列为根因却未收敛 | **成立** | 三处赋值删除 `url` 字段（`el-upload` text 形态只用 `name`，全仓无其他消费者），并在保留的那一处写明「不写 url」的原因 |
| I1 | 裁剪弹窗与发布页各持一个 `useCoverPreview` 实例，同一 `cover_path` 会各发一次 IPC、各存一份 dataURL | **不采纳** | 评审建议的 prop/inject 注入会让 `CoverCropDialog` 失去独立可测性（其现有测试直接以 `imagePath` 挂载），换来的只是省一次实测 25 ms 的读盘。代价是弹窗打开期间多驻留一份 base64，属瞬时、有界。 |
| I2 | 三段 `suspend/release` 样板可提取为 `useOverlaySuspension(owner)` | **不采纳** | `overlay-view-suspension.test.js` 的结构锁是**按函数名逐块取源码**断言的（该文件自带注释：不用跨函数懒惰匹配，否则锁会在实现被拆开时假绿）。提取成工厂后，锁失去读者，只剩「某个 composable 里大概有这段」。三处显式是刻意的。 |
| W2 | `closeCoverPreview` 的 `finally` 里 `await` 可能向 `watch` 回调抛未处理拒绝 | **不成立**（评审自身已在复查后降级为 Info） | 复核 `releaseEmbeddedViewsForOverlay`：其内部 `try/catch` + `console.warn` 确实吞掉了 `invokePageManager` 的 reject，不会冒泡。不再加第二层 `try/catch` —— 那是对着已被兜住的路径建防御。 |

**方法论留痕**：I4 是本次最有价值的一条 —— 它不是代码缺陷，而是**我自己写的规格里有一项从未落地**。若按「实现优先」顺手补个 `data-cover-src`，就是给一个无消费者的属性写死代码；正确动作是删规格。判据：**该字段有没有真实读者**，而不是「规格写了就得实现」。
