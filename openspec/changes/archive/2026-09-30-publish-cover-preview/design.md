# Design — publish-cover-preview

## 上下文

发布页封面此前只有文件名可见。要显示图像，必须先解决「渲染层拿不到本地文件」这一约束：CSP `img-src` 不含 `file:`，而封面路径是本地绝对路径。仓库里已有 `cover:read-data`（`electron/ipc-handlers/publish.js` → `cover-cropper.readImageAsDataUrl`）把本地图片转成 dataURL，且 `CoverCropDialog` 已在用它。

## 方案对比

| 方案 | 说明 | 结论 |
|---|---|---|
| A. `el-upload` 改 `list-type="picture"` | 依赖组件内置列表样式，缩略图尺寸与交互不受控，放大查看仍要另做；且 `url` 字段是本地路径，改了形态照样破图 | ❌ |
| B. 渲染层拼 `file://` | 需放宽 CSP 才能显示，安全面扩大（`file:` 一旦放开，任何注入的 img src 都能读本机文件） | ❌ |
| C. 主进程用 `sharp` 生成小尺寸缩略图 | `sharp` 只由 `packages/shared-utils` 声明，`apps/desktop/package.json` 未声明，违反 AGENTS.md「生产依赖闭包」；且引入原生二进制的打包/平台矩阵风险 | ❌ |
| **D. 复用 `cover:read-data` 取 dataURL + 渲染层自建缩略图与 `UiModal` 放大** | 零新增 IPC、零 CSP 改动、零新依赖；与裁剪弹窗同源，已被生产验证 | ✅ **采用** |

## 关键决策

### 1. 挂在字段上，而不是挂在按钮上

封面路径有五个写入口。挂在按钮回调上会有两类失败：当下漏掉「草稿恢复」（它不经过任何按钮），以及将来新增入口时静默漏接。挂在 `article.cover_path` 的 `immediate` 监听上一次覆盖，且新入口自动生效。

推论：预览的加载时机由字段变化决定，因此必须处理「前一次还在途、后一次已开始」——见决策 3。

### 2. 剥信封只允许一处实现

`res.data.dataUrl || res.dataUrl` 这段剥离原先在 `CoverCropDialog.loadImage()` 里。若在 `Publish.vue` 再抄一份，两份会随时间漂移（AGENTS.md 记录过同类事故：漂移表现为「契约破坏被误判成空结果」）。因此抽出 `useCoverPreview` 作为唯一实现，并让裁剪弹窗反向复用它。

代价：裁剪弹窗从命令式 `loadImage()` 变为响应式。用「路径 getter 带上 `visible`」保持「仅弹窗打开时才读盘」的既有语义 —— 关闭时 getter 返回空串，composable 走空态不发 IPC，等价于原来的 `if (props.visible)` 守卫。副作用是关闭时清空 `previewUrl`，反而消除了重开瞬间的旧图闪现。

### 3. 竞态守卫是正确性要求，不是优化

用户可连续点「提取 → AI 生成 → 裁剪」。若迟到的旧响应写回状态，缩略图会显示**上一张**封面 —— 用户据此确认的是一张即将被发布的错误图像。这比没有缩略图更糟，因为它提供的是错误证据。

实现：模块内自增 `requestToken`，每次 `load()` 领取本地 `token`，任何写状态前比对 `token === requestToken`；不等则整段丢弃（含 `loading` 的复位，否则会误清新请求的加载态）。`onScopeDispose` 递增 token 以作废在途请求，兼作卸载保护。

### 4. 用实测否决了自己提的防御性门禁

设计初期判断「自动加载会把读盘+base64 从用户主动操作变成每次字段变化都做，可能卡顿」，拟给 `cover:read-data` 加 `maxBytes`。实测：

| 封面大小 | `readFileSync` + `base64` | dataURL 长度 |
|---|---|---|
| 0.3 MB | 0.9 ms | 0.40 MB |
| 2 MB | 1.9 ms | 2.67 MB |
| 8 MB | 6.7 ms | 10.67 MB |
| 20 MB | 25.6 ms | 26.67 MB |

风险不成立。而实施该门禁需要改 `electron/` + preload 签名 + 重建 bundle + QM-1 打包 + IPC 契约测试。**爆炸半径大于收益的防御就是负债**，故撤销。数字保留在 PRD §9，避免下一个人重新猜。

### 5. 浮层互斥按功能流程划范围

AGENTS.md 要求应用级模态挂起内嵌 `WebContentsView`。本次只新增一个弹窗，但同一条封面流程里的裁剪弹窗与 AI 封面浮层一直没有挂起。只补自己那条会得到「新浮层守规矩、旁边的不守」的分裂状态，且同一个「弹窗被原生图层盖住」的 Bug 原地残留。因此三个 owner 一并登记，并在 PR 说明里把后两者明确标注为**补登记的既有漏项**，不与新功能混为「顺手改」。

### 6. 布局：不加包裹层

`.cohere-form-item` 是 `flex-direction: column` + `align-items: stretch`，`el-upload` 因此占满宽。为并排放缩略图而套一层行向 `display:flex` 容器，会让 `el-upload` 变成行向 flex item（`flex: 0 1 auto`）→ 宽度按内容 → `publish-form.png` 基线出现与本功能无关的位移。改为把缩略图作为列内兄弟节点插入（其 `width` 显式给定时不受 stretch 影响）。

同时，缩略图必须是 `el-upload` 的兄弟而非插槽内容：`Publish.test.js` 把 `el-upload` stub 成 `<div><slot/></div>`，插槽内的东西对单测不可见。

## 已知限制（继承自既有实现）

`readImageAsDataUrl` 扩展名白名单只有 `.jpg/.jpeg/.png/.webp`，而封面框 `accept="image/*"`。故 `.gif`/`.bmp` 封面会显示「封面预览不可用」但发布照常。裁剪弹窗一直如此，本次让它对用户可见，并在 PRD §7.3 记录，以免被当成新缺陷。

## 未取得的证据

真机 Electron 窗口目视验证未做：本机另一会话已占用桌面应用单例锁与 dev 端口，再起实例有顶掉现有窗口的风险。单测与结构锁覆盖接线与语义，实际观感需一次桌面验收确认。
