# 视频提示词评测 — 设计

## 总体流程（video case）

```
POST /cases {media_type:"video", provider:"agnes-video", model:"agnes-video-v2.0", ...}
  → 校验（media_type ∈ {image,video}；scene+video 拒绝；video+dual 拒绝）
POST /cases/{id}/runs
  → 读视频 provider 密钥（prompt_eval_provider_keys）→ 缺失 400 角色感知提示
  → create_run（video 仅 single）→ start_run_pipeline
run_pipeline（media_type=video）：
  processing → video_service.generate_video（异步状态机）→
    提交 POST {base}/videos {model,prompt,width,height,num_frames,frame_rate}
    → taskId → 轮询 GET {域名根}/agnesapi?video_id={taskId}&model_name={model}（15s 间隔，总超时 20min，429/5xx 有界退避；与桌面端 agnes-video.js 对齐）
    → 成功取 video URL → 下载（≤50MB + MP4 ftyp 魔数）→ 落盘 run_{id}_video.mp4
    → ffmpeg 抽帧 首/中/尾（-ss 0 / duration/2 / duration-0.5）→ run_{id}_frame_0..2.png
    → run.video_path / run.video_frames 落库，status=succeeded, eval_status=evaluating
  → 评估：build_eval_prompt(media_type=video)（4 视频维度模板）
    → evaluate_images（3 帧字节，复用现有 chat/completions 通道，max_tokens=4000）
    → parse_and_validate(raw, 3, media_type="video") → 落库 overall/dimensions/...
```

## 数据模型与迁移

- `prompt_eval_cases.media_type` String(16) NOT NULL DEFAULT 'image'（image|video）。
- `prompt_eval_runs.video_path` String(512)（模型已有，存量库幂等 ALTER 补列）。
- `prompt_eval_runs.video_frames` Text（JSON 数组，3 帧文件名；评估输入与展示追溯）。
- 迁移 `ensure_prompt_eval_video_columns()`：PRAGMA 探测→ALTER（复用 scene/dual 迁移模式），main.py 启动时追加调用。

## 契约（prompt_eval_contract.py）

- `MEDIA_TYPES = ["image","video"]`；`VIDEO_FRAME_COUNT = 3`。
- `resolve_video_dimension_weights()`：固定 4 维（0.30/0.30/0.20/0.20，和=1），不随帧数变化。
- `validate_eval_result(payload, image_count, media_type="image")`：video → 维度白名单=视频 4 维；其余校验（overall/problems/points）与图片一致。
- 桌面端一致性：dimensions.js VIDEO_DIMENSIONS id 列表已由 test_prompt_eval_contract.py 断言；video 权重即注册表原值（两端一致，不加归一化分支）。

## 评估模板（prompt_eval_evaluation_service.py）

- `build_eval_prompt(..., media_type="image")`：video 分支输出 4 视频维度说明（时序一致性/运动准确性/音画同步/视频审美质量），输入快照标注「视频抽帧 3 张（首/中/尾）」，约束强调基于帧序列判断运动与时序。
- `parse_and_validate(raw, image_count, media_type="image")` 透传。

## 视频生成服务（新 prompt_eval_video_service.py）

- 契约镜像桌面端 `agnes-video.js`（Agnes Video V2.0，OpenAI 兼容）：
  - 提交 `POST {base}/videos`：`{model, prompt, width:1152, height:768, num_frames:121, frame_rate:24}` → `{taskId}`。
  - 轮询 `GET {域名根}/agnesapi?video_id={taskId}&model_name={model}`：status ∈ queued/in_progress/completed/failed/error/canceled/expired；成功返回 video URL（video_url 或 data.url 兼容取）。
  - 429/5xx 有界退避（[1,2,4,8]s 上限 4 次）；网络错误重试 2 次；总轮询超时 20min（OPS_PROMPT_EVAL_VIDEO_POLL_TIMEOUT 可覆盖，测试用短值）。
- 下载：httpx GET（timeout 120s），`validate_video_bytes`：≤50MB + MP4 魔数（ftyp box 偏移 4-8 为 'ftyp'）。
- 抽帧：`extract_frames(video_path, out_dir, run_id)`：
  - ffmpeg 解析：`imageio_ffmpeg.get_ffmpeg_exe()`（env `FFMPEG_BIN` 优先，测试注入假二进制/直接 monkeypatch 执行函数）。
  - duration：`ffmpeg -i input` stderr 解析 `Duration: HH:MM:SS.xx`（无 ffprobe 依赖）。
  - 抽帧：`ffmpeg -ss {t} -i input -frames:v 1 -q:v 2 out.png`（t=0 / duration/2 / max(0,duration-0.5)），subprocess 在 `asyncio.to_thread` 执行，单帧超时 30s。
  - 产物校验：PNG 魔数 + 非空。
- 组合 `generate_video(cfg, prompt, out_dir, run_id, http=None, now=None, poll_interval=None)` → `{"video": name, "frames": [3 个文件名]}`；任一步失败抛 `VideoGenerationError`（fail closed）。

## 流水线（prompt_eval_service.py）

- `validate_case_body`：media_type 校验；scene+video → ValueError；video 时 image_count/aspect_ratio 不参与生成（保留默认值 1/16:9 兼容）；case_to_dict/update_case 透传 media_type。
- `create_run`：video+dual → ValueError「视频评测暂不支持双路对比」；create_scene_run 保持图片。
- `run_pipeline`：media_type=="video" 分支调用 video_service.generate_video；快照（start_run_pipeline/variant_snapshot）加 media_type 字段。
- `run_to_dict`：输出 video_path/video_frames。
- `run_owns_media`：归属查询覆盖 image_paths + video_path + video_frames（文件名集合匹配）。

## 路由（routers/prompt_eval.py）

- create_run：video 时密钥缺失提示「未配置可用的视频生成模型（视频评测）」；vision 缺失文案不变。
- media 路由逻辑不变（FileResponse 自动按扩展名给 video/mp4 + Range 支持），授权函数已扩展。
- 场景 run 入口：case.media_type==video 不可能发生（创建即拒绝），无需额外分支。

## 前端（PromptEvalWorkbench.vue）

- manual 表单顶部 media_type radio（图片评测/视频评测）；video 时隐藏 图片数/画幅，禁用 dual radio（提示「视频评测暂不支持双路对比」），提示文案「约 5 秒视频，抽首/中/尾 3 帧评估」。
- ensureCase payload 带 media_type；按钮「生成视频并评估」。
- 详情「生成物」栏：currentRun.video_path → `<video controls :src="mediaUrl(video_path)">` + 帧缩略图（video_frames）；否则维持图片缩略图。
- 场景模式：保持图片（不暴露 media_type）。

## 测试

- contract：video 权重固定 4 维；validate_eval_result video 白名单/缺维拒绝；build_eval_prompt video 含 4 维 id；parse_and_validate video 透传。
- video service：mock httpx（提交/轮询/下载/失败），monkeypatch 抽帧执行（假 ffmpeg 输出 PNG），时长解析，超时/退避，魔数拒绝，文件名与 8MB 检查（视频 50MB）。
- API：media_type 矩阵（video 创建成功/scene+video 400/dual+video 400/密钥缺失文案）；video run 流水线分支（monkeypatch video_service.generate_video）。
- migration：video 三列幂等补列（新建库 + 存量库模拟）。
- 一致性：test_prompt_eval_contract.py 增加 VIDEO_DIMENSIONS 权重断言（两端注册表原值）。

## 外部边界与验收

- 真实 Agnes 视频生成（队列 15min+ 级别）、真实视觉评估模型为外部验收项，自动化测试全部 mock。
- 音画同步维度基于视觉帧近似评估；音频抽取与真实音轨评估标记 v2.2 预留，PRD 注明。
