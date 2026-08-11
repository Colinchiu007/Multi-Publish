# Design — 视频提示词优化引擎

## 决策记录与备选方案

| 决策 | 选择 | 备选 | 理由 |
|---|---|---|---|
| 引擎归属 | 扩展外部 prompt-engine（8013）为双领域引擎（domain=image\|video） | 新建独立 video-prompt-engine sidecar（8014） | prompt-engine 已具备平台策略注册表（strategies/base.py）、分镜策略注册表（storyboard/base.py，含 compose_batch 批量一致性）、LLM 多供应商、KeyRouter、SQLite+内存缓存、敏感键拦截；Multi-Publish 已有 PromptBridge 生命周期与契约层。新建 sidecar = 重复运维 + 契约双份 |
| API 形态 | 复用 `/v1/optimize`、`/v1/optimize/batch`，请求体加 `domain` 字段（缺省 image） | 新建 `/v1/video/optimize` 独立端点 | domain 缺省兼容图片契约，零回归；一个端点一套校验链 |
| 输出形态 | 结构化 `video` 对象 + 渲染单串 `optimized_prompt` 双形态 | 仅单串 | provider 直用单串；上层编排（分镜编辑/重试/审计）读结构化字段 |
| 视频平台策略 | 新增 `strategies/video/`，Phase 1 仅 GenericVideoStrategy 兜底；平台专项策略（kling/veo/runway…）Phase 2 | 一次性全部平台 | 保持最小闭环可交付，平台策略按 provider 实际请求体逐一定制 |
| 混合模式接入点 | select_video_scenes 选中场景 → 视频优化 → generateSceneVideo | 在 generateSceneVideo 内部优化 | 保持 generateSceneVideo 纯执行（提交/轮询/下载），优化属编排职责，便于跳过/重试 |

## 架构

```
videogen_generate 前      Story2Video 混合模式（select_video_scenes 后）
        │                          │
        ▼                          ▼
  PromptBridge.optimizeVideo / optimizeVideosBatch   ← domain=video
        │                          │
        ▼                          ▼
  prompt-engine-contract.js（视频枚举/别名归一/边界/敏感拦截/请求构造/输出校验）
        │
        ▼ HTTP 127.0.0.1:8013
  prompt-engine /v1/optimize[?domain=video]
     → VideoPlatformType 归一 → GenericVideoStrategy.build_system_prompt
     → LLM 结构化 JSON → post_process（剥 <think>/关键词/长度/渲染单串）
     → OptimizeResult（optimized_prompt + video 结构化字段 + error）
```

## 关键实现点

### prompt-engine（外部仓库，独立 codex 分支）
1. `models.py`：`DomainType(image|video)`；`VideoPlatformType` 枚举（sora/kling/veo/runway/wan/seedance/minimax/hunyuan/cogvideo/ltx/higgsfield/grok/agnes/generic_video）；`OptimizeRequest.domain` 可选字段；`VideoPromptResult(BaseModel)`：`shot`、`camera`、`motion_intensity(int 1-10)`、`scene_transition`、`continuity_token`、`duration_hint`；`OptimizeResult.video: VideoPromptResult | None`。
2. `strategies/video/generic.py`：`@register('generic_video')`，system prompt 六要素（主体/动作/环境/光色/镜头/风格）+ 运动与转场引导；`post_process` 从 LLM JSON 提取结构化字段并渲染单串，非法 JSON 回退规则化拼接。
3. `api/rest.py`：`/v1/optimize`、`/v1/optimize/batch` 读取 `request.domain` 选择策略域（video → strategies/video 注册表），响应含 `video` 字段；`/v1/platforms` 增加 `domain` 查询参数。
4. `04-tests/`：`test_video_optimize.py`（domain 缺省兼容、video 平台别名、结构化输出、空/超长/error fail-closed、批量数量）、`test_video_generic_strategy.py`（六要素模板、post_process 渲染）。

### Multi-Publish（codex/video-prompt-optimize-engine 分支）
1. `video-prompt-engine-contract.js`（**新文件**，与图片契约 `prompt-engine-contract.js` 分文件分命名，避免混淆）：
   - `VIDEO_PLATFORMS` Set + `VIDEO_PLATFORM_ALIASES`（sora-v2→sora、kling-pro→kling、veo-3/veo3→veo、runway-gen4→runway…）+ `normalizeVideoPlatform` 回退 `generic_video`；
   - `buildVideoOptimizeRequest(prompt, options)`：domain 默认 video、platform 归一、creativeLevel/maxLength/numCandidates/negativePrompt 边界收敛、context 透传 + `assertNoSensitiveContext`；
   - `extractOptimizedVideoPrompt(result)`：error→detail→空串 fail-closed，`video` 字段越界收敛（motion_intensity clamp 1-10），返回 `{ok, prompt, meta, video}`。
2. `prompt-bridge.js`：`optimizeVideo(prompt, options)`、`optimizeVideosBatch(prompts, options)`（复用 `_post` 与健康检查）。
3. `service-bus.js`：`optimizeVideoPrompt` / `optimizeVideoPromptsBatch` 委托。
4. `videogen-stages.js`：`videogen_generate` 前新增优化步骤——场景数组非空时批量调 `optimizeVideosBatch`，逐项 fail-closed，失败即阶段失败；未注入 PromptBridge 时明确错误。
5. `story2video-stages.js`：`select_video_scenes` 选中场景生成 `videoPrompt` 时经 `optimizeVideo`；失败按混合模式既有语义（回退图片轮播，不中断整线，PRD 7.1.x 混合模式契约）。
6. 测试：`prompt-engine-contract.test.js`（视频枚举/别名/边界/请求构造/结构化校验）、`videogen-stages.test.js`（mock PromptBridge：请求命中 domain=video、空/error/数量不匹配失败）、`story2video-stages.test.js`（混合模式视频场景经优化、失败回退）。

## 风险与回退策略

| 风险 | 缓解/回退 |
|---|---|
| 8013 未运行导致视频流水线失败 | 与图片契约一致：明确错误提示启动 prompt-engine；Phase 1 只影响提示词环节，视频生成链路本身不变 |
| domain 字段与旧 prompt-engine 版本不兼容 | Multi-Publish 契约层仅在新版可用时传 domain；缺省 image 路径不受影响 |
| 视频优化引入额外延迟（LLM 调用） | numCandidates 默认 1、缓存命中复用（prompt-engine 既有 sqlite/mem 缓存）；成本护栏 Phase 3 监控 |
| 结构化字段 schema 漂移 | 双仓库契约测试锁定；`openspec validate` + 场景-测试映射检查 |
| 平台专项策略未就绪时质量参差 | Phase 1 用 GenericVideoStrategy 兜底，平台策略逐 provider 定制进入 Phase 2 |
