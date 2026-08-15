## Why

运营后台提示词评测工作台（PR #571，v1）已支持图片评估，但视频提示词只能评测其「文本→图片」效果，无法评测视频生成的真实表现（时序一致性、运动准确性、音画同步）。PRD §14 已将视频维度与 video_path 字段预留为 v2，本期落地：真实视频生成（Agnes Video V2.0，异步任务）+ 首/中/尾 3 帧抽帧 + 复用视觉评估 LLM 契约，输出与图片一致。

## What Changes

- **case 增加媒体类型**：`prompt_eval_cases.media_type`（image|video，默认 image）；video case 走视频生成链路（异步提交→轮询→下载→ffmpeg 抽帧首/中/尾 3 帧→落盘 video+frames）。
- **评估契约扩展**：`validate_eval_result` / `build_eval_prompt` / `parse_and_validate` 支持 media_type=video，固定 4 维（temporal_consistency/motion_accuracy/audio_visual_sync/video_aesthetic_quality），与桌面端 dimensions.js 一致性测试继续对齐。
- **新增视频生成服务**：`prompt_eval_video_service.py`（提交/轮询/下载/抽帧），provider 密钥槽位复用 `prompt_eval_provider_keys`（如 agnes-video / agnes-video-v2.0）；ffmpeg 通过 `imageio-ffmpeg` 提供（新增 requirements 依赖，支持 FFMPEG_BIN 覆盖）。
- **run 状态机扩展**：video run 落盘 `video_path` + `video_frames`（3 帧），媒体授权（owner/admin）覆盖视频与帧文件；生成/评估失败均 fail closed。
- **前端**：新建评测表单增加「图片/视频」媒体类型切换（manual 模式；视频隐藏图片数/画幅，禁用双路对比）；详情「生成物」栏视频用 `<video>` 播放器 + 3 帧缩略图；场景模式保持图片（视频 case 在场景模式明确拒绝）。
- **范围边界**：视频仅 manual+single（dual、场景模式 → 400 fail closed）；音频抽取与音画真实音频评估不在本期（PRD §14「可选音频」标注 v2.2 预留）。
- **文档**：PRD-PROMPT-EVAL-SYSTEM-2026-08-11.md §14 由「预留」改为「已实现」，CHANGELOG / learnings / quality-gates 同步。

## Capabilities

### New Capabilities
- `prompt-eval-video`: 运营后台视频提示词评测契约（mediaType=video case 生命周期、视频生成异步状态机、抽帧评估、媒体授权、前端视频展示）。

### Modified Capabilities
- `prompt-eval-ops-workbench`: 「视频 v2 预留」Requirement 由「拒绝视频」升级为「视频评测已实现」；新增视频生成与抽帧评估 Requirement。

## Impact

- 后端：`ops-center/backend/models.py`（media_type/video_frames 列）、`services/prompt_eval_migration.py`（幂等补列）、`services/prompt_eval_contract.py`（视频维度/校验）、`services/prompt_eval_evaluation_service.py`（视频模板）、新增 `services/prompt_eval_video_service.py`、`services/prompt_eval_service.py`（校验/流水线分支/媒体授权）、`routers/prompt_eval.py`（提示文案）；`requirements.txt` 增加 `imageio-ffmpeg`。
- 前端：`PromptEvalWorkbench.vue`（媒体类型切换、视频播放器与帧展示）。
- 测试：contract 视频维度、视频生成服务（mock httpx+ffmpeg）、API 矩阵（media_type/dual/scene 拒绝、密钥提示）、migration 补列。
- 外部边界：真实 Agnes 视频生成与真实视觉模型可用性为外部验收；单元/集成测试使用 mock。
- 交付：codex/ 分支 + PR；后端 pytest + 前端 build 门禁。
