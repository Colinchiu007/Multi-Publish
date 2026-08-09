# Design: 参数治理 R2 — splitSpeechRate/concurrency/autoAdvance 前端移除

## Context

R1（PR #422/7b27a11b）确立死字段移除模式并成文 PRD 7.1.19。R2 移除剩余三个「假配置项」，等价性已由 R1 证据链 + 本机核查确认：
- `split.speechRate`：normalizer（story2video-text-config.js:353-355）**硬覆盖** `split.speechRate = voice.speed`，注释「不再校验/接受独立值」→ 提交值恒被忽略。
- `concurrency`：normalizer（:406）`firstDefined(suppliedConfig.concurrency, params.concurrency) → 默认 3, 范围 1-8`；前端无 UI 恒提交 3 → 移除后默认 3 等价。
- `autoAdvance`：提交 params（CreateView.vue:1711）字面量 `autoAdvance: true`；s2vConfig.autoAdvance（:1011）无读取 → 死字段。

## Goals / Non-Goals

**Goals**: 移除三字段前端声明与提交，契约派生/默认/字面量兜底；UE 契约与 PRD 合同同步。
**Non-Goals**: 不改 text-config 契约默认；不动 Python YAML；不做 B 类运营化（P1 独立立项）。

## Decisions

### D1: 字段移除（CreateView.vue）
- s2vConfig 删除 `splitSpeechRate: 1`、`concurrency: 3`、`autoAdvance: true`（autoAdvance 行保留 platforms/publish 等其余键）。
- 提交构造：split 段删除 `speechRate: config.splitSpeechRate`；顶层删除 `concurrency: config.concurrency`；params 保留 `autoAdvance: true` 字面量。
- 快照兼容：_applyS2VSnapshot 白名单忽略已移除键（既有机制，R1 已验证）。

### D2: 测试
- CreateView.test.js：s2vConfig 字段不存在断言追加三项；提交不携带断言（split 无 speechRate、顶层无 concurrency、params.autoAdvance 仍为 true）。
- UE 契约：s2vConfig 声明块精确匹配追加 `splitSpeechRate`/`concurrency`/`autoAdvance` 不声明。

### D3: 文档
- PRD 7.1.19 §2 系统管理清单：三字段标注「R2 已移除（前端）」，来源不变（voice.speed 派生 / 契约默认 3 / params 字面量）。
- CHANGELOG R2 条目；learnings 追加「死提交字段第二轮清理（R1 模式的重复验证）」。

## Risks / Trade-offs

- 低风险：三字段均无 UI、无前端读取；normalizer/params 兜底等价；R1 模式已验证。
- concurrency 边界 1-8：移除后不再可能从前端传入越界值（前端从未暴露 UI），契约校验保留。
