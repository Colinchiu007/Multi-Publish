# 设计：视频域上限 40000 双仓联动

## 决策

- **域级显式顶格，不碰共享默认**：沿用上轮口径——不动共享 kernel `PROMPT_ENGINE_LIMITS.maxLength`（500）与 legacy 8013（2000）；只把视频域专属上限 `VIDEO_ENGINE_LIMITS.videoMaxLengthMax` 与 standalone range 从 20000 提到 40000。视频域有独立层级语义（refined 5000 默认 / 长模板 ≈22871 字符），不与图片域的 500 兜底连坐。
- **落库上限视频专属**：`story2video-project-service.js` 三处 videoPrompt `safeText(..., 20000)` → 40000；图片 prompt 的 `safeText(..., 20000)`（图片域上限，PR #887）不改。legacy 8013 输出 ≤2000、standalone ≤40000，均在 40000 落库上限内。
- **双后端安全**：`PromptBridge.optimizeVideo` builder clamp 已按能力范围收敛（显式值优先于 tiered 默认），standalone range 随契约更新为 [200,40000]，legacy 仍 [50,2000]，双后端不 422。
- **引擎侧联动**：8020 引擎 `VideoOptimizeRequest.max_length` `le` 同步 20000→40000（外部 prompt-engine change `video-maxlength-40000`）；max_tokens 默认 cap 16384 逻辑不动，真实 provider 输出仍受 cap 约束，本变更只解除校验层 422 与落库截断。

## 数据流

历史重生成 `regenerateScenePrompt(kind=video)` → `optimizeVideoPrompt({ index, max_length: 40000 })` → `PromptBridge.optimizeVideo` builder（standalone [200,40000] / legacy [50,2000]）→ 8020/8013 → 返回 ≥1800 字符长提示词 → `safeText(optimizedText, 40000)` 完整落库 → 详情/编辑视图完整展示。
