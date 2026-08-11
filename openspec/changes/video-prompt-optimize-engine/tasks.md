# Tasks — video-prompt-optimize-engine

> 进度唯一来源。场景→测试映射见各任务「测试目标」。

## T1 prompt-engine：视频领域模型与枚举（外部仓库分支）
- [x] `models.py` 新增 `DomainType`（image/video，缺省 image）、`VideoPlatformType` 枚举、`OptimizeRequest.domain` 可选字段、`VideoPromptResult`（shot/camera/motion_intensity 1-10/scene_transition/continuity_token/duration_hint）
- [x] `OptimizeResult.video: VideoPromptResult | None` 可选字段
- [x] 测试目标：`test_video_optimize.py` — domain 缺省兼容（不传 domain 行为与图片一致）；`test_video_generic_strategy.py`

## T2 prompt-engine：GenericVideoStrategy + REST 接入（外部仓库分支）
- [x] `strategies/video/__init__.py` + `strategies/video/generic.py`：六要素 system prompt + post_process（剥 think/关键词/渲染单串 + 结构化字段提取，非法 JSON 规则化回退）
- [x] `strategies/base.py` 注册表支持按 domain 分组；`api/rest.py` `/v1/optimize`、`/v1/optimize/batch` 按 `request.domain` 选策略域，响应含 `video`；`/v1/platforms` 支持 `domain` 查询
- [x] 测试目标：`test_video_optimize.py` — video 平台别名归一、结构化输出、空/超长/error fail-closed、批量数量一致；`test_api_endpoints.py` 扩展

## T3 Multi-Publish：prompt-engine-contract.js 视频契约（本分支）
- [x] `video-prompt-engine-contract.js`（新文件，与图片契约分离命名）：`VIDEO_PLATFORMS` + `VIDEO_PLATFORM_ALIASES` + `normalizeVideoPlatform`（回退 generic_video）
- [x] `buildVideoOptimizeRequest(prompt, options)`：domain 默认 video、platform 归一、边界收敛、context 透传 + `assertNoSensitiveContext`
- [x] `extractOptimizedVideoPrompt(result)`：error→detail→空串 fail-closed；video 字段越界收敛；返回 `{ok, prompt, meta, video}`
- [x] 测试目标：`video-prompt-engine-contract.test.js` — 场景「领域与视频平台契约」（别名/缺省兼容）、「上下文与一致性」（敏感键拦截/一致性令牌）、「配置契约边界」、「输出校验 fail closed」

## T4 Multi-Publish：PromptBridge/ServiceBus 视频优化入口（本分支）
- [x] `prompt-bridge.js` `optimizeVideo` / `optimizeVideosBatch`（复用 `_post`、健康检查、错误边界）
- [x] `service-bus.js` 暴露 `optimizeVideoPrompt` / `optimizeVideoPromptsBatch`
- [x] 测试目标：`service-bus-plugin-registry.test.js` 扩展 — mock PromptBridge 验证委托与 fail-closed

## T5 Multi-Publish：videogen 流水线接入（本分支）
- [x] `videogen-stages.js` `videogen_generate` 前批量优化（`bus = serviceBus || pipelineEngine.serviceBus`；数量/空项 fail-closed；未注入/异常明确失败）：场景提示词 → `optimizeVideosBatch(domain=video)`；未注入 PromptBridge 明确失败；逐项校验失败即阶段失败
- [x] 测试目标：`videogen-stages.test.js` — 场景「视频提示词统一经 prompt-engine 优化」（请求命中 domain=video、空/error/数量不匹配失败、服务不可用明确失败）

## T6 Multi-Publish：Story2Video 混合模式接入（本分支）
- [x] `story2video-stages.js` 视频场景提示词经 `optimizeVideo` 改写后再 `generateSceneVideo`；失败按混合模式既有语义回退图片轮播（PRD 7.1.x）
- [x] 测试目标：`story2video-stages.test.js` — 场景「混合模式视频场景优化」（经视频优化、不得直接复用图片 optimized_prompt、失败回退）

## T7 跨仓库契约回归与文档（本分支 + 外部仓库分支）
- [ ] 真实 8013 smoke：`/v1/optimize` domain=video 请求返回结构化结果（外部验收边界，标注执行环境）
- [ ] `01-docs/VIDEO-PROMPT-OPTIMIZE-ENGINE-DESIGN-2026-08-11.md` 状态更新；CHANGELOG 追加；learnings 复盘（如适用）
- [ ] 场景-测试映射核对：`openspec validate` + `scripts/openspec-sync-check.js` 通过
- [ ] 双分支推送 + PR（prompt-engine 仓库、Multi-Publish 仓库），记录 remoteStatus

## 明确不做（边界）
- 平台专项策略（kling/veo/runway/wan/seedance… 定制 system prompt）→ Phase 2
- 分镜批量一致性 compose_batch（continuity_token 全链路）→ Phase 2
- 评估闭环/成本护栏监控 → Phase 3
- 音频联动（旁白节奏→提示词）→ Phase 4
