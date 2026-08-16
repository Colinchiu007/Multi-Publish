## Context

链路：`ResultView 历史记录「重新生成视频优化词」` → `Story2VideoProjectService.regenerateScenePrompt(kind=video)` → `serviceBus.optimizeVideoPrompt(seed, { index })` → `PromptBridge.optimizeVideo`（8020 standalone 优先，失败回退 8013 legacy domain=video）→ 契约 builder `resolveTieredMaxLength(explicit, creativeLevel, range, batchDefault, refinedDefault)`。

现状缺口：regen 未传 explicit `max_length`，creativeLevel 默认 5（<7）→ 落 batchDefault：standalone 8020 = 1800、legacy 8013 = 500。图片域 regen（PR #887/#896）已改为显式传域上限 2000；视频域未对齐。

## Selected Approach

1. `regenerateScenePrompt` video 分支请求追加 `max_length: VIDEO_ENGINE_LIMITS.videoMaxLengthMax`（=20000，视频域目标上限，语义「引擎侧 le=20000 已对齐」），与 `index` 并列。
2. 双后端 clamp 语义（既有契约函数，零改动）：
   - `buildStandaloneVideoOptimizeRequest`（8020）：`resolveTieredMaxLength(20000, …)` 显式值 → `clampNumber(20000, 200, 20000)` = 20000；
   - `buildVideoOptimizeRequest`（legacy/8013）：显式值 → `clampNumber(20000, 50, 2000)` = 2000（legacy 真实上限，不 422）。
3. 落库 `safeText(optimizedText, 20000)` 保持：legacy 输出 ≤2000、standalone ≤20000，均在落库上限内，无需改动。
4. 不引入 `creative_level` 传递：显式 `max_length` 路径优先于 tiered 默认，语义不依赖 creativeLevel，改动最小。

## Alternatives Considered

- **改共享 kernel 默认 500→2000/1800**：静默放大所有通用 `optimize` 调用方（图片批量/其他流水线 + 视频 legacy 路径）的默认长度——跨域行为变更 + 成本影响；与 PRD 3.1.29.5 边界冲突，否决。
- **仅改 8020 standalone 路径**：legacy 回退环境（未托管 VIDEO_PROMPT_PORT）历史重生成仍走 500 默认截断，残缺场景未根治；否决——必须双后端安全。
- **regen 先探测后端再传值**：显式值会被两个 builder 各自 clamp，探测属多余耦合；否决。

## Risks

- 8020 引擎 20000 上限内输出更长时，视频优化 token 消耗/耗时增加：上限放开≠必然写满，由引擎自决；与图片 2000 放开同模式，PM 已在 PRD 3.1.29.5 确认。
- legacy 8013 环境输出仍 ≤2000：属 8013 video 领域引擎真实能力（le=2000），契约收敛不放松（PRD 3.1.29.5 明确）；需超过 2000 须先与供应商/网关确认真实上限与配额，不在本次范围。