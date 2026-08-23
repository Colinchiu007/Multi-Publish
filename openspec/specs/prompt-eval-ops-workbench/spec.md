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

#### Scenario: scene 模式创建 case（场景层评测工作流扩展）
- **WHEN** 运营选择场景模式并提交整篇文案（≤20000 字）与分句配置
- **THEN** 创建 source_mode=scene 的 case（prompt_zh 不必需，由逐场景 LLM 生成）并同步分句返回 scenes 列表；manual 模式行为与校验不变

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

### Requirement: 视频评测
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

### Requirement: 媒体类型边界
媒体类型 SHALL 受以下边界约束，违反返回 400 明确提示：mediaType ∈ {image, video}；场景模式（source_mode=scene）SHALL 仅支持图片（video → 「场景模式暂不支持视频评测」）；视频 SHALL 仅支持 single 对比模式（dual → 「视频评测暂不支持双路对比」）。

#### Scenario: 拒绝非法组合
- **WHEN** 提交 scene+video 或 video+dual 组合
- **THEN** 返回 400 且不创建 case/run

### Requirement: 视频生成密钥
视频生成 provider 密钥 SHALL 与图片同表（prompt_eval_provider_keys）管理（admin、加密存储、不返明文）；video case 创建 run 时若未配置可用视频密钥，SHALL 返回角色感知提示（admin：「视频生成模型」；非 admin：联系管理员），不携带空密钥请求上游。

#### Scenario: 缺失视频密钥
- **WHEN** video case 触发 run 且无可用视频 provider 密钥
- **THEN** 返回 400 角色感知提示，不发起任何 provider 请求

### Requirement: 评测列表/详情（场景维度）
评测列表 SHALL 展示 source_mode 列；scene 模式详情 SHALL 额外返回 scenes（含每场景字幕块/上下文/中英提示词）并展示场景摘要，runs 可按 scene_id 归属到场景卡片。

#### Scenario: scene 模式详情
- **WHEN** 打开 scene 模式 case 详情
- **THEN** 展示 scenes 列表与场景 run 关联（scene_id），manual case 不返回 scenes

### Requirement: 双路对比模式

评测 case SHALL 支持 `compare_mode`（`single` 默认 / `dual`）。`dual` 模式下创建 run SHALL 派生两个 run 变体：`prompt_variant=manual`（人工录入 prompt_zh，走既有路径）与 `prompt_variant=engine`（引擎生成）。`single` 模式 MUST 保持既有行为（仅 manual 变体）。`prompt_variant` 字段在 runs 表中 SHALL 有默认值 `manual`，既有数据无需迁移。

#### Scenario: dual 创建双变体
- **WHEN** 运营创建 `compare_mode=dual` 的 case 并触发 run
- **THEN** 生成两个 run 记录（manual/engine），状态机、媒体归属、聚合统计各自独立

#### Scenario: single 行为不变
- **WHEN** 运营创建 `compare_mode=single`（默认）的 case 并触发 run
- **THEN** 仅生成 manual 变体，输出与既有版本一致

### Requirement: 引擎优化变体生成

`engine` 变体 SHALL 通过 prompt-engine HTTP 接口（`OPS_PROMPT_ENGINE_BASE_URL`，默认 `http://prompt-engine:8013`，`POST /v1/optimize`）从 case 的 `source_text`（+`context`）生成优化提示词，作为该变体的 `prompt_zh` 快照；`prompt_en` SHALL 走既有翻译服务（与 manual 一致，标注 machine_translation）。引擎请求参数 SHALL 落库于 `engine_meta`（含 `pair_id`、`creative_level` 默认 8、`num_candidates` 默认 3、`max_length` 默认 500、`excluded_characters`/`no_swap_pairs` 透传）。引擎调用 SHALL 有界超时（20s）+ 单次重试，失败时 engine 变体 MUST NOT 创建，返回可操作错误 `OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE`，manual 变体 MUST 不受影响。

#### Scenario: 引擎成功生成
- **WHEN** prompt-engine 可达且返回合法优化提示词
- **THEN** engine 变体 run 创建成功，携带 prompt_zh/prompt_en 快照与 engine_meta（pair_id 与 manual 变体同批次一致）

#### Scenario: 引擎不可达
- **WHEN** prompt-engine 超时/5xx/返回非法输出
- **THEN** 返回 OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE（含引擎阶段标记），不创建 engine 变体；manual 变体正常创建

#### Scenario: 引擎响应非法
- **WHEN** 引擎返回空串或非字符串 optimized_prompt
- **THEN** 按引擎失败处理，显式失败且不静默降级到人工提示词

### Requirement: 双路独立状态机

manual 与 engine 变体 SHALL 各自独立执行「生成 → 评估」状态机（queued→processing→evaluating→succeeded/failed），评估维度与权重 MUST 与既有 4 维一致（relevance 30% / content_accuracy 30% / aesthetic_quality 20% / cross_image_consistency 20%）；任一变体失败 MUST NOT 影响另一变体状态。

#### Scenario: 一路失败一路成功
- **WHEN** engine 变体图片生成失败（如 provider 限流）而 manual 变体成功
- **THEN** engine run.status=failed（error 含生成阶段），manual run 保持 succeeded 且可查看

### Requirement: 双路聚合对比

summary 接口 SHALL 提供 `dual` 对比区块：仅统计同一 `pair_id` 内 manual+engine 均成功的成对 run；输出 manual/engine 平均分、四维均值、平均分差、提升率（(avg_engine−avg_manual)/avg_manual，分母为 0 时 null）、等级分布差。无成对数据时 dual 区块 SHALL 为空（不影响既有聚合输出）。

#### Scenario: 成对统计
- **WHEN** 存在 3 对成对成功 run（同一 pair_id 内两变体均 succeeded）
- **THEN** dual 区块输出基于 3 对的对比统计，且口径可复现（配对键 = pair_id）

#### Scenario: 无成对数据
- **WHEN** 所有 run 均为 single 模式或 engine 变体全部失败
- **THEN** dual 区块为空对象，既有 summary 输出不变

### Requirement: 引擎连通性探测

后台 SHALL 提供 `GET /api/v1/prompt-eval/engine/status`（admin）探测 prompt-engine `/health` 并返回 base_url/可达性/耗时；不可达时返回 503 + 可操作错误（提示检查 OPS_PROMPT_ENGINE_BASE_URL 与引擎服务）。该接口 MUST NOT 消耗引擎 LLM 配额（仅 /health 探测）。

#### Scenario: 引擎可达
- **WHEN** prompt-engine /health 返回 200
- **THEN** 返回 {ok: true, base_url, latency_ms}

#### Scenario: 引擎不可达
- **WHEN** /health 超时或非 200
- **THEN** 返回 503 + OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE，不抛未处理异常

### Requirement: 前端双路对比展示

评测工作台前端 SHALL 在新建表单提供 `compare_mode` 选择（默认「仅人工提示词」）；`dual` 时展示引擎参数（creative_level/num_candidates 高级折叠）。case 详情页对 dual case SHALL 按 variant 并排展示（原版 | 引擎优化版），engine 变体标注「引擎生成」徽章并展示 engine_meta 摘要（tooltip）；聚合分析页 SHALL 展示双路对比卡片（平均分差/提升率）。run 状态轮询接口 SHALL 返回 `prompt_variant` 供前端分组。

#### Scenario: dual case 并排
- **WHEN** 打开 compare_mode=dual 的 case 详情
- **THEN** 页面按 manual/engine 分组并排展示两路的中英提示词、生成物与评估结果，且 variant 标记可见

#### Scenario: single case 无引擎痕迹
- **WHEN** 打开 compare_mode=single 的 case 详情
- **THEN** 页面与既有版本一致，不出现引擎相关 UI

### Requirement: 引擎调用携带 BYOK llm 绑定

双路对比（`compare_mode=dual`）创建 run 时，engine 变体调用 `POST {OPS_PROMPT_ENGINE_BASE_URL}/v1/optimize` SHALL 携带 `llm` 对象 `{provider, model, api_key, base_url}` 与 `caller`（`ops-center`）。`llm` 绑定 SHALL 来源于「模型密钥」表 `minimax-llm`（优先默认项），回退 `OPS_PROMPT_EVAL_LLM_BASE_URL/MODEL/API_KEY` 环境变量；ops-center provider 名 SHALL 映射为引擎 provider 注册名（`minimax-llm → minimax`，其余未注册名 → `openai_compat`，与桌面端 `engineProviderFor` 语义一致）。`api_key` SHALL 仅进入请求 payload，MUST NOT 写入日志或 `engine_meta`。

#### Scenario: dual 创建请求携带 llm
- **WHEN** 创建 `compare_mode=dual` 的 case 并触发 run 且 minimax-llm 密钥已配置
- **THEN** 引擎请求体包含 `llm.provider=minimax`、非空 `llm.model`/`llm.api_key`/`llm.base_url`，且 `caller=ops-center`

#### Scenario: 环境变量回退
- **WHEN** 模型密钥表无 minimax-llm 但配置了 `OPS_PROMPT_EVAL_LLM_*` 环境变量
- **THEN** llm 绑定由环境变量构造（provider 恒为 `minimax`），引擎请求仍携带 llm

### Requirement: 缺 llm 密钥 fail-fast 不退引擎请求

`compare_mode=dual` 创建 run 时若 llm 密钥缺失（表与环境变量均无），后台 SHALL 返回 400 可操作错误（提示在「模型密钥」添加 minimax-llm 或设置 `OPS_PROMPT_EVAL_LLM_API_KEY`），MUST NOT 发起不带 llm 的引擎请求（避免带空 key 请求上游返回误导性 422/502）。

#### Scenario: 未配置 llm 密钥
- **WHEN** dual run 且 minimax-llm 与 `OPS_PROMPT_EVAL_LLM_*` 均未配置
- **THEN** 返回 400 且不调用引擎；manual 变体不创建

### Requirement: 客户端向后兼容

`optimize()` 客户端 SHALL 仅在调用方显式传入 llm 时写入 payload；未传 llm（免 LLM 路径或旧引擎调用方）时 payload 与既有契约一致，不得强制注入。需要 LLM 的请求若因调用方缺 llm 而被引擎 422 拒绝，客户端 SHALL 按既有 `EngineUnavailableError`（HTTP >=400）fail-closed 语义显式报错。

#### Scenario: 免 LLM 路径不带 llm
- **WHEN** 调用方未传 llm（如 `creative_level<=3` 模板直出场景）
- **THEN** payload 不含 `llm` 字段，既有行为不变

#### Scenario: 引擎 422 显式失败
- **WHEN** 引擎因缺 llm/非法 llm 返回 422
- **THEN** 客户端抛出 `EngineUnavailableError`（错误信息含 HTTP 422），不静默降级到人工提示词

