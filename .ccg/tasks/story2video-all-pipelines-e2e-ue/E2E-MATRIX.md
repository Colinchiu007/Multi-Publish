# 视频创作全流水线真实 E2E 能力矩阵（2026-08-06）

## 结论速览

- 本仓库桌面端只有 `story2video-compose`（图片轮播）具备真实执行引擎（六阶段编排：split → domain_enrich → optimize → generate_assets → compose → publish），可进行真实视频生成 E2E。
- 其余 13 条流水线（animated-explainer / talking-head / cinematic / animation / avatar-spokesperson / character-animation / clip-factory / documentary-montage / hybrid / localization-dub / podcast-repurpose / screen-demo / framework-smoke）在 `PipelineEngine` 中仅为 state_machine 状态跟踪（`start()` 不执行真实工作），`StageExecutor` 明确注释"旧的 13 条流水线无 stage.type 字段，回退 MANUAL_CHECKPOINT，与原状态机行为完全一致"。前端点击启动后停留首阶段（无自动推进），**当前无法产生真实视频**——这是"无执行引擎"的实现缺口，不是"未配置模型"。

## 证据

- `apps/desktop/electron/services/pipeline-engine.js:6-17`：双模式设计，state_machine（默认）仅跟踪状态；orchestrator（仅 story2video）通过 StageExecutor 真实执行。
- `apps/desktop/electron/services/stage-executor.js:16-24`：13 条旧流水线无 stage.type → MANUAL_CHECKPOINT，与原状态机行为一致。
- `apps/desktop/electron/services/pipeline-engine.js:586-644`：`startOrchestrated` 仅对 `STORY2VIDEO_PIPELINE` 归一化参数并 autoAdvance。
- `packages/python-backend/src/server.py`：仅提供 `/api/pipelines`（清单/清单详情）、`/api/video/*`（单步工具：process/analyze/mix-audio/search-stock/generate-subtitle），无 13 条流水线的端到端执行器。
- `packages/python-backend/src/multi_publish/video_creation/`：大量单步工具（分析/数字人/采集/角色/增强/provider），但未接入桌面端 13 条流水线的编排。

## Profile 已配置模型（C:\tmp\Multi-Publish-debug-profile\multi-publish.db，enabled=1 且带密钥）

| provider | 类别 | 模型 | 连接测试 |
|---|---|---|---|
| minimax-image | image | image-01 | success（model_provider_logs） |
| minimax-tts | tts | speech-2.8-turbo | success（model_provider_logs） |
| agnes-llm | llm | agnes-2.0-flash | — |
| sensenova-llm | llm | deepseek-v4-flash | — |

## 各流水线 E2E 判定

| 流水线 | 真实引擎 | 所需模型 | 已配置 | 可真实生成 | 备注 |
|---|---|---|---|---|---|
| story2video-compose | ✅ 六阶段编排 | LLM+图片+TTS | ✅ | ✅ 可跑 | 本次真实 E2E 主目标 |
| animated-explainer | ❌ 无 | — | — | ❌ | state_machine 占位 |
| talking-head | ❌ 无 | — | — | ❌ | state_machine 占位 |
| cinematic | ❌ 无 | — | — | ❌ | state_machine 占位 |
| animation | ❌ 无 | — | — | ❌ | state_machine 占位 |
| avatar-spokesperson | ❌ 无 | — | — | ❌ | state_machine 占位 |
| character-animation | ❌ 无 | — | — | ❌ | state_machine 占位 |
| clip-factory | ❌ 无 | — | — | ❌ | state_machine 占位 |
| documentary-montage | ❌ 无 | — | — | ❌ | state_machine 占位 |
| hybrid | ❌ 无 | — | — | ❌ | state_machine 占位 |
| localization-dub | ❌ 无 | — | — | ❌ | state_machine 占位 |
| podcast-repurpose | ❌ 无 | — | — | ❌ | state_machine 占位 |
| screen-demo | ❌ 无 | — | — | ❌ | state_machine 占位 |
| framework-smoke | ❌ 无 | — | — | ❌ | state_machine 占位 |

## E2E 执行计划

1. story2video-compose：UI 驱动真实生成（登录 profile + 已配置 MiniMax 图片/TTS + LLM），断言六阶段全部成功、输出视频存在且 ffprobe 可解码、时长>0。
2. 其余 13 条：UI 驱动点击启动，记录"启动→停留首阶段"的真实行为，作为无引擎缺口的 UI 证据；写入 UI/UE 优化需求（未实现流水线应显式标识并禁用启动）。
3. 外部验收边界：真实 provider 生成依赖账号配额/网络；失败时记录真实错误码与原因，不伪造通过。

## 状态更新（2026-08-06 09:00）

| 流水线 | 引擎 | 状态 |
|---|---|---|
| story2video-compose | ✅ | PR #362/#363 合并，E2E PASS |
| animated-explainer | ✅ | PR #364 合并，E2E PASS |
| clip-factory / cinematic / framework-smoke / talking-head | ✅ | PR #365 合并（18d264d），E2E PASS |
| UE 优化（徽标/禁用/子分组） | — | PR #366 合并（0957e48） |
| documentary-montage | ✅ | PR #367（CI 中），E2E PASS（run_1785970039014_aiie） |
| localization-dub / podcast-repurpose / screen-demo | ❌ | 可行未实现（建议单独立项） |
| animation / avatar-spokesperson / character-animation / hybrid | ❌ | 缺视频生成/数字人模型 |
