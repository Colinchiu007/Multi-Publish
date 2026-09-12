# PRD — 采集页「抖音/小红书图文+视频链接采集与 ASR 文案转写」

- 文档编号：PRD-COLLECT-DOUYIN-XHS-VIDEO-ASR-2026-09-12
- 状态：已实现（Phase 1）
- 关联分支：codex/collect-douyin-xhs-asr
- 关联模块：apps/desktop/src/views/Collection.vue、packages/python-backend/src/multi_publish/aggregation/、apps/desktop/electron/ipc-handlers/aggregation.js
- 创建日期：2026-09-12

## 1. 背景与目标

采集页此前仅支持图文正文采集（trafilatura/RSS/Sitemap/API 四种无头源），用户粘贴抖音/小红书链接时，Python 侧 PLAYWRIGHT_SOURCE_TYPES 校验直接拒绝。而爆款内容大量源自抖音/小红书视频作品，其口播文案是最核心的改写素材。

本功能目标：

1. URL 采集输入框支持抖音（douyin.com、v.douyin.com）与小红书（xiaohongshu.com、xhslink.com）作品链接。
2. 检测到视频作品链接时，自动执行「元数据探测 → 视频下载 → 音频提取 → ASR 语音转写」管线，把口播文案提取为文本。
3. 转写文案与图文采集结果统一进入采集列表、采集记录，可直接创建草稿、AI 改写、加入爆款库、发送视频创作。
4. 全程免费：默认使用本地 faster-whisper（MIT 许可，无 API 费用）；Phase 2 预留 SenseVoice 本地引擎（中文 CER ~8%）与 SiliconFlow 免费在线 API。

## 2. 术语定义

| 术语 | 定义 |
|------|------|
| 视频作品 | 含音轨的短视频作品（抖音视频、小红书视频笔记） |
| ASR | Automatic Speech Recognition，语音识别，把音频转成文本 |
| faster-whisper | OpenAI Whisper 的 CTranslate2 高效实现，MIT 许可，CPU int8 推理 |
| SenseVoice | 阿里 FunASR 开源语音识别模型，中文识别显著优于 Whisper 系（CER 8.01% vs 22-31%） |
| SiliconFlow | 国内可访问的模型 API 平台，FunAudioLLM/SenseVoiceSmall 模型免费（¥0） |
| yt-dlp | 开源视频下载命令行工具，社区维护抖音/小红书 extractor |
| 口播文案 | 视频中主播/旁白说出的语音内容，经 ASR 转写得到的文本 |
| media_type | 采集结果媒体类型标记：article（图文）/ video（视频） |

## 3. 功能范围

### 3.1 视频链接识别与路由（P0）

用户在 URL 输入框粘贴链接并点击「采集」（或回车）时，前端按 URL hostname 检测：

- 命中抖音/小红书域名 → 调用视频采集通道 aggregationCollectVideo。
- 未命中 → 走现有图文采集链路（aggregationCollect → urlCollectFetch 降级），行为与变更前完全一致。

域名匹配表（hostname 精确匹配或子域后缀匹配）：

| 平台 | 匹配域名 |
|------|---------|
| 抖音 | douyin.com 及其全部子域（如 v.douyin.com、www.douyin.com） |
| 小红书 | xiaohongshu.com 及其全部子域、xhslink.com（短链） |

数据校验：

- URL 必须以 http:// 或 https:// 开头，否则不进视频通道。
- 非 http(s) 协议（如 file://、javascript:）一律不进视频通道。
- URL 解析失败（非法格式）不进视频通道，由图文链路给出原有错误提示。

### 3.2 视频采集管线（P0）

后端四阶段管线（顺序执行，任一阶段失败即终止并返回该阶段错误）：

1. **元数据探测**（约 3-5 秒）：yt-dlp --dump-json 获取标题、时长、作者、封面，不下载文件。时长超过 10 分钟的视频在此阶段直接拒绝。
2. **视频下载**（10 秒-数分钟）：yt-dlp 下载最高画质（bv*+ba/b），文件大小上限 500MB，下载超时 300 秒。
3. **音轨检测与音频提取**（数秒）：ffprobe 检测音频流（无音轨返回 -8 错误）；ffmpeg 提取 16kHz 单声道 PCM WAV（ASR 标准输入格式）。
4. **ASR 转写**（约 0.5x 视频时长）：faster-whisper base 模型（CPU int8、VAD 过滤）转写，超时 300 秒。转写文本拼接为全文。

临时文件管理：下载的视频与提取的音频存于系统临时目录（mp-collect-video-* 前缀），管线结束（无论成败）自动清理，磁盘不残留。

### 3.3 采集结果数据模型扩展（P0）

CollectResult 新增 4 个可选字段（全部带默认值，旧数据/旧客户端完全兼容）：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| media_type | "article" 或 "video" | "article" | 媒体类型 |
| video_url | str | "" | 视频原始链接 |
| duration | float | 0.0 | 视频时长（秒） |
| transcript | str | "" | ASR 转写文案（与 content 同值） |

视频采集时：content = 转写文案全文（下游改写/发布直接用 content，无需感知来源）；metadata 含 platform（douyin/xiaohongshu）、asr_engine、asr_language、thumbnail、segments（分段调试信息）。

### 3.4 ASR 引擎抽象与切换（P0 框架 / P1 引擎）

统一接口：transcribe(audio_path) / is_available() / install_hint()。

| 引擎 | 状态 | 说明 |
|------|------|------|
| faster_whisper | Phase 1 默认 | 本地推理，MIT，模型首次自动下载（~150MB），中文效果中等 |
| sensevoice | Phase 2 预留 | llama.cpp GGUF 单二进制（Windows 预编译包 + q8 模型 ~235MB），中文 CER ~8%，~20x 实时 |
| siliconflow | Phase 2 预留 | 在线免费 API（FunAudioLLM/SenseVoiceSmall），需 SILICONFLOW_API_KEY，国内可访问 |

引擎选择：环境变量 ASR_ENGINE（默认 faster_whisper）。所选引擎不可用时返回 -6 与该引擎的中文安装指引，不自动切换引擎（避免不可预期的网络/下载行为）。

### 3.5 采集页视频结果显示（P0）

采集结果卡片（采集结果列表 + 采集记录标签页）按 media_type 区分：

| 显示项 | 图文（article） | 视频（video） |
|--------|----------------|--------------|
| 卡片图标 | 📰 | 🎬 |
| 标题 | item.title | item.title（视频标题） |
| 副信息行 | source · 字数 | source · 字数 · 时长（mm:ss） · 平台标签（抖音/小红书） |

采集结果详情区（collectedResult 区域）：

- 视频类型追加显示「 · 🎬 视频口播文案 · 3:25 · 抖音」（时长与平台有值时）。
- content 显示完整转写文案。
- 后续操作（创建草稿/AI 改写/加入爆款库/结合爆款库改写）与图文完全一致。

### 3.6 分阶段进度提示（P0）

视频采集期间（管线耗时 10 秒-数分钟），采集按钮下方显示蓝色进度提示条（data-testid="collection-video-stage"）：

| 阶段 | 触发时机（预估） | 提示文字（zh / en） |
|------|-----------------|---------------|
| probe | 采集开始 | 🔎 正在探测视频信息... / Probing video info... |
| downloading | 5 秒后 | ⬇️ 正在下载视频... / Downloading video... |
| extracting | 65 秒后 | 🎵 正在提取音频... / Extracting audio... |
| transcribing | 75 秒后 | 🎙️ 正在语音转写... / Transcribing speech... |

Phase 1 为按预估时间推进的假进度（真实进度轮询留待 Phase 2 任务化改造）；采集按钮保持禁用防重复提交；请求结束（成功/失败）提示条消失。

### 3.7 错误提示（P0）

| 错误码 | 场景 | 用户提示（zh） | 可重试 |
|--------|------|---------------|--------|
| VIDEOCLONE_LINK_ANTI_BOT | yt-dlp 触发平台风控 | 该链接触发了平台风控，请稍后重试 | 是 |
| VIDEOCLONE_LINK_PRIVATE | 私密作品 | 该视频为私密作品，无法采集 | 否 |
| VIDEOCLONE_LINK_MEMBERSHIP | 会员内容 | 该视频为会员专属内容，无法采集 | 否 |
| VIDEOCLONE_LINK_REGION | 地区限制 | 该视频受地区限制，无法采集 | 否 |
| VIDEOCLONE_LINK_UNAVAILABLE | 链接失效/已删除 | 视频不可用或已删除，请检查链接 | 否 |
| VIDEOCLONE_FILE_TOO_LARGE | >10min（探测期）或 >500MB | 透传后端提示，含实际值：「视频过长（15:32），采集仅支持 10 分钟内的短视频」/「视频文件过大（620MB），上限 500MB」 | 否 |
| -6 | ASR 引擎未安装 | 透传安装指引：语音转写引擎不可用，请安装 faster-whisper：pip install faster-whisper（国内可设 HF_ENDPOINT=https://hf-mirror.com） | 否（需安装） |
| -7 | 转写超时（300s） | 转写超时，请尝试较短的短视频 | 是 |
| -8 | 视频无音轨 | 该视频无音轨，无法进行语音转写 | 否 |
| VIDEOCLONE_INVALID_PLATFORM | 非抖音/小红书域名直达端点 | 仅支持抖音/小红书视频链接 | 否 |
| -99 | 未知异常 | 采集失败 + 技术详情 | 视情况 |

网络类错误（-1/-2/-3/-5）沿用现有 RETRYABLE_CODES 显示重试按钮；视频通道失败不回退图文采集（图文链路无法处理视频，回退只会产生二次错误）。

## 4. 交互流程

```
用户粘贴 URL → 点击「采集」/回车
  ├─ 域名检测：抖音/小红书？
  │   ├─ 是 → 按钮禁用 + 阶段提示（探测→下载→提音频→转写）
  │   │        → IPC aggregation:collect-video（600s 超时）
  │   │        → Python POST /aggregation/collect-video
  │   │        → 管线四阶段 → CollectResult(media_type=video)
  │   │        → 成功：卡片入列表（🎬 徽标+时长+平台）→ toast「内容采集成功」
  │   │        → 失败：错误区显示中文提示（可重试显示重试按钮）
  │   └─ 否 → 现有图文链路（aggregationCollect → 失败回退 urlCollectFetch）
```

一键采集+改写（collectAndRewrite）：视频链接同样先走视频通道，转写文案作为改写输入，其余流程不变。

## 5. 非功能需求

1. **免费性**：默认引擎 faster-whisper 为 MIT 许可本地推理，无 API 费用；模型自动下载到 HuggingFace 缓存目录。
2. **资源上限**：视频 ≤500MB / 探测期时长 ≤10 分钟 / 下载超时 300s / 转写超时 300s / 端点超时 600s。
3. **临时文件零残留**：tempfile.TemporaryDirectory 上下文保证异常路径也清理。
4. **向后兼容**：CollectResult 新字段全默认值；现有图文采集链路（UI/IPC/端点）零改动；旧采集记录（collected_items 存储）读取时 mediaType 为 undefined，按图文渲染。
5. **依赖可选**：faster-whisper 在 pyproject.toml [project.optional-dependencies].asr 组，不进主 dependencies；缺失时 -6 错误+安装指引，不影响其他功能。
6. **安全**：URL 协议白名单（http/https）；子进程 windowsHide 无弹窗；错误提示只含用户可读信息，技术细节仅进日志。

## 6. 测试计划

| 层 | 文件 | 覆盖 |
|----|------|------|
| Python 单元 | packages/python-backend/tests/test_aggregation_video.py | 模型兼容/平台检测/错误分类/引擎抽象/管线成功/反爬/超限/无音轨/引擎缺失/超时/空转写（23 用例） |
| IPC 合同 | apps/desktop/electron/ipc-handlers/aggregation.test.js | 新通道注册/调用参数/600s 超时/-6/-7/-8 分类 |
| preload | apps/desktop/electron/preload.test.js | aggregationCollectVideo 方法暴露 |
| 前端组件 | apps/desktop/src/views/Collection.test.js | 域名路由（抖音/小红书/普通 URL 回归）/成功结果字段/-6/-8 错误/通道不可用/时长格式化（58 用例含存量） |
| locale | .github/scripts/check-locale-sync.js | zh/en key 成对 + CJK 无新增硬编码 |

## 7. ASR 引擎说明与部署打包策略

### 7.1 AsrEngine 三引擎架构说明

`AsrEngine` 是 Python 后端的语音转写引擎抽象层（`packages/python-backend/src/multi_publish/aggregation/asr_engine.py`），统一接口：

| 方法 | 作用 |
|------|------|
| transcribe(audio_path) | 转写音频 → { text, language, duration_seconds, segments } |
| is_available() | 引擎依赖是否可用（库已装/二进制存在/API Key 已配） |
| install_hint() | 依赖缺失时的中文安装指引 |

三个实现：

| 引擎 | 类型 | 状态 | 说明 |
|------|------|------|------|
| faster_whisper | 本地 Python 库 | **Phase 1 默认（已实现）** | MIT 许可，CPU int8 推理，模型首次使用自动下载 |
| sensevoice | 本地单文件二进制 | Phase 2 预留 | llama.cpp GGUF（Windows 预编译包），中文 CER ~8%，~20x 实时 |
| siliconflow | 在线 API | Phase 2 预留 | FunAudioLLM/SenseVoiceSmall 免费 API，需 SILICONFLOW_API_KEY |

「可切换」= 通过环境变量 `ASR_ENGINE=faster_whisper|sensevoice|siliconflow` 选择引擎（默认 faster_whisper），调用代码无需修改。引擎不可用时返回 -6 + 该引擎安装指引，不自动切换（避免不可预期的网络/下载行为）。

### 7.2 faster-whisper 是否本地模型？是否打包进安装包？

**是纯本地模型**：MIT 许可、CPU 本地推理、无 API 调用、无使用费用、断网可用。

**当前设计：不打包进安装包**。faster-whisper 是 Python 可选依赖（`pip install faster-whisper`，含 ctranslate2 等约 500MB 依赖），模型权重（base 约 150MB）首次转写时自动下载到本机 HuggingFace 缓存目录（国内可设 `HF_ENDPOINT=https://hf-mirror.com` 镜像加速）。

**产品发布时的三个选项对比**：

| 方案 | 安装包体积影响 | 首次使用体验 | 适用场景 |
|------|--------------|------------|---------|
| A. 现状：不打包，首次使用下载 | 零影响（+0MB） | 首次需下载 ~150MB 模型 + 依赖 | 当前默认；用户按需安装 |
| B. 打包进安装包 | +650MB 左右（依赖+模型） | 开箱即用 | 对体积不敏感的企业内网分发 |
| C. Phase 2 换 SenseVoice 单二进制 | +315MB 左右（二进制+q8 模型） | 开箱即用，中文效果更好 | **推荐的产品化终态** |

**推荐路径**：Phase 1 保持方案 A（轻量分发，错误提示含完整安装指引）；Phase 2 接入 SenseVoice 后切方案 C（单二进制 + 模型文件作为 extraResources 打包，无需 Python 依赖，中文 CER 8% 优于 Whisper 系 22-31%，~20x 实时 CPU 推理）。方案 B 不推荐（PyInstaller 打包 ctranslate2 依赖链复杂且体积最大）。

### 7.3 错误提示透传契约（2026-09-12 修复）

视频管线的错误提示分两类渲染：

- **含具体数值的提示**（视频过长含实际时长/文件过大含实际大小）：后端 detail 直接透传显示（剥掉错误码前缀），保留关键信息。例：「视频过长（15:32），采集仅支持 10 分钟内的短视频」。
- **固定语义提示**（无音轨/引擎缺失/超时/私密/会员等）：按 collect-error.js 分类 reason 渲染 locale 模板文案（zh/en 成对）。

分类器新增 11 个视频管线 reason：video_too_long / video_file_too_large / no_audio_track / asr_engine_unavailable / video_transcribe_timeout / video_private / video_membership / video_region / video_anti_bot / video_invalid_platform / asr_empty。重试语义：仅 video_transcribe_timeout 与 video_anti_bot 可重试，其余为输入/资源类错误不显示重试按钮。

## 8. Phase 2 展望（不在本次范围）


1. SenseVoice 本地引擎接入（llama.cpp GGUF 二进制 + 模型下载管理 UI）。
2. SiliconFlow 在线引擎接入（设置页 API Key 配置）。
3. 真实进度上报（任务化 + task-status 轮询或 SSE）。
4. 批量视频采集。
5. yt-dlp 自动更新检查。
