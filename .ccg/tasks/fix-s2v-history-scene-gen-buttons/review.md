# Review

## 分析阶段（双模型）

- Claude analyzer：wrapper exit 0，完成完整根因校验。确认根因成立；补出关键遗漏——`generateSceneAiVideo` 方法入口 `ResultView.vue:1011` 也有 `hasUsableVideoPrompt` guard，必须与模板 `:disabled` 同步放宽，否则按钮可点但静默 return。推荐方案 A（前端 scene-level），不做后端 slot 感知（video2 是视觉别名、无独立持久身份）。
- opencode backend：地区/服务端错误降级（模型返回 `This model is not available in your country` / `Unexpected server error`），已按项目既有先例记录降级，本任务补充 Claude 分析 + 主代理本地深读作为第二视角。
- 结论采纳：全部 4 卡渲染生成按钮；`hasUsableVideoPrompt` 放宽为 `videoPrompt || prompt || text`；更新错误固化测试断言。

## 实施后审查（Claude reviewer，wrapper exit 0）

### 通过项
- 门控与后端回退契约逐字一致（`videoPrompt || prompt || text`），模板 `:disabled` 与方法入口 guard 同步放宽，无「可点但静默 return」。
- 测试已去除反向固化断言（按钮 2→4、image2/video2 存在），busy 传播、无 videoPrompt 有 prompt/text 可点且真实触发 IPC 均已覆盖。
- Lint / CJK / 构建 / 定向测试全绿。

### Critical 处置
1. PRD-video-creation.md 附录 A 旧「6.」残留导致编号重复、契约自相矛盾 —— 已删除旧条目，编号恢复 1-7 连续。
2. 多卡按钮落点与「空卡」卖点：分析确认 image2 槽为空时从 image2 卡点击必补入空槽（`alternateImages` 空则先写 image2）；video2 是视觉别名，生成 AI 视频写入 canonical 视频槽并显示在 video1。已在 PRD-SCENE-MATERIAL-ENHANCE 明示该落点契约，多卡入口仍是同一场景级动作，不改后端写目标。

### Warning 处置
- W1（非字符串 videoPrompt 分歧）：服务层持久化已归一为 string，实际数据不存在 object，判定低风险，不改。
- W2（提示文案准确性）：三者全空才显示提示，文案指导「先编辑提示词」仍合理，保留。
- W3（测试选择器歧义）：`generate-ai-video-button` 用例改为 slot 限定选择器，已修复。

### Info
- I1 generateSceneImage 缺 segmentsDirty 预保存（pre-existing，不在本次范围）。
- I2/I3 文档一致性：合格。

## 结论
Claude reviewer 原始 Critical 2 已全部处置（文档编号修复 + 落点契约文档化），无剩余 Critical。opencode 后端不可用已记录降级。
