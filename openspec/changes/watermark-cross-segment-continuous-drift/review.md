# Review — watermark-cross-segment-continuous-drift（2026-08-28）

## 双模型审查（并行）

- **Claude reviewer**：无 Critical；Warning W1（单镜头「不触发」文档/代码矛盾）、W2（bgm 顺序无测试锁定）、W3（无单镜头测试）——三项已全部修复（见下）。Info I1-I6 已处理 I1（表达式单一来源）、I2（滤镜无逗号断言）、I3（crf 注释）、I4（色名白名单）、I6（超时 profile 常量）；I5（90% 停驻展示）按设计接受不处理。
- **Opencode reviewer**：Major M1（同 W1，单镜头触发描述错）与 M2（`_burnMovingWatermark` 复刻 `buildWatermarkFilter`，违反单一来源 Goal）；Minor m1（PRD `''moving''` 排版错）、m2（无单镜头测试）——全部修复。

## 修复清单

1. **W1/M1 单镜头守卫**：compose 触发条件加 `segments.length > 1`；`segmentOptions` 传递 `sceneTotal`；片段层 skip 改 `watermarkPostpone = position==="moving" && sceneTotal>1`——单镜头保持片段内嵌（零额外编码、无二次有损），多镜头后置。
2. **W2 bgm 顺序锁定**：新增「moving + bgmPath」用例，断言 `_runFfmpegStage` 调用顺序 `['watermark', 'bgm']` 且 percent 90 < 92。
3. **W3/m2 单镜头测试**：新增「单镜头 + moving：不进 watermark 阶段，sceneTotal=1 传递」compose 用例 + image/video 片段级 sceneTotal=1 内嵌断言（每文件 2→3 调用）。
4. **M2 单一来源**：`_burnMovingWatermark` 直接调用 `buildWatermarkFilter({ watermark: config, watermarkText })`；新断言「后置滤镜 === buildWatermarkFilter 输出」完全相等防漂移。
5. **I1**：`buildMovingWatermarkPositionExpr()` 模块级 helper，片段/后置共用。
6. **I4**：`resolveWatermarkColor` + 常用色名白名单（hex/16 色名，其余回退 white）。
7. **I6**：`FULL_REENCODE_TIMEOUT_PROFILE` 常量，xfade/watermark 共用。
8. **m1**：PRD 3.1.39 双单引号排版修正；触发条件句改为「仅多镜头触发后置」；learnings 同步。

## 验证证据

- 单元：compose-engine 148/148（原 140 + 新增/调整 8）；相邻套件 5 文件 286 全绿；本轮全量 434/434。
- 真实 ffmpeg 冒烟（2026-08-28，ffmpeg 7.1）：多镜头 2×30s——phases 含 watermark:90，t0.5 起点居中 (656,366.5)/画布 (640,360)，切点 29.5→30.5s Δy=3.5px/Δx=11px（旧片段内嵌会跳 ~650px），音频 aac 保留，59.6s；总耗时 16.2s（watermark 阶段约 6s，~10x 实时）。单镜头 10s——无 watermark 阶段（零额外编码），t1.0 起点居中 (673,373.5)（采样避开 fade 0-0.5s 淡入期），音频保留。
- QM-1：`electron-builder --win --dir` exit 0；asar 清单含 `story2video-compose-engine.js`。
