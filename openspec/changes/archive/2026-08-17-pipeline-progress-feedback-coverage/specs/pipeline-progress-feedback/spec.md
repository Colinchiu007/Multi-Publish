## Purpose

在 pipeline-progress-feedback 既有统一契约（stage.progress 双写、onProgress 通道、通用渲染、加权总进度）之上，补齐执行器覆盖与本地化：optimize / generate_assets / finalize_assets 必须走统一通道并按子步骤上报、完成态带 summary；进行中信息与完成摘要结构化本地化（messageKey/summaryKey + 参数，渲染端 locale 优先，缺失降级 raw）；全部注册流水线耗时阶段必须提供可预期的进行中反馈基线。compose 子进度契约与 Python progress.py 行为不变。

## ADDED Requirements

### Requirement: 主流水线执行器覆盖完整化

story2video-compose 的 optimize、generate_assets、finalize_assets 三个阶段执行器 SHALL 通过统一 `onProgress` 通道上报进行中信息：在内部循环（逐场景 LLM、逐图片/视频/TTS 资源项、逐段 TTS）中按子步骤发射 `{ percent, messageKey, messageParams, detail }`，不得只在阶段开始/结束时发射；阶段完成时 SHALL 上报 `percent: 100` 并携带完成摘要（raw summary 与可选 summaryKey/summaryParams）。`context.optimize_progress` / `context.assets_progress` 旧字段 SHALL 保留（旧快照读取路径兼容），且与统一通道同源同值。

#### Scenario: optimize 运行中走统一通道
- **WHEN** optimize 阶段对 N 个场景逐场景 LLM 优化，已完成第 M 个场景
- **THEN** `stage.progress` 存在且 `percent === round(M/N*100)`、`detail = { done: M, total: N, kind: 'scene' }`，并携带本地化 messageKey/params；`context.optimize_progress = { done: M, total: N }` 同值

#### Scenario: generate_assets 运行中走统一通道
- **WHEN** generate_assets 阶段并行生成图片/视频/TTS，已累计完成 C 个资源项（共 T 项）
- **THEN** `stage.progress.percent` 反映 `C/T`，`detail.kind === 'resource'`，messageKey 指向含图片/视频/旁白计数的模板；旧 `context.assets_progress` 计数一致

#### Scenario: 完成态摘要与收尾
- **WHEN** optimize / generate_assets / finalize_assets 阶段成功完成
- **THEN** 该阶段 `stage.summary` 非空（raw 与可选 summaryKey 并存），`stage.progress.percent === 100`（finalize_assets 在 TTS 全部完成后补发）

### Requirement: 进行中信息结构化本地化

阶段进度对象 SHALL 可选携带结构化本地化字段：`stage.progress.messageKey`（字符串，前缀 `stageProgress.`）+ `stage.progress.messageParams`（纯对象，键值仅 string/number/boolean，深度 ≤2）；完成摘要对应 `stage.summaryKey` + `stage.summaryParams`。渲染端 SHALL 优先按 messageKey/summaryKey 经 locale 模板渲染（zh/en 成对，CI Gate 7），key 缺失或翻译无效时降级渲染 raw message/summary。raw `message`/`summary` SHALL 仍然必填/保留（旧快照与调试路径）。任一结构化字段非法时该次更新 SHALL 被拒绝（fail-closed），但 raw 字段合法时不得丢弃整个更新。

#### Scenario: 本地化渲染优先
- **WHEN** 运行中阶段 `stage.progress = { percent: 40, message: '中文原文', messageKey: 'stageProgress.optimizeDone', messageParams: { done: 2, total: 5 } }` 且界面语言为 en
- **THEN** 进度清单展示英文模板插值（如 "5 scenes, 2 done" 语义），不展示中文原文

#### Scenario: 无 key 降级
- **WHEN** 阶段 `stage.progress` 只有 raw message（历史快照 / 未迁移执行器）
- **THEN** 按既有行为渲染 raw message，无空窗

#### Scenario: 非法结构化字段 fail-closed
- **WHEN** messageKey 非字符串/非 `stageProgress.` 前缀、或 messageParams 含非纯对象/深层嵌套/非法值类型
- **THEN** 该次更新被拒绝（不写入 stage.progress），流水线继续执行

### Requirement: 其余流水线反馈基线

所有注册流水线（animated-explainer、talking-head、cinematic、clip-factory、documentary-montage、localization-dub、podcast-repurpose、videogen、smoketest 等）的自定义阶段执行器 SHALL 提供最小进行中反馈：阶段开始 SHALL 发射进行中 message（percent ≥ 5 且 < 100），阶段完成 SHALL 发射 `percent: 100` 与完成摘要（raw summary + 可选 summaryKey）；存在内部循环（逐句/逐场景/逐资源）的执行器 SHALL 在循环内按子步骤发射 `{ percent, detail }`。内置 split/compose/publish 执行器行为不变。

#### Scenario: explainer 阶段带摘要
- **WHEN** animated-explainer 的 research/proposal/script/scenes 等阶段完成
- **THEN** 阶段行展示完成摘要（summaryKey 或 raw summary），不再只显示「生成完成」类 message

#### Scenario: 无反馈流水线补齐
- **WHEN** talking-head 的 transcribe 阶段逐句分句执行
- **THEN** 阶段运行中展示「正在分句…（i/N）」类 message 与按句子计数的 detail；render 阶段完成展示 summary

## MODIFIED Requirements

### Requirement: 各阶段目标反馈粒度（更新）

以下阶段 SHALL 提供运行中反馈（本表替换原「各阶段目标反馈粒度」表中的对应行）：

| 阶段 | 运行中反馈 |
|------|-----------|
| optimize | 执行器统一通道逐场景上报「共 N 个场景，已完成 M 个」+ 迷你进度条 + 完成摘要 |
| generate_assets | 执行器统一通道按图片/视频/TTS 资源项上报计数 + 迷你进度条 + 完成摘要（原「沿用既有子进度契约」行更新为统一通道子步骤上报，既有 assets_progress 计数语义保留） |
| finalize_assets | 逐段 TTS「正在生成第 i/N 段旁白」+ 完成收尾（100% + 摘要） |
| publish | 逐平台「正在发布到 {平台} (i/N)」（不变） |
| scene_context / select_video_scenes / split | 既有进行中 message + 完成摘要（不变） |
| 其余流水线 LLM/资源阶段 | 开始 message + 循环子步骤计数 + 完成摘要（原「按需」行收紧为必须） |

#### Scenario: 主流水线全阶段统一反馈
- **WHEN** story2video-compose 任一阶段运行中
- **THEN** 该阶段行均展示进行中 message，且 optimize/generate_assets/compose/publish/finalize_assets 展示迷你进度条（percent 合法时），完成阶段展示摘要
