# prompt-eval-ops-workbench Specification (delta: dual-path engine comparison)

## Purpose

在既有评测工作台（人工提示词 → 生成 → 视觉评估）之上增加「双路对比」：同一原文并行评测人工原版提示词与提示词优化引擎（prompt-engine）生成的优化版提示词，产出可量化的引擎提升幅度，形成「引擎能力 → 评测数据 → 引擎迭代」闭环。

## ADDED Requirements

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
