## 设计

### 现状
- 模板仅在 `slot.kind === 'image1'` 渲染【生成新图】（ResultView.vue:259）、仅在 `slot.kind === 'video1'` 渲染【生成 AI 视频】（:270）；image2/video2 空卡无生成入口。
- 渲染层 `hasUsableVideoPrompt` 只校验 `segment.videoPrompt`（:1538），后端 `generateSceneAiVideo` 回退 `videoPrompt || prompt || text`（story2video-project-service.js:1779），契约漂移导致历史记录按钮灰显。

### 方案对比
- **A：前端 scene-level（采纳）** —— 全部图片/视频视觉卡渲染同一场景级生成按钮；`hasUsableVideoPrompt` 放宽并同步方法入口 guard。零 IPC/后端契约改动；image2 为空时从 image2 卡点击必补入该空槽；video2 是视觉别名，生成 AI 视频写入 canonical 视频槽。与既有 `selectSceneMaterial` 的 video1/video2 归一化先例一致。
- **B：后端 slot 感知写入（否决）** —— 需为 video2 引入独立写目标/持久身份语义，破坏「3 个持久化素材身份」契约，扩 IPC 参数，改动面大、收益不匹配。

### 决策
- 采纳方案 A；按钮多卡重复暴露只是同一场景级动作的多入口，不改变写目标。
- 风险与回退：image2 已有内容且未选中时再生成会替换 image1（既有选中态规则）；video2 生成结果显示在 video1。两者均在 PRD 明示，属可接受契约；若后续需要「按卡填槽」再单独扩展。

### 测试目标
- 空槽也有按钮（按钮总数 4、image2/video2 存在）。
- 无 videoPrompt 但有 prompt/text 时按钮可点且真实调用 IPC（覆盖方法入口 guard）。
- busy 传播到全部 4 个入口；选择器 slot 限定避免歧义。
