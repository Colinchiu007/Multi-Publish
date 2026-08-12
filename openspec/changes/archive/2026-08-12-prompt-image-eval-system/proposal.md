## Why

提示词优化引擎（prompt-engine 8013）负责把文案优化为图片提示词，但其输出效果（生成图片）没有任何量化反馈闭环：不知道优化后的提示词生成出来的图片与原文/上下文/优化提示词的关联度、内容准确性、审美质量、多图一致性如何，问题无法归因（原文/上下文/优化后提示词/负向提示），也无法积累数据持续迭代优化策略。

## What Changes

- **新增「提示词优化效果评估系统」（PromptEval，v1 图片）**：独立评估引擎（不侵入 Story2Video 流水线），输入=生成图片 + 该图对应的原始文案/整个文案上下文/优化后提示词/负向提示，输出=多维度打分（0-100）+ 问题归因 + 提示词优化点清单。
- **评估维度**：关联度（30%）、内容准确性（30%）、视觉审美质量（20%）、跨图上下文一致性（20%，仅≥2 图参与，单图权重归一化为 0.375/0.375/0.25）。
- **fail closed 契约**：输入校验（EVAL_* 错误码）、评估器输出校验（JSON 契约 + 白名单，非法即整次失败）、持久化原子写；mediaType=video 明确拒绝（视频扩展预留维度但 v1 不实现）。
- **使用入口**：CLI 批处理 + 桌面 IPC（prompt-eval:run/list/get/delete/analyze/dimensions）+ Vue 评估视图（运行/历史/聚合分析 3 Tab）。
- **持续提升闭环**：评估记录持久化（userData/prompt-eval/）+ 聚合分析（维度均值/问题类别分布/优化点汇总）→ 指导 prompt-engine 模板迭代。

## Capabilities

### New Capabilities
- `prompt-image-eval-system`: 提示词优化效果评估体系契约（媒体类型抽象、维度与评分规则、输入/输出校验、评估提示词、问题归因、优化点类型、持久化、聚合分析、CLI/IPC/UI 入口、视频扩展预留）。

### Modified Capabilities
- `image-prompt-engine`: 消费其输出（optimized_prompt）作为评估输入，不修改其契约。

## Impact

- 新增运行时模块：`apps/desktop/electron/services/prompt-eval/`（dimensions/prompt-builder/llm/engine/store/report/evaluator/cli + 测试）。
- 接线点：`ipc-handlers/prompt-eval.js`、`ipc-handlers/index.js`、`preload/prompt-eval.js`、`preload/index.js`、`preload/access-control.js`、`src/views/PromptEvalView.vue`、`src/router/index.js`、`src/layouts/AppNavbar.vue`、`src/locales/zh.js`。
- 文档：01-docs/PRD.md、PRD-PROMPT-EVAL-SYSTEM-2026-08-11.md、ARCH-PROMPT-EVAL-SYSTEM-2026-08-11.md、CHANGELOG.md、.quality-gates.md。
- 外部边界：视觉评估模型可用性、真实图片评估效果为外部验收边界；不修改 prompt-engine（8013）与 Story2Video 流水线契约。
- 交付：codex/ 分支 + PR 合并；聚焦测试 + 质量门禁；双模型审查（按 CCG）。
