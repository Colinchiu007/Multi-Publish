## ADDED Requirements

### Requirement: 混合流水线配置契约（video 段）
Story2Video 流水线 SHALL 支持可选的 `story2videoTextConfig.video` 配置段，声明混合成片模式。字段：`mode`（枚举 `off` | `fixed` | `ai-judged`，默认 `off`）、`provider`（字符串，空=运行时解析默认视频生成器）、`model`（字符串，可空）、`fixedRatio`（整数百分比，默认 25，范围 [10,50]，仅 fixed 生效）、`minRatio`（整数百分比，默认 20，范围 [5,80]，仅 ai-judged 生效）、`maxRatio`（整数百分比，默认 40，范围 [5,80]，仅 ai-judged 生效）、`maxScenes`（整数，默认 3，范围 [1,12]）。`mode=off` 时系统 MUST 保持既有纯图片轮播行为；缺失/空 video 段按 `off` 处理，不得报错。

#### Scenario: 默认关闭保持既有行为
- **WHEN** renderer 提交的 story2videoTextConfig 不含 video 段或 `video.mode = 'off'`
- **THEN** 流水线按既有图片轮播流程执行，无 AI 视频场景，select_video_scenes 阶段输出空 plan 或等价跳过

#### Scenario: 开启固定比例
- **WHEN** `video.mode = 'fixed'` 且 `fixedRatio = 25`
- **THEN** 系统按场景顺序标记前约 25% 估算时长的场景为 AI 视频场景

#### Scenario: 开启 AI 智能选择
- **WHEN** `video.mode = 'ai-judged'`
- **THEN** 系统调用默认 LLM 评估场景精彩度并选择 AI 视频场景，所选场景估算总时长占比落在 [minRatio, maxRatio] 内且数量不超过 maxScenes

### Requirement: fixed 模式场景选择
fixed 模式 SHALL 按场景顺序累计估算时长（每场景估算时长 = sentence.duration 若存在，否则 split.targetSeconds 默认 6s），标记累计占比首次达到 `fixedRatio/100` 的场景（含边界场景）；场景数大于 0 且 fixedRatio 大于 0 时 MUST 至少标记 1 个场景。实际占比允许因场景粒度近似（记录 `actualRatio`）。

#### Scenario: 顺序累计标记
- **WHEN** 10 个场景各 6s，`fixedRatio = 25`（目标 25%×60s=15s）
- **THEN** 场景 0/1/2 被标记（累计 18s 首次 ≥15s，含边界场景，`actualRatio = 30%`），实际占比记录为近似值

#### Scenario: 至少一个场景
- **WHEN** `fixedRatio = 10` 且场景数 ≥ 1
- **THEN** 首个场景被标记（即使单场景占比超过 10%）

### Requirement: ai-judged 模式选择与比例钳制
ai-judged 模式 SHALL 调用默认 LLM 对每个场景返回 `{index, video, excitement(1-10), reason}`；选择结果 MUST 满足：所选场景估算总时长占比 ≥ minRatio 且 ≤ maxRatio，数量 ≤ maxScenes。越界时 SHALL 按 excitement 排序钳制：占比超 maxRatio 时从低 excitement 剔除；不足 minRatio 时按高 excitement 补入。LLM 输出解析失败或 index 非法时 SHALL fail closed 返回可读错误（引导重试），不得静默全选或全不选。

#### Scenario: 超上限剔除
- **WHEN** LLM 初选 5 个场景占比 55%，maxRatio=40
- **THEN** 系统按 excitement 从低到高剔除直至占比 ≤ 40%，保留高精彩度场景

#### Scenario: 不足下限补入
- **WHEN** LLM 初选 1 个场景占比 10%，minRatio=20
- **THEN** 系统按 excitement 从高到低补入未选场景直至占比 ≥ 20%（且 ≤ maxRatio、≤ maxScenes）

#### Scenario: 解析失败失败关闭
- **WHEN** LLM 返回非 JSON 或缺省 index 的数组
- **THEN** select_video_scenes 阶段返回 `success: false` 与可读错误，不进入资源生成

### Requirement: 视频生成器前置校验
`video.mode !== 'off'` 时，select_video_scenes 阶段 SHALL 解析视频生成器：显式 provider/model 优先，否则取 `_modelProviderManager.getDefault('video')`；解析失败（无视频 provider 配置）时 MUST fail closed，返回引导文案（提示在设置中添加视频模型），不得以默认 LLM 或其他能力兜底。

#### Scenario: 未配置视频生成器
- **WHEN** `video.mode = 'fixed'` 且模型管理器中无任何视频能力 provider
- **THEN** select_video_scenes 返回失败与「请先完成视频模型设置」类引导，流水线停在可操作点

### Requirement: 混合资源生成
generate_assets 阶段 SHALL 对 video_plan 中 `useVideo=true` 的场景调用视频生成适配器（generateVideo 提交 + getVideoStatus 轮询 + 下载落盘，并发 1），产出本地 `videoPath` 且不生成图片；其余场景维持图片生成。两类场景均生成 TTS 旁白。视频生成失败（provider 错误/超时/下载失败）时 SHALL 回退图片轮播：已生成图片则复用，否则补生成图片；补图也失败则该场景按既有 allowPartialAssets 语义处理。resume 断点快照 SHALL 记录 `videoPath` 且旧快照（无该字段）兼容。

#### Scenario: 视频场景产出 videoPath
- **WHEN** 场景被标记 useVideo 且视频生成成功
- **THEN** assetManifest.scenes[i] 含 `videoPath`（本地文件），不含 imagePath，audioPath 正常

#### Scenario: 视频生成失败回退图片
- **WHEN** 视频场景的 generateVideo 全部重试失败
- **THEN** 该场景回退为图片轮播（复用已生成图片或补生成），不因视频失败中断整条流水线

#### Scenario: 断点续跑复用视频产物
- **WHEN** generate_assets 中途失败后从断点恢复且该场景已完成视频生成
- **THEN** 恢复逻辑直接复用已落盘 videoPath，不重复调用视频生成

### Requirement: 混合片段合成
compose 引擎 SHALL 支持「AI 视频场景（videoPath）+ 图片轮播场景（imagePath）」混合输入：每个场景必须恰好一种画面源（videoPath 或 imagePath）且必须有 audioPath。视频场景以 AI 视频文件为画面基底，SHALL 归一化到目标分辨率/帧率并按片段有效时长（follow-audio 跟随旁白 / min-duration 补齐语义不变）裁剪或补齐，叠加字幕/水印后混入旁白；图片场景维持既有 zoompan 路径。两类片段合成后 SHALL 走既有转场拼接/BGM/转码管线，segment 记录增加 `mediaKind: 'video' | 'image'`。

#### Scenario: 混合输入合成成功
- **WHEN** scenes 数组包含 videoPath 场景与 imagePath 场景且均有 audioPath
- **THEN** 合成输出包含两类片段，顺序与场景顺序一致，转场/BGM/字幕正常

#### Scenario: 视频源不可读拒绝
- **WHEN** 场景 videoPath 指向不存在/越界/超限文件
- **THEN** compose 返回明确错误（Scene media path is not allowed or unreadable），不产出半成品

#### Scenario: 双画面源冲突拒绝
- **WHEN** 场景同时携带 videoPath 与 imagePath
- **THEN** 按 videoPath 优先（显式声明），或拒绝并提示；二选一语义必须确定并记录

### Requirement: 前端视频增强配置区与展示
CreateView SHALL 提供「视频增强」配置区：视频模式选择（关闭 / 固定比例 / AI 智能选择）、视频生成器选择（视频能力 provider）、fixed 比例输入（10-50%，默认 25）、ai-judged 区间提示（默认 20%-40%）与成本提示文案；提交时组装 `story2videoTextConfig.video`。阶段时间轴 SHALL 展示新阶段 `select_video_scenes`，并在该阶段完成时显示「已选 N 个 AI 视频场景（约 X%）」类详情。`videoMode` 等新字段 MUST 纳入上次选项持久化白名单与恢复校验。

#### Scenario: 配置区展示与提交
- **WHEN** 用户选择「固定比例」并设置 25%
- **THEN** 表单提交包含 `video: { mode:'fixed', fixedRatio:25, ... }`，启动后阶段清单出现 select_video_scenes

#### Scenario: 旧快照恢复兼容
- **WHEN** lastOptions 快照缺少 videoMode/videoFixedRatio 等新键
- **THEN** 恢复后使用 data() 默认值，不报错、不出现空白下拉
