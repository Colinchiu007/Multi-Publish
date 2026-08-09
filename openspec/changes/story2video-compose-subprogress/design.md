# Design: 图片轮播流水线「视频合成」阶段子百分比进度条

## Context

图片轮播流水线（story2video-compose）6 阶段清单中，`compose`（视频合成）只显示「进行中」+ 耗时，无子进度；该阶段耗时占比最大（逐场景 ffmpeg 合成 + 拼接 + 旁白合并 + 可选 BGM/转码 + 校验）。`optimize`（场景 x/y）与 `generate_assets`（图片/旁白 x/y）已有子进度（`context.optimize_progress` / `context.assets_progress`，经 3 秒轮询 `pipelineGetRunContext` 下发）。compose 后端链：`StageExecutor.COMPOSE`（stage-executor.js:346）→ `serviceBus.composeVideo`（service-bus.js:71）→ `Story2VideoComposeEngine.compose`（story2video-compose-engine.js:397），主流程全部 `execFileAsync`（无实时进度）。

## Goals / Non-Goals

**Goals:**
- compose 阶段展示独立子百分比进度条 + 阶段文案（与 optimize/assets 的子进度模式对称）。
- 数据契约 `context.compose_progress`：字段级校验、失败冻结、成功才 100。
- 保持向后兼容：`compose()` 仅新增可选回调参数；ServiceBus 签名不变；既有调用方/测试不受影响。

**Non-Goals:**
- v1 不做 ffmpeg `-progress pipe:1` 段内实时百分比（8 处 execFileAsync 改 spawn 属高风险重构，记入 PRD 后续演进项）。
- 不改动 compose 引擎的 ffmpeg 参数、校验规则、输出语义。
- 不引入新阶段、不改阶段清单结构。

## Decisions

### D1: 引擎进度发射（story2video-compose-engine.js）

`compose(assetManifest, options, onProgress)` 新增可选 `onProgress`（兼容 `options.onProgress`；第三参优先）。引擎内部 `_emitComposeProgress(next)` helper：
- 输入归一化为 `{ phase, percent, segmentsDone?, segmentsTotal?, message? }`；percent 取整、钳制 [0,100]、**单调不降**（低于上次发射值时忽略）。
- **`done`（percent=100）只在成功 return 前发射**；全部失败路径（片段/拼接/旁白/BGM/webm/校验/持久化失败）不发射新值，percent 冻结在最后有效值（<100）。
- 可选步骤（BGM/WebM）按实际执行路径跳变；message 仅用于日志/测试 hint，前端不直接渲染。

权重（阶段 → percent）：
| 阶段 | percent |
|---|---|
| preflight（素材准备/校验） | 0 |
| validated（校验通过） | 3 |
| segments（逐片段 k/N，k 为已完成片段数） | 3 + 72·k/N（k=N 精确 75） |
| concat（拼接，含 chunked 递归） | 87 |
| narration（旁白合并） | 89 |
| bgm（可选混音） | 92 |
| webm（可选转码） | 95 |
| verify（输出校验） | 98 |
| done（成功） | 100 |

### D2: 执行器 fail-closed 写入（stage-executor.js）

内置 COMPOSE 执行器把 `options.onProgress` 透传 `serviceBus.composeVideo`；回调内对 `compose_progress` 做**字段级校验**后才写入 `context`：
- `phase` 为非空字符串且属于已知枚举（未知 phase 丢弃）；
- `percent` 为有限数且 [0,100]；
- `segmentsTotal` 存在时为 ≥1 整数；`segmentsDone` 存在时为 [0, segmentsTotal] 整数；
- 结构为纯原始值对象（IPC structuredClone 安全）。
校验失败则忽略该次回调（fail-closed：宁可不更新也不下发非法值）。

### D3: 前端展示（CreateView.vue）

- `stageDetailText(stage, i)` 新增 `compose` 分支：`phase==='segments'` 且 total>0 时显示「正在合成片段 k/N · p%」，其余显示「视频合成 p%」；沿用 `translateWithLocaleFallback` 内联 fallback（与 optimize/assets 一致，**不进 locale 静态文件**，规避 i18n 插值陷阱）。
- 模板 `.stage-main` 内新增子进度条：`v-if="stage.name === 'compose' && stage.status === 'running' && composeSubProgressPercent(stage) !== null"`，`data-testid="story2video-stage-compose-progress"`，复用 `.progress-bar/.progress-fill` + 新增 `.progress-bar-mini`（高 4px）。
- 新增 helper `composeSubProgressPercent(stage)`：读 `orchestrationContext.compose_progress`，percent 有限且 [0,100] 时返回，否则 null（历史 run / 旧数据安全降级）。

### D4: 测试面

- compose 引擎：mock `_createSegment` 等，断言 onProgress 相位/百分比序列；3 条失败路径（片段失败/拼接失败/校验失败）断言 percent 冻结 <100 且无 `done`；单调性（不降）。
- stage-executor：mock `composeVideo` 内部触发 `options.onProgress`，断言 `context.compose_progress` 写入；非法值（percent=NaN/超界、total=0、未知 phase）不写入。
- pipeline-story2video-contract：composeVideo mock 触发 onProgress，断言 `getRunContext` 暴露 `compose_progress`。
- CreateView.test / story2video-ue-contract：子进度条渲染 + 文案 + data-testid 存在。

## Risks / Trade-offs

- **风险（低）**：`compose()` 签名新增第三参——既有调用方不受影响（可选），测试全 mock `_createSegment` 不触 ffmpeg 真实路径。
- **权衡**：段内非实时（以段为单位跳变）是 v1 有意取舍；chunked 拼接（>8 段）在 75→87 区间仍可能短暂停滞，已通过拓宽权重缓解，段级 onStep 插值记入 PRD 后续项。
- **不引入**：无新增依赖、无 IPC 通道变更（复用 context 轮询）。
