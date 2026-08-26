# 相似度真度量改造 — 双模型分析综合

## 确认问题
1. pipeline.js:121-124 clone 参数传 plan 报告，产物从未二次分析 → score 构造性恒真
2. similarity.js:156 无证据维度按权重计满分（空-空 script/style → 1）→ score 恒 0.85/grade 恒 L2，与 verdict 自相矛盾

## claude 后端分析要点（SESSION 0285e995）
1. **shots 二态化**：timesToShots 空切点→单段[{0,dur}]，成功必 ≥1 段；仅失败 null。null → warnings.sceneDetectFailed + evidenceSource='plan-fallback'，禁止静默回退。artifacts.output 补 probeOk（compose ffprobe 失败时 durationSec 已回退 built.totalDurationSec，现无标志）
2. **script 勿置空（修正原方案）**：置空 → L1/L2 必需维 script+style 恒不过 → 恒 needs_review，failOnLowSimilarity 下流水线不可完成（Type-II 假失败）。改为 merge 报告：structure/duration 实测 + script/style 继承 plan（字幕烧录/风格已应用 = 合理代理），逐维 provenance（measured/plan-constructive），warnings.unmeasuredScript 降 confidence
3. **归一化 + grade 修正**：score=Σ(ev·w·m)/Σ(ev·w)，全无证据归 0；confidence<0.5 或已证据维 < 必需维 → grade=null（消除「L2 + insufficient_evidence」矛盾）；metrics 恒 number（UI .toFixed）
4. **时长零成本实测**：artifacts.output.durationSec 已是 ffprobe 实测，wrapper 直接覆盖 meta.durationSec
5. **降级透传**：scenes 透传 degraded/source + assets.degraded 汇总 + warnings.degradedAssets（只警示不门禁）
6. **测试盲区**：现有 stub compose 不写 artifacts.output → 全走回退路径「不小心全绿」；补四态用例（实测命中/null 失败/降级/回退）；similarity.test 补 partial-evidence score/grade 断言；compose 单测 stub sceneRunner（真实 ffmpeg 红蓝硬切阈值 0.3 未必命中，勿进 CI 关键路径）

## opencode 后端分析
（等待返回后补充）

## opencode 后端分析（SESSION ses_fc664b67affe）
1. 质疑 sceneRunner 价值：compose 按 plan 镜头渲染，output timeline 几乎必等于 plan → 可砍掉只做 duration 实测
2. similarity.js:59,97,106 空输入默认 1 直接改 0
3. compose-ffmpeg.js:170 ffprobe 失败 durationSec 应 null 不回退
4. shots 三态语义：null(失败)/[](测得无镜头)/[...](测得)
5. pipeline.test.js:60-61 依赖 clone==source 同 duration，需改写
6. 合成对象禁止写回 ctx.report
7. 补测试清单：merge 路径/shots=null 警告/degraded 透传/归一化/grade null/duration≠plan/不污染 ctx.report

## 综合裁决（主代理）
- **保留 sceneRunner**（否决 opencode 简化案）：场景检测是唯一能暴露占位退化（同图静态画面）的实测信号，35% 权重维度不实测则改造意义减半；采纳其三态语义与「失败显式降级」
- **纯函数空输入语义不动**（否决 opencode 改 0 案）：空-空=1 语义上合理（都无文案=一致），问题只在计分——用 score 归一化排除（claude 案），改动面小
- **durationSec 保留回退值 + 新增 probeOk 标志**（折中）：改 null 破坏 artifacts 契约；probeOk=false 时 duration 维度 provenance 标 plan-fallback
- **merge 报告不写回 ctx.report**（双方一致）

## 定稿方案
1. compose-ffmpeg.js：+sceneRunner（默认 runFfmpegSceneDetect）；artifacts.output += {fps, shots(三态), sceneMethod, probeOk}，全容错
2. pipeline.js compose 包装器：构建 merge clone 报告（独立对象）——probeOk 时 meta 实测；shots 数组时 timeline/visual.shots 实测，null 时 plan+warnings.sceneDetectFailed+evidenceSource='plan-fallback'；script/style 继承 plan（provenance plan-constructive）；similarity.provenance 逐维标注；warnings.unmeasuredScript（无 ASR/TTS 时）；degradedAssets 从 artifacts.assets 附加
3. similarity.js：score=Σ(ev·w·m)/Σ(ev·w) 全无证据=0；confidence<0.5 或已证据维<必需维 → grade=null
4. generate-assets.js：scenes 透传 degraded/source，artifacts.assets.degraded 汇总
5. desktop video-clone/asset-generator.js:35：透传 degraded/source
6. 测试：similarity（归一化/grade null）、pipeline 四态（实测命中/null 失败/probeOk false/回退+不污染+failOnLowSimilarity 回归）、compose（sceneRunner stub 成功/异常）、generate-assets（degraded）、desktop wrapper（透传）
