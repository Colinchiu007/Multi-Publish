## Why

采集页目前仅支持图文正文采集（trafilatura/RSS/Sitemap/API），抖音/小红书链接被 Phase 1 校验直接拒绝。用户粘贴的爆款内容大量来自抖音/小红书（图文笔记 + 视频作品），视频口播文案是最核心的素材，当前完全无法采集。本次变更为采集功能补齐抖音/小红书支持：图文作品提取正文，视频作品经「yt-dlp 下载 → ffmpeg 提音频 → 免费 ASR 转写」管线把口播文案提取为文本，与图文结果统一进入采集列表，直接服务后续改写与发布。

## What Changes

- 新增视频作品采集端点 `POST /aggregation/collect-video`（Python FastAPI）：yt-dlp `--dump-json` 元数据探测 → yt-dlp 下载（500MB/30min 上限，错误分类复用 video-clone-engine 语义）→ ffmpeg 提取 16kHz 单声道 WAV → ASR 转写 → 返回扩展的 CollectResult。
- 新增 ASR 引擎抽象（Python sidecar 内 `AsrEngine` 基类 + 三实现）：`faster-whisper`（本地，复用现有 Transcriber 依赖）、`sensevoice`（本地 llama.cpp GGUF 单二进制，中文 CER ~8%，Phase 2 接入）、`siliconflow`（在线免费 API 兜底）。引擎经环境变量 `ASR_ENGINE` 切换，默认 faster-whisper，缺失依赖时给出可操作的中文错误。
- 扩展 `CollectResult` 模型：新增 `media_type`（article/video，默认 article 保持向后兼容）、`video_url`、`duration`、`transcript` 可选字段；视频采集时 `content` 填转写文案，`metadata` 存平台/引擎/segments 调试信息。
- 新增 IPC 通道 `aggregation:collect-video` + preload `aggregationCollectVideo`：与现有 aggregation IPC 同模式，错误码沿用 classifyError 并新增 -6（ASR 引擎不可用）/ -7（转写超时）/ -8（视频无音轨）。
- 采集页 UI 适配：URL 输入自动检测抖音/小红书域名（复用 hintPlatform 语义）→ 视频链接走 collect-video 通道；采集结果卡片区分 📄 图文 / 🎬 视频徽标，视频卡片显示时长与来源平台，详情区显示完整转写文案；转写期间显示分阶段进度提示（探测元数据 → 下载视频 → 提取音频 → 语音转写）。
- 依赖声明：python-backend `pyproject.toml` 声明 `faster-whisper` 可选依赖组（不在主 dependencies 强制安装，运行时缺依赖返回 -6 错误码与安装指引）。
- 文档：新增 PRD（含数据校验/流程/功能逻辑/交互逻辑/显示项/提示文字全量规格）、CHANGELOG 条目、learnings 沉淀。

## Capabilities

### New Capabilities
- `aggregation-collect-video`: 抖音/小红书图文+视频作品链接采集，含视频下载、音频提取、ASR 转写管线与错误分类契约。
- `aggregation-asr-engines`: ASR 转写引擎抽象与多引擎切换（faster-whisper 本地 / sensevoice 本地 / siliconflow 在线），含引擎选择、降级与依赖缺失处理契约。

### Modified Capabilities
- `aggregation-collect`: CollectResult 数据模型新增 media_type/video_url/duration/transcript 可选字段（默认值保证旧数据兼容）；采集源列表新增 douyin/xiaohongshu 视频通道说明。

## Impact

- **Python 后端**：`packages/python-backend/src/multi_publish/aggregation/`（router.py 新端点、models.py 字段扩展、service.py 或新 video_collect.py 服务）；`video_creation/analysis/transcriber.py` 保持不动（新服务直接调用其 execute()）。
- **Electron 主进程**：`apps/desktop/electron/ipc-handlers/aggregation.js`（新通道 + 错误码扩展）。
- **preload**：`apps/desktop/electron/preload/aggregation.js`（aggregationCollectVideo）。
- **渲染进程**：`apps/desktop/src/views/Collection.vue`（URL 域名检测、视频卡片显示、分阶段进度、错误提示）；`apps/desktop/src/locales/{zh,en}.js` 成对新增文案。
- **依赖**：python-backend 可选依赖组 faster-whisper（Phase 1）；SenseVoice 二进制与模型不打包进应用，首次使用时下载到用户数据目录（Phase 2）。
- **外部依赖**：yt-dlp / ffmpeg / ffprobe 二进制（复用 video-clone-engine 的 resolveBinary 环境变量回退链 VC_YTDLP_PATH/VC_FFMPEG_PATH）；SiliconFlow API（可选，SILICONFLOW_API_KEY）。
- **测试**：新增 Python 端点测试（mock yt-dlp/ffmpeg/ASR）、IPC handler 测试、Collection.vue 组件测试（视频链接检测 + 卡片渲染 + 错误路径）。
