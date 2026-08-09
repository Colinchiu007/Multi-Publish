# Proposal: 图片轮播参数治理 — 前端死字段移除与契约边界文档化

## Why

图片轮播（story2video-compose）前端 `s2vConfig` 存在 3 个「存在但不可控/已不再参与计算」的隐藏字段：`voicePitch`（无 UI、恒默认 0）、`creativeLevel`（UE 契约明确不暴露、恒默认 5）、`splitBaseWordsPerSecond`（Batch 5a 起已由语言感知表驱动，字段为遗留兼容）。它们既增加契约表面积（normalizer 双源 firstDefined）、又在恢复快照/提交构造中制造「假配置项」，与参数治理目标（用户可见可调 or 系统统一默认）冲突。另有 watermark/subtitle 的「UI 字段 + 样式对象」结构需文档化边界（模板驱动，非冗余），以及 fps/分句长度/负向提示词等 UI-后端边界未成文。

## What Changes

- 移除前端 `s2vConfig.voicePitch` / `creativeLevel` / `splitBaseWordsPerSecond` 三个死字段；提交构造不再显式传 `voice.pitch` / `optimize.creativeLevel`（normalizer 以契约默认 0 / 5 兜底）；`split.baseWordsPerSecond` 不暴露 UI、当前仍随提交按语言表显式下发（normalizer 缺省时以语言表兜底，双路径同源）。
- 版本化 text-config 契约保持不变（默认值仍为 pitch 0 / creativeLevel 5 / baseWordsPerSecond 语言表），仅更新注释与测试断言：缺省输入 → 默认值。
- 恢复快照兼容：`_applyS2VSnapshot` 按当前默认键白名单应用，旧快照中的已移除键自动忽略（无需迁移）。
- 文档：PRD 新增「7.1.19 参数治理与隐藏工程默认值合同」——列出系统管理参数（voicePitch/creativeLevel/concurrency/splitBaseWordsPerSecond 等）、UI 边界（fps 产品子集 24/30/60 vs 后端 1..120；splitMaxSentenceLength 20-1000 默认 200；negativePrompt ≤500）、watermark/subtitle 双源结构说明（UI 字段 + 样式对象为模板-提交协调，非冗余）。
- 测试：CreateView（断言字段不存在 + 提交不携带死字段）、UE 契约（升级为「字段不存在」）、text-config（缺省 → 默认值兜底断言）。
- **非目标（P1 待办）**：B 类参数运营化（枚举/目录/限额转 ops-center）需 pipeline_configs 基础设施，另行立项。

## Capabilities

- **New Capabilities**: `story2video-parameter-governance`（图片轮播参数治理：隐藏工程默认值清单、UI-后端边界、双源结构说明）
- **Modified Capabilities**: 无

## Impact

- 代码：`apps/desktop/src/views/CreateView.vue`（s2vConfig 默认值 + 提交构造）
- 测试：`CreateView.test.js`、`story2video-ue-contract.test.js`、`story2video-text-config.test.js`
- 文档：`01-docs/PRD.md`、`CHANGELOG.md`、learnings
- 无契约破坏：text-config 提交/回读双向映射保留（字段可缺省）；旧快照恢复兼容；行为等价（默认值相同）
