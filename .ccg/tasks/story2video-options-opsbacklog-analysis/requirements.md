# 图片轮播流水线选项/参数：优化与运营后台转移分析（Phase 0 探索，待确认后实施）

日期：2026-08-09｜范围：story2video-compose 全链路（前端 s2vConfig/s2vOutputConfig、版本化 text-config、YAML stageDefs、compose 引擎、运营后台 ops-center）
结论先行：**不建议大改前端布局；优先做「冗余清理 + 边界统一」的低成本优化（P0），再评估「枚举/目录/限额类参数运营化」（P1，需补 ops-center 下发基础设施），发布/内容类参数保持用户侧（不可转移）。**

## 一、现状盘点（file:line 证据）

### 1.1 前端暴露项（CreateView.vue v-model）
| 字段 | 标签 | 默认 | 分组 | 位置 |
|---|---|---|---|---|
| contentType | 内容类型(通用/历史) | general | 基础 | :227 |
| imageProvider | 图片生成器 | '' | 基础 | :234 |
| imageStyle | 图片风格 | cinematic | 基础 | :258 |
| promptStyle | 提示词风格 | realistic | 基础 | :269 |
| imageEffect | 图片动效 | zoom-in | 基础 | :280 |
| transition | 转场 | fade | 基础 | :295 |
| subtitleSize / subtitleStyleName / subtitleEnabled | 字幕字号/样式/开关 | size3/style1/true | 基础 | :306-325 |
| bgmVolume | 背景音乐音量 0-10 | 5 | 画面 | :341 |
| watermarkText | 水印文字(可选) | '' | 画面 | :345 |
| voiceProvider / voiceModel / voiceId | 语音生成器/模型/音色 | ''/' '/' ' | 声音 | :373-394 |
| voiceSpeed / voiceVolume | 语速 0.5-2 / 音量 0-2 | 1 / 1 | 声音 | :453-458 |
| splitLanguage / splitMode | 分句语言/模式 | auto/balanced | 高级 | :478-486 |
| splitMaxSentenceLength | 单句最大长度 20-1000 | 200 | 高级 | :494 |
| splitTargetCharsPerScene / splitTargetSeconds | 分镜粒度(字数/秒双视图) | 20 / 6 | 高级 | :499-514 |
| sceneDurationMode / minSceneDuration | 最短场景时长开关/秒 | follow-audio/6 | 高级 | :523-530 |
| negativePrompt | 负向提示词 maxlength500 | '' | 高级 | :534 |
| templateId / templateCategory / 自定义模板 | 视频模板 | '' / all | 高级 | :542-565 |
| fps / format（activeOutputConfig） | 帧率/格式 | 30 / mp4 | 高级 | :569-580 |
| platforms / title / tagsText / publishContent / coverUrl | 发布平台/标题/标签/正文/封面 | [] / ''… | 发布 | :598-617 |

### 1.2 前端隐藏（工程默认，s2vConfig 默认值 CreateView.vue:991-1012）
voicePitch(0)、concurrency(3)、creativeLevel(5)、autoAdvance(true)、splitBaseWordsPerSecond(3.3 遗留)、splitMinWords/MaxWords(10/50)、splitEnforceSentenceBoundary/OverflowToNext(true)、splitSubtitleMinChars/MaxChars/Timing(8/15/proportional)、voiceEmotion(default)、watermarkConfig 对象、splitViewMode(UI 态)。UE 契约（story2video-ue-contract.test.js）明确 voicePitch/concurrency/creativeLevel 不暴露。

### 1.3 后端契约
- YAML stageDefs（story2video-compose.yaml）：split options :153-169（max_sentence_length 200、target_duration 6、base_words_per_second 3.3、target_chars_per_scene 20 等）；optimize :204-211（creative_level 5、max_length 300、num_candidates 1、auto_detect_style true）；generate_assets :237-252（concurrency 3、aspectRatio 9:16、voiceEmotion default、allowPartialAssets false）；compose :275-301（transition/imageEffect/subtitleStyle/bgmVolume 0.5/watermarkConfig/resolution 720x1280/fps 30/format mp4/defaultSceneDuration 6/minSceneDuration 6）；limits :318（output≤600s/narration≤900s/segment≤180s）。
- text-config（story2video-text-config.js:22-94）：split/optimize/image/voice/subtitle/bgm/transition/sceneDurationMode/minSceneDuration/templateId/concurrency/watermark/output/publish 版本化默认；枚举集合 :96-111（IMAGE_EFFECTS/TRANSITIONS/SCENE_DURATION_MODES/SPLIT_MODES/LANGUAGES/SUBTITLE_TIMINGS/OUTPUT_FORMATS/CONTENT_TYPES/ASPECT_RATIOS）。
- compose 引擎限额（story2video-compose-engine.js:35-41）：maxDuration 600s、maxAudioDuration 900s、maxSegment 180s、maxOutputPixels 7680*4320、MAX_XFADE_INPUTS 8（硬编码）。

### 1.4 运营后台现状（ops-center，D:\Data\projects\ops-center）
- 已建「预设模型/多模态能力」管理（PRD 7.4.2）：model_presets 表（含 capabilities/capability_models/is_visible/doc_links）、admin JWT 写 API（/api/v1/model-presets）、独立前端菜单。
- **差距**：桌面端预设仍本地种子（model-provider-seeds + model-provider-manager.js:381 _syncPresetCapabilities 本地回填），未见桌面→ops-center 的目录同步客户端；ops-center 仅管模型预设，无流水线参数目录（pipeline_configs）能力。

## 二、可优化项（保留前端，低成本改进，P0）
- O1 冗余双源清理：
  - splitBaseWordsPerSecond 遗留兼容（CreateView.vue:999-1001 注释已标可清理；YAML :158 仍在）→ 从契约移除（text-config/YAML/normalizer 三处）
  - watermarkText 与 watermarkConfig.{enabled,text} 双份（s2vConfig:1009-1010 vs YAML:287-295）→ 收敛单一来源
  - subtitleSize/subtitleStyleName 与 subtitleStyle.{size,style} 双份（SUBTITLE_SIZE_MAP）→ 收敛
  - splitTargetSeconds 与 splitTargetCharsPerScene 双通道（YAML:170-172 注释明确 chars 主控）→ 保留主控 + 视图换算
- O2 边界统一（当前 UI 与后端不一致）：
  - fps：UI 枚举 24/30/60（:569-573）vs YAML fps 1..120（:313）→ 统一枚举或统一边界
  - splitMaxSentenceLength：UI 20-1000（:494）vs YAML max_sentence_length 200（:156）→ 统一上限
  - negativePrompt：UI maxlength 500（:534）vs YAML 无上限说明 → PRD 注明上限
- O3 隐藏默认值策略（voicePitch/creativeLevel/voiceEmotion/concurrency）：要么补 UI（高级组「更多参数」展开），要么从契约移除；避免「存在但不可控」的选项

## 三、适合转移到运营后台（P1，需补基础设施）
- B1 枚举/目录类：图片风格/提示词风格/动效/转场/字幕样式/分镜模式/纵横比/模板目录（IMAGE_EFFECTS/TRANSITIONS/SPLIT_MODES/SUBTITLE_STYLES/ASPECT_RATIOS/templateLibrary）→ 运营维护目录 + 默认值，前端只读下发（对齐 model_presets 机制）
- B2 provider 目录延伸：imageProvider/voiceProvider/model/voiceId 的「默认值 + 可见性」，本质是 model_presets 按能力给默认 model（对齐 7.4.1 capability_models）；用户仍可下拉覆盖
- B3 工程/限额类：concurrency、optimize.maxLength/numCandidates/autoDetectStyle、prompt-engine platform 默认、compose 限额（600/900/180s、输入字节、输出像素、MAX_XFADE_INPUTS）、图片重试次数/异常阈值（ProviderAnomalyBus 30s/60s/120s）→ 运营统一管控，前端不暴露
- B4 账号级默认下发：contentType/imageStyle/sceneDurationMode/splitTargetCharsPerScene/voiceSpeed 的默认值 → 运营可下发，用户可覆盖
- ⚠️ 前置：ops-center 需新增 pipeline_configs（表/API/菜单）+ 桌面端目录同步客户端（版本号、增量、回退、离线缓存）；供应商枚举必须保留官方约束校验（禁止臆造，QM 契约）

## 四、不适合转移（用户创作核心，保持现状）
文案/媒体输入、voiceId 音色选择（个人偏好）、发布配置（platforms/title/tags/content/coverUrl）、水印开关与文字、BGM 文件与音量、字幕开关、分句语言/模式（创作意图）、fps/分辨率/格式（输出偏好）。

## 五、优先级与验收
- P0（随手可做）：O1 清理 + O2 边界统一 → 契约测试（text-config/stage-executor/CreateView）+ PRD 同步；影响面：normalizer 三腿等价、遗留快照恢复兼容
- P1（需用户确认 + 排期）：O3 隐藏默认值策略 → 先定产品口径；B1/B2 目录运营化 → 先补 ops-center 下发基础设施（独立 PR，含版本化与回退测试）
- P2（后续）：B3 限额运营化、B4 账号级默认、模板覆盖范围扩大（字幕/水印/分句入模板）
- 验收标准（每个变更）：分支 + PR + CI；相关契约/聚焦测试全绿；PRD 7.1.x 与 learnings 同步；不改变供应商真实契约。

## 六、待用户确认的问题
1. O1 清理是否一次做全（四组双源字段）还是分批？
2. voicePitch/creativeLevel 产品口径：移除 vs 补 UI？
3. B1/B2 是否立项（ops-center pipeline_configs 全链路）？还是本期只做 P0？
4. concurrency/限额是否希望用户可见可调（高级组）还是运营统一？
