# Tasks — Higgsfield round3b 跨镜状态包

## T1 引擎：models.py 新增 prev_final_frame + final_frame 上限上调
- [ ] `VideoOptimizeRequest` + `prev_final_frame: Optional[str] = Field(default=None, max_length=1000)`
- [ ] `VideoPromptMeta.final_frame` max_length 500 → 1000
- [ ] 单测：>1000 → 422 / 缺省正常 / final_frame 1001 字符拒绝

## T2 引擎：缓存 key 组件 + 盐 V4（同批一次重建）
- [ ] `_cache_key` + `_h(request.prev_final_frame or "")`
- [ ] 盐 `HIGGSFIELD_FMT_V2 → HIGGSFIELD_FMT_V4`
- [ ] 单测：异 prev_final_frame → 异 key；V4 旧缓存失效

## T3 引擎：承接指令注入 system prompt
- [ ] `build_system_prompt`（或 optimizer 调用点）在有 prev_final_frame 时注入 SCENE Continuity 段
- [ ] 单测：注入/缺省两形态断言

## T4 引擎：evaluator continuity_check（评审修订：弃 2-gram/泛词/角色必中）
- [ ] `evaluate`/`select_best` 增加 prev_final_frame 与角色白名单参数
- [ ] 英文：去停用词+高频泛词，≥40% 且角色名必中；中文：白名单 ≥60% 或整句重合 ≥0.5
- [ ] `violations["continuity_break"] = -5` advisory；checks 暴露 hits/total/ratio/method
- [ ] 单测：英文正反例/中文改写正反例/角色缺失必中反例/泛词不稀释/缺省跳过/择优排序稳定性

## T5 契约：video-prompt-engine-contract.js 透传
- [ ] 两个构造器支持 options.prev_final_frame（trim/按句截断 1000/非字符串丢弃）
- [ ] final_frame 上限校验 500 → 1000（与引擎同界）
- [ ] 单测：合法透传/超长按句截断/空与非法丢弃/缺省不带字段

## T6 流水线：story2video-stages.js 终态回写 + 串行化 + 跨镜注入
- [ ] 视频优化完成后回写 `scenes[i].video.final_frame`
- [ ] 视频场景 ≥2 时串行化视频优化阶段，维护 lastFinalFrame；单视频场景保持并发
- [ ] 注入优先序 lastFinalFrame → scenes[i-1].video.final_frame → endingState → finalFrame；图片前驱/隔场景视频前驱正确串联
- [ ] 单测：注入/首视频场景不注入/终态缺失跳过/混合轮播/回写闭环/日志