## Context

- ApiUsageGovernor（apps/desktop/electron/services/api-usage-governor.js）已实现：每 provider 并发信号量 maxConcurrent、滑动窗口 RPM 排队（_pace 时间槽）、429 冷却 + 退避重试、5h/周 token 额度窗口（setTokenWindows）、自适应 rateFactor。
- AIGenerator.generate 在 providerId 非空时经 governor.run 执行（ai-generator.js:96-104）；生成阶段（story2video generate_assets）并行调用经 serviceBus/assetGenerator，未走 governor。
- 限流预算当前来自静态 PROVIDER_LIMITS（governor-provider-limits.js），ops-center 预设目录（含每分钟连接次数/5小时限额）与桌面 model-provider-seeds.js 手工对齐，无运行时同步。
- 桌面 provider 配置存于 model_providers 表 config JSON（ModelProviderManager），前端 ModelProviders.vue 可编辑。

## Goals / Non-Goals

**Goals:**
- 把所有模型调用（含视频创作生成阶段）收敛到统一调度机制（governor + 薄封装）。
- 每分钟连接次数/5小时限额次数进入 provider 配置并可被 governor 使用；种子值与 ops-center 对齐。
- 生成阶段并行上限受 provider maxConcurrent 约束，超预算排队（有界）而非直接失败。
- 全链路默认行为不回归：未配置限流字段时回退现有静态表/默认并发。

**Non-Goals:**
- 不做桌面端与 ops-center 的运行时 API 同步（保持手工种子对齐 + 文档契约；运行时同步列为后续）。
- 不重写 ApiUsageGovernor 核心算法。

## Decisions

1. **统一机制 = ApiUsageGovernor + model-call-scheduler 薄封装**。复用既有实现避免重复造轮子；scheduler 提供语义化入口（withModelBudget/mapWithModelBudget）供各阶段使用。
2. **预算来源优先级**：精确 key 覆盖（setLimits）> provider 配置 rate_per_minute/limit_per_5h（setProviderLimits）> 静态 PROVIDER_LIMITS 表 > 类别默认。
   - rate_per_minute → { rpm, maxConcurrent = clamp(ceil(rpm/10), 1, 4) }（每分钟连接次数与并发换算：保守取 1/10，视频类 1）。
   - limit_per_5h → setTokenWindows 5h 窗口（field=requests，limit=limit_per_5h），在 governor 请求计数（result 无 usage 时按 1 次计）——governor 需扩展 request 计数窗口。
3. **story2video generate_assets**：image/tts 分别解析 provider（resolveCapabilityProvider），用 mapWithModelBudget 取代 _mapWithConcurrency；provider 未配置时 fallback 原 concurrency=3。
4. **种子对齐**：model-provider-seeds.js 为知名 provider 补充 rate_per_minute/limit_per_5h（数值与 ops-center 种子一致）；新增 provider 配置变更时同步更新。
5. **前端**：ModelProviders.vue 编辑弹窗新增「每分钟连接次数」「5小时限额次数」数字输入（可空，>0 校验），保存进 config。

## Risks / Trade-offs

- rpm 换算 maxConcurrent 为启发式，可能偏保守/激进；429 自适应（rateFactor）兜底真实限流。
- 5h 窗口按「请求次数」计数（非 token），与既有 token 窗口语义不同，需独立 window 字段；文档需澄清「5小时限额次数」= 请求次数上限。
- 配置为空的 provider 回退静态表，行为与现状一致，风险低。
- generate_assets 并发上限收紧可能降低本地 ffmpeg/edge-tts 兜底路径吞吐（该类 provider 无外部 RPM，回退高预算，影响可忽略）。
