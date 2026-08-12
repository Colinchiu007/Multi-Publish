# prompt-eval-ops-scenes Specification

## Purpose
运营后台评测工作台场景层工作流：运营输入整篇文案，后台按桌面端分句机制拆成场景层，逐场景展示「场景文字 / 字幕二次分句 / 场景上下文 / 优化后提示词中英对照」，再逐场景真实生成图片并评估，驱动提示词优化引擎迭代。分句/上下文/评估契约与桌面端一致；v1 仅图片，视频 v2 预留。

## Requirements

### Requirement: 场景级分句与字幕二次分句
后台 SHALL 提供与桌面端 `story2video-engine/src/text-segmentation.ts` 语义一致的场景级分句与字幕二次分句服务（Python 实现，生产不依赖 node）：句子边界消歧（中英文标点 + 空白归一）→ 场景级分组（按 `target_chars_per_scene` 预算）→ 字幕分块（`subtitle_min_chars`/`subtitle_max_chars` + 标点优先级）→ proportional/equal 时间线。一致性 SHALL 由 pytest 内 esbuild 打包桌面端 TS 模块、node 执行同一输入逐项断言（scenes/subtitles/duration）。

#### Scenario: 分句结果与桌面端一致
- **WHEN** 同一文案与同一分句配置输入 Python 服务与桌面端 TS 模块
- **THEN** 场景列表、每场景字幕块文本与时长逐项一致（覆盖普通中文/多标点/短场景/边界字数）

#### Scenario: 分句配置校验
- **WHEN** target_chars_per_scene 非 1-200 整数、subtitle_min_chars 非 1-50、subtitle_max_chars ≤ min 或 >200、subtitle_timing 非 proportional/equal
- **THEN** 返回 400 可操作错误，不创建 case

### Requirement: 场景上下文提取
后台 SHALL 为每个场景提取场景上下文（白名单键：genre/era/culture/setting/time/characters/props/visual_style/tone/summary/anchors/negative_anchors），语义对齐桌面端 `story-context-engine.js`；敏感键 SHALL fail closed（与整篇 context 校验同规则）；提取异常 SHALL 标记 degraded 而非降级丢弃。

#### Scenario: 场景上下文键正确
- **WHEN** 场景文字与整篇文案已知
- **THEN** 返回上下文仅含白名单键，缺失键不输出，异常路径返回 degraded 标记

### Requirement: scene 模式 case 与数据模型
后台 SHALL 支持 `source_mode`（manual|scene）：scene 模式 case 只存整篇原文与生成配置（prompt_zh 可为空，由逐场景 LLM 生成），并新建独立 `prompt_eval_scenes` 表（case_id/index/scene_text/subtitle_blocks/scene_context/prompt_zh/prompt_en/prompt_en_source/时间戳）；`prompt_eval_runs.scene_id` SHALL 可空，manual 模式向后兼容。

#### Scenario: scene case 幂等重建
- **WHEN** 同一 case 重新分句
- **THEN** 旧 scenes 与其 run 关联保留或按删除策略处理，新 scenes 重建且 index 从 0 连续

### Requirement: 逐场景中英优化提示词
后台 SHALL 按「整篇原文 + 场景文字 + 场景上下文」调用 LLM 生成该场景优化提示词中文（prompt_zh）并翻译英文（prompt_en），来源 SHALL 服务端标注 machine_translation 且幂等缓存（同 prompt_zh 7 天内复用，prompt_en_cache_zh 变更时失效重译）；UI SHALL 标注「机器翻译」。优化/翻译结果为空 SHALL 报错可重试。

#### Scenario: 场景中英对照生成与缓存
- **WHEN** 运营对场景调用 translate
- **THEN** 生成并落库该场景 prompt_zh/prompt_en（machine_translation）；7 天内重复调用复用缓存不重复计费

### Requirement: 逐场景生成与评估状态机
场景 run SHALL 复用 12A.22 生成→评估状态机：queued→processing→succeeded（生成物落盘）→evaluating→succeeded/failed；失败 SHALL 记录阶段与原因，不静默降级；评估输出非法 SHALL eval_status=failed 且生成物保留；run 携带 scene_id 以便按场景聚合。

#### Scenario: 场景 run 生命周期
- **WHEN** 运营对某场景触发「生成图片并评估」
- **THEN** 创建带 scene_id 的 run 并异步执行；状态可轮询；完成后场景卡片展示总分/等级/维度/问题/优化点

### Requirement: 场景接口
后台 SHALL 提供：`POST /api/v1/prompt-eval/cases`（scene 模式：整篇文案+分句配置→建 case+scenes，同步返回）、`GET /api/v1/prompt-eval/cases/{id}`（scene 模式含 scenes）、`POST /api/v1/prompt-eval/cases/{id}/scenes/{sid}/translate`、`POST /api/v1/prompt-eval/cases/{id}/scenes/{sid}/runs`；鉴权与 manual 模式一致（读=登录、写=登录/创建者、密钥=admin）。场景数超 100 SHALL 拒绝。

#### Scenario: 场景接口鉴权与边界
- **WHEN** 非创建者/非 admin 访问他人场景；或场景数超 100；或 provider 未配置密钥
- **THEN** 404/400 可操作错误；未配置密钥提示「未配置可用的图片生成模型」

### Requirement: 前端场景工作流
运营后台前端 SHALL 在「新建评测」提供 manual/scene 切换：scene 模式输入整篇文案（≤20000 字）+ 高级分句配置（默认与桌面端一致：20/8/15/proportional）→「分句并生成场景」→ 场景卡片四区（场景文字 / 字幕二次分句含时长 / 场景上下文键值 / 优化后提示词中英对照带机器翻译标注）→ 逐场景「重新生成中英对照」「生成图片并评估」；进行中状态徽章与轮询刷新，完成后展示总分/等级/维度进度/问题 Top3。评测列表详情 SHALL 展示 scene 模式与场景摘要。

#### Scenario: 整篇文案→场景层→逐场景生成
- **WHEN** 运营输入整篇文案并分句
- **THEN** 展示全部场景卡片；运营可逐场景生成中英对照与图片评估；多场景生成互不阻塞
