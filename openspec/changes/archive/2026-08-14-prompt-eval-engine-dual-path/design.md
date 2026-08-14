## Context

ops-center 评测工作台现状（v1，图片先行）：运营录入 source_text + 手写 prompt_zh → LLM 翻译 prompt_en（machine_translation）→ 图片 provider 生成 → 视觉 LLM 4 维打分（relevance 30% / content_accuracy 30% / aesthetic_quality 20% / cross_image_consistency 20%）。评测的 prompt 完全由人工提供，引擎（prompt-engine 独立仓库/服务 :8013）不参与。prompt-engine 的 `POST /v1/optimize` 已支持 `num_candidates`（多候选择优）、`context` 注入、`excluded_characters`/`no_swap_pairs`（图片引擎 Higgsfield 对齐后生效）；ops-center 是 Python FastAPI，无法进程内 import TS 引擎，走 HTTP 是自然边界。

## Goals / Non-Goals

**Goals:**
- 同一 case 下并行跑「人工原版 vs 引擎优化版」两路：引擎变体由 `POST /v1/optimize` 从 source_text+context 生成 prompt_zh（快照落库），复用既有翻译/生成/评估流水线。
- 量化引擎提升：summary 聚合 manual vs engine 分数差与提升率；详情页双 run 并排。
- 引擎不可用时 dual 模式显式失败（engine 变体 failed），manual 变体独立可用。

**Non-Goals:**
- 不在本 change 扩展 prompt-engine 接口（/v1/optimize 既有契约已够用；OptimizeResult 返回引擎内部评分留待引擎侧后续 change）。
- 不做视频评测 v2（既有 v1 图片先行约束不变）。
- 不把 scene 模式的分句/字幕逻辑改为引擎驱动（沿用现有 segmentation/translate_scene；双路对比先覆盖单条 case，scene 模式同机制扩展但不在本 change 强制）。
- 不引入队列/重试基建（沿用现有 asyncio worker + run 状态机）。

## Decisions

### D1: 双路对比以 run 变体承载（非独立 case）
`compare_mode=dual` 的 case 在创建 run 时派生两个 run 记录：`prompt_variant=manual|engine`。理由：run 表已承载「生成+评估」全生命周期与媒体归属，双变体天然复用状态机/聚合/媒体权限；独立 case 方案会复制 case 元数据且破坏「多 run 对比」语义。engine 变体 run 创建时同步调用引擎并落 `prompt_zh/prompt_en/engine_meta` 快照（run 提交后 worker 只读快照，与 scene run 快照语义一致）。

### D2: 引擎调用放在 run 创建路径（同步），失败显式
创建 dual case 的 run 时，engine 变体先同步调 `/v1/optimize`（超时 20s，重试 1 次）；成功 → 建 run + 快照；失败 → 不创建 engine 变体 run，返回错误含引擎阶段标记（`OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE`）。manual 变体始终创建。理由：双路对比的用户期望「一次点击拿到两路」，异步引擎生成会让「还没开始就跑失败」的体验复杂化；引擎调用是纯文本 LLM 调用（非图片生成），20s 预算合理。

### D3: 引擎输入与参数
- 输入：`prompt=source_text`（单条模式）或 `prompt=scene_text`（scene 模式扩展预留）；`context` 透传既有 case context（scene 模式透传 scene_context）。
- 参数：`creative_level` 默认 8（精修级，对齐引擎 refined tier），case 可配置；`num_candidates` 默认 3（引擎择优生效）；`max_length` 默认 500；`excluded_characters`/`no_swap_pairs` 从 case 可选字段透传（新增 case 可选字段，v1 默认空）。
- 引擎输出语言：中文输入 → 中文输出，作为 engine 变体的 prompt_zh；prompt_en 走既有翻译服务（与 manual 一致）。

### D4: 聚合对比口径
summary 新增 `dual` 区块：仅统计同一 case 内成对成功的 manual+engine run（配对键 case_id + 同 created_at 批次，engine_meta.run_pair_id 落库）；输出平均分差、四维均值差、提升率（(avg_engine − avg_manual)/avg_manual，分母 0 时 null）、等级分布差。配对防串扰：engine_meta 记录 `pair_id`（uuid），跨 case 不配对。

### D5: 配置与密钥
`OPS_PROMPT_ENGINE_BASE_URL` 环境变量（默认 `http://prompt-engine:8013`）；无鉴权（内网服务），如需鉴权走既有 OPS_SECRET_KEY 体系（预留）。`prompt-engine` 不占用「模型密钥」表（引擎自身持 LLM key）；但为测试连通性，routers 增加 `GET /api/v1/prompt-eval/engine/status`（admin，探测 /health）。

### D6: 前端交互
新建评测表单：`compare_mode` 切换（单选「仅人工提示词 / 人工+引擎双路对比」）；dual 时显示引擎参数（creative_level/num_candidates，高级折叠）。详情页 dual case 按 variant 分组并排（原版 | 引擎优化版，引擎版标「引擎生成」徽章 + engine_meta 摘要 tooltip）。列表/详情 run 状态轮询沿用 `list_case_runs`（返回含 prompt_variant）。

## Risks / Trade-offs

- [引擎同步调用拖慢 run 创建] → 20s 超时 + 1 重试封顶；manual 变体不受影响；错误信息明确（D2）。
- [引擎生成质量不稳定导致对比失真] → 双路共用同一图片 provider/视觉评估（同 run 批次、同参数），差异仅来自提示词；评估维度与既有 4 维一致，结果可解释。
- [聚合配对复杂度] → pair_id 显式配对（D4），不成对数据不进 dual 区块；单 run 仍走既有统计。
- [scene 模式未强制覆盖] → 数据模型/流水线按变体设计天然兼容，后续 case 场景扩展只需 UI 层放开开关。

## Migration Plan

- 部署：`compare_mode` 默认 single（既有行为零变化）；runs 新列 `prompt_variant` 默认 `manual`、`prompt_source_zh`/`engine_meta` 可空——已有数据无需迁移。schema 变更走既有 `prompt_eval_migration.py` 模式（ALTER TABLE ADD COLUMN IF NOT EXISTS 风格）。
- 回滚：回退提交即可；新列/新字段缺省时全部既有路径行为不变。

## Open Questions

- 引擎内部评分（tier/score/violations）是否随 `/v1/optimize` 响应返回并在 UI 展示——取决于引擎侧 change（image-engine-higgsfield-alignment 合入后 OptimizeResult 是否扩展）；本 change 先落 engine_meta 请求参数快照，响应侧字段预留。
