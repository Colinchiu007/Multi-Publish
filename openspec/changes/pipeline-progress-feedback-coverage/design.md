## Context

- 统一契约骨架已存在：`pipeline-engine.js:1988-2010` `onProgress` → `normalizeStageProgress`（fail-closed、单调检查）→ 双写 `stage.progress` + `context.stage_progress` → `stage:progress` 事件；`_calcProgress` 已加权；实时推送 500ms 节流（`ipc-handlers/pipeline.js`）；`StageProgress.vue` 已通用渲染（message + 迷你进度条 + summary 优先，`stage.name` 特判仅剩旧快照降级分支）。
- 缺口：story2video 自定义执行器中 `optimize`（`story2video-stages.js:1747`）与 `generate_assets`（`:1982`，签名未接 onProgress）只写旧 context；`finalize_assets`（`:2736`）缺完成态收尾；explainer 无 summary；其余 8 个 `*-stages.js` 完全无 onProgress。运行中 message/summary 均为主进程硬编码中文。
- 约束：additive、向后兼容；不改阶段执行顺序与 checkpoint；`context.*_progress` 保留；新文案 locale zh/en 成对（CI Gate 7）；非法进度值不阻断流水线。

## Goals / Non-Goals

**Goals:**
- 主流水线三个缺口阶段（optimize / generate_assets / finalize_assets）走统一通道，带迷你进度条与完成摘要。
- 运行中信息本地化：渲染端 locale 为唯一权威，主进程只发 key + 参数。
- 全部注册流水线执行器有可预期的进行中反馈基线。

**Non-Goals:**
- 不改 Python `progress.py` 发布状态机；不改 compose 引擎子进度契约；不做帧级实时进度；不重写各流水线执行逻辑（只加进度上报，失败/重试/断点语义不变）。

## Decisions

1. **message/summary 结构化字段**：`normalizeStageProgress` 扩展校验可选 `messageKey`/`messageParams`/`summaryKey`/`summaryParams`；`messageKey` 必须是字符串且前缀 `stageProgress.`，`messageParams` 为纯对象（键值仅 string/number/boolean，深度 ≤2）；raw `message`/`summary` 仍必填/保留（旧 renderer 与降级路径依赖）。`pipeline-engine.js` 透传（`stage.progress` 已整体 spread，`stage.summary` 已写入），无需改引擎。
   - 替代方案 A：主进程按 locale 直发本地化文本 → 放弃：locale 权威在 renderer（localStorage），主进程需要知道界面语言且双份维护。
   - 替代方案 B：只发 key 不发 raw message → 放弃：旧快照/旧 renderer/调试无文本可看。
2. **optimize 接入**：在 `_mapWithConcurrency` 每场景完成回调处（`story2video-stages.js:1774-1949` 内 `partialResume[index]` 赋值点）统一调用 `emitOptimizeProgress()`：`percent = done/total`、`messageKey: 'stageProgress.optimizeDone'`、`messageParams: {done, total}`、`detail: {done, total, kind: 'scene'}`；完成后 `summaryKey: 'stageProgress.optimizeSummary'` + raw summary。旧 `context.optimize_progress` 保留。
3. **generate_assets 接入**：执行器签名加 `onProgress`；在 `writeAssetsProgress()`（`:605`、auto 侧 `:2160`）旁同步 `emitUnifiedProgress()`：`percent = (imagesDone+videosDone+ttsDone)/(imagesTotal+videosTotal+ttsTotal)`，`messageKey` 按有无视频选 `assetsDetail`/`assetsDetailNoVideo`，`detail.kind: 'resource'`；完成后 summary。旧 `context.assets_progress` 保留。
4. **finalize_assets 收尾**：TTS 全部完成后补 `percent:100` + summary（`summaryKey: 'stageProgress.finalizeTtsSummary'`）。
5. **其余流水线基线**：每个自定义执行器统一模式——入口 `onProgress({percent: 5, messageKey, messageParams})`，内部循环（逐句/逐场景/逐资源）按项 `percent: i/n + detail`，出口 `percent:100 + summaryKey`。先 explainer（已有 10/100，补 summary + key），再 talking-head / cinematic / clip-factory / documentary / localization-dub / podcast-repurpose / videogen / smoketest（无进度的全部补最小基线）。
6. **渲染端**：`StageProgress.vue` 的 `stageDetailText` 与 `stageTimeDetailText` 前增加 key 优先解析：`localized(key, params)` 返回有效翻译则用之，否则降级 raw。summary 同理。

## Risks / Trade-offs

- [percent 与旧 context 计数不一致] → 统一从同一计数器派生（done/total 同源），双写同值。
- [messageKey 拼写漂移导致渲染回退 raw] → 降级为 raw message（仍是合法中文），不空窗；locale 成对检查由 CI Gate 7 + glossary 测试兜底。
- [批量改 8 个执行器文件引入行为回归] → 每文件只加上报调用不碰业务逻辑；跑各流水线既有单测 + 新增断言；改动前逐文件读原文。
- [en 用户 summary 仍为中文（未迁移的旧 summary）] → 本次新增 summary 全部带 key；存量 raw summary 保留，后续迭代迁移。

## Migration Plan

- 与主分支并行开发于 `codex/pipeline-progress-feedback-v2`；合入后旧快照（无 key）自动降级 raw，无开关；回滚 = 合入前 revert，契约字段 additive 无破坏。
