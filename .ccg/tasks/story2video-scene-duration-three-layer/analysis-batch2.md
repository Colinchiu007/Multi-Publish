审查 Story2Video 场景时长三层模型 **Batch 2（切分层）** 设计（工作树 D:\Data\projects\Multi-Publish，分支 codex/smart-sentence-splitter）。只做分析，不修改代码。

背景：Batch 1 已落地参数层（split.targetCharsPerScene 主控、反推 target_duration、sceneDurationMode/minSceneDuration）。Batch 2 让切分层真正消费主控。

【Batch 2 范围】
1. apps/desktop/electron/services/story2video-text-config.js：
   - split.speechRate 改为由 voice.speed 驱动（单一来源，消除“切分按 1x、播报按 1.5x”脱节）；因 chars 计算依赖 speechRate，需把 chars 计算块移到 voice 构建之后
   - stageOptions.split 增加 target_chars_per_scene: split.targetCharsPerScene（仅供本地 fallback 消费；8002 经 _buildStorySplitterOptions 白名单不会收到该键）
2. apps/desktop/electron/services/story2video-segmentation.js：
   - normalizeOptions 读取 targetCharsPerScene（别名 targetCharsPerScene/target_chars_per_scene）
   - splitScenesLocally：提供时直接用（仍夹 [minWords,maxWords] 防御），缺省回退 targetDuration×bps×rate 旧公式
3. packages/story2video-engine/src/text-segmentation.ts：SceneSegmentationConfig 增加可选 targetCharsPerScene，calculateTargetWords 优先用它
4. 真实 8002（127.0.0.1:8002 在线）取整差异验证：本地 targetChars 切分 vs 8002 target_duration×bps×rate 切分，分镜数/边界一致性
5. 测试：speechRate 单一来源、stageOptions 透传、本地切分直用 targetCharsPerScene、TS 侧同步

【明确不改】UI（Batch 4）、compose min-duration 消费（Batch 3）、voice-aware 估算表（Batch 5）。

请审查并输出：
1. speechRate=voice.speed 覆盖的风险（旧配置 splitSpeechRate 独立值被忽略是否可接受；chars 计算顺序调整的正确性）；
2. target_chars_per_scene 双通道（本地直用 vs 8002 经 target_duration 反推）一致性/取整差异；
3. 8002 对未知字段的容忍度（若 stage.options 直接透传会怎样）；
4. 测试缺口（列出具体用例）；
5. Critical/Warning/Info 分级意见（注明文件）。

## Batch 2 8002 真实取整/边界验证（2026-08-08）

样本：6 句中文（约 57 字，无 topic）。chars ∈ {10,20,30,40,50} × rate ∈ {1.0,1.5,2.0}。
- chars ≥ 30：8002 与本地 splitScenesLocally 分镜数一致（3/3、2/2）。
- chars < 30（含默认 20）：8002 有自身合并行为（如 chars=20 → 8002:3 vs 本地:6）。
- 结论：8002 场景算法与本地贪心按句分组存在差异（非本次引入，老 target_duration 路径同样存在）；
  分镜字数主控在 ≥30 字/场景时本地/8002 一致。外部 8002 sidecar 边界记录，默认 20 字场景粒度以 8002 实际为准。
