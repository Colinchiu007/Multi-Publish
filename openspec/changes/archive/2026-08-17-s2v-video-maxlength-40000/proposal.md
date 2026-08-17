# 视频提示词字数上限再放宽：20000 → 40000

## Why

上轮（PR #906，spec `story2video-video-maxlength`）已把历史重生成视频优化词显式顶格到视频域上限 20000。用户本轮诉求「字数限制再放宽一些」：视频提示词（导演分镜单）最长形态 ≈5000 词 / 22,871 字符，20000 仍偏紧，希望再翻倍放宽到 40000。桌面契约层（`video-prompt-engine-contract.js`）与落库上限（`story2video-project-service.js`）需同步放开；8020 引擎侧（外部 prompt-engine 仓）同步 `le=20000→40000`（独立 change `video-maxlength-40000`），legacy 8013 通用契约保持 2000 不动。

## What Changes

- **契约层视频域上限 20000 → 40000**：`apps/desktop/electron/services/video-prompt-engine-contract.js` `VIDEO_ENGINE_LIMITS.videoMaxLengthMax: 20000 → 40000`；`videoMaxLengthRanges.standalone {200, 20000}` → `{200, 40000}`；`videoMaxLengthRefinedDefault: 5000` 保持；legacy `{50, 2000}` 保持。
- **落库上限视频专属 20000 → 40000**：`story2video-project-service.js` videoPrompt 三处 `safeText(..., 20000)` → `40000`（约 L502/658/1129）；图片 prompt 保持 20000 不动。
- **测试同步**：`video-prompt-engine-contract.test.js` standalone clamp 断言（20000→40000）；`story2video-project-service.test.js` video regen `max_length=20000` 断言 → 40000、超长用例（5000 字符）仍完整落库。
- **域级显式顶格语义不变**：`regenerateScenePrompt` video 仍显式透传 `VIDEO_ENGINE_LIMITS.videoMaxLengthMax`；`PromptBridge.optimizeVideo` 双后端 builder clamp 逻辑不变（standalone [200,40000] / legacy [50,2000]）；共享 kernel `PROMPT_ENGINE_LIMITS.maxLength.default` 500 不动。

## Capabilities

### New Capabilities

- 无（归入既有 `story2video-video-maxlength` 规格）。

### Modified Capabilities

- `story2video-video-maxlength`：视频域上限 20000 → 40000（契约 `videoMaxLengthMax`/standalone range + 落库 safeText 视频专属 40000）；legacy 8013 [50,2000]、共享 kernel 500、tiered 默认（batch 1800 / refined 5000）保持不变。

## Impact

- 代码：`apps/desktop/electron/services/video-prompt-engine-contract.js`、`apps/desktop/electron/services/story2video-project-service.js`。
- 测试：`video-prompt-engine-contract.test.js`、`story2video-project-service.test.js`。
- 文档：`01-docs/PRD-video-creation.md`（3.1.29.5 补充 40000）、`01-docs/CHANGELOG.md`、本 change、`.quality-gates.md`。
- 不涉及：共享 kernel 默认（500）、legacy 8013（2000）、图片 prompt（2000）、渲染层、IPC/preload、数据库、locale（无新增用户可见文案）。
