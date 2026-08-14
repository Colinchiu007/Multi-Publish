# story2video-creation-mode Specification

## Purpose
在「故事讲述」的「视频增强」配置区新增「创作模式」（全自动 / 分镜素材自选），提供逐场景素材自选的创作流程：先批量生成候选素材（图片 / 图片+视频）并暂停等待用户选择，全部选定后再生成 TTS 与最终视频合成。
## Requirements
### Requirement: 创作模式配置契约
story2videoTextConfig SHALL 支持 `creation` 段：`mode`（枚举 `auto` | `manual`，默认 `auto`）、`materialMode`（枚举 `all-images` | `video-image`，默认 `all-images`，仅 manual 生效）。normalizer MUST 校验枚举，非法值拒绝并返回可读错误；缺失/空段按默认值处理。前端 s2vConfig 增加同名字段并纳入上次选项持久化与恢复白名单。

#### Scenario: 默认全自动
- **WHEN** renderer 未提交 creation 段或 mode='auto'
- **THEN** 流水线按既有全自动流程执行（单图/单视频 + TTS + 合成），无 finalize_assets 阶段

#### Scenario: 非法枚举拒绝
- **WHEN** 提交 mode='unknown' 或 materialMode='foo'
- **THEN** normalizer 返回校验错误，流水线不启动

#### Scenario: 选项恢复校验
- **WHEN** lastOptions 快照含 creationMode/manualMaterialMode 且值为合法枚举
- **THEN** 恢复后 UI 正确选中对应项；非法值回退 data() 默认值

### Requirement: 视频增强区创作模式 UI
CreateView「视频增强」区 SHALL 展示「创作模式」单选（`全自动（推荐）` 默认 / `分镜素材自选`）；选择「分镜素材自选」时 MUST 展示成本提示文案（每个分镜段落将生成多张图片和 1 个视频供选择；Token 或积分消耗将大量增加，建议先用短文案测试后，再用于真实创作），并展示「素材模式」单选（`全部故事讲述` / `视频+故事讲述`）及其说明。提交 SHALL 组装 `creation` 段。

#### Scenario: 全自动默认选中
- **WHEN** 打开故事讲述配置
- **THEN** 创作模式默认选中「全自动（推荐）」，素材模式区域隐藏

#### Scenario: 自选模式联动
- **WHEN** 选择「分镜素材自选」
- **THEN** 显示成本提示与素材模式单选；提交参数含 creation.mode='manual' 与所选 materialMode

### Requirement: 候选素材生成（manual）
manual 模式下 generate_assets SHALL：`materialMode='all-images'` 时每场景生成 **2 张图片**（同一优化提示词两次独立调用）；`materialMode='video-image'` 时对 video_plan 中 useVideo=true 的场景额外生成 **1 个视频**（同一优化提示词，2 图 + 1 视频），其余场景 2 张图片。**不生成 TTS**。产出候选清单 `context.generate_assets.candidates`（每项含 index/text/prompt/promptTranslation 与 candidates 数组，每候选含 id/kind/path/meta），并以 `scene_asset_selection` 检查点暂停（run.status='paused'，checkpoint.type='scene_asset_selection'），不进入 compose。

视频候选生成 SHALL 采用与全自动模式一致的有界并发机制：并发上限按视频 provider 预算解析（provider 配置 `rate_per_minute` > 静态表 > 类别默认，请求值默认 2，经 `maxConcurrent` 收敛），视频场景之间的视频候选并行生成；图片候选 SHALL 与视频候选并行启动，不得等待视频全部完成。每场景 2 图同场景内按 seq 0→1 顺序生成（避免同 index 输出路径并发覆盖）。进度 `context.assets_progress`（imagesDone/imagesTotal、videosDone/videosTotal）SHALL 在生成过程中实时更新。

视频生成失败 SHALL 先经**有界瞬时重试**再回退：瞬时类错误（超时/网络/限流 429/「队列满 queue is full」）按分类重试——瞬时最多 3 次（退避 800ms×attempt）、限流与队列满最多 4 次（退避 2.5s×attempt）；非瞬时错误（配置/内容政策等）不重试立即回退。重试耗尽后该场景回退仅 2 图候选。

#### Scenario: 全部图片轮播候选
- **WHEN** manual + all-images，3 个场景
- **THEN** 每场景 2 张图片候选（共 6 个候选），无视频候选，无 TTS，流水线暂停于选择检查点

#### Scenario: 视频+图片轮播候选
- **WHEN** manual + video-image，videoMode=ai-judged 选中场景 1
- **THEN** 场景 1 候选为 2 图 + 1 视频（同一提示词），其余场景各 2 图；无 TTS，暂停于选择检查点

#### Scenario: 视频候选有界并行
- **WHEN** manual + video-image 且 2 个视频场景，provider 预算允许并发 2
- **THEN** 两个视频候选并行生成（最大 in-flight=2），且图片候选在视频完成前已启动

#### Scenario: 预算收敛
- **WHEN** 请求视频并发 5 但 provider 预算 maxConcurrent=1
- **THEN** 视频候选逐个生成（最大 in-flight=1），全部完成且候选清单完整

#### Scenario: 视频队列满有界重试
- **WHEN** 视频候选提交返回「video queue is full, please retry later」类瞬时拥塞错误
- **THEN** 按限流语义有界重试（最多 4 次，2.5s×attempt 退避），重试耗尽后该场景回退仅 2 图，不中断流水线

#### Scenario: 视频生成失败回退
- **WHEN** manual + video-image 中某视频场景视频生成失败
- **THEN** 该场景候选仅 2 图（回退），不中断流水线

### Requirement: 选择交互与默认值
暂停于 scene_asset_selection 检查点时，前端 SHALL 展示选择面板：每场景列出候选缩略图（图片经 story2videoCreateShareUrl 展示；视频以 video 元素或封面展示），单选；默认选中规则：该场景有视频候选 → 默认选中视频；纯图片候选 → 默认选中第 1 张（seq 最小）。用户可切换。全部场景均已确认后才允许提交。

#### Scenario: 默认选中规则
- **WHEN** 场景候选为 2 图 + 1 视频
- **THEN** 默认选中视频候选
- **WHEN** 场景候选为 2 图
- **THEN** 默认选中第 1 张图片

#### Scenario: 未确认禁止提交
- **WHEN** 存在未确认场景（默认值被取消或数据缺失）
- **THEN** 提交按钮禁用并提示

### Requirement: 选择确认 IPC 与推进
新 IPC `pipeline:confirmSceneAssets(runId, selections)` SHALL：校验 run 存在且 paused 于 scene_asset_selection 检查点；校验 selections 覆盖全部场景、index 唯一、candidateId 属于该场景候选清单（非法 fail closed 返回明确错误码）；写入 `context.scene_asset_selection`，随后推进到 finalize_assets → compose → publish。新 IPC MUST 注册进 preload、api/publisher 与 IPC 契约测试。

#### Scenario: 合法提交推进
- **WHEN** 用户确认全部场景选择并提交
- **THEN** selections 写入 context，流水线继续并最终完成 compose

#### Scenario: 非法候选拒绝
- **WHEN** selections 含不存在场景或非法 candidateId
- **THEN** IPC 返回校验错误，不写入 context，流水线保持暂停

#### Scenario: 错误状态拒绝
- **WHEN** run 不在 scene_asset_selection 暂停态
- **THEN** IPC 返回错误，不推进

### Requirement: finalize_assets 阶段
manual 模式 SHALL 在 generate_assets 与 compose 之间插入 `finalize_assets` 阶段：读取候选清单与已确认选择，校验每场景恰有一个已选候选，为所选场景生成 TTS 音频，组装与现状兼容的最终 assetManifest（scenes 含 imagePath 或 videoPath + audioPath），写回 context.generate_assets 供 compose 使用；auto 模式不插入该阶段。

#### Scenario: 确认后生成 TTS 并合成
- **WHEN** 选择确认后进入 finalize_assets
- **THEN** 仅对已选场景生成 TTS，最终清单与场景顺序一致，compose 正常合成

#### Scenario: 缺少选择失败关闭
- **WHEN** 进入 finalize_assets 但 context 无完整选择
- **THEN** 阶段失败并给出可读错误，不产出半成品

### Requirement: 暂停快照与断点恢复
scene_asset_selection 暂停时 SHALL 持久化 paused 快照（含 checkpoint 信息）；应用重启后 `resumeOrchestration` SHALL 能恢复该 paused 检查点（返回 paused，不自动推进），前端重新进入选择面板。

#### Scenario: 重启后恢复选择
- **WHEN** 应用重启且存在 paused + scene_asset_selection 快照
- **THEN** 历史记录显示已暂停，点击恢复后回到选择面板（候选与默认选中保持），继续确认可推进

### Requirement: 成本提示文案
选择「分镜素材自选」时显示的成本提示 MUST 覆盖：每个分镜段落将生成多张图片和 1 个视频供选择；Token 或积分消耗将大量增加；建议先用短文案测试后，再用于真实创作。zh/en 双语由 i18n 驱动。

#### Scenario: 双语提示
- **WHEN** 界面语言为 zh / en 且选择自选模式
- **THEN** 显示对应语言的成本提示与素材模式说明

