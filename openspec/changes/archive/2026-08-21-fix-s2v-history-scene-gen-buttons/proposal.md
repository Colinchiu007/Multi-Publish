## Why

历史详情页场景素材区（ResultView.vue）对「未生成」的空素材卡缺少生成入口：图片 2/视频 2 空卡下方没有【生成新图】/【生成 AI 视频】按钮；同时【生成 AI 视频】在无 `videoPrompt` 时被渲染层门控灰显，而后端 `generateSceneAiVideo` 实际回退 `videoPrompt || prompt || text`，导致老项目 / 未持久化 `videoPrompt` 的历史记录无法从详情页生成视频。

## What Changes

- 场景级生成按钮从「只在 image1/video1 卡渲染一次」改为「覆盖全部图片/视频视觉卡」：image1/image2 卡显示【生成新图】（`generateSceneImage`），video1/video2 卡显示【生成 AI 视频】（`generateSceneAiVideo`）；多卡入口仍是同一场景级动作，不改后端写目标，video2 保持视觉别名、不新增持久化身份。
- 渲染层「能否生成 AI 视频」门控改为 `videoPrompt || prompt || text` 任一 trim 非空，与后端 `generateSceneAiVideo` 回退契约逐字一致；模板 `:disabled` 与方法入口 guard 同步放宽，避免「按钮可点但静默 return」。
- 更新 ResultView.test.js：去除「image2/video2 无按钮」的错误固化断言，新增空槽按钮、prompt/text 回退可点并真实触发 IPC、busy 传播回归；PRD / CHANGELOG / spec / learnings 同步。

## Capabilities

### New Capabilities

（无。复用既有 `story2video-history-material-selection` capability。）

### Modified Capabilities

- `story2video-history-material-selection`：`详情页布局与交互（ResultView）` Requirement 由「生成新图只在 image1 卡内显示一次、生成 AI 视频只在 video1 卡内显示一次，其余卡不重复」改为「所有图片/视频视觉卡均可渲染同一场景级生成动作入口；AI 视频门控与后端回退契约一致」。

## Impact

- `apps/desktop/src/views/ResultView.vue`：生成按钮 `v-if` 扩到 image1/image2、video1/video2；`hasUsableVideoPrompt` 放宽为 `videoPrompt || prompt || text`。
- `apps/desktop/src/views/ResultView.test.js`：更新按钮归属/数量断言，新增回退可用性与真实 IPC 调用回归。
- 文档：`01-docs/PRD-video-creation.md`、`01-docs/PRD-S2V-PIPELINE-PAGE-UX.md`、`01-docs/PRD-SCENE-MATERIAL-ENHANCE-2026-08-18.md`、`01-docs/CHANGELOG.md`、`01-docs/learnings.md`、`.ccg/spec/frontend/index.md`。
- 交付：codex 分支 PR（待合并），CI 全绿。
