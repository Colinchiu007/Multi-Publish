# video-content-fidelity — 视频内容保真：分镜-文案对齐

## Why

动画流水线（pipeline=animation）的 storyboard 阶段只拿到 concept 输出的一句 `visual_style`，原始文案全文、角色设定、故事钩子全部丢失，导致视频画面与文案内容不匹配（真实 E2E 证据：733 字三国志文案产出 12 个"赛博侦探档案"场景，白马之战/襄樊之战/水淹七军等核心事件无独立场景，甚至臆造"只用了一年"与原文"长达十几年"矛盾）。同时现有 `story2video-scene-context` 能力只服务 Story2Video 图片/文案流水线，videogen 链路未接入。

## What Changes

- **CONCEPT 双模式（核心升级）**：保留"一两句话 → LLM 完成整个视频创意"的原始机制（`creative` 模式），新增按原文保真模式（`fidelity`）/ 混合模式（`hybrid`），由 `auto` 规则按输入长度/句数/段落数自动判定，显式参数 `storyboardMode` 可覆盖。
- **保真约束与事实注入**：`fidelity`/`hybrid` 下 CONCEPT 输出增加 `key_facts`/`entities` 清单；STORYBOARD 注入完整分段文案 + `key_facts`，每场景绑定 `source_paras`（对应文案段落），关键事件必须有专属场景。
- **入口长文分段（S2）**：新增文案段落化（空行/句号断句 + 可复用 story2video-segmentation 断句能力），作为分镜映射基准。
- **内容对齐门禁（S3）**：新增 `video-content-alignment` 校验器：从文案抽取关键实体/事件（词典 + LLM 兜底），校验 storyboard 场景覆盖度；低于阈值（默认 0.8）带缺失清单重试（默认最多 2 次），fail closed。
- **优化层事实保真（S4）**：videogen 链路把文案摘要/实体通过 `OptimizeRequest.context`（复用 video-prompt-engine 契约已支持键）透传给 prompt-engine；prompt-engine `generic_video` 策略增加事实保真指令（不得改变主体身份/时代/事件）。
- **生成后对齐评估（S5）**：storyboard→generate 产物附带对齐报告（覆盖度/缺失实体/重试记录），写入 run 上下文与日志；视觉层 VLM 评分预留接口（本期标注为未来工作，不冒充已实现）。
- **PRD/文档详细补充**：新增 `01-docs/PRD-video-content-fidelity.md`、`01-docs/ARCH-video-content-fidelity.md`；PRD.md / PRD-video-creation.md / CHANGELOG 同步。

## Capabilities

- **New Capabilities**: `video-content-fidelity`（双模式分镜、段落化、内容对齐门禁、对齐评估）
- **Modified Capabilities**: `video-prompt-engine`（S4：优化请求 context 注入契约扩展 + 事实保真指令），`story2video-scene-context`（delta：videogen 链路接入复用说明，若需行为级变更）

## Impact

- 代码：`apps/desktop/electron/services/videogen-stages.js`（CONCEPT/STORYBOARD/GENERATE）、新模块 `video-content-alignment.js`、`video-prompt-engine-contract.js`（context 透传）、`service-bus.js`/`prompt-bridge.js`（透传链）、prompt-engine `strategies/video/generic.py`（事实保真指令）
- 测试：videogen-stages.test.js、video-content-alignment.test.js、video-prompt-engine-contract.test.js、prompt-engine tests/test_video_optimize.py
- 文档：01-docs/PRD.md、PRD-video-creation.md、CHANGELOG.md、新增 PRD/ARCH
- 不改：Story2Video 图片流水线现有 scene_context 行为；不引入新外部依赖（S5 视觉评估仅预留接口）
