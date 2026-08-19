# 基线差异审计

## 已交付基线

- 历史视频任务编辑页已经存在四个固定素材槽位：`image1`、`image2`、`video1`、`video2`，代码位置为 `apps/desktop/src/views/ResultView.vue` 的 `sceneMaterialSlots`。
- 素材选择 IPC、图片生成、AI 视频生成、场景视频路径优先级和 URL 刷新链路已在主线交付，本次不修改主进程数据模型、IPC 参数或生成服务。
- 现有场景素材区已经位于每个 segment 的背景框中，但当前操作按钮仍按槽位循环，造成重复；单选项仍位于 label 内部的缩略图区域上方，交互边界不清晰；预览弹窗视频类型判断错误。

## 本次待办

1. 将 radio 移到缩略图下方、素材标题前，缩略图仅触发放大预览，禁止缩略图/其父容器触发选择。
2. 统一素材槽位媒体类型判定，使 `video1`/`video2` 正确以 video 预览，并扩大预览弹窗内容可视尺寸。
3. 把“生成新图”“生成 AI 视频”放入各自素材卡的背景框内，每个场景各渲染一次且与对应素材类型相邻。
4. 未生成视频/图片占位只保留本地化“未生成”，移除意外英文残留；所有空槽使用与媒体一致的固定尺寸背景。
5. 修正/新增 ResultView 回归测试，覆盖预览不选择、radio 选择、四槽位、按钮归属、空槽尺寸 class 和视频预览。
6. 更新 `PRD-S2V-PIPELINE-PAGE-UX.md`、`PRD-video-creation.md`、CHANGELOG、learnings，并更新 OpenSpec 正式 spec 的旧三槽位/点击即选择冲突。

## 待确认但可按现有代码推断

- `video1`/`video2` 是当前 renderer 的槽位枚举；后端历史 spec 的 `video` 是持久化 `selectedMaterial` 枚举，不能直接混用。UI 选择 IPC 仍发送 renderer 槽位 kind，若现有测试/服务契约要求映射，则本次保持既有调用链，只拆分视觉入口。
- 用户提到的“英文文字”没有独立稳定键；需要通过最终渲染 DOM 测试确认不输出英文默认/slot kind，并将占位文案收敛到 `story2video.sceneMaterial.emptySlot`。
