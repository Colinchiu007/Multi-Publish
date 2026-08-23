# Tasks — prompt-eval-video

## 1. 契约层（contract + evaluation）
- [ ] `prompt_eval_contract.py`：MEDIA_TYPES / VIDEO_FRAME_COUNT / resolve_video_dimension_weights；validate_eval_result 增加 media_type（video 白名单=视频 4 维）
- [ ] `prompt_eval_evaluation_service.py`：build_eval_prompt / parse_and_validate 增加 media_type（video 模板 4 维 + 3 帧说明）
- [ ] `tests/test_prompt_eval_contract.py`：video 权重/白名单/缺维拒绝；build_eval_prompt video 断言；桌面端 VIDEO_DIMENSIONS 权重一致性
- [ ] 门禁：cd ops-center/backend && pytest tests/test_prompt_eval_contract.py -q

## 2. 视频生成服务（新）
- [ ] `services/prompt_eval_video_service.py`：提交/轮询/下载/MP4 魔数/时长解析/ffmpeg 抽帧（imageio-ffmpeg，FFMPEG_BIN 覆盖，asyncio.to_thread）
- [ ] `tests/test_prompt_eval_video_service.py`：mock httpx 提交/轮询/失败/超时；假 ffmpeg 抽帧；魔数拒绝；落盘命名
- [ ] `requirements.txt`：+ imageio-ffmpeg

## 3. 数据层与流水线
- [ ] `models.py`：cases.media_type；runs.video_frames（video_path 已有）
- [ ] `services/prompt_eval_migration.py`：ensure_prompt_eval_video_columns + main.py 挂载 + 测试
- [ ] `services/prompt_eval_service.py`：validate_case_body/case_to_dict/update_case（media_type、scene+video 拒绝）；create_run（video+dual 拒绝）；run_pipeline 视频分支；start_run_pipeline 快照；run_to_dict；run_owns_media 覆盖视频文件
- [ ] `tests/test_prompt_eval_api.py` 或新测试：media_type 矩阵 / 密钥提示 / 流水线分支（monkeypatch）

## 4. 路由与前端
- [ ] `routers/prompt_eval.py`：create_run/create_scene_run 视频密钥提示文案
- [ ] `PromptEvalWorkbench.vue`：media_type 切换、video 表单约束、视频播放器 + 帧展示
- [ ] 门禁：后端 pytest（本次文件）+ 前端 npm run build

## 5. 文档与交付
- [ ] PRD-PROMPT-EVAL-SYSTEM-2026-08-11.md §14 更新（v2 已实现）
- [ ] CHANGELOG.md / .quality-gates.md / 01-docs/learnings.md 复盘
- [ ] worktree 分支 codex/prompt-eval-video → PR → 合并 → openspec archive + CCG 归档 + 安全删 worktree
