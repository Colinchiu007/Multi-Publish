# video-prompt-optimize-engine — 视频提示词优化引擎

## Why
项目内所有 AI 视频生成的提示词目前均"裸奔"直传 provider：videogen 流水线由分镜 LLM 直接产出画面提示词（videogen-stages.js），Story2Video 混合模式把图片优化提示词原样复用作视频提示词（story2video-stages.js:667），Python video_creation 的 16 个视频 provider 全部直传 inputs["prompt"]。视频独有的镜头语言/运动/时序/跨镜头一致性维度完全缺失，出片质量不可控、不可审计。图片侧已有成熟样板（prompt-engine 8013 + prompt-engine-contract.js 契约单一来源 + fail-closed 校验），视频侧应复用同一机制实现统一治理。

## What Changes
- **prompt-engine（外部仓库，8013）新增 video 领域**：`OptimizeRequest.domain` 字段（缺省 image，向后兼容）；`VideoPlatformType` 枚举（sora/kling/veo/runway/wan/seedance/minimax/hunyuan/cogvideo/ltx/higgsfield/grok/agnes/generic_video）；视频结构化响应 `VideoPromptResult`（`shot`/`camera`/`motion_intensity`/`scene_transition`/`continuity_token`/`duration_hint` + 渲染单串 `optimized_prompt`）；`strategies/video/generic.py` 兜底策略（主体/动作/环境/光色/镜头/风格六要素模板）；`/v1/optimize`、`/v1/optimize/batch` 支持 domain=video。
- **Multi-Publish 契约层新增视频契约**：`prompt-engine-contract.js` 增加视频平台枚举/别名归一、数值边界、`buildVideoOptimizeRequest`、`extractOptimizedVideoPrompt`（结构化字段 schema 校验、error→detail→空串 fail-closed 顺序与图片一致）、敏感键拦截复用。
- **PromptBridge/ServiceBus 暴露视频优化入口**：`optimizeVideo` / `optimizeVideosBatch`（或同端点传 domain=video）。
- **Story2Video 混合模式**：`select_video_scenes` 选中的视频场景提示词先经视频优化引擎再提交 `generateSceneVideo`，不再直接把图片优化提示词当视频提示词用。
- **videogen 流水线**：`videogen_generate` 阶段前对场景提示词批量走视频优化（Generic 兜底），未配置/不可用时 fail closed；`videogen_storyboard` 产出的 `{prompt,text,duration}` 直接可消费。
- **测试**：双仓库契约测试（mock PromptBridge / 本地 HTTP stub，不依赖真实 8013 与 LLM key）。
- **BREAKING**: 无。`domain` 缺省为 image，现有图片契约与调用方零影响。

## Capabilities
- **New Capabilities**:
  - `video-prompt-engine` — 视频提示词统一优化引擎契约（领域切换、视频平台枚举、结构化输出、fail-closed 校验、集成点约束）
- **Modified Capabilities**: 无（视频提示词当前无既有规格约束，本 change 引入首个治理基线）

## Impact
- 外部仓库 `D:\Data\projects\prompt-engine`：`prompt_engine/models.py`、`api/rest.py`、`strategies/`（新增 `video/`）、`04-tests/` → 独立 codex 分支 + PR
- `apps/desktop/electron/services/`：`prompt-engine-contract.js`、`prompt-bridge.js`、`service-bus.js`、`story2video-stages.js`、`videogen-stages.js`、`stage-executor.js` + 对应测试 → codex 分支 + PR
- 契约双仓库同步；跨仓库回归用真实 8013 作为外部验收边界，不纳入自动化单元门禁
