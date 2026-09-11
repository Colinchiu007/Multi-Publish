## Context

采集页现有链路（Collection.vue → aggregation IPC → Python FastAPI /aggregation/collect → trafilatura）只处理图文正文；抖音/小红书在 Python 侧被 PLAYWRIGHT_SOURCE_TYPES 校验直接拒绝。视频下载（yt-dlp）、ffprobe/ffmpeg、faster-whisper 转写三套能力已分别存在于 video-clone-engine 与 python-backend，但彼此孤立，未与采集模型打通。本设计把这三套能力串联为视频采集管线，并保持图文链路零改动。

双模型架构分析（opencode + Claude，2026-09-12）在以下关键决策上达成一致：新增独立 /collect-video 端点而非扩展 /collect；yt-dlp --dump-json 做元数据探测而非浏览器自动化；ASR 引擎放 Python sidecar 并做三引擎抽象；CollectResult 增量可选字段保证向后兼容；分两阶段实施（Phase 1 faster-whisper 全本地，Phase 2 SenseVoice + SiliconFlow）。

## Goals / Non-Goals

**Goals:**

- 抖音/小红书视频链接 → 下载 → 提音频 → ASR 转写 → 采集列表，全流程可用（Phase 1）
- 图文与视频结果统一数据模型，下游改写/发布无感
- ASR 引擎可切换、可扩展（faster-whisper / sensevoice / siliconflow）
- 图文采集现有行为 100% 不变（回归保护）
- 错误全程中文提示、可操作（安装指引/重试建议）

**Non-Goals:**

- 不做抖音/小红书账号 Cookie 登录采集（collection-engine 的浏览器 adapter 保留为未来高级路径）
- 不做 ASR 模型打包进安装包（首次使用下载到用户数据目录）
- 不做说话人分离（diarization）与字幕时间轴编辑（metadata 中保留 segments 供未来使用）
- 不做批量视频采集（Phase 1 仅单链接；批量沿用现有图文批量通道）
- 不修改现有 /aggregation/collect 端点行为

## Decisions

### D1: 新增独立端点 /aggregation/collect-video（而非扩展 /collect）

理由：视频管线耗时 10 秒～5 分钟（下载+CPU 转写），与图文同步采集的超时模型、错误码体系、进度上报逻辑完全不同；独立端点使现有 /collect 零风险，且允许独立演进（未来加 SSE 进度流）。

替代方案（否决）：扩展 /collect 按 URL 域名内部分支——耦合两条管线，/collect 的 30 秒超时对视频下载不够，错误码无法区分。

### D2: 元数据探测用 yt-dlp --dump-json（而非浏览器自动化）

理由：不下载文件即可获取 title/duration/uploader/thumbnail（约 3-5 秒）；yt-dlp 社区对抖音/小红书 extractor 维护活跃；代码库已有 runYtDlp/hintPlatform/classifyDownloadError 完整基础设施。探测失败按 classifyDownloadError 语义返回中文错误，不降级到 Playwright（采集场景浏览器路径需 Cookie 管理，体验差且不稳定）。

替代方案（否决）：Playwright 打开页面提取 DOM——冷启动 2s+、资源占用大、拿不到视频直链与时长，且现有 PLAYWRIGHT_SOURCE_TYPES 证明该路径尚未成熟。

### D3: ASR 引擎放 Python sidecar，AsrEngine 抽象基类 + 三实现

理由：Transcriber（faster-whisper）已是 python-backend 内的 BaseTool，Python ASR 生态最丰富（FunASR/SenseVoice/whisperx）；统一在 Python 内管理引擎选择逻辑最清晰。新建 aggregation/asr_engine.py 独立封装（不直接复用 Transcriber 类，因其 BaseTool 耦合 + 写 JSON 文件副作用），但核心转写调用逻辑一致。

引擎选择：环境变量 ASR_ENGINE（faster_whisper | sensevoice | siliconflow），默认 faster_whisper。不自动降级切换引擎——静默切换可能引发不可预期的网络请求或大模型下载，显式错误更可控。

替代方案（否决）：Node 子进程调 llama.cpp 二进制——需另建进程管理与 IPC 通道，与现有 Transcriber 重复；npm whisper 绑定包（whisper-node/smart-whisper）已停更或 Windows 部署差。

### D4: CollectResult 增量可选字段（而非嵌套 media 对象）

理由：顶层可选字段（media_type/video_url/duration/transcript）对 Pydantic 是纯增量，旧 JSON 反序列化自动填默认值；前端 item 构造只需加 4 个映射。嵌套对象方案（metadata.media = {...}）虽不污染顶层，但访问路径深、类型不明确。

content 字段语义统一：视频采集时 content = 转写文案（下游改写/发布直接用 content，无需感知来源）；transcript 冗余存储同值，供前端显式标注「口播文案」。

### D5: 同步执行 + 长超时（Phase 1），进度用阶段提示而非轮询

理由：pythonBridge.requestBackend 支持自定义 timeout 参数；视频管线设 600 秒（下载 300s + 转写 300s）。Phase 1 前端用「分阶段假进度提示」（探测→下载→提音频→转写，按预估时间切换文案）而非真实进度轮询——实现简单，且用户核心诉求是结果而非精确百分比。真实进度（task 轮询/SSE）留给 Phase 2，与 SenseVoice 引擎一起做。

替代方案（Phase 2 计划）：复用现有 task-status 端点做后台任务 + 轮询——需要后端线程池与任务状态机，Phase 1 先不做。

### D6: faster-whisper 为可选依赖组（不进主 dependencies）

理由：faster-whisper + ctranslate2 体积大（~500MB 含依赖），且仅视频采集用户需要。放 [project.optional-dependencies] asr 组，运行时 is_available() 探测，缺失返回 -6 + 安装指引。主依赖保持轻量，不影响其他功能启动。

### D7: 临时文件用 tempfile.TemporaryDirectory 自动清理

理由：视频（最大 500MB）与音频 WAV 都是中间产物，转写完成后即无用。TemporaryDirectory 上下文管理器保证异常路径也清理，无需手动 atexit。

## Risks / Trade-offs

- [yt-dlp 对抖音/小红书 extractor 失效（平台反爬升级）] → 错误分类返回「该链接触发了平台风控」引导重试；yt-dlp 社区更新频繁，应用内提示用户更新 yt-dlp（yt-dlp -U）；video-clone 模块已有同样的依赖风险，非新增。
- [大视频下载耗时（500MB 上限内仍可能数分钟）] → --dump-json 先取时长，超 10 分钟的视频在探测阶段即拒绝（提示过长）；下载阶段前端显示持续提示文案，按钮禁用防重复提交。
- [faster-whisper base 模型首次下载 ~150MB（国内 HuggingFace 可能慢）] → 日志记录下载进度；错误提示包含 HF_ENDPOINT=https://hf-mirror.com 镜像建议；Phase 2 SiliconFlow 在线引擎为零下载替代。
- [CPU 转写速度 ~0.5x 实时（30 分钟视频需 15 分钟）] → 超时 300s 保护（-7 错误提示尝试较短视频）；采集场景主流是 1-5 分钟短视频，可接受；Phase 2 SenseVoice ~20x 实时彻底解决。
- [同步长请求占用 FastAPI worker] → 管线各阶段用 asyncio.to_thread 包裹阻塞调用，不阻塞事件循环；单用户桌面应用并发压力极小。
- [Electron 打包体积] → yt-dlp/ffmpeg 已在打包清单（video-clone 依赖）；ASR 模型不打包，首次使用下载；faster-whisper 可选安装。

## Migration Plan

1. 后端先行：models.py 扩展（纯增量）→ asr_engine.py → video_service.py → router.py 端点。每步跑 pytest。
2. IPC 层：aggregation.js 新通道 + preload 方法（纯增量，不动现有通道）。
3. 前端：Collection.vue 域名检测分支 + 视频卡片渲染 + locales 成对新增。
4. 回滚策略：全部为增量变更，回滚 = revert 单个 commit；旧图文链路无任何 schema/行为变化，无数据迁移。

## Open Questions

- SenseVoice Windows 二进制在本机实测速度与兼容性（AVX2 要求）——Phase 2 验证，不影响 Phase 1 架构。
- SiliconFlow API 的并发限流额度——Phase 2 接入时实测，超限走 -3 错误码。
