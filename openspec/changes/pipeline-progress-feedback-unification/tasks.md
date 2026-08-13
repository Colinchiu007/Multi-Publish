## 1. 阶段进度契约基础（spec: 阶段级进度数据契约 / 执行器统一上报通道）

- [ ] 1.1 泛化进度校验函数 `normalizeStageProgress(update)`（由 `_normalizeComposeProgressForContext` 模式扩展，`stage-executor.js`）：percent 0-100 有限整数且单调、message ≤80 非空字符串、detail `{done,total,kind}` 合法、非法返回 null（fail-closed）
- [ ] 1.2 `PipelineEngine._createRun` / 恢复路径：stage 对象初始化 `progress: null`、`summary: null` 字段（`pipeline-engine.js:842-853`、`:1322`、`:1389`）
- [ ] 1.3 `_executeStage` 注入统一 `onProgress({ percent, message, detail })`：经 `normalizeStageProgress` 校验后双写 `stage.progress` + `context.stage_progress`（`pipeline-engine.js:1836-1881`）
- [ ] 1.4 `getRunSnapshot` 返回 stage 时透传 `progress`/`summary`（`pipeline-engine.js:1587-1615`）
- [ ] 1.5 `_calcProgress` 升级为阶段数占比 + 当前阶段 percent 加权（`pipeline-engine.js:1822`）；前端 `orchestrationProgressPercent` 优先取快照 `progress`（`CreateView.vue:1521`）

## 2. 逐阶段接入进行中反馈（spec: 各阶段目标反馈粒度）

- [ ] 2.1 optimize 运行中展示：StageProgress/映射在 running 时也读取 `context.optimize_progress`（数据已有，`story2video-stages.js:1434`；当前仅 completed 展示）
- [ ] 2.2 publish 逐平台：`STAGE_TYPES.PUBLISH` 循环内 `onProgress({ percent, message: '正在发布到 {平台} (i/N)' })`（`stage-executor.js:541-575`）
- [ ] 2.3 finalize_assets 逐段 TTS：`story2video-stages.js` finalize 段每段 TTS 完成后上报
- [ ] 2.4 LLM 阶段：domain_enrich / scene_context / select_video_scenes（`story2video-stages.js`）与 explainer research/proposal/script/scenes（`explainer-stages.js`）调用前后上报 message（i/N 可计数处带计数）
- [ ] 2.5 split 完成摘要：完成后写 `stage.summary`（场景数），进行中发 message

## 3. UI 通用化（spec: 进度清单通用渲染 / 数据安全与本地化）

- [ ] 3.1 `StageProgress.vue` 移除 `stage.name` 特判：统一渲染 `stage.progress.message` + 迷你进度条（percent 合法即显示）；compose 子进度条逻辑并入通用渲染（保留 testid 兼容）
- [ ] 3.2 完成阶段优先显示 `stage.summary`；旧快照降级读取 `orchestrationContext.split/optimize_progress/assets_progress/compose_progress`
- [ ] 3.3 新增 locale 文案（zh/en 成对）：optimize 运行中、publish 平台进度、finalize_assets TTS 段、split 进行中、LLM 阶段「正在分析场景…」

## 4. 测试与验证

- [ ] 4.1 契约测试：`onProgress` → `getRunSnapshot().stages[i].progress` 可见；越界/NaN/空 message/detail 越界被拒（fail-closed）；双写 `context.stage_progress` 一致
- [ ] 4.2 执行器测试：publish 逐平台 percent i/N、finalize_assets 逐段、optimize running 展示（`pipeline-story2video-contract.test.js` / `stage-executor.test.js`）
- [ ] 4.3 UI 测试：任意阶段带 progress 渲染 message + mini bar；无 progress 安全降级；summary 优先；总进度加权（`CreateView.test.js` / `story2video-ue-contract.test.js` 保留阶段清单用例）
- [ ] 4.4 回归：`stage-executor.test.js`、`pipeline-story2video-contract.test.js`、`CreateView.test.js` 全量通过；locale 同步检查（CI Gate 7 等价脚本）通过
- [ ] 4.5 手动验证：启动开发版走 story2video-compose 短流水线，确认每个阶段运行中均有进行中文案/进度；Vite build 通过
