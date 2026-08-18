# PRD-SCENE-MATERIAL-ENHANCE-2026-08-18

> v2.0 | 2026-08-19 | PR: #977, #980, #984

## 变更摘要

视频创作历史记录任务详情页场景素材区域全面升级：2图+1视频 -> 2图+2视频，优化交互体验。9项变更。

---

## 1. 场景素材扩展：2 图 + 2 视频

变更前3 slot -> 变更后4 slot（image1/image2/video1/video2）。

数据模型 sceneMaterialSlots(segment) 返回4个slot对象，每个含kind/label/path/url/selected。

数据校验：segment为空返回空数组；alternateImages非数组回退[]；videoMeta为空时视频路径为null。

新增Locale: video1Label(视频1/Video 1), video2Label(视频2/Video 2)。

---

## 2. 每个素材独立生成按钮

变更前2个统一按钮 -> 变更后每个slot独立按钮。

图片slot显示「生成新图」，点击 generateSceneImage(segmentId)。
视频slot显示「生成 AI 视频」，点击 generateSceneAiVideo(segmentId, slotKind)。

禁用条件：isSegmentBusy 时 disabled；视频按钮在 !videoPrompt 时 disabled + tooltip「请先编辑或重新生成视频优化词，再生成 AI 视频」。

生成流程：前置检查 -> 设置忙碌 -> 调用IPC -> 成功更新project/segments + refreshSegmentImageUrls + 通知 -> 失败恢复 + 错误通知 -> finally清除忙碌。

互斥规则：同一segment同时只有一个生成操作（isSegmentBusy控制）。

---

## 3. 设为当前使用：Radio 按钮

变更前点击整个卡片 -> 变更后左上角radio按钮。

Radio name=scene-material-{segmentId}，同segment互斥。无内容时disabled。

选中态：slot边框高亮 + 右上角「当前使用」badge。

Locale: selectedBadge(当前使用/In Use), selectAriaLabel, emptyAriaLabel。

---

## 4. 视频显示 AI 场景片段

变更前显示合成完整视频 -> 变更后显示AI流水线场景片段。

数据源：videoMeta.sceneVideoPath -> videoUrl, videoMeta.altSceneVideoPath -> altVideoUrl。

URL解析：refreshSceneMaterialUrls()逐segment解析，失败设为null不影响其他slot。

---

## 5. 当前使用状态反映真实素材

变更前默认选视频 -> 变更后读取segment.selectedMaterial。

effectiveSelectedMaterial(segment) 读取 selectedMaterial，值为 image1/image2/video1/video2 或 null。

---

## 6. 纯图片轮播模式占位符

无AI视频生成时，视频slot显示浅灰色色块+「未生成」文字。

Locale: emptySlot(未生成/Not generated)。

---

## 7. 生成 AI 视频后显示

完整流程：点击按钮 -> 检查条件 -> 落盘修改 -> 设置忙碌 -> 调用IPC -> 成功更新+刷新URL+通知 -> 失败通知 -> finally清除。

生成完成后 refreshSceneMaterialUrls() 自动解析新视频URL，缩略图自动更新。

---

## 8. 缩略图真实比例

变更前固定 aspect-ratio:3/4 -> 变更后自然比例，min-height:80px, max-height:200px, object-fit:cover。

响应式：桌面4列, 移动端(<720px)2列。

---

## 9. 分段编辑 Sticky 侧边栏

变更前随滚动 -> 变更后 fixed 定位(right:20px, top:80px, z-index:100)。

移动端(<900px)隐藏。点击分段编号平滑滚动。

---

## Locale Keys 完整参考

中文: title=场景素材, image1Label=图片1, image2Label=图片2, video1Label=视频1, video2Label=视频2, emptySlot=未生成, selectedBadge=当前使用, generateImage=生成新图, generateAiVideo=生成AI视频, generating=生成中..., generatingAiVideo=AI视频生成中..., aiVideoNeedsPromptHint=请先编辑或重新生成视频优化词再生成AI视频, previewHint=点击可放大预览, previewImageTitle=图片预览, previewVideoTitle=视频预览, selectAriaLabel=选择{label}作为当前素材, emptyAriaLabel={label}尚未生成

英文对应: Scene Materials, Image 1, Image 2, Video 1, Video 2, Not generated, In Use, Generate New Image, Generate AI video, Generating..., Generating AI video..., Edit or regenerate the video prompt first then generate the AI video, Click to enlarge preview, Image Preview, Video Preview, Select {label} as the active material, {label} is not generated yet

---

## 文件变更

| 文件 | 说明 |
|------|------|
| ResultView.vue | 模板+script+CSS全面修改 |
| zh.js | 新增video1Label/video2Label/generatingAiVideo/aiVideoNeedsPromptHint |
| en.js | 同上英文版 |

---

## 相关PR

#977 主功能实现, #980 修复按钮$t()腐蚀, #984 修复模板显示$t()腐蚀 — 全部已合并。

---

## 教训

$t()腐蚀：PowerShell sed消耗$字符。检测：grep检查裸括号。预防：sed用单引号保护$。

---

## 测试验证

- [ ] 4个slot显示正确
- [ ] radio互斥选择
- [ ] 图片/视频按钮文案正确
- [ ] 视频按钮禁用条件
- [ ] 未生成占位符
- [ ] 缩略图真实比例
- [ ] 侧边栏fixed定位
- [ ] 响应式布局
- [ ] locale key完整
- [ ] $t()无腐蚀
