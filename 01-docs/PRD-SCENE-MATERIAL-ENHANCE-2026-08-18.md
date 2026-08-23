# PRD-SCENE-MATERIAL-ENHANCE-2026-08-18

> v2.1 | 2026-08-20 | 场景素材布局、预览隔离与空态修正

## 变更摘要

视频创作历史记录任务详情页场景素材区域统一为 4 个视觉卡位（2 图 + 2 视频显示位），并修正选择、预览、生成按钮归属、弹窗尺寸和空态布局。服务端仍保持 3 个持久化素材身份（image1/image2/video），不新增数据迁移。

---

## 1. 场景素材扩展：2 图 + 2 视频

变更前 3 个可见槽位 -> 变更后 4 个固定视觉卡（image1/image2/video1/video2）。四个视觉卡始终按固定顺序渲染，缺少素材时保留同尺寸空框。

renderer 的 sceneMaterialSlots(segment) 返回 4 个 slot 对象，每个含 kind/label/path/url/selectable/selected。image1 读取 segment.imagePath；image2 读取 alternateImages[0].path；video1 优先读取 videoMeta.sceneVideoPath，缺失时兼容 segment.videoPath；video2 只读取 videoMeta.altSceneVideoPath。视频 radio 的 selectable 还必须满足 canonical segment.videoPath 存在，以匹配主进程 video 持久化校验；仅有 videoMeta 的异常旧数据允许预览但不允许选择。

数据校验：segment 为空时不渲染场景卡；alternateImages 非数组、空数组或首项缺少 path 时 image2 为空；videoMeta 缺失时 video1 只按旧项目兼容规则回退 videoPath，video2 为空；selectedMaterial 只接受 image1/image2/video，非法值按未选择处理。

新增/使用 Locale：video1Label、video2Label、previewAriaLabel，以及既有 emptySlot、selectAriaLabel、emptyAriaLabel、previewHint 等 zh/en 成对键。

---

## 2. 场景级生成按钮归属

生成动作属于场景，不属于某一张候选图片或视频。因此每个场景的生成按钮是场景级动作，并放进对应图片/视频卡片（多卡入口只是同一动作的重复暴露）：

- image1/image2 卡内都显示「生成新图」，点击 generateSceneImage(segmentId)，写入目标由选中态规则决定；image2 槽为空时从 image2 卡点击会补入该空槽。
- video1/video2 卡内都显示「生成 AI 视频」，点击 generateSceneAiVideo(segmentId)，结果写入 canonical 视频槽并显示在 video1 卡。
- video2 仍是视觉别名，不新增持久化身份；从任一视频卡点击都触发同一 canonical 生成动作。

禁用条件：isSegmentBusy 时两枚按钮都 disabled；视频按钮在 videoPrompt/prompt/text 任一 trim 后非空时可点，三者全空时 disabled，并通过 title 显示「请先编辑或重新生成视频优化词，再生成 AI 视频」。

生成流程：前置检查 -> 未保存分段先保存 -> 设置 segmentBusy -> 调用 IPC -> 成功更新 project/segments -> refreshSegmentImageUrls 重新生成预览 URL -> 显示本地化成功通知；失败保留旧素材、清理本次产物、显示归一化失败通知 -> finally 清除忙碌。

互斥规则：同一segment同时只有一个生成操作（isSegmentBusy控制）。

---

## 3. 设为当前使用：Radio 按钮

变更前点击整个卡片可能同时触发选择和预览 -> 变更后 radio 是唯一的「设为当前使用」入口，位于缩略图底部、素材标签之前。

radio 的 name=scene-material-{segmentId}，同一 segment 互斥；每个 radio 有稳定 id、对应 label、localized aria-label。没有 path 的槽位 radio disabled；视频卡缺少 canonical segment.videoPath 时也必须 disabled；path 存在但 URL 解析失败时，radio 仍按服务端 path 合同决定是否可选择，缩略图按钮则 disabled。

缩略图 button 不包在 ancestor label 内，点击/Enter/Space 只打开预览，不调用 select IPC；radio 或其 label 被点击时才调用选择。选中态为卡片边框高亮 + 「当前使用」badge。

持久化边界：selectedMaterial 和 IPC kind 仍只有 image1/image2/video。video1/video2 是 renderer 视觉别名；选择任一有 path 的视频视觉卡时归一发送 video。由于服务端只持久化一个 video 身份，当前使用徽标只在 video1 canonical 卡显示一次，video2 不伪造第二个持久化选择。

Locale: selectedBadge(当前使用/In Use), selectAriaLabel, emptyAriaLabel。

---

## 4. 视频显示 AI 场景片段

变更前显示合成完整视频 -> 变更后显示AI流水线场景片段。

数据源：videoMeta.sceneVideoPath -> videoUrl, videoMeta.altSceneVideoPath -> altVideoUrl。

URL解析：refreshSceneMaterialUrls()逐segment解析，失败设为null不影响其他slot。

---

## 5. 当前使用状态反映真实素材

变更前默认选视频 -> 变更后读取并白名单校验 segment.selectedMaterial。

effectiveSelectedMaterial(segment) 只返回 image1/image2/video 或 null；空字符串、video1、video2 和其他未知值都按 null 处理，不猜测首个素材。

---

## 6. 纯图片轮播模式占位符

无 AI 视频生成时，video1/video2 仍显示浅灰背景的固定 media frame + 一行「未生成」文字；不得额外显示 Video 1、Video 2、video1、video2 或第二行未解释英文。

Locale：emptySlot=未生成/Not generated；每个空框只渲染一次该键。

点击空框不打开预览；空框仍保留和有媒体缩略图相同的 aspect-ratio、背景色和卡位宽度，保证四格整齐。

---

## 7. 生成 AI 视频后显示

完整流程：点击按钮 -> 检查条件 -> 落盘修改 -> 设置忙碌 -> 调用IPC -> 成功更新+刷新URL+通知 -> 失败通知 -> finally清除。

生成完成后 refreshSceneMaterialUrls() 自动解析新视频URL，缩略图自动更新。

---

## 8. 缩略图固定媒体框与响应式布局

每个 scene-material-thumb 使用稳定 aspect-ratio:3/4、min-height:96px、width:100%，图片和视频使用 object-fit:cover；空框复用同一尺寸和背景色。按钮、radio、label 和生成 action 均在自己的卡片内，action 文案允许换行但不能改变媒体框尺寸。

响应式：桌面 4 列；视口 <=720px 时 2 列。窄屏不改 media frame 几何，不因空素材删除 grid item。

---

## 9. 分段编辑 Sticky 侧边栏

变更前随滚动 -> 变更后 fixed 定位(right:20px, top:80px, z-index:100)。

移动端(<900px)隐藏。点击分段编号平滑滚动。

---

## Locale Keys 完整参考

中文: title=场景素材, image1Label=图片1, image2Label=图片2, video1Label=视频1, video2Label=视频2, emptySlot=未生成, selectedBadge=当前使用, generateImage=生成新图, generateAiVideo=生成AI视频, generating=生成中..., generatingAiVideo=AI视频生成中..., aiVideoNeedsPromptHint=请先编辑或重新生成视频优化词再生成AI视频, previewHint=点击可放大预览, previewAriaLabel=放大预览{label}, previewImageTitle=图片预览, previewVideoTitle=视频预览, selectAriaLabel=选择{label}作为当前素材, emptyAriaLabel={label}尚未生成

英文对应: Scene Materials, Image 1, Image 2, Video 1, Video 2, Not generated, In Use, Generate New Image, Generate AI video, Generating..., Generating AI video..., Edit or regenerate the video prompt first then generate the AI video, Click to enlarge preview, Enlarge preview {label}, Image Preview, Video Preview, Select {label} as the active material, {label} is not generated yet

---

## 文件变更

| 文件 | 说明 |
|------|------|
| ResultView.vue | 模板、场景素材数据校验、radio/preview 事件隔离、按钮归属、固定媒体框和 xl 预览弹窗 |
| ResultView.test.js | 四卡顺序、radio-only、preview-only、视频 kind 归一、生成按钮覆盖全部图片/视频卡、空态英文泄漏、URL 失效边界和 locale 成对回归 |
| zh.js / en.js | video1/video2 标签和 previewAriaLabel 成对维护；既有生成/空态/提示文案保持成对 |
| PRD / OpenSpec | 同步数据模型、流程、交互、显示项、提示文字、错误处理和回归矩阵 |

---

## 相关PR

#977 主功能实现, #980 修复按钮$t()腐蚀, #984 修复模板显示$t()腐蚀 — 全部已合并。

---

## 教训

$t()腐蚀：PowerShell sed消耗$字符。检测：grep检查裸括号。预防：sed用单引号保护$。

---

## 测试验证

- [x] 4 个视觉 slot 固定顺序、空框保持四格
- [x] radio 位于缩略图下方、标签之前；thumbnail 不触发选择 IPC
- [x] 图片/AI 视频按钮覆盖 image1/image2 与 video1/video2 卡（场景级动作多入口）
- [x] 视频按钮 prompt guard、busy guard 和 dirty 自动保存流程保持
- [x] 未生成只显示一条本地化 emptySlot，不泄漏英文 kind
- [x] aspect-ratio:3/4、固定背景和 4 列/2 列响应式规则
- [x] xl 预览弹窗，图片/视频按 kind 正确渲染
- [x] locale zh/en key 成对，ResultView 组件 97 条聚焦回归通过
- [x] $t() 模板无腐蚀，OpenSpec strict validate 通过

## 10. 验收数据与错误合同

1. 页面必须接受旧项目缺少 alternateImages、videoMeta、selectedMaterial 和派生 URL 的情况；缺字段只产生空卡或兼容回退，不触发数据迁移。
2. 服务端继续校验 projectId、segmentId、kind 白名单和目标槽位存在性；renderer 的 disabled 控件是第一层保护，IPC/service 是第二层保护，伪造请求不能改变项目状态。
3. create-share-url 返回非零 code、空 data、过期路径或异常时，该卡保留固定背景并清空 URL；其他卡继续显示，预览按钮不可用。
4. 生成失败必须保留旧 image/video path、meta、selectedMaterial，清理本次 attemptFiles；错误提示使用稳定通知键，不显示绝对路径、堆栈、provider JSON 或内部 prompt。
5. 回归矩阵包含正常/空素材、path 有而 URL 无、非法 selectedMaterial、旧字段缺省、video1/video2 视觉别名、重复按钮、空态英文残留、modal 尺寸、键盘可访问性和 busy 双击。
