# prompt-eval-ops-workbench Specification (delta: prompt-eval-video)

## Purpose
运营后台「提示词评测工作台」v2：在图片评测基础上新增视频评测——真实视频生成（异步任务）+ 首/中/尾 3 帧抽帧 + 复用视觉评估契约；输出与图片一致（overall/dimensions/problems/promptOptimizationPoints）。

## MODIFIED Requirements

### Requirement: 视频评测（原「视频 v2 预留」升级）
运营后台 SHALL 支持 mediaType=video 的评测 case：真实调用视频生成 provider（异步提交→轮询→下载），服务端 ffmpeg 抽帧（首/中/尾 3 帧），评估输入为 3 帧图片字节，评估 LLM 契约复用图片通道但维度固定为视频 4 维（temporal_consistency/motion_accuracy/audio_visual_sync/video_aesthetic_quality，权重 0.30/0.30/0.20/0.20）；run SHALL 落盘 video_path 与 video_frames（3 帧文件名），媒体授权（owner/admin）覆盖视频与帧文件。

#### Scenario: 视频 case 完整链路
- **WHEN** 运营创建 mediaType=video case（provider=agnes-video 等视频槽位）并触发 run
- **THEN** run 异步完成 生成→评估；run.video_path 指向落盘视频、run.video_frames 为 3 帧文件名；评估维度为视频 4 维且权重和=1

#### Scenario: 视频生成失败
- **WHEN** 视频 provider 提交失败/轮询超时/下载或抽帧失败
- **THEN** run.status=failed 且 error 记录生成阶段原因，不写评估（fail closed，不静默降级为图片）

#### Scenario: 视频评估失败
- **WHEN** 生成成功但评估输出非法（维度白名单外/分数越界/problems·points 缺失）
- **THEN** run.eval_status=failed，error 记录评估阶段原因，视频与帧保留可查看

### Requirement: 媒体类型边界（新增）
媒体类型 SHALL 受以下边界约束，违反返回 400 明确提示：mediaType ∈ {image, video}；场景模式（source_mode=scene）SHALL 仅支持图片（video → 「场景模式暂不支持视频评测」）；视频 SHALL 仅支持 single 对比模式（dual → 「视频评测暂不支持双路对比」）。

#### Scenario: 拒绝非法组合
- **WHEN** 提交 scene+video 或 video+dual 组合
- **THEN** 返回 400 且不创建 case/run

### Requirement: 视频生成密钥
视频生成 provider 密钥 SHALL 与图片同表（prompt_eval_provider_keys）管理（admin、加密存储、不返明文）；video case 创建 run 时若未配置可用视频密钥，SHALL 返回角色感知提示（admin：「视频生成模型」；非 admin：联系管理员），不携带空密钥请求上游。

#### Scenario: 缺失视频密钥
- **WHEN** video case 触发 run 且无可用视频 provider 密钥
- **THEN** 返回 400 角色感知提示，不发起任何 provider 请求
