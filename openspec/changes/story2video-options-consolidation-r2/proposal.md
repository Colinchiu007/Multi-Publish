# Proposal: 图片轮播参数治理 R2 — 移除 splitSpeechRate/concurrency/autoAdvance 前端死字段

## Why

R1（PR #422）移除了 voicePitch/creativeLevel/splitBaseWordsPerSecond 三个前端死字段并成文 PRD 7.1.19 参数治理合同。合同 §5 明确记录后续清理候选：`split.speechRate`（normalizer 硬覆盖为 voice.speed，渲染层值恒被忽略）、`concurrency`（系统管理参数，前端无 UI 恒提交 3）、`autoAdvance`（提交 params 字面量 true，s2vConfig 字段无读取）。本变更延续同一治理模式，清除剩余「假配置项」。

## What Changes

- 移除前端 `s2vConfig.splitSpeechRate` / `concurrency` / `autoAdvance`；提交构造不再显式传 `split.speechRate` / `concurrency`；params 保留字面量 `autoAdvance: true`。
- 版本化 text-config 契约不变（speechRate 由 voice.speed 派生、concurrency 默认 3、autoAdvance 由 params 决定），仅测试/注释更新。
- 快照兼容：`_applyS2VSnapshot` 白名单应用，旧快照已移除键自动忽略。
- 文档：PRD 7.1.19 §2/§5 更新（三字段转为「已移除」状态），CHANGELOG、learnings。
- 测试：CreateView（字段不存在 + 提交不携带）、UE 契约（s2vConfig 声明块不包含）、text-config（契约默认路径已覆盖）。

## Capabilities

- **Modified Capabilities**: `story2video-parameter-governance`（PRD 7.1.19 合同对应能力：系统管理参数清单更新）

## Impact

- 代码：`apps/desktop/src/views/CreateView.vue`（s2vConfig 默认值 + 提交构造）
- 测试：`CreateView.test.js`、`story2video-ue-contract.test.js`
- 文档：`01-docs/PRD.md`、`CHANGELOG.md`、learnings
- 无契约破坏：text-config 契约默认不变；params.autoAdvance 字面量保留；旧快照恢复兼容；行为等价
