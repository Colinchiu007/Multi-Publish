## 1. 测试先行（TDD）

- [x] 1.1 新增 `prompt_eval_engine_client` 单测：本机临时 HTTP 服务覆盖 200 正常（含 optimized_prompt 校验）/ 5xx / 超时 / 非法 JSON / 空或非字符串 optimized_prompt fail closed
- [x] 1.2 双路 run 派生单测：`compare_mode=dual` → manual+engine 两变体（pair_id 同批次一致、engine_meta 快照落库）；`single` → 仅 manual（既有行为）
- [x] 1.3 引擎不可达单测：engine 变体不创建、返回 OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE（含阶段标记）、manual 正常创建
- [x] 1.4 状态机独立单测：engine 变体生成失败 → engine run failed（error 含生成阶段），manual 保持 succeeded
- [x] 1.5 聚合 dual 区块单测：成对统计（平均分差/四维均值差/提升率）、分母 0 → null、无成对 → 空对象
- [x] 1.6 `engine/status` 探测单测：/health 200 → ok + latency_ms；超时/非 200 → 503 + 可操作错误
- [x] 1.7 回归：既有 prompt_eval 测试全过；single 模式（新字段缺省）行为与既有一致

## 2. 模型与迁移

- [x] 2.1 `prompt_eval_migration.py`：runs 新增 `prompt_variant`（默认 manual）/`prompt_source_zh`/`engine_meta`；cases 新增 `compare_mode`（默认 single）——按既有 ALTER 风格幂等迁移
- [x] 2.2 `models.py`：PromptEvalCase.compare_mode、PromptEvalRun.prompt_variant/prompt_source_zh/engine_meta（engine_meta JSON 文本）

## 3. 引擎 HTTP 客户端

- [x] 3.1 新增 `prompt_eval_engine_client.py`：`optimize(source_text, context, creative_level=8, num_candidates=3, max_length=500, excluded=..., no_swap=...)` → POST {base}/v1/optimize（超时 20s、重试 1 次、响应校验 optimized_prompt 非空字符串）；`health()` → GET {base}/health
- [x] 3.2 配置：`OPS_PROMPT_ENGINE_BASE_URL`（默认 http://prompt-engine:8013）；错误类型 `OPS_PROMPT_EVAL_ENGINE_UNAVAILABLE` 统一出口

## 4. 编排接入

- [x] 4.1 `create_case`：compare_mode 校验（single/dual，非法 400）
- [x] 4.2 单条 case：`create_run`（single）行为不变；dual 派生两变体——manual 直接建；engine 同步调引擎 → prompt_zh 快照 → 既有翻译生成 prompt_en → engine_meta（pair_id uuid）落库 → 建 run；引擎失败显式报错不建 engine 变体
- [x] 4.3 `run_to_dict` / `list_runs_for_case`：返回 prompt_variant/engine_meta（前端分组与展示）
- [x] 4.4 summary：新增 dual 区块（pair_id 配对、平均分差、四维均值差、提升率、等级分布差）
- [x] 4.5 routers：`GET /prompt-eval/engine/status`（admin，health 探测）；compare_mode 透传与校验；engine 配置读取

## 5. 前端

- [x] 5.1 `PromptEvalWorkbench.vue` 新建表单：compare_mode 单选（默认「仅人工提示词」）；dual 时显示引擎参数折叠（creative_level/num_candidates）
- [x] 5.2 case 详情：dual 按 variant 并排（原版 | 引擎优化版），engine 变体「引擎生成」徽章 + engine_meta 摘要 tooltip；run 轮询按 prompt_variant 分组
- [x] 5.3 聚合分析页：双路对比卡片（平均分差/提升率）
- [x] 5.4 `promptEval.js`：API 扩展（compare_mode 字段、engine/status、engine_meta 透传）

## 6. 验证与评审

- [x] 6.1 `cd ops-center/backend && pytest` 全过（含既有 6 个 prompt_eval 测试）
- [x] 6.2 `cd ops-center/frontend && npm run build` 通过
- [x] 6.3 双模型评审（antigravity 不可用则 Claude 降级并记录）0 Critical
- [x] 6.4 CHANGELOG 补档 + openspec sync-specs（delta 合入 main spec）+ CCG task 归档（三同步）
