审查 Story2Video 场景时长三层模型 **Batch 3（节奏层，compose min-duration 静音补齐）** 设计（工作树 D:\Data\projects\Multi-Publish，分支 codex/story2video-min-duration = main，PR #396 已合并）。只做分析，不修改代码。

背景：Batch 1/2 已落地参数层（targetCharsPerScene 主控、speechRate 单一来源）与切分层；sceneDurationMode/minSceneDuration 已全链路透传（Batch 3 前为 no-op）。Batch 3 让 compose 消费 min-duration。

【Batch 3 范围】
1. apps/desktop/electron/services/story2video-compose-engine.js：
   - compose()：`effectiveDuration = sceneDurationMode==='min-duration' ? max(audioDuration, minSceneDuration) : audioDuration`；
     音频不可探测时回退 defaultSceneDuration；字幕时间轴、动效归一化统一用 effectiveDuration
   - _createSegment：min-duration 且 effectiveDuration > 音频实际时长时——`-t effectiveDuration` + 音频链 apad（或 anullsrc 静音）+ 该场景去掉 -shortest；否则保持现状（-shortest 跟随音频）
   - 累计成片时长校验（<=600s）包含补齐后的 effectiveDuration；单段上限仍按原始音频时长校验（不因补齐误拒）
   - _concatNarrationAudio（完整旁白导出）保持原始音频、不补齐
   - renderSegment：与 compose 对齐 min-duration 语义
2. 真实 ffmpeg 帧级验证（补 claude review W3）：渲染 min-duration 补齐段，ffprobe 断言时长=max(音频,N)、滤镜可解析、无 -shortest 截断
3. 测试：follow-audio 模式与现状逐项一致（回归锁定）；min-duration 补齐（3s 音频→6s 片段）；10s 长旁白不截断；字幕末页结束于 effectiveDuration；动效 effectDuration 用补齐值；转场安全；总时长含补齐超限拒绝；旁白导出不含补齐
4. 文档：PRD 3.1.9 Batch 3 状态、learnings、CHANGELOG

【明确不改】UI（Batch 4）、voice-aware 估算表（Batch 5）、切分逻辑（Batch 2 已完成）。

请审查并输出：
1. effectiveDuration 计算正确性：max(audio, N) vs defaultSceneDuration 回退优先级；minSceneDuration < defaultSceneDuration 时（claude Batch1 分析 I3）边界；
2. apad/-t/-shortest 组合的 ffmpeg 行为：补齐段音频流完整性、concat/xfade 兼容、BGM 混音；
3. 字幕时间轴与动效在补齐段的正确性；
4. 测试缺口（列出具体用例，含真实 ffmpeg）；
5. Critical/Warning/Info 分级意见（注明文件）。
