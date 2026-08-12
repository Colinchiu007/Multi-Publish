# prompt-eval-ops-workbench Specification

## Purpose
运营后台「提示词评测工作台」：由运营人员真实生成图片/视频，对提示词优化引擎的改写效果进行同屏比对与聚合分析；中英对照由后台 LLM 自动翻译并标注「机器翻译」；评估契约与桌面端 PromptEval 保持一致。v1 图片先行，视频 v2 预留。
## Requirements
### Requirement: 评测 case 与中英对照
运营人员 SHALL 能创建评测 case（原文 source_text、可选 context、优化后提示词中文 prompt_zh、provider/model、image_count 1-20、aspect_ratio 枚举），并触发后台 LLM 自动翻译 prompt_zh→prompt_en，来源 SHALL 由服务端标注为 machine_translation（客户端不可伪造）且幂等缓存（同 prompt_zh 7 天内复用）；UI SHALL 在英文提示词旁标注「机器翻译」。

#### Scenario: 创建 case 并生成中英对照
- **WHEN** 运营提交合法 case 并调用 translate
- **THEN** case 落库且 prompt_en 由服务端翻译生成并标注 source=machine_translation；重复翻译复用缓存

#### Scenario: 校验失败
- **WHEN** source_text 为空/超长、prompt_zh 空/超长、context 含敏感键（递归）、provider 未配置密钥、aspect_ratio 非法
- **THEN** 返回 400 + OPS_PROMPT_EVAL_* 错误，不创建 case

### Requirement: 真实生成与评估状态机
创建 run SHALL 异步执行「生成 → 评估」：queued→processing→succeeded（生成物落盘/COS）→ evaluating→succeeded/failed；生成失败（空/非法图片、provider 错误）SHALL run failed 且不静默降级；评估输出非法（非 JSON/分数越界/维度白名单外/problems·points 非数组）SHALL eval_status=failed 且生成物保留；error 记录阶段与原因。

#### Scenario: 生成成功评估失败
- **WHEN** 生成成功但评估 LLM 返回非法输出
- **THEN** run.status=succeeded 且 eval_status=failed，error 记录评估阶段原因，生成物可查看

#### Scenario: 生成失败
- **WHEN** provider 返回空结果或非受支持图片
- **THEN** run.status=failed，error 记录生成阶段原因，不写评估

### Requirement: 模型密钥管理
后台 SHALL 提供 admin 级模型密钥目录（provider/model/base_url/enabled 加密存储），密钥明文 SHALL 不出现在任何响应、日志或评估提示词；未配置可用密钥时创建 run SHALL 返回可操作错误「未配置可用的图片生成模型」。

#### Scenario: admin 管理密钥
- **WHEN** 管理员维护 provider 密钥
- **THEN** 返回不含密钥明文；未登录/非 admin 写操作 401/403

### Requirement: 聚合分析
后台 SHALL 提供聚合接口：记录数、平均分、等级分布、维度均值、问题类别分布、优化点 Top、按 provider/model 对比；口径与桌面端 PromptEval analyze 一致（维度/等级映射相同）。

#### Scenario: 聚合正确
- **WHEN** 存在多个 run
- **THEN** /summary 返回统计与分布，且维度/等级枚举与桌面端一致（一致性测试断言）

### Requirement: 前端评测工作台
运营后台前端 SHALL 提供「评测工作台」三 Tab（新建评测 / 评测列表与详情·四栏同屏 原文|中英提示词|生成物|评估结果·多 run 对比 / 聚合分析）与「模型密钥」管理页（admin）；无密钥时显示引导文案；生成/评估过程以状态徽章与进度提示呈现。

#### Scenario: 同屏比对
- **WHEN** 打开 case 详情
- **THEN** 展示 原文、中英提示词（英文标机器翻译）、生成图片缩略图、评估结果（总分/等级/维度/问题/优化点），并可并排对比同 case 多 run

### Requirement: 视频 v2 预留
v1 SHALL 仅支持图片（mediaType=image）；runs 表 SHALL 预留 video_path 字段；评估维度表 SHALL 预留 temporal_consistency/motion_accuracy/audio_visual_sync/video_aesthetic_quality（v2 实现，v1 不暴露视频入口）。

#### Scenario: 视频暂不支持
- **WHEN** 请求含视频生成参数
- **THEN** 返回 OPS_PROMPT_EVAL_MEDIA_TYPE_NOT_SUPPORTED「视频评测暂未实现」

