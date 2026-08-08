审查 Story2Video 场景时长三层模型 **Batch 1（参数层）** 的设计（工作树 D:\Data\projects\Multi-Publish，分支 codex/smart-sentence-splitter）。只做分析，不修改代码。

背景：PRD 3.1.9 已确认三层模型：① 分镜粒度=每分镜目标字数（targetCharsPerScene，主控，默认 20）；② 实际时长=ffprobe 真实音频（保留）；③ 节奏下限=最短场景时长（min-duration，可选开关默认关）。已确认默认：双视图+默认时长视图、N=6、开关默认关。

【Batch 1 范围 — 参数层】
1. apps/desktop/electron/services/story2video-text-config.js：
   - 新增 split.targetCharsPerScene（默认 20，整数，范围 1..200）
   - 兼容：配置仅提供 targetSeconds 时，换算 targetCharsPerScene = clamp(round(targetSeconds × baseWordsPerSecond × speechRate), minWords, maxWords)；两者都提供时以 targetCharsPerScene 为准（targetSeconds 保留为展示/时长视图换算来源）
   - 新增 compose.sceneDurationMode（'follow-audio' | 'min-duration'，默认 follow-audio）、compose.minSceneDuration（默认 6，1..60）
   - stageOptions：compose 增加 sceneDurationMode/minSceneDuration；split 阶段暂不把 targetCharsPerScene 发给 8002（Batch 2 再接线）
2. packages/python-backend/.../story2video-compose.yaml：runtime_defaults.story2videoTextConfig 同步 split.targetCharsPerScene=20、compose.sceneDurationMode='follow-audio'、compose.minSceneDuration=6（renderer/normalizer/YAML 一致性门禁）
3. stage-executor.js composeOptionKeys 增加 'sceneDurationMode','minSceneDuration'；story2video-project-service.js _safeOptions 白名单同步
4. 测试：默认值、targetSeconds 兼容换算（结果 ∈ [minWords,maxWords]）、targetCharsPerScene 越界（0/201）拒绝、sceneDurationMode 非法枚举拒绝、minSceneDuration 越界拒绝、白名单透传

【明确不改（后续批次）】切分公式消费 targetCharsPerScene（Batch 2）、speechRate 由 voice.speed 驱动（Batch 2）、UI 双视图与开关（Batch 4）、voice-aware 估算表（Batch 5）。

请审查并输出：
1. 参数契约正确性：默认 20 与现有 targetSeconds=6×3.3×1=19.8→20 一致性；换算公式与 clamp 边界；
2. 兼容性风险：旧项目只有 targetSeconds 的配置、新配置同时传两者的优先级、8002 是否可能因新增字段受影响；
3. yaml/text-config 一致性遗漏点；
4. 测试缺口（列出具体用例）；
5. 风险与建议（按 Critical/Warning/Info 分级，注明文件）。
