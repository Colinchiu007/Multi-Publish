# story2video-parameter-governance Specification

## Purpose
定义图片轮播（story2video-compose）流水线的参数治理契约：隐藏工程默认值清单（系统管理、前端不暴露不提交）、UI-后端边界、以及 watermark/subtitle 双源结构说明，避免「存在但不可控」的假配置项并统一契约口径。
## Requirements
### Requirement: 隐藏工程默认值由系统管理
图片轮播前端 s2vConfig SHALL 不包含 voicePitch、creativeLevel、splitBaseWordsPerSecond 字段。提交构造 SHALL 不显式提交 voice.pitch 与 optimize.creativeLevel，由版本化 text-config 契约默认值兜底（voice.pitch=0、optimize.creativeLevel=5）；split.baseWordsPerSecond 不暴露 UI、值由语言感知表派生（当前仍随提交显式下发，normalizer 缺省时以语言表兜底，两种路径同源）。上述参数与 concurrency、autoAdvance 等 SHALL 列为系统管理参数，前端不提供 UI，开放 UI 前须先评估契约影响。本合同的 PRD 落点为 7.1.19（不是 7.1.20）。

#### Scenario: 缺省输入走契约默认
- **WHEN** renderer 提交不携带 voice.pitch / optimize.creativeLevel / split.baseWordsPerSecond
- **THEN** normalizer 输出 voice.pitch=0、optimize.creativeLevel=5、split.baseWordsPerSecond 按 split.language 的语言感知表取值

#### Scenario: 显式下发与语言表同源
- **WHEN** renderer 当前按语言表显式下发 split.baseWordsPerSecond
- **THEN** 该值与 normalizer 语言表兜底值一致（zh 4.5 / en 2.8 / 其余 3.3），双路径同源

#### Scenario: 前端不再声明死字段
- **WHEN** 检查 CreateView.vue 的 s2vConfig 默认值与提交构造
- **THEN** 源码不包含 `s2vConfig.voicePitch`、`s2vConfig.creativeLevel`、`s2vConfig.splitBaseWordsPerSecond` 三个字段（UE 契约断言字段不存在）

### Requirement: 旧快照恢复兼容
恢复上次选项时 SHALL 按当前默认键白名单应用快照；旧快照中的已移除键（voicePitch/creativeLevel/splitBaseWordsPerSecond）SHALL 被自动忽略，不报错、不污染当前配置。

#### Scenario: 旧快照含已移除键
- **WHEN** 已保存的 lastOptions 快照含 voicePitch/creativeLevel/splitBaseWordsPerSecond 且当前默认不含这些键
- **THEN** 恢复后 s2vConfig 不含这些键，其余字段正常恢复

### Requirement: UI-后端边界文档化
PRD 参数治理合同 SHALL 明确以下边界：fps 前端产品子集为 24/30/60（后端技术边界 1..120）；splitMaxSentenceLength 前端范围 20-1000、默认 200；negativePrompt 前端上限 500 字符。

#### Scenario: 边界成文
- **WHEN** 查询参数治理合同
- **THEN** fps 产品子集、splitMaxSentenceLength 范围与默认、negativePrompt 上限均有明确记录

### Requirement: watermark/subtitle 双源结构说明
PRD 参数治理合同 SHALL 说明：watermark 的 UI 文本字段（watermarkText）与样式对象（watermarkConfig）为「UI 字段 + 模板/样式持有」结构，提交时合成 watermark.text；subtitle 的 subtitleSize/subtitleStyleName（UI 选择）与 subtitleStyle（模板对象，含 color）为同类结构，提交时合成 subtitle.size/style/color。二者为模板-提交协调结构，非冗余双源。

#### Scenario: 结构说明存在
- **WHEN** 查询参数治理合同
- **THEN** watermark/subtitle 双源结构的职责划分（UI 字段、模板持有、提交合成）有明确说明

### Requirement: video 配置段参数治理
story2videoTextConfig.video 段 SHALL 纳入参数治理：mode/fixedRatio/minRatio/maxRatio/maxScenes 由 normalizer 白名单校验（枚举与数值边界如混合流水线能力 spec 定义）；provider/model 为空时运行时解析默认视频生成器。前端提交 MUST 只发送受支持字段，normalizer 对未知字段 SHALL 忽略或拒绝并给出可读错误，禁止静默透传。视频生成并发 SHALL 固定为 1（系统管理，不暴露 UI），与图片/TTS 并发互不影响。

#### Scenario: 非法比例被拒绝
- **WHEN** renderer 提交 `video.fixedRatio = 200` 或 `video.minRatio > video.maxRatio`
- **THEN** normalizer 抛错并返回可读错误，流水线不启动

#### Scenario: 未知字段被忽略
- **WHEN** renderer 提交 video 段包含未声明字段（如 `video.foo = 1`）
- **THEN** normalizer 忽略未知字段，不污染归一化结果

#### Scenario: 视频并发固定为 1
- **WHEN** 混合模式 generate_assets 执行视频生成
- **THEN** 视频生成并发恒为 1（不随 concurrency 参数变化），图片/TTS 并发不受影响

