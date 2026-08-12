## Why

桌面端 PromptEval（PR #559）已实现图片评估能力，但评估数据只在用户本机，运营侧不可见、不可审计、无法驱动 prompt-engine 模板迭代。运营后台需要一个「评测工作台」：由运营人员真实生成图片/视频，把「原文文本 → 优化后提示词（中英对照）→ 真实生成物 → 评估结果」串成可审计、可对比、可聚合的评测链路。

## What Changes

- **运营后台新增「提示词评测工作台」**（ops-center 12A.22）：运营人员录入原文与优化后提示词（中文），后台 LLM 自动生成英文对照（标注「机器翻译」），真实调用图片生成模型（minimax-image/flux，服务端直连 A1）产出素材，调用视觉评估模型打分（复用桌面端 PromptEval 维度契约），同屏展示 原文 | 中英提示词 | 生成物 | 评估结果，支持多 run 对比与聚合分析。
- **新增后端**：`prompt_eval_cases` / `prompt_eval_runs` / `prompt_eval_provider_keys` 表；`POST /api/v1/prompt-eval/cases|translate|runs`、`GET runs/{id}|cases|summary`、`DELETE cases/{id}`、admin `/providers`；异步状态机（queued→processing→succeeded→evaluating→succeeded/failed），生成与评估失败均 fail closed。
- **新增服务**：`prompt_eval_generation.py`（provider 直连 + 密钥加密存储 + 有界重试/429 退避 + 图片魔数校验）、`prompt_eval_translation.py`（LLM 中英对照，幂等 7 天缓存，标注 source=machine_translation）、`prompt_eval_evaluation.py`（视觉评估 + 白名单校验 fail closed，与桌面端契约一致）。
- **前端**：「评测工作台」三 Tab（新建评测 / 评测列表与详情·四栏同屏·多 run 对比 / 聚合分析）+「模型密钥」管理（admin）。
- **范围**：v1 图片先行；视频 v2 预留（video_path 字段 + 维度占位，mediaType=video 明确拒绝）。

## Capabilities

### New Capabilities
- `prompt-eval-ops-workbench`: 运营后台提示词评测工作台契约（评测 case/run 生命周期、中英对照机器翻译标注、服务端直连生成与密钥管理、视觉评估 fail closed、聚合分析、前端三 Tab、视频 v2 预留）。

### Modified Capabilities
- `prompt-image-eval-system`（桌面端）：评估维度/错误码契约被后台复用，以共享常量表/一致性测试保证两端对齐，不修改桌面端现有行为。

## Impact

- 后端：`ops-center/backend/models.py`（3 表）、`services/prompt_eval_{generation,translation,evaluation}_service.py`、`routers/prompt_eval.py`、`services/prompt_eval_contract.py`（与桌面端共享契约常量）、密钥加密存储；pytest 新增。
- 前端：ops-center Vue3 新增「评测工作台」「模型密钥」页；路由/菜单；组件测试；`npm run build` 门禁。
- 文档：ops-center/docs/PRD.md 12A.22、01-docs/PRD-PROMPT-EVAL-OPS-WORKBENCH-2026-08-12.md、ARCH-PROMPT-EVAL-OPS-WORKBENCH-2026-08-12.md、CHANGELOG、quality-gates。
- 外部边界：真实 provider（minimax-image/flux）与真实视觉模型可用性为外部验收；单元/集成测试使用 mock。
- 交付：codex/ 分支 + PR；双模型分析/审查；后端 pytest + 前端 build 门禁。
