# publish-cover-preview (delta: publish-cover-preview)

## ADDED Requirements

### Requirement: 封面预览的唯一真源是 cover_path

发布页的封面缩略图与放大预览 SHALL 由 `article.cover_path` 单一字段驱动，而不得挂在任何按钮的成功回调上。封面的五个写入口（从视频提取、AI 生成、裁剪确认、手动选择本地文件、草稿恢复）SHALL 因此自动生效，无需逐个接线。

驱动 SHALL 为 `immediate` 的响应式监听，使草稿恢复而来的封面在进入页面时即可见。

#### Scenario: 提取封面后立即可见

- **WHEN** 用户点【从视频提取封面】且主进程返回有效封面路径
- **THEN** 封面行出现该封面的缩略图，无需用户额外操作

#### Scenario: AI 生成封面后同一位置更新

- **WHEN** 用户点【AI 生成封面】并成功
- **THEN** 缩略图替换为生成结果，与提取路径走同一实现

#### Scenario: 草稿恢复的封面

- **WHEN** 用户从草稿箱打开一个已保存封面的草稿
- **THEN** 发布页渲染时即显示该封面缩略图，不要求用户重新生成

#### Scenario: 空封面不产生请求

- **WHEN** `article.cover_path` 为空串或非字符串
- **THEN** 不发起任何 IPC，且不显示缩略图与失败提示（空态不是错误）

### Requirement: 本地路径到可渲染地址的解析只允许一处实现

渲染层 CSP 的 `img-src` 不含 `file:`，本地绝对路径 SHALL NOT 直接作为 `<img src>`。解析 SHALL 统一经 `apps/desktop/src/composables/useCoverPreview.js`，该模块是 `cover:read-data` 响应信封剥离（`res.data.dataUrl || res.dataUrl`）的唯一实现，`CoverCropDialog` 亦 SHALL 复用之。

该模块 SHALL NOT 引入新的 IPC 通道、SHALL NOT 放宽 CSP、SHALL NOT 新增第三方依赖。

#### Scenario: 两种响应形状均可解析

- **WHEN** IPC 返回 `{code:0, data:{dataUrl}}` 或 `{code:0, dataUrl}`
- **THEN** 两者均被剥出可用地址，行为一致

#### Scenario: 禁止宿主环境外发

- **WHEN** 预览任意本地封面
- **THEN** 全过程不产生任何网络出站请求

### Requirement: 迟到的旧响应必须被丢弃

用户可在前一次解析尚未返回时再次改变封面路径。实现 SHALL 为每次解析分配递增序号，并在写入状态前比对；序号不匹配时 SHALL 整段丢弃该响应，包括其成功结果、失败结果与加载标志的复位。组件作用域销毁 SHALL 作废所有在途请求。

#### Scenario: 连续生成时以最后一次为准

- **WHEN** 先请求封面 A 的解析、随即改为封面 B，且 B 先返回、A 后返回
- **THEN** 缩略图保持显示 B，A 的结果被丢弃

#### Scenario: 迟到的失败不得污染成功结果

- **WHEN** 新封面已解析成功，而旧封面的解析随后以失败返回
- **THEN** 缩略图仍显示新封面，且不出现失败提示

#### Scenario: 卸载后不写状态

- **WHEN** 解析请求在途时宿主组件被卸载，随后响应返回
- **THEN** 不写入任何状态

### Requirement: 缩略图三态与失败降级

缩略图 SHALL 呈现互斥的三态：加载中、有图、读取失败。读取失败 SHALL 保留同尺寸占位框并展示「封面预览不可用」，具体原因 SHALL 挂在 `title` 上；SHALL NOT 整块消失。`el-upload` 的文件名列表 SHALL 继续保留，且发布链路 SHALL 不受预览失败影响。

缩略图 SHALL 是 `el-upload` 的兄弟节点而非其插槽内容。图文发布形态的封面行 SHALL NOT 为并排显示而新增 flex 包裹层（列向 flex 下包裹会使上传控件从占满宽退化为内容宽，造成与功能无关的视觉基线位移）。

#### Scenario: 不支持的格式如实告知但不阻断发布

- **WHEN** 用户选择的封面扩展名不在主进程白名单内（如 `.gif`）
- **THEN** 显示「封面预览不可用」且 `title` 含具体原因，封面路径仍保留、发布照常

#### Scenario: 删除封面

- **WHEN** 用户移除已选封面
- **THEN** 缩略图与打开中的放大弹窗一并消失

### Requirement: 点击放大预览与键盘可达

缩略图 SHALL 可点击与可聚焦，`role` SHALL 为 `button` 且 `tabindex` 为 `0`，`Enter` 与 `Space` SHALL 触发放大。放大 SHALL 使用 `UiModal`（`size="xl"`），SHALL 支持 `Esc`、点击遮罩与关闭按钮三种关闭途径，并 SHALL 展示文件名与原始像素尺寸。放大弹窗打开期间封面路径发生变化 SHALL 收起弹窗，不得显示与真源不符的旧图。

#### Scenario: 键盘打开

- **WHEN** 缩略图获得焦点后按下 Enter
- **THEN** 打开放大预览弹窗

#### Scenario: 预览中被替换

- **WHEN** 放大弹窗打开时 `article.cover_path` 被改写
- **THEN** 弹窗收起，且不残留浮层挂起状态

### Requirement: 封面流程的模态浮层必须挂起内嵌视图

内嵌 `WebContentsView` 是压在渲染 DOM 之上的原生图层，CSS z-index 对其无效。发布页封面流程中的每个应用级模态 SHALL 各持唯一 owner 经 `useEmbeddedViewSuspension` 挂起与恢复：`publish-cover-preview`（归 `CoverPreviewDialog.vue`）、`publish-cover-crop-dialog`（归 `CoverCropDialog.vue`）、`publish-ai-cover-dialog`（归 `Publish.vue`）。owner SHALL NOT 以字面量塞进调用点（必须经命名常量）。释放 SHALL 被**穷尽保证**，成立形态按实现方式二选一：浮层由 `visible` 状态驱动时，`watch(visible)` 的开合两分支 SHALL 分别挂起与释放，且组件卸载 SHALL 兜底释放（覆盖父组件直接 `v-if` 掉本组件、`visible` 不经过 `false` 的路径）；释放在函数体内发生且其后还有语句时，SHALL 走 `finally`。

守卫 SHALL 落在 `useEmbeddedViewSuspension` 本身而非各浮层调用点：主进程任一时刻只让活动标签视图可见，因此内嵌主页实例内的模态不会被别的视图盖住，而「隐藏全部视图」反而会隐藏它自己。

#### Scenario: 打开即挂起、关闭即释放

- **WHEN** 打开放大预览，随后关闭
- **THEN** 以内核 owner 各发起一次挂起与释放，成对且不多发

#### Scenario: 关闭路径抛错不得残留计数

- **WHEN** 关闭动作自身抛出异常
- **THEN** 挂起仍被释放

#### Scenario: 内嵌主页实例必须跳过挂起

- **WHEN** 浮层运行于「+新标签」创建的内嵌主页实例（其本身即为一张 `WebContentsView`）
- **THEN** 挂起与释放均直接 no-op，不发起 IPC —— 否则主进程 `_hideAllTabs()` 会连承载该模态的视图一起隐藏，内容区整块空白且弹窗无法关闭

#### Scenario: 壳态判据不得在模块导入期冻结

- **WHEN** 同一已导入模块的上下文从主窗口切换为内嵌主页实例
- **THEN** 后续挂起调用立即停止发起 IPC（判据按调用时刻读取）

### Requirement: 新增文案必须 zh/en 成对且无死键

新增用户可见文案 SHALL 全部落在 `publishPage.coverPreview.*`（`title` / `hint` / `ariaLabel` / `loading` / `unavailable`），zh 与 en SHALL 成对新增并保持行位对称。渲染层测试 SHALL 断言 i18n 键或用户可见文案，SHALL NOT 断言易漂移的 locale 字面量。

#### Scenario: 切换语言

- **WHEN** 界面语言在 zh 与 en 之间切换
- **THEN** 缩略图提示、加载与不可用文案均随语言变化，无硬编码中文
