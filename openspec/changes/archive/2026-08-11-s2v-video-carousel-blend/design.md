## Context

Story2Video 流水线（`story2video-compose`）当前为「图片轮播」单一视觉形态：`split → domain_enrich → optimize → generate_assets（图片+TTS）→ compose（zoompan 合成）→ publish`。`story2video-compose-engine.compose()` 要求每个 scene 同时具备 `imagePath` + `audioPath`；`videogen-stages.js` 已具备成熟的 AI 视频生成路径（`generateVideo` + `getVideoStatus` 轮询 + 下载落盘），但属于独立流水线体系，与 Story2Video 无交集。本设计把两条路径整合进 Story2Video 流水线，形成「AI 视频片段 + 图片轮播」混合成片，AI 视频只用于最值得动态化的场景（总时长 20%-40%），控制 Token/成本。

## Goals / Non-Goals

**Goals:**
- 新增两种混合模式：`fixed`（前 20%-30% 时长 AI 视频）与 `ai-judged`（LLM 按精彩度选场景，总占比 20%-40%）。
- 复用现有：视频 provider 解析与轮询下载（videogen-stages）、compose 字幕/转场/BGM/水印管线、model-call-scheduler 调度、前端选项持久化。
- 保持向后兼容：`video.mode = 'off'` 默认值下，所有既有行为、契约、UI 不变。
- 混合片段合成：AI 视频场景以视频文件为画面基底，图片场景维持 zoompan，统一分辨率/帧率后走既有 xfade 拼接。

**Non-Goals:**
- 不改动通用 videogen 流水线（animation/hybrid 等）。
- 不做视频片段内的智能剪辑/关键帧选择；AI 视频按场景提示词整体生成、按旁白时长裁剪。
- 不做「多场景合并为一段 AI 视频」的批量生成优化（成本控制用 maxScenes 上限 + 并发 1 达成）。

## Decisions

### D1：新增独立阶段 `select_video_scenes`（而非在 generate_assets 内计算）
- **选择**：在 pipeline stageDefs 的 `optimize` 与 `generate_assets` 之间插入 `select_video_scenes`（type `story2video_select_video_scenes`），输出 `context.video_plan`。
- **理由**：场景选择涉及 LLM 调用（ai-judged）与确定性计算（fixed），是独立可观察/可断点续跑的阶段；前端阶段时间轴自动显示新阶段（阶段列表来自 pipeline 定义）；失败时可单独重试且不重复消耗图片额度。
- **备选**：在 generate_assets 开头计算——省一个阶段但进度不透明、与断点续跑/checkpoint 语义耦合，放弃。

### D2：`video` 配置字段与归一化（story2video-text-config.js）
- `story2videoTextConfig.video = { mode: 'off'|'fixed'|'ai-judged', provider: '', model: '', fixedRatio: 25, minRatio: 20, maxRatio: 40, maxScenes: 3 }`。
- 校验规则：mode 枚举；fixedRatio ∈ [10, 50]（整数百分比）；minRatio/maxRatio ∈ [5, 80] 且 min ≤ max；maxScenes ∈ [1, 12]；provider/model 走 `idValue` 白名单（空字符串允许，运行时解析默认视频 provider）。
- 输出到 `stageOptions.generate_assets.videoMode/video` 与 `stageOptions.select_video_scenes.video`；`video.mode='off'` 时 select 阶段直接输出空 plan（全场景图片轮播），generate_assets 行为不变。
- **版本**：配置 version 保持 1（新增可选字段，向后兼容；既有快照无 video 键 → 默认 off）。

### D3：fixed 模式时长估算
- 用 `split.targetSeconds`（每场景估算时长，默认 6s）作为统一时长单位；若 sentence 带 `duration` 则优先。
- 按场景顺序累计估算时长，标记累计占比达到 `fixedRatio/100` 为止；至少标记 1 个场景（若 fixedRatio>0 且场景数>0）。
- **风险**：真实成片时长由 TTS 音频决定，估算有偏差 → 比例是近似值，PRD 明确「约 20%-30%」。

### D4：ai-judged 模式 LLM 选择与钳制
- LLM 输入：每场景 index/text/prompt/估算时长 + min/maxRatio + maxScenes；要求返回 `[{index, video: bool, excitement: 1-10, reason}]`。
- 解析失败（非 JSON/缺 index）→ fail closed 并给出可读错误（与 videogen parseJsonArray 同风格，但更严格：逐条校验 index 合法性）。
- 钳制算法：按 excitement 降序把 `video=true` 场景加入候选；若总时长占比 < minRatio → 按 excitement 降序补入未选场景；若 > maxRatio → 从低 excitement 开始剔除；最后受 maxScenes 截断；输出实际 ratio。
- 无 provider 配置 → select 阶段 fail closed：`视频生成器未配置，请在设置中添加视频模型`（与 videogen `getVideoProviderConfig` 一致，从 `_modelProviderManager.getDefault('video')` 解析）。

### D5：generate_assets 视频分支
- `useVideo` 场景：并发 1（经 `modelCallScheduler.withModelBudget({type:'video'})`），调 `manager.callAdapter(providerId,'generateVideo',{prompt,model,width,height,numFrames,frameRate})` → 轮询 `getVideoStatus` → 下载到 runDir `video_<index>.mp4`；产出 `videoPath`，**不生成图片**。
- 分辨率/帧率：从配置 `size`（如 720x1280）+ `output.fps` 派生；`pickFrameCountForDuration` 逻辑复用 videogen。
- 视频生成失败（全部失败）→ 该场景回退图片轮播：若该场景图像已生成则用图；否则尝试补生成图；仍失败 → 场景失败，遵循既有 allowPartialAssets 语义。
- resume 快照：`completed` 项新增 `videoPath`，断点续跑按需复用。

### D6：compose-engine 混合片段
- scene 准备阶段：`videoPath`（kind 'video'）与 `imagePath` 二选一，`audioPath` 必须有。
- `_createSegment` 分支：
  - image 场景：现有 zoompan 路径（不变）。
  - video 场景：`ffmpeg -i videoPath -i audioPath`，`scale` 到目标分辨率、fps 归一化、按 `effectDuration` 裁剪/补齐（`-t` + `-shortest` 语义与现有 min-duration/follow-audio 一致），叠加字幕/水印滤镜，混入旁白。
- 拼接/转场/BGM/WebM 转码全部复用既有管线；`segmentRecords` 增加 `mediaKind: 'video'|'image'` 供结果页区分。

### D7：前端（CreateView.vue）
- 「视频增强」折叠区（appearance 之后）：
  - 视频模式 select：关闭 / 固定比例（成片前 20%-30%） / AI 智能选择（20%-40%）
  - 视频生成器 select：video 能力 provider（`s2vVideoProviders` 从模型提供方拉取，复用 s2vImageProviders 的加载方式）
  - fixed 模式显示比例输入（10-50%，默认 25）
  - ai-judged 模式显示区间提示（20%-40%）
  - 提示文案：成本提示「AI 视频更贵更慢，仅用于最精彩场景」。
- `STORY2VIDEO_STAGE_NAMES` 加 `select_video_scenes`；`stageDetailText` 展示 `已选 N 个 AI 视频场景（约 X%）`。
- `S2V_RESTORE_ENUM_OPTIONS` 加 `videoMode` 白名单；s2vConfig 快照恢复兼容。

## Risks / Trade-offs

- [AI 视频生成慢（10 分钟轮询上限）且可能失败] → 并发 1 + maxScenes 上限；失败回退图片轮播，不阻塞整条流水线。
- [fixed 模式比例基于估算时长，与实际成片有偏差] → PRD 明示「约」；以场景数为单位的近似语义。
- [ai-judged LLM 返回非法 JSON/越界] → 严格解析 + 钳制 + fail closed 可读错误。
- [新增阶段改变阶段时间轴] → 前端阶段列表来自 pipeline 定义自动展示；S2V 阶段名常量同步。
- [断点续跑兼容] → resume 快照新增字段均为可选；旧快照无 video 键按 off 处理。
- [视频 provider 未配置] → select 阶段 fail closed 引导设置，不进入生成。

## Migration Plan

1. 实现 + 单元/集成测试（text-config / stages / compose-engine）。
2. 前端构建（`npm run build`）+ 桌面打包验证（QM-1 流程适用：修改 electron 服务代码需本地打包验证）。
3. PR 合入 main 后，UI 默认 off，用户按需开启；无需数据迁移。

## Open Questions

- 视频生成 provider 的默认分辨率映射（9:16 vs 16:9）是否直接采用输出 size？— 采用输出 size（如 720x1280），生成后统一 scale 到目标分辨率，不阻塞实现。

## 选型评估：两套流水线体系对比与结合（2026-08-11 用户澄清后补充）

### 体系现状
1. **story2video-compose**（pipeline-engine 注册的流水线，stageDefs + StageExecutor 执行）：文案 → split → domain_enrich → optimize → generate_assets（图片+TTS）→ compose（zoompan 合成）→ publish。成熟能力：TTS 时长跟随（follow-audio/min-duration）、字幕/水印/BGM/转场、阶段子进度、断点续跑/快照、内容政策检查点、选项持久化。
2. **通用 videogen 系列**（animation / avatar-spokesperson / character-animation / hybrid，pipeline-engine 注册）：LLM 概念/分镜 → 视频 provider generateVideo + getVideoStatus 轮询 + 下载 → FFmpeg 拼接。成熟能力：视频 provider 解析（_modelProviderManager.getDefault('video')）、异步任务轮询、本地落盘。

### 对比结论
- 用户实际入口（CreateView「启动流水线」）指向 story2video-compose；videogen 系列为 experimental，无图片轮播/字幕/BGM/断点等能力。
- story2video-compose 本身就是 pipeline-engine 体系内的一条流水线（非独立体系），在其 stageDefs 中新增阶段即等价于「新建一条流水线能力」。
- 图片轮播的成熟能力（TTS 时长、字幕、混音、进度、恢复）全部依赖 story2video 侧；AI 视频的成熟能力（provider/轮询/下载）全部依赖 videogen 侧。
- **因此采用「结合」方案**：以 story2video-compose 为宿主流水线，新增 select_video_scenes 阶段与 generate_assets 视频分支（复用 videogen 的视频生成模式），compose 引擎扩展混合片段合成。不新建平行流水线，避免重复建设 UI/进度/断点/字幕体系。
- 备选（已否决）：纯 videogen 新建混合流水线——需从零补图片轮播的 TTS/字幕/BGM/进度/断点/UI，成本高、违背「消耗小、复用优先」目标。
