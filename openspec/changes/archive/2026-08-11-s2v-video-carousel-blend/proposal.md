# Proposal: 视频+图片轮播混合流水线（AI 视频片段 + 图片轮播组合）

## Why

当前 Story2Video 流水线（story2video-compose）只支持「图片轮播」一种视觉形态：所有场景都生成静态图 + TTS，再经 FFmpeg zoompan 合成。AI 视频生成（videogen 系列流水线）与图片轮播是两套独立体系，用户无法在同一支视频里组合两种形态。AI 视频质量更高但成本/耗时远高于图片，全部场景都用 AI 视频不经济；全部用图片轮播又缺乏「精彩场景动态化」的冲击力。需要一个混合流水线：只把最值得动态化的场景（占总时长约 20%-40%）交给 AI 视频生成，其余继续图片轮播，在成本与表现力之间取得平衡。

## What Changes

- 新增 Story2Video 混合模式配置 `video`（`mode: off | fixed | ai-judged`），并新增 `select_video_scenes` 阶段：
  - **fixed（固定组合）**：按顺序把成片前 20%-30%（默认 25%，可配置）时长的场景标记为 AI 视频场景，其余为图片轮播场景；
  - **ai-judged（AI 判断）**：由默认 LLM 依据场景文案/提示词评估「精彩度」，选出适合 AI 视频的场景，并约束所选场景总时长占比在 20%-40% 区间（默认 min 20% / max 40%，越界时按精彩度钳制）。
- `generate_assets` 扩展：被标记为 AI 视频的场景调用视频生成适配器（generateVideo + getVideoStatus 轮询 + 下载），产出本地 `videoPath`，不再为其生成图片；其余场景维持图片生成。TTS 旁白对两类场景都生成。
- `story2video-compose-engine` 扩展：片段合成支持「AI 视频场景（videoPath）+ 图片轮播场景（imagePath）」混合输入；视频场景以 AI 视频为画面基底做分辨率/时长归一化后混入 TTS 与字幕。
- 前端 CreateView 新增「视频增强」配置区：视频模式选择、视频生成器（provider）、fixed 比例/AI 判断区间展示；启动参数 `story2videoTextConfig.video` 随之扩展。
- 校验/降级：未配置视频 provider 时选择阶段 fail closed 并给出明确引导；视频生成全部失败时回退为图片轮播（降级不丢整条流水线）。
- **BREAKING**：无。新字段全部可选，默认 `video.mode = off` 保持既有行为。

## Capabilities

### New Capabilities

- `story2video-video-carousel-blend` — 混合流水线能力：两种模式（fixed / ai-judged）的场景选择算法、比例约束、生成与合成契约、降级行为。

### Modified Capabilities

- `story2video-compose-progress` — 新增 `select_video_scenes` 阶段与视频场景生成子进度（阶段清单、percent 语义）。
- `story2video-parameter-governance` — `story2videoTextConfig.video` 字段的归一化/校验规则（枚举、比例边界、provider/model 白名单）。

## Impact

- 运行时代码（走 codex/ 分支 + PR）：
  - `apps/desktop/electron/services/pipeline-engine.js`（story2video-compose stageDefs 增加 select_video_scenes）
  - `apps/desktop/electron/services/story2video-stages.js`（新阶段执行器 + generate_assets 视频分支）
  - `apps/desktop/electron/services/story2video-compose-engine.js`（混合片段合成）
  - `apps/desktop/electron/services/story2video-text-config.js`（video 字段归一化）
  - `apps/desktop/src/views/CreateView.vue`（UI 配置区 + 文案）
- 测试：story2video-text-config.test.js / story2video-stages.test.js / story2video-compose-engine.test.js 新增混合模式用例。
- 文档：01-docs/PRD.md（7.1.25 新增）、CHANGELOG.md。
- 复用现有：videogen-stages.js 的视频 provider 解析与轮询下载逻辑、compose-engine 现有字幕/转场/BGM 管线、model-call-scheduler 调度。
