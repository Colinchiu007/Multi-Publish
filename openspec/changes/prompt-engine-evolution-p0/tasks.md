# Tasks — prompt-engine-evolution-p0

> 进度单一来源：以本文件 checkbox 为准。实现前先写/改测试（TDD）。

## 审计与前置

- [x] 基线差异审计：既有 `image-prompt-engine` spec 仅覆盖优化路径，不含反馈管道；`01-docs/prompt-engine-evolution-design.md` 已定稿合入 main（6e8265df）
- [x] OpenSpec change 创建：proposal → design → specs → tasks 并 `openspec validate` 通过

## 实现（codex/prompt-engine-evolution-p0 分支）

### 任务 1：schema 与 signal-collector（TDD）
- [x] `services/prompt-evolution/schema.js`：GenerationEvent/FeedbackEvent 常量 + 枚举（engine/mode/type/optimizedBy/status）+ `validateGeneration()` / `validateFeedback()`（fail closed）
- [x] `services/prompt-evolution/signal-collector.js`：`createSignalCollector`（recordGeneration/recordFeedback/getStats/轮转/孤儿检测/sessionId 解析）
- 测试目标：`signal-collector.test.js`（schema 校验矩阵、append-only、eventId join、sessionId 解析、孤儿标记、写失败不抛、tmpdir 隔离、月轮转、统计聚合）✅ 通过

### 任务 2：IPC 与接线
- [x] `ipc-handlers/generation-feedback.js`：`generation:feedback`（eventId 或 sessionId 至少其一 + type 枚举 + EC 错误码）、`prompt-library:list`（P0 骨架）
- [x] `ipc-handlers/index.js` 注册；`phase1-context.js`/`phase5-ipc.js` feature flag `MP_EVOLUTION_ENABLED` 注册 collector；preload `generationFeedback`/`promptLibraryList`
- 测试目标：`generation-feedback.test.js`（合法/缺 eventId 与 sessionId/非法 type/纯 JSON、EC 常量、未启用时返回骨架）✅ 通过

### 任务 3：前端埋点
- [x] Story2Video CreateView：采纳（confirmSceneAssetSelections）上报 `reportEvolutionFeedback`（feature flag + API 存在时；缺失静默跳过）
- 测试目标：CreateView 组件测试（无 API 静默、generationFeedback 透传 type/sessionId）✅ 通过

### 任务 4：history-prompt onEvent 钩子
- [x] `generateImagePromptsSmart` 增加可选 `onEvent` 回调参数（不传行为不变，回调抛错不阻断生成）
- 测试目标：`history-template.test.ts` 补 onEvent 断言 ✅ 通过（129/129）

### 任务 5：文档与门禁
- [x] CHANGELOG 追加、`.quality-gates.md` 自检记录
- [x] 桌面 Vitest 全量测试通过（7378 passed / 1 failed→构建 preload 后重跑 build-preload + preload 336 全绿；单 worker 全量 1470s）
- [x] 双模型审查（Claude + Codex，均「需修改后通过」→ 已修复全部 CRITICAL C1/C2 与 MAJOR M1-M6，G1/G2 一并修复，测试全绿）
- [ ] 提交/推送/PR/合并；OpenSpec archive + CCG task 归档三同步
