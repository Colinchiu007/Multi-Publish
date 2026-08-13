# PIPELINE-MATRIX.md — 视频创作流水线矩阵

> 快照日期：2026-08-13（基于当前 `main` 分支代码）
> 用途：开发 / Code Review / 需求评审时快速核对「流水线 × 阶段 × 执行引擎 × 可用性 × 供应商要求」。
> 口径：以 **Electron JS 侧 `PipelineEngine` stageDefs 为实际执行权威**；Python YAML manifest 为契约/技能消费层，两者存在阶段命名漂移（见 §6）。

## 1. 总览（14 条注册流水线）

| # | 流水线 | 类别 | 阶段数(JS) | 执行注册器 | stability | 成本 | 可真实执行 |
|---|---|---|---|---|---|---|---|
| 1 | animated-explainer | generated | 8 | explainer-stages.js | production | medium | ✅ |
| 2 | talking-head | talking_head | 4 | talkinghead-stages.js | beta | low | ✅ |
| 3 | cinematic | cinematic | 4 | cinematic-stages.js | production | medium | ✅ |
| 4 | animation | animation | 4 | videogen-stages.js | production | high | ✅ |
| 5 | avatar-spokesperson | talking_head | 4 | videogen-stages.js | production | high | ✅ |
| 6 | character-animation | animation | 4 | videogen-stages.js | beta | high | ✅ |
| 7 | clip-factory | screen_recording | 4 | clipfactory-stages.js | beta | low | ✅ |
| 8 | documentary-montage | cinematic | 5 | documentary-stages.js | beta | medium | ✅ |
| 9 | hybrid | hybrid | 4 | videogen-stages.js | production | high | ✅ |
| 10 | localization-dub | hybrid | 4 | localization-stages.js | beta | medium | ✅ |
| 11 | podcast-repurpose | hybrid | 4 | podcast-repurpose-stages.js | beta | low | ✅ |
| 12 | screen-demo | screen_recording | 3 | **无 stageDefs** | production | low | ❌ 仅状态机 |
| 13 | framework-smoke | custom | 2 | smoketest-stages.js | beta | low | ✅ |
| 14 | story2video-compose | generated | 9 | story2video-stages.js | beta | high | ✅ |

可用性判定：`PipelineEngine.listPipelines()` 以「是否含 stageDefs」为 `available` 依据；`screen-demo` 无 stageDefs，仅列表展示不可运行。

## 2. 阶段明细（JS stageDefs 实际执行）

### 2.1 story2video-compose（产品主流水线，9 阶段）

| 阶段 | 执行类型 | checkpointRequired | 说明 |
|---|---|---|---|
| split | 内置 SPLIT | false | 双层分句：smart-sentence-splitter(8002) 生成场景，本地生成字幕块；连接/超时类错误本地降级 |
| domain_enrich | story2video_domain_enrich | false | 可选领域增强：history 识别时代/朝代生成视觉上下文 |
| scene_context | story2video_scene_context | false | 场景上下文增强中间层（2026-08-11 新增） |
| optimize | story2video_optimize | **true** | 提示词统一经 prompt-engine(8013) 优化 + 输出校验 |
| select_video_scenes | story2video_select_video_scenes | false | 视频增强场景选择：off / fixed(默认25%) / ai-judged(20-40%,≤maxScenes) |
| generate_assets | story2video_generate_assets | **true** | 并行生成图片 + TTS + 可选 AI 视频；manual 模式产出候选 |
| finalize_assets | story2video_finalize_assets | false | 分镜素材自选确认后生成旁白并组装最终素材 |
| compose | 内置 COMPOSE | **true** | ffmpeg 合成：转场/字幕/BGM/水印；mp4 或 webm |
| publish | 内置 PUBLISH | **true** | 多平台发布；未开启/未选平台标记 skipped |

> 注：UI「启动流水线」固定提交 `autoAdvance=true` + `checkpointPolicy='none'`，因此即使 4 个阶段标记 checkpointRequired=true 也全程自动执行。

### 2.2 其余流水线（阶段均 checkpointRequired=false，自动执行）

| 流水线 | 阶段 |
|---|---|
| animated-explainer | research → proposal → script → scenes → assets → editing → compose → publish |
| talking-head | upload → transcribe → captions → render |
| cinematic | ingest → grade → compose → render |
| animation | concept → storyboard → animate → render |
| avatar-spokesperson | avatar_select → script → generate → render |
| character-animation | character_design → rigging → animate → render |
| clip-factory | analyze → extract → caption → export |
| documentary-montage | research → ingest → edit → narrate → render |
| hybrid | plan → generate → merge → render |
| localization-dub | transcribe → translate → tts → sync |
| podcast-repurpose | analyze → visualize → assemble → render |
| screen-demo | record → annotate → render（未实现 stageDefs） |
| framework-smoke | verify → report |

## 3. 供应商 / 依赖要求

| 流水线 | 必需能力 | 说明 |
|---|---|---|
| animated-explainer | LLM 规划链 + 图片生成 + TTS + ffmpeg | assets 阶段并发 3，16:9 |
| talking-head | 本地 ffmpeg 字幕烧录 | 上传视频+文案，无 AI provider 必须项 |
| cinematic | 本地 ffmpeg | 调色 + 淡入淡出 + 分辨率合成 |
| animation / avatar-spokesperson / character-animation / hybrid | **视频生成 provider** + LLM + ffmpeg | videogen_generate 未配置时 fail closed 引导设置 |
| clip-factory | 本地 ffmpeg | 场景检测→逐段剪辑→标题→合并导出 |
| documentary-montage | LLM + 图片生成 + TTS + ffmpeg | ken-burns，16:9 |
| localization-dub | LLM 翻译 + TTS + ffmpeg | 源视频+文案→分句时间段→翻译→配音→替换音轨 |
| podcast-repurpose | 图片生成 + ffmpeg | 音频输入→每段配图→切分组装 |
| framework-smoke | ffmpeg/ffprobe 工具链 | 冒烟测试 |
| story2video-compose | 8002 分句 + 8013 prompt-engine + 图片 + TTS + 可选 AI 视频 + ffmpeg + PublisherRouter | 输出 ≤600s；BGM ≤15MB(wav/m4a/mp3) |

供应商实现目录：`packages/python-backend/src/multi_publish/video_creation/providers/{image,video,audio}/`（image 15 个、video 20+（含 stock_sources）、audio TTS 6 + 音乐 4）。

## 4. 输入 / 输出合同

- **story2video-compose 仅收 text**：`mode !== 'text'`、携带 images/audio/video 均抛错；image/remix/gallery/audio/batch 为历史六模式，已显式排除。
- 输出：`mp4 | webm`；旁白独立 `narration.m4a`；compose 支持转场 xfade、BGM 混音、水印、字幕、follow-audio/min-duration 时长模式。
- 其他流水线输入按需（video/audio/text），无统一 text-only 限制。

## 5. checkpoint 语义

- 引擎双模式：`state_machine`（仅状态跟踪，兼容旧 13 条行为）/ `orchestrator`（`startOrchestrated()` 真实执行）。
- 除 story2video-compose 的 optimize/generate_assets/compose/publish 外，所有 JS stageDefs checkpointRequired 均为 false。
- Python YAML `default_checkpoint_policy: guided` 全部 14 条一致；story2video 的 6 个合同阶段 checkpoint 标记与 JS 一致，其余流水线 YAML 为通用模板，不代表 JS 行为。

## 6. 已知不一致（JS stageDefs vs Python YAML manifest）

- 多数流水线的 YAML 使用通用模板阶段（idea/script/scene_plan/assets/edit/compose/publish），与 JS 实际执行阶段（upload/transcribe/... 等）**命名不匹配**；YAML 主要供 Python 侧 loader 与技能（如 `video_compose.py` 消费 scene_plan/proposal）使用。
- 仅 story2video-compose 的 YAML（6 段合同）与 JS 高度对应（JS 9 段 = 合同 6 段 + scene_context/select_video_scenes/finalize_assets 三个中间层）。
- 若后续建立「manifest 合同一致性」门禁，此为现成缺口。

## 7. 关键结论

1. 14 条注册流水线中仅 `screen-demo` 不可真实执行。
2. 3 条完全本地化、零 AI 供应商：cinematic / clip-factory / talking-head。
3. 4+1 条依赖视频生成 provider：videogen 家族（animation/avatar/character/hybrid）+ story2video 可选视频增强。
4. checkpoint 收紧只发生在 story2video；其余自动执行。
5. 产品面只有一条对外主流水线：Story2Video text 标准模式（外显「图片轮播 / Image Carousel」）。

## 8. 出处索引

- `apps/desktop/electron/services/pipeline-engine.js`：PIPELINES 注册表(:52-662)、双模式(:5-12)、可用性(:766-779)、并发上限(:689-695)
- `apps/desktop/electron/services/story2video-text-config.js`：text-only 强制(:272-279)
- `packages/python-backend/src/multi_publish/video_creation/pipeline/definitions/*.yaml`：14 条 manifest
- `packages/python-backend/src/multi_publish/video_creation/pipeline/definitions/story2video-compose.yaml`：supported/unsupported_modes(:106-116)、外部服务(:121-124)、阶段(:144-353)
- `apps/desktop/electron/services/{explainer,talkinghead,cinematic,videogen,clipfactory,documentary,podcast-repurpose,localization,smoketest,story2video}-stages.js`：阶段执行器注册
- `apps/desktop/src/views/CreateView.vue`：UI 入口(:769-770, :1706, :1755)
- `01-docs/PRD-video-creation.md`：创作模式收敛(:56,68,212-213)、启动合同(:438)
- `01-docs/PLAN-VIDEO-PIPELINE-PROGRESS-FEEDBACK-2026-08-13.md`：阶段进行中信息反馈颗粒度统一方案（PRD 7.1.9.3 / 3.1.23）

## 9. 阶段进度反馈能力矩阵（2026-08-13 基线）

> 口径：`getRunSnapshot().stages[i]` + `run.context` 中各阶段运行期实际可观测的进行中反馈；「细」= 百分比/计数 + 文案，「中」= 仅完成态摘要或数据有但 UI 未展示，「粗」= 仅「运行中 + 开始时间」。目标态见 `PLAN-VIDEO-PIPELINE-PROGRESS-FEEDBACK-2026-08-13.md` §五。

| 阶段 | 数据载体 | 运行中反馈（现状） | 粒度 | 目标（7.1.9.3） |
|------|---------|------------------|------|----------------|
| compose（全部流水线） | `context.compose_progress` | phase + percent + 片段计数 + 子进度条 | 细 | 沿用 |
| generate_assets（story2video/explainer 内嵌） | `context.assets_progress` | 图片 a/b · 视频 c/d · 旁白 e/f | 细 | + 综合百分比 |
| optimize | `context.optimize_progress` | 无（数据有，UI 仅完成后展示） | 中 | 「正在优化第 i/N 个场景」+ 百分比 |
| split | `context.split` | 无（完成后「拆分为了 N 个场景」） | 中 | 进行中文案 + 完成摘要 |
| domain_enrich / scene_context / select_video_scenes | — | 无 | 粗 | LLM 调用前后 message（i/N） |
| finalize_assets | `context.finalize_assets.partialTts` | 无 | 粗 | 逐段 TTS「正在生成第 i/N 段旁白」 |
| publish | —（结果仅 output） | 无 | 粗 | 逐平台「正在发布到 {平台} (i/N)」 |
| animated-explainer：research/proposal/script/scenes/editing | — | 无 | 粗 | 「正在{执行动作}…」 |
| talking-head：upload/transcribe/captions/render | — | 无 | 粗 | 同上 |
| 其余（cinematic/documentary/podcast/localization/video-clone/clip-factory） | — | 无 | 粗 | 同上 |
