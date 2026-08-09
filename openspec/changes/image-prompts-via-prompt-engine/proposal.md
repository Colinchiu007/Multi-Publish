## Why

Story2Video-compose 的 manifest（story2video-compose.yaml）与运行时默认值已声明「optimize 阶段走 prompt-engine（port 8013）、auto_detect_style=true、platform/creativeLevel/maxLength/numCandidates/context」等契约，但实际实现（story2video-stages.js 的 story2video_optimize）仍直接调用默认 LLM，且 story2video-text-config.js 显式忽略 prompt-engine 专属参数。设计（manifest）与实现（直接 LLM）长期背离，导致图片提示词缺少统一的风格检测、改写与输出校验，且跨流水线行为不一致。

## What Changes

- **Story2Video optimize 阶段改为统一走 prompt-engine**：`story2video_optimize` 从「直接调用默认 LLM」改为调用 PromptBridge（POST /v1/optimize），请求携带 platform / style / creative_level / max_length / negative_prompt / num_candidates / auto_detect_style / context；保留有界并发、瞬态重试、断点续传（optimize_resume）与进度（optimize_progress）语义。
- **风格检测**：style 未显式指定时启用 `auto_detect_style: true`，由 prompt-engine 返回 detected_categories；风格/平台枚举与 prompt-engine 契约对齐（14 项 StyleType、7 项 PlatformType，含别名 cinematic→photography、3d-render→3d_render、dall-e→dalle、stable-diffusion→stable_diffusion）。
- **输出校验（fail closed）**：optimized_prompt 必须为非空字符串且不超 max_length；error 非空（服务不可用/配额/非法响应）时阶段失败并给出明确错误；批量数量不匹配或某项无效立即失败；无效结果不进入 generate_assets。
- **配置契约扩展**：`story2video-text-config.js` 的 optimize 配置新增 platform / maxLength / numCandidates / autoDetectStyle / context，范围校验对齐 prompt-engine 边界（platform 7 枚举、creativeLevel 1-10、maxLength 50-2000、numCandidates 1-5、negativePrompt ≤500）；旧字段（style/creativeLevel/negativePrompt）保持向后兼容。
- **通用 OPTIMIZE/OPTIMIZE_BATCH 对齐**：通用 StageExecutor 已走 PromptBridge，补齐同一参数透传与输出校验口径（含平台/风格别名归一），保证「所有图片提示词」统一契约。
- **服务不可用语义**：按 manifest 契约，prompt-engine（8013）未运行时 optimize 阶段返回明确错误，不静默回退到默认 LLM（避免绕过统一契约）；错误消息可解释、可操作。
- **测试与文档**：更新/新增 story2video-stages、story2video-text-config、stage-executor、pipeline-story2video-contract 测试（本地 HTTP stub / mock PromptBridge 覆盖契约，不依赖真实 8013）；更新 PRD、learnings、CHANGELOG、.quality-gates.md 执行记录。
- **OpenSpec/CCG/质量节拍三同步**：本 change 归档、CCG task 归档、质量节拍复盘记录一并提交。

## Capabilities

### New Capabilities
- `image-prompt-engine`: 图片提示词统一经 prompt-engine 做风格检测、改写与输出校验的契约（阶段行为、请求/响应校验、配置边界、服务不可用语义、测试映射）。

### Modified Capabilities
<!-- 无；openspec-integration 为流程契约，不受本变更影响 -->

## Impact

- 运行时代码：`apps/desktop/electron/services/story2video-stages.js`（OPTIMIZE 执行器）、`story2video-text-config.js`（配置契约）、`prompt-bridge.js`（请求归一，如必要）、`stage-executor.js`/`service-bus.js`（参数透传口径，如必要）、pipeline-engine.js stageDef（optimize 默认选项）。
- 测试：story2video-stages.test.js、story2video-text-config.test.js、stage-executor.test.js、pipeline-story2video-contract.test.js、e2e-pipeline-orchestrator.test.js 注释与夹具。
- 文档：01-docs/PRD.md、01-docs/PRD-video-creation.md、01-docs/learnings.md、CHANGELOG.md、.quality-gates.md、packages/python-backend/.../story2video-compose.yaml（对齐描述，如需要）。
- 外部依赖：prompt-engine（D:\Data\projects\prompt-engine）服务契约（8013 /v1/optimize、/v1/classify）；真实 LLM key 与配额为外部验收边界。
- 交付：codex/ 分支 + PR 合并；应用重启验证（可见窗口）。
