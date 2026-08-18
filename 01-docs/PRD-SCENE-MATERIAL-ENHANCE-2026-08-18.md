# PRD-SCENE-MATERIAL-ENHANCE-2026-08-18

## 变更摘要

视频创作历史记录任务详情页的场景素材区域进行全面升级，从 2 图 + 1 视频扩展为 2 图 + 2 视频，并优化交互体验。

## 变更列表

### 1. 场景素材扩展：2 图 + 2 视频

变更前：每个场景有 3 个素材 slot（图片 1、图片 2、视频）
变更后：每个场景有 4 个素材 slot（图片 1、图片 2、视频 1、视频 2）

数据模型：
- sceneMaterialSlots() 方法现在返回 4 个 slot 对象
- 每个 slot 包含：kind、label、path、url、selected
- kind 枚举：image1、image2、video1、video2
- 视频 1 使用 segment.videoMeta.sceneVideoPath
- 视频 2 使用 segment.videoMeta.altSceneVideoPath

Locale Keys 新增：
- story2video.sceneMaterial.video1Label
- story2video.sceneMaterial.video2Label

### 2. 每个素材独立生成按钮

变更前：场景素材下方有两个按钮「生成新图」和「生成 AI 视频」
变更后：每个素材 slot 有自己的生成按钮

交互逻辑：
- 图片 slot（image1/image2）：显示「生成新图」按钮
- 视频 slot（video1/video2）：显示「生成 AI 视频」按钮
- 点击后重新生成该条内容
- 生成中状态：按钮显示「生成中...」或「AI 视频生成中...」

数据校验：
- 视频生成按钮在 segment.videoPrompt 为空时禁用
- 生成前自动保存未保存的修改
- 忙碌状态互斥：同一 segment 不能同时触发多个生成操作

### 3. 设为当前使用：Radio 按钮

变更前：点击整个 slot 卡片选择
变更后：每个 slot 左上角有 radio 按钮

交互逻辑：
- Radio 按钮 name 为 scene-material-{segmentId}
- 同一 segment 内互斥选择
- 选中状态：slot 边框高亮 + 右上角「当前使用」badge
- 无内容时 radio 禁用

显示项：
- Radio 按钮：16x16px，accent-color: var(--primary)
- 位置：slot 左上角 position: absolute; top: 6px; left: 6px
- Badge：右上角「当前使用」

### 4. 视频显示 AI 场景片段

变更前：视频 slot 显示合成后的完整视频
变更后：视频 slot 显示 AI 在流水线过程中生成的该场景视频片段

数据来源：
- 视频 1：segment.videoMeta.sceneVideoPath -> segment.videoUrl
- 视频 2：segment.videoMeta.altSceneVideoPath -> segment.altVideoUrl

逻辑：
- refreshSegmentImageUrls() 方法同时解析两个视频 URL
- 如果 sceneVideoPath 为空，videoUrl 设为 null
- 如果 altSceneVideoPath 为空，altVideoUrl 设为 null

### 5. 当前使用状态反映真实素材

变更前：默认选中视频（如果有）
变更后：selectedMaterial 字段反映用户实际选择的素材

逻辑：
- effectiveSelectedMaterial(segment) 读取 segment.selectedMaterial
- 用户通过 radio 按钮选择后，调用 selectSceneMaterial() 更新
- 服务端持久化选择状态

### 6. 纯图片轮播模式占位符

场景：流水线未涉及 AI 视频生成（纯图片轮播模式）

显示：
- 视频 slot 显示浅灰色背景色块
- 色块上显示文字：「未生成」
- CSS：scene-material-empty-text 样式

Locale Key：
- story2video.sceneMaterial.emptySlot：未生成 / Not generated

### 7. 生成 AI 视频后显示

流程：
1. 用户点击视频 slot 的「生成 AI 视频」按钮
2. 调用 generateSceneAiVideo(segmentId, slotKind)
3. 服务端生成 AI 视频片段
4. 返回更新后的 project 数据
5. refreshSegmentImageUrls() 解析新的视频 URL
6. 视频 slot 显示生成的视频

### 8. 缩略图真实比例

变更前：固定 aspect-ratio: 3/4
变更后：使用自然比例，min-height: 80px; max-height: 200px

CSS 变更：
- .scene-material-thumb 移除固定 aspect-ratio
- 添加 min-height: 80px 和 max-height: 200px

响应式：
- 桌面端：4 列网格 grid-template-columns: repeat(4, minmax(0, 1fr))
- 移动端（<720px）：2 列网格 grid-template-columns: repeat(2, 1fr)

### 9. 分段编辑 Sticky 侧边栏

变更前：分段编辑面板随页面滚动
变更后：分段定位侧边栏固定在页面右侧

CSS：
- position: fixed
- right: 20px
- top: 80px
- width: 200px
- z-index: 100
- max-height: calc(100vh - 120px)
- overflow-y: auto

响应式：
- 移动端（<900px）：隐藏侧边栏

## 文件变更

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| apps/desktop/src/views/ResultView.vue | 修改 | 场景素材模板、方法、CSS |
| apps/desktop/src/locales/zh.js | 修改 | 新增 video1Label/video2Label |
| apps/desktop/src/locales/en.js | 修改 | 新增 video1Label/video2Label |

## 测试验证

- [ ] 场景素材显示 4 个 slot（2 图 + 2 视频）
- [ ] 每个 slot 有独立的 radio 按钮
- [ ] 图片 slot 显示「生成新图」按钮
- [ ] 视频 slot 显示「生成 AI 视频」按钮
- [ ] 纯图片轮播模式视频 slot 显示「未生成」
- [ ] 缩略图使用真实比例
- [ ] 分段定位侧边栏固定不滚动
- [ ] 移动端响应式布局正确
