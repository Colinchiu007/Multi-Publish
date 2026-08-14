# Tasks: prompt-engine-higgsfield-round3a

## T1 图片主缓存 key 修复（M，评审 C1/C4 修订）✅
- [x] `prompt_engine/cache.py`：SqlitePromptCache.make_key 全组件 + 版本盐 IMAGE_FMT_V1
- [x] `prompt_engine/cache_manager.py`：MemoryPromptCache key 同构
- [x] `prompt_engine/optimizer.py`：`_cache_key/_cache_get/_cache_set` 调用点传新组件（excluded/no_swap/context/style/language）
- [x] legacy `_PromptCache`/`fuzzy_match_prompt` 不动（兼容测试保留）
- [x] 测试：make_key 单测 + **集成级**（异 excluded 两次 optimize → miss）+ fuzzy 零回归

## T2 视频 evaluator 确定性校验（M，评审 C2/W1/W2/W3 修订）✅
- [x] `video_prompt_engine/strategies/base.py` + `generic_video.py`：refined 多切教 `[SHOT N]` 标记指令
- [x] `video_prompt_engine/optimizer.py`：缓存版本盐 HIGGSFIELD_FMT_V1 → V2
- [x] `video_prompt_engine/evaluator.py`：timeline_missing(-5)/timing_break(-5) + checks 暴露
- [x] 测试：timeline 正反例（shots≥2 带标记✓/缺标记✗/单切 N/A）+ timing 区间形态（"0:00-0:04"）+ 既有 violations 组合 + 新渲染形态不触发对照

## T3 音频分层（M，评审 C3/W7/W8 修订）✅
- [x] `video_prompt_engine/models.py`：VIDEO_OUTPUT_KEYS + VideoPromptMeta.audio_layers
- [x] `video_prompt_engine/strategies/base.py`：_clean_audio_layers + Output Format 键 + build_tail 去重
- [x] `video_prompt_engine/evaluator.py`：missing_audio 判定表（sfx/dialogue 至少一层）
- [x] 测试：链路端到端 + 渲染形态 + 去重 + 判定表四分支 + 零回归

## T5 评审修复（2026-08-15 Review Pass 2）✅
- [x] C1：C6 尾行剥离正则兼容 Audio 段形态（`Audio:.*`/`No music\.` 分支）+ 双尾行回归
- [x] W1：missing_audio 判定表限定 refined（batch 仍走正文检查）+ 回归
- [x] W2：make_key `json.dumps(default=str)` + set 排序归一 + 空容器归一 + 回归
- [x] I1/I2/I9/I10/I12：剥离后正文判定 / timing_diff 恒存在 / int music_off / 空层回退 / 指令分行 + 回归
- [x] 基线：rest.py 资源端点显式 utf-8 读取（GBK locale rag_cases 恒 0）

## T4 收尾
- [x] prompt-engine 全量 pytest（726+ 通过；web_e2e 5 errors 为无服务端环境性基线）
- [x] Multi-Publish 契约联调冒烟（视频优化请求/响应无回归）
- [ ] CHANGELOG / learnings / v3.0 报告落地状态
- [ ] 双模型评审（Claude，antigravity 降级）+ PR + merge + 三同步归档
