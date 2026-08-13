# story2video-creation-mode Specification (Delta)

## MODIFIED Requirements
### Requirement: 候选素材生成（manual）
manual 模式下 generate_assets SHALL：`materialMode='all-images'` 时每场景生成 **2 张图片**（同一优化提示词两次独立调用）；`materialMode='video-image'` 时对 video_plan 中 useVideo=true 的场景额外生成 **1 个视频**（同一优化提示词，2 图 + 1 视频），其余场景 2 张图片。**不生成 TTS**。产出候选清单 `context.generate_assets.candidates`（每项含 index/text/prompt/promptTranslation 与 candidates 数组，每候选含 id/kind/path/meta），并以 `scene_asset_selection` 检查点暂停（run.status='paused'，checkpoint.type='scene_asset_selection'），不进入 compose。

视频候选生成 SHALL 采用与全自动模式一致的有界并发机制：并发上限按视频 provider 预算解析（provider 配置 `rate_per_minute` > 静态表 > 类别默认，请求值默认 2，经 `maxConcurrent` 收敛），视频场景之间的视频候选并行生成；图片候选 SHALL 与视频候选并行启动，不得等待视频全部完成。每场景 2 图同场景内按 seq 0→1 顺序生成（避免同 index 输出路径并发覆盖）。进度 `context.assets_progress`（imagesDone/imagesTotal、videosDone/videosTotal）SHALL 在生成过程中实时更新。

#### Scenario: 全部图片轮播候选
- **WHEN** manual + all-images，3 个场景
- **THEN** 每场景 2 张图片候选（共 6 个候选），无视频候选，无 TTS，流水线暂停于选择检查点

#### Scenario: 视频+图片轮播候选
- **WHEN** manual + video-image，videoMode=ai-judged 选中场景 1
- **THEN** 场景 1 候选为 2 图 + 1 视频（同一提示词），其余场景各 2 图；无 TTS，暂停于选择检查点

#### Scenario: 视频候选有界并行
- **WHEN** manual + video-image 且 2 个视频场景，provider 预算允许并发 2
- **THEN** 两个视频候选并行生成（最大 in-flight=2），且图片候选在视频完成前已启动

#### Scenario: 预算收敛
- **WHEN** 请求视频并发 5 但 provider 预算 maxConcurrent=1
- **THEN** 视频候选逐个生成（最大 in-flight=1），全部完成且候选清单完整

#### Scenario: 视频生成失败回退
- **WHEN** manual + video-image 中某视频场景视频生成失败
- **THEN** 该场景候选仅 2 图（回退），不中断流水线
