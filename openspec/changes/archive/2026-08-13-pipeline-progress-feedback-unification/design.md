# Design — 阶段进行中信息反馈颗粒度统一

## Context

- 现状：前端 3s 轮询 `pipeline:getRunContext` → `getRunSnapshot()` 返回 `{ stages[], context }`（`pipeline-engine.js:1587`）；stage 对象仅 `{ name, status, startedAt, completedAt }`（`pipeline-engine.js:842-853`）；进度数据散落在 `context.optimize_progress` / `assets_progress` / `compose_progress`；StageProgress.vue 按 `stage.name` 特判渲染（`split/optimize/generate_assets/compose`）。
- 已有可复用模式：compose 的 `onProgress` 回调 + `_normalizeComposeProgressForContext` 字段级校验（`stage-executor.js:53`、`:411-435`）；`assets_progress`/`optimize_progress` 已在执行器内实时写 context。
- 约束：additive、向后兼容；不改阶段执行顺序与 checkpoint 语义；`context.*_progress` 保留（旧 renderer/测试依赖）；进度为展示增强，非法值不阻断流水线；新文案 locale zh/en 成对。

## Goals

- 统一阶段进度契约并在快照中下发（`stage.progress` + `stage.summary` + `context.stage_progress` 双写）。
- 提供 StageExecutor 通用 `onProgress` 通道，逐阶段接入（publish/finalize_assets/LLM 阶段/split/optimize 运行中展示）。
- StageProgress 去特判通用渲染 + 总进度加权。

## Non-Goals

- 不做帧级实时进度（最小上报粒度 = 场景/资源项/平台/TTS 段）。
- 不做 Phase 3（实时事件推送/快照裁剪）——后续独立 change。
- 不改 Python `progress.py`（发布进度状态机保持独立）。
- 不重复规格化既有 compose/generate_assets 子进度。

## Decisions

1. **阶段进度载体：`stage.progress` + `context.stage_progress` 双写**
   - 快照直读 `stage.progress`（前端不再从 context 挖各 key）；`context.stage_progress` 供旧路径/调试。
   - 替代方案：仅扩展 `context`（`context.stage_progress`）→ 放弃：前端仍需按阶段映射，去特判不彻底。
2. **通道形态：`onProgress({ percent, message, detail })` 函数参数注入 `_executeStage`**
   - 复用 compose 既有模式并泛化校验函数（`normalizeStageProgress` 收口：percent 0-100 整数单调、message ≤80 字符串、detail done/total/kind、非法 fail-closed）。
   - 替代方案：EventEmitter 总线 → 放弃：现有执行器都是 async 函数直调，回调注入改动最小。
3. **UI 通用渲染：StageProgress.vue 读 `stage.progress` / `stage.summary`，移除 stage.name 特判**
   - compose 子进度条泛化为任意阶段（percent 合法即显示 mini bar）；`orchestrationContext` 的 `split/optimize_progress/assets_progress/compose_progress` 映射迁移到新模型后保留降级读取（旧快照）。
   - 替代方案：保持特判逐个扩展 → 放弃：新增阶段永远落后。
4. **总进度加权：`∑完成阶段 + 当前阶段 percent·(1/N)`**
   - `_calcProgress` 由「completed/N」升级为「(completed + runningStagePercent/100)/N × 100」；前端 `orchestrationProgressPercent` 同步口径（快照已有 `progress` 时优先用主进程值）。
5. **接入顺序（先易后难，保证每步可回归）**
   - optimize 运行中展示（数据已有，纯 UI+映射）→ publish 逐平台 → finalize_assets 逐段 TTS → LLM 阶段（domain_enrich/scene_context/select_video_scenes/explainer）→ split summary → 其余流水线按需。

## Risks / Trade-offs

- `context` 已包含 `assets_progress` 等大对象但均为路径/计数（非 base64），双写体积可接受；3s 轮询不变。
- `stage.progress` 新增字段为 IPC 增量，旧 renderer 忽略，向后兼容。
- 泛化校验函数可能影响 compose 既有行为——回归需跑 `stage-executor.test.js` / `pipeline-story2video-contract.test.js` 全量。
- `message` 拼接平台名/场景文本来自内部数据（平台枚举、索引），纯文本插值无 XSS 面；若未来含用户输入须走 locale + 转义。
