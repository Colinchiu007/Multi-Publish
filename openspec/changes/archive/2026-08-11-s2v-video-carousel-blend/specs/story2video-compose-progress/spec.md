## ADDED Requirements

### Requirement: select_video_scenes 阶段进度展示
图片轮播流水线阶段清单 SHALL 包含 `select_video_scenes`（位于 optimize 与 generate_assets 之间）。该阶段执行时前端 SHALL 展示对应阶段条目；`video.mode = 'off'` 时该阶段快速通过（输出空 plan 或跳过），阶段清单仍按 pipeline 定义展示。

#### Scenario: 开启混合模式显示阶段
- **WHEN** `video.mode = 'fixed'` 或 `'ai-judged'` 且流水线运行至 select_video_scenes
- **THEN** 阶段清单显示 select_video_scenes 为 running，随后 completed

#### Scenario: 关闭混合模式不阻塞
- **WHEN** `video.mode = 'off'`
- **THEN** select_video_scenes 阶段直接完成，不调用 LLM、不改变后续阶段行为

### Requirement: generate_assets 子进度区分视频场景
generate_assets 阶段子进度 SHALL 在混合模式下同时呈现视频场景进度：`context.assets_progress` 增加 `videosDone`/`videosTotal`（仅 `video.mode !== 'off'` 且存在视频场景时非零）。前端详情文案在 videosTotal>0 时展示「图片 x/y · 视频 a/b · 旁白 x/y」。

#### Scenario: 混合模式进度展示
- **WHEN** 混合模式运行 generate_assets，5 个场景含 2 个视频场景
- **THEN** `assets_progress = { imagesDone, imagesTotal, videosDone, videosTotal, ttsDone, ttsTotal }`，前端文案含视频进度

#### Scenario: 纯图片模式不显示视频进度
- **WHEN** `video.mode = 'off'`
- **THEN** `assets_progress` 不含 videos 字段或恒为 0，前端文案维持「图片 x/y · 旁白 x/y」
