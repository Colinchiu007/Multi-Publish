## Why

提示词评测工作台目前评测的是「运营人员手动粘贴的提示词」——它无法回答「新的提示词优化引擎到底提升了多少」。图片引擎已具备多候选择优/违规扣分/tier 层级（Higgsfield 对齐），视频引擎已有导演级机制，但这些能力与评测链路完全隔离：评测里没有「引擎优化」入口，也就没有量化引擎收益的数据闭环。双路对比让评测直接消费引擎输出，同一原文并行跑「人工原版 vs 引擎优化版」两路生成+视觉评估，产出可量化的引擎提升幅度。

## What Changes

- **双路对比模式**：评测 case 新增 `compare_mode`（single/dual）。dual 模式下创建 run 自动派生两个 run 变体：`manual`（人工录入 prompt_zh，现状路径）与 `engine`（引擎从 source_text+context 优化生成 prompt_zh 快照，再走现有翻译/生成/评估）。
- **引擎 HTTP 客户端**：ops-center 新增 prompt-engine HTTP 客户端服务（`OPS_PROMPT_ENGINE_BASE_URL`，默认 `http://prompt-engine:8013`），复用既有 `POST /v1/optimize`（含 num_candidates 择优、excluded_characters/no_swap_pairs 双向约束，引擎侧已实现）；新增 `prompt-engine` 模型密钥槽位（可选，与 minimax-llm 同构）。
- **数据模型扩展**：runs 表新增 `prompt_variant`（manual/engine）、`prompt_source_zh`（A 路原版快照，对比用）、`engine_meta`（引擎请求快照：creative_level/num_candidates/tier/score/violations，engine 变体填充；引擎返回未含 evaluation 时存请求参数）。case 新增 `compare_mode`。
- **聚合对比**：summary 新增按 variant 对比——manual vs engine 平均分差、各维度均值差、引擎提升率（engine 平均分 − manual 平均分）/ manual 平均分；列表页/详情页双 run 并排展示。
- **前端**：新建评测表单增加「同时用引擎优化对比」开关；case 详情对 dual case 按 variant 并排展示（原版 | 引擎优化版）并标注引擎生成；聚合分析页增加双路对比卡片。
- **失败语义**：引擎不可达/超时 → engine 变体 run failed 且错误信息含引擎阶段标记，不静默降级；manual 变体不受影响（可独立成功）。

## Capabilities

### New Capabilities
（无——双路对比是既有评测工作台能力的扩展，不引入新 capability 路径）

### Modified Capabilities
- `prompt-eval-ops-workbench`: 扩展 case/run 数据模型（compare_mode/prompt_variant/engine_meta）、引擎 HTTP 客户端契约、双路生成与评估状态机、聚合对比分析、前端双路并排展示。

## Impact

- 代码：`ops-center/backend/services/prompt_eval_service.py`（case/run 模型扩展）、新增 `prompt_eval_engine_client.py`（HTTP 客户端）、`prompt_eval_generation_service.py`/`evaluation_service.py`（按 variant 透传）、`routers/prompt_eval.py`（compare_mode 校验、engine 配置读取）、`scripts/seed.py`（prompt-engine 密钥槽位）、前端 `PromptEvalWorkbench.vue` + `promptEval.js`。
- 测试：新增 `prompt_eval_engine_client` 单测（本地临时 HTTP 服务覆盖超时/5xx/非法 JSON）、双路 run 派生单测、聚合对比单测、前端开关/并排渲染测试；既有 6 个 prompt_eval 测试不回归。
- 依赖：无新第三方依赖（httpx 已有）。
- 外部契约：`POST /v1/optimize` 是既有契约，引擎侧无新增接口；`OPS_PROMPT_ENGINE_BASE_URL` 为新增可选配置，缺省未配置时 dual 模式创建 run 返回可操作错误。
