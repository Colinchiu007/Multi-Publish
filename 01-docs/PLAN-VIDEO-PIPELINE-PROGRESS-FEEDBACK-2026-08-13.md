# PLAN — 视频创作流水线「进行中信息反馈」颗粒度统一方案（2026-08-13）

> 状态：方案（待确认后实施）
> 快照基线：`main` b0053cef（2026-08-13）
> 关联 PRD：`01-docs/PRD.md` 7.1.9 / 7.1.9.1 / 7.1.9.2（本方案扩展为 7.1.9.3）；`01-docs/PRD-video-creation.md` 3.1.23
> 关联矩阵：`01-docs/PIPELINE-MATRIX.md` §9 阶段进度反馈能力矩阵

## 一、背景与问题

视频创作流水线（`story2video-compose` 为主，另有 animated-explainer、talking-head、cinematic、videogen 家族等 13 条注册流水线）的进度清单列表中，**每个阶段「进行中」的信息反馈详细程度不一、颗粒度不统一**：

- compose（视频合成）有完整的子百分比进度（phase + percent + 片段计数 + 子进度条）；
- generate_assets（图片/TTS/视频）有计数（图片 x/y · 旁白 c/d）；
- optimize 的 `optimize_progress` 数据存在，但 UI 只在阶段完成后展示；
- split 只有完成后摘要；
- 其余阶段（domain_enrich / scene_context / select_video_scenes / finalize_assets / publish / explainer 各 LLM 阶段 / talking-head 等）运行中仅显示「运行中 + 开始时间」，无任何进行中细节。

## 二、现状链路（代码实测）

```
执行器（stage-executor.js 内置 + story2video-stages.js 等自定义）
   ├─ COMPOSE        → context.compose_progress  { phase, percent, segmentsDone, segmentsTotal }
   ├─ generate_assets→ context.assets_progress   { imagesDone/Total, ttsDone/Total, videosDone/Total }
   ├─ optimize       → context.optimize_progress { done, total }（UI 仅在 completed 时展示）
   └─ 其余阶段       → 无任何中间反馈
        ↓ 写入 run.context
前端每 3s 轮询 pipeline:getRunContext（apps/desktop/src/views/CreateView.vue:1782）
   → getRunSnapshot 返回 { stages[], context, ... }（apps/desktop/electron/services/pipeline-engine.js:1587）
   → StageProgress.vue 按 stage.name 硬编码特判渲染细节
```

关键事实：

1. 阶段对象只有开始/完成两个状态点：`stage = { name, status, startedAt, completedAt }`，**无 progress 字段**（pipeline-engine.js:842-853）。
2. 主进程 Backlot 事件（pipeline:start / stage:start / stage:complete / stage:fail / pipeline:complete / checkpoint:pause，pipeline-engine.js:724-760）**未桥接到 renderer**，前端只能 3s 轮询。
3. 只有 compose 有完整子进度（story2video-compose-engine.js:671-927，9 个 phase + percent + 片段计数）。
4. generate_assets 每完成一张图/一段旁白/一个视频即写 `context.assets_progress`（story2video-stages.js:1801-1818），轮询可见「图片 3/10 · 旁白 2/10」。
5. optimize 运行中 `context.optimize_progress.done/total` 持续更新（story2video-stages.js:1434），但 StageProgress.vue:112 仅在 `status === 'completed'` 时显示。
6. publish 逐平台串行发布（stage-executor.js:541-575），无任何中间反馈，结果只在 output 中。
7. Python 侧 `packages/python-backend/src/multi_publish/core/progress.py` 仅服务发布（publish:progress），与视频创作流水线阶段无关。
8. 执行器签名 `StageExecutor.execute({ runId, stage, params, context })`（stage-executor.js:192）**无 onProgress 上报通道**，仅 compose 例外（自带 onProgress 选项）。

## 三、颗粒度盘点

| 阶段 | 运行中反馈 | 完成反馈 | 粒度 |
|---|---|---|---|
| compose（全部流水线） | ✅ phase+percent+片段计数+子进度条 | — | 细 |
| generate_assets（story2video/explainer 内嵌） | ✅ 图片/视频/旁白计数 | ✅ 同上 | 细 |
| optimize | ❌（数据有，UI 仅完成后展示） | ✅ 共 N 场景完成 M 个 | 中 |
| split | ❌ | ✅ 拆分为了 N 个场景 | 中 |
| domain_enrich / scene_context | ❌ | ❌ | 粗 |
| select_video_scenes（AI 视频场景） | ❌（视频生成 16-30s+ 无反馈） | ❌ | 粗 |
| finalize_assets（素材自选→TTS） | ❌（逐段 TTS 无上报） | ❌ | 粗 |
| publish | ❌（逐平台无中间反馈） | ❌（仅结果页平台列表） | 粗 |
| animated-explainer：research/proposal/script/scenes/editing | ❌（LLM 调用 20s+ 无反馈） | ❌ | 粗 |
| talking-head：upload/transcribe/captions/render | ❌ | ❌ | 粗 |
| 其余（cinematic/documentary/podcast/localization/video-clone/clip-factory） | ❌ | ❌ | 粗 |

## 四、根因（6 条）

1. **无统一阶段进度契约**：进度散落在 context 的不同 key（`optimize_progress` / `assets_progress` / `compose_progress`），结构、语义、更新时机各写各的。
2. **执行器没有上报通道**：`StageExecutor.execute` 签名无 `onProgress` 参数，内部循环（逐场景、逐平台、逐 TTS）无处上报；只有 compose 例外。
3. **stage 对象无 progress 字段**：快照只给 status，UI 无法统一渲染进行中细节。
4. **UI 按阶段名硬编码特判**：StageProgress.vue 里 `stage.name === 'split'/'optimize'/'generate_assets'/'compose'` 四个特判，新增阶段或其他流水线一律「运行中」。
5. **无推送通道**：3s 轮询 + 全量 context 快照，更新延迟且拉取成本高（图片为路径非 base64，可接受，但无增量）。
6. **无字段级校验**：只有 compose 有 `_normalizeComposeProgressForContext` 归一化（stage-executor.js:53），其余进度字段直接裸写。

## 五、优化方案

### Phase 1 — 统一契约 + UI 通用化（S/M，收益最大）

1. **阶段进度模型**（pipeline-engine.js `_createRun` / 快照）：
   ```
   stage.progress = { percent: 0-100, message: '正在生成第 3/10 张图片', detail: { done, total, kind }, updatedAt }
   stage.summary = '拆分为了 12 个场景'   // 完成态摘要（可选）
   ```
   `getRunSnapshot`（pipeline-engine.js:1587）直接下发 stage.progress，不动 context 兼容层。
2. **StageProgress.vue 去特判**：统一渲染 `stage.progress.message` + 迷你进度条（有合法 percent 就显示），compose 子进度条泛化为任意阶段；`optimize` 运行中立即能显示「正在优化 3/10」（数据已有）。
3. 现有 compose/generate_assets 数据先映射进新模型，UI 立即变一致。

### Phase 2 — 执行器上报通道 + 补齐各阶段（M）

4. `StageExecutor.execute` 增加统一 `onProgress` 参数；`_executeStage`（pipeline-engine.js:1836）注入并双写 `stage.progress` + `context.stage_progress`；归一化/校验收口成通用函数（仿 compose：percent 0-100 单调、message 限长、非法值 fail-closed 或拒绝展示）。
5. 逐阶段接入：
   - **publish**：循环内 `onProgress({ percent, message: '正在发布到微博 (1/3)' })`（stage-executor.js:541 循环）；
   - **finalize_assets**：逐段 TTS 上报（story2video-stages.js finalize 段）；
   - **select_video_scenes / scene_context / domain_enrich / explainer 各 LLM 阶段**：调用前后发阶段化 message（「正在分析场景…」）；
   - **split**：完成后写 summary（已有 N 场景）。
6. 总进度从「阶段数占比」升级为「阶段数占比 + 当前阶段 percent 加权」，进度条平滑前进。

### Phase 3 — 实时推送（可选增强）

7. 把 Backlot 事件桥接 renderer（如 `pipeline:update` webContents.send），事件驱动更新，轮询降级为兜底；或先做快照裁剪（context 中仅下发 progress 子集），降低 3s 轮询成本。建议先做裁剪，推送作为二期。

## 六、涉及文件与验证

- 改动范围：
  - `apps/desktop/electron/services/pipeline-engine.js`（stage.progress 模型、快照下发）
  - `apps/desktop/electron/services/stage-executor.js`（onProgress 通道、通用归一化）
  - `apps/desktop/electron/services/story2video-stages.js`（+ explainer/talkinghead 等按需接入）
  - `apps/desktop/src/views/video-creation/StageProgress.vue`（去特判、通用渲染）
  - `apps/desktop/src/views/CreateView.vue`（快照字段透传，如有需要）
- 测试：
  - 阶段契约测试：onProgress → `getRunSnapshot().stages[i].progress` 可见；越界 percent 拒绝；空 message 过滤；
  - UI 通用渲染测试：任意带 progress 的阶段显示 message + 迷你进度条；
  - 保留现有 `story2video-ue-contract.test.js`「渲染阶段清单」用例不回归；
  - locale 成对：新增用户可见文案写入 `zh.js` / `en.js` 成对（CI Gate 7 拦截）。
- 风险：onProgress 为 additive 扩展，不改变现有执行器默认行为，向后兼容；进度 message 仅内部生成、纯文本插值，无 XSS 面；实施须按仓库流程走 OpenSpec propose（M+/中高风险门禁）+ 独立 worktree 交付。

## 七、边界与不做项

- 不做帧级实时进度：除 compose 片段粒度外，其余阶段以「场景/平台/资源项」为最小上报粒度。
- 不改 Python `progress.py` 语义（发布进度状态机保持独立，仅评估复用其字段模型）。
- 不改流水线执行顺序与 checkpoint 语义，纯增量展示层 + 上报通道。

## 八、出处索引（代码基线 2026-08-13）

- `apps/desktop/electron/services/pipeline-engine.js`：PIPELINES(:52-662)、run/stage 结构(:837-865)、_emit(:756)、_advanceRun(:1088)、getRunSnapshot(:1587)、_executeStage(:1836)、_calcProgress(:1822)
- `apps/desktop/electron/services/stage-executor.js`：execute(:192)、COMPOSE onProgress(:411-435)、PUBLISH 循环(:541-575)、_normalizeComposeProgressForContext(:53)
- `apps/desktop/electron/services/story2video-stages.js`：optimize_progress(:1434-1610)、assets_progress(:1801-1818)、finalize_assets(:2314-2496)
- `apps/desktop/electron/services/story2video-compose-engine.js`：KNOWN_COMPOSE_PHASES(:75)、onProgress 发射(:568-580, :840-927)
- `apps/desktop/electron/services/explainer-stages.js`：注册(:220-420)
- `apps/desktop/src/views/CreateView.vue`：3s 轮询(:1751/:1782/:1811)、updateOrchestrationStatus(:2864)、orchestrationSummary(:1553)
- `apps/desktop/src/views/video-creation/StageProgress.vue`：特判渲染(:105-133)、状态映射(:71-89)
- `packages/python-backend/src/multi_publish/core/progress.py`：发布进度状态机（独立，未接入流水线阶段）
