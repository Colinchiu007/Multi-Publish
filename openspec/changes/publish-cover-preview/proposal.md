## Why

一键发布页选择视频后点【从视频提取封面】或【AI 生成封面】，界面只在 `el-upload` 的文本列表里留一行文件名（`video-co...` + 对勾），**没有任何图像**。用户无法确认取到的是哪一帧（黑帧 / 片头 / 字幕条）、AI 生成的是什么、裁剪构图对不对，只能盲发，或另开文件管理器去临时目录翻图。

根因是双层的：

1. `el-upload` 未设 `list-type`，默认 `text` 形态只渲染文件名；
2. 写入 `coverFileList` 的 `url` 字段是**本地绝对路径**而不是可加载 URL —— 渲染层 CSP（`apps/desktop/src/index.html:8`）的 `img-src` 不含 `file:`，所以即使改成 `picture` 形态也是破图。

用户诉求（原话）：「点击了【从视频提取封面】后，显示了提取的封面图片文件，但是没有缩略图，不方便确认。应该显示缩略图，同时可以点击后放大查看。」以及补充：「点击【AI 生成封面】后的处理也一样，也要显示缩略图。」

## What Changes

- **预览挂在 `article.cover_path` 上，而不是挂在各按钮回调上。** 封面有五个写入口（提取 / AI 生成 / 裁剪 / 手动选择 / 草稿恢复），挂在字段上一次覆盖全部；挂在回调上必然漏掉「草稿恢复」，且以后每加一个入口就再漏一次 —— 漏掉的那次不会报错。
- **新增 `apps/desktop/src/composables/useCoverPreview.js`**：把「本地绝对路径 → dataURL」的剥信封（`res.data.dataUrl || res.dataUrl`）收敛为**唯一实现**，并带自增序号**竞态守卫**（迟到的旧响应必须整段丢弃）。
- **`CoverCropDialog.vue` 改为复用该 composable**，删除其内部那份重复的剥离实现；命令式 `loadImage()` 由「路径 getter 带上 `visible`」等价替代。
- **新增 `apps/desktop/src/components/CoverThumbnail.vue`**：144×81 缩略图，三态互斥（加载中 / 有图 / 读取失败），`role=button` + `tabindex=0` + Enter/Space 可达。
- **封面放大预览**：`UiModal`（`size="xl"` + `close-on-esc`）+ 原生 `<img>`，显示文件名与原始像素尺寸；预览打开期间换封面必须收起弹窗。
- **视频与图文两个封面行都接入**，共用同一份 composable 实例与同一个弹窗节点。
- **浮层互斥合同补登记三个 owner**：`publish-cover-preview`（新增）、`publish-cover-crop-dialog` 与 `publish-ai-cover-dialog`（后两者是同一封面流程的**既有漏项**，一并补上）。

### 明确不做（附理由）

- **不加主进程 `cover:read-data` 体积门禁**：实测 0.3 / 2 / 8 / 20 MB 封面的 `readFileSync`+`base64` = 0.9 / 1.9 / 6.7 / 25.6 ms，不构成卡顿；而改 `electron/` 会连带 preload bundle 重建 + QM-1 打包 + IPC 契约测试，爆炸半径大于收益。
- **不引入 `sharp` 生成小尺寸缩略图**：`sharp` 只由 `packages/shared-utils` 声明，桌面工作区未声明，违反「生产依赖闭包」。
- **不预览远程 `cover_url`**：会为渲染一张第三方图向任意用户输入的域名发请求（可追踪信标），且 `http://` 被 CSP 拦成破图。
- **零新增 IPC、零 CSP 改动、零新依赖。**

## Impact

- 运行时代码（全部在渲染层）：`apps/desktop/src/composables/useCoverPreview.js`（新增）、`apps/desktop/src/components/CoverThumbnail.vue`（新增）、`apps/desktop/src/views/Publish.vue`、`apps/desktop/src/components/CoverCropDialog.vue`、`apps/desktop/src/locales/{zh,en}.js`。
- 测试：新增 `src/composables/useCoverPreview.test.js`（17 例）；`src/views/Publish.test.js` 新增「封面缩略图与放大预览」11 例并在两处 `electronAPI` 夹具补 `readCoverData` / `pageManager`、在 stubs 补 `teleport`；`src/overlay-view-suspension.test.js` 新增三 owner 结构锁；`CoverCropDialog.test.js` 作为复用后回归。
- 文档：`01-docs/PRD-PUBLISH-COVER-PREVIEW-2026-09-28.md`（新增）、`01-docs/PRD.md`、`CHANGELOG.md`、`01-docs/learnings.md`、`.quality-gates.md`。
- 不涉及：`apps/desktop/electron/`、`packages/rpa-engine/`、IPC 合同、安全 / 鉴权、持久化、状态机。

## Capabilities

### New Capabilities
- `publish-cover-preview`: 发布页封面的缩略图与放大预览契约（唯一路径解析实现、五入口统一触发、竞态丢弃、三态显示与降级、浮层互斥 owner、明确不做项）。
