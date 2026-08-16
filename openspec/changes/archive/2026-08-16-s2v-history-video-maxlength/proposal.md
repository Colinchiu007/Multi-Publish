## Why

「视频创作-历史记录」重新生成视频优化词（`regenerateScenePrompt` kind=video）直接调 `serviceBus.optimizeVideoPrompt(seed, { index })`，未显式携带 `max_length`：8020 独立视频引擎（video_prompt_engine）批量层默认 **1800**、8013 legacy 回退路径（domain=video）批量层默认 **500**，长视频提示词仍会被后端默认截断。图片路径已在 PR #887/#896 放开到 2000 并显式携带（历史案例：截断在 "Wunü Mo" 单词中间），视频域尚未对齐。用户诉求（PRD 3.1.29.5，2026-08-16 PM 已确认）：视频提示词优化字数尽量放宽，长提示词不因长度被静默截断。

目标：历史重生成视频优化词显式携带视频域上限（`VIDEO_ENGINE_LIMITS.videoMaxLengthMax`=20000），由视频契约 builder 按双后端能力范围各自收敛（8020 standalone [200,20000] / 8013 legacy [50,2000]），避免落回后端默认截断。

## What Changes

- **历史重生成视频优化词显式顶格**：`story2video-project-service.js` `regenerateScenePrompt`（kind=video）请求新增 `max_length: VIDEO_ENGINE_LIMITS.videoMaxLengthMax`（20000），与 `index` 并列透传；`PromptBridge.optimizeVideo` 双后端 builder 各自 clamp：`buildStandaloneVideoOptimizeRequest` 收敛 [200,20000]、`buildVideoOptimizeRequest`（legacy/8013）收敛 [50,2000]，双后端安全（显式值优先于 tiered 默认），不 422。
- **落库截断保持**：videoPrompt 落库 `safeText(optimizedText, 20000)` 不变——legacy 输出 ≤2000、standalone ≤20000 均在落库上限内；不引入图片 2000 截断。
- **共享契约不放松**：共享内核 `PROMPT_ENGINE_LIMITS.maxLength.default` 保持 500 不动；视频 `videoMaxLengthRanges`（legacy [50,2000] / standalone [200,20000]）、`videoMaxLengthBatchDefault`（1800）与 `videoMaxLengthRefinedDefault`（5000）不动。Story2Video 各入口显式携带。
- **测试**：S2V 专属断言——regenerateScenePrompt video 显式 `max_length=20000` 透传 + 超长（5000 字符）返回完整落库；通用 kernel/video 契约既有断言不改值（保持 500 / 范围收敛）。

## Capabilities

### New Capabilities
- `story2video-video-maxlength`: 历史重生成视频优化词 `max_length` 显式顶格契约——历史重生成入口（regenerateScenePrompt kind=video）显式携带视频域上限（20000），双后端（8020 standalone / 8013 legacy）按各自能力范围收敛，禁止落回后端默认截断；流水线 stage 经文本配置显式携带（默认 2000）不属本次改动。

### Modified Capabilities
- 无（既有 `video-prompt-engine` 契约范围与 tiered 默认语义保持不变）。

## Impact

- **代码**：`apps/desktop/electron/services/story2video-project-service.js`。
- **测试**：`apps/desktop/electron/services/story2video-project-service.test.js`（S2V 专属断言更新/新增）。
- **文档**：`01-docs/PRD-video-creation.md`（3.1.29.5 状态）、`01-docs/CHANGELOG.md`、本 change、`.quality-gates.md`。
- **不涉及**：共享 kernel 默认、8020/8013 契约范围、渲染层、IPC/preload、数据库、locale（无新增用户可见文案）。
