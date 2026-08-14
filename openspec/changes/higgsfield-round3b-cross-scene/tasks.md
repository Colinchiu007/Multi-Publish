# Tasks — Higgsfield round3b 跨镜状态包

## T1 引擎：models.py 新增 prev_final_frame 字段（≤500，可选）
- [ ] VideoOptimizeRequest + `prev_final_frame: Optional[str] = Field(default=None, max_length=500)`
- [ ] 单测：>500 → 422 / 缺省正常

## T2 引擎：缓存 key 组件 + 盐 V3
- [ ] `_cache_key` + `_h(request.prev_final_frame or "")`
- [ ] 盐 `HIGGSFIELD_FMT_V2 → HIGGSFIELD_FMT_V3`
- [ ] 单测：异 prev_final_frame → 异 key；V3 旧缓存失效

## T3 引擎：承接指令注入 system prompt
- [ ] `build_system_prompt`（或 optimizer 调用点）在有 prev_final_frame 时注入 SCENE Continuity 段
- [ ] 单测：注入/缺省两形态断言

## T4 引擎：evaluator continuity_check
- [ ] `evaluate`/`select_best` 增加 prev_final_frame 参数；实体提取 + 停用词 + ≥60% 阈值
- [ ] `violations["continuity_break"] = -5` advisory；checks 暴露 hits/total/ratio
- [ ] 单测：正例（复用实体）/反例（未复用）/缺省跳过

## T5 契约：video-prompt-engine-contract.js 透传
- [ ] 两个构造器支持 options.prev_final_frame（trim/截断 500/非字符串丢弃）
- [ ] 单测：合法透传/超长截断/空与非法丢弃/缺省不带字段

## T6 流水线：story2video-stages.js 跨镜注入
- [ ] 视频优化阶段 i>0 注入上一场景终态（final_frame → endingState → finalFrame 优先序）
- [ ] 单测：注入/首场景不注入/终态缺失跳过/日志
