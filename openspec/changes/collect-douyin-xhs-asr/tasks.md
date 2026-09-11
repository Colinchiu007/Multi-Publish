## 1. Python 后端 — 数据模型与 ASR 引擎

- [x] 1.1 扩展 CollectResult 模型：新增 media_type/video_url/duration/transcript 可选字段（默认值保证旧数据兼容），新增 CollectVideoRequest 请求模型（url + 可选 asr_engine），跑 models 相关测试
- [x] 1.2 新建 aggregation/asr_engine.py：AsrEngine 抽象基类（transcribe/is_available/install_hint）+ FasterWhisperEngine 实现（复用 Transcriber 核心逻辑：model_size=base、CPU int8、VAD、segments 拼接全文），单元测试 mock faster_whisper
- [x] 1.3 pyproject.toml 新增 [project.optional-dependencies] asr 组（faster-whisper），验证 pip install -e '.[asr]' 可装

## 2. Python 后端 — 视频采集服务与端点

- [x] 2.1 新建 aggregation/video_service.py：VideoCollectService（yt-dlp --dump-json 探测 → 下载 → ffmpeg 提 16kHz WAV → AsrEngine 转写 → CollectResult），tempfile.TemporaryDirectory 清理，时长>10min 探测期拒绝，错误分类复用 classifyDownloadError 语义
- [x] 2.2 router.py 新增 POST /aggregation/collect-video 端点（asyncio.to_thread 包裹阻塞调用，600s 超时语义，ValueError→400/Exception→500 与现有端点一致）
- [x] 2.3 Python 测试：test_aggregation_video.py（mock yt-dlp/ffmpeg/ASR 子进程与引擎，覆盖成功/反爬/超限/无音轨/引擎缺失/临时文件清理路径）

## 3. Electron IPC 与 preload

- [x] 3.1 ipc-handlers/aggregation.js 新增 aggregation:collect-video 通道（pythonBridge.requestBackend POST /aggregation/collect-video，timeout 600000ms），classifyError 扩展 -6（ASR 引擎不可用）/-7（转写超时）/-8（无音轨）
- [x] 3.2 preload/aggregation.js 新增 aggregationCollectVideo 方法；preload.test.js 补断言
- [x] 3.3 ipc-handlers/aggregation.test.js 补测试：新通道调用、-6/-7/-8 错误分类、超时参数

## 4. 前端采集页 UI

- [x] 4.1 Collection.vue：collectUrl() 增加抖音/小红书域名检测（douyin.com/xiaohongshu.com/xhslink.com），命中走 aggregationCollectVideo；视频采集期间分阶段提示（探测→下载→提音频→转写）与按钮禁用
- [x] 4.2 Collection.vue：采集结果卡片与详情区按 media_type 区分（🎬 徽标/时长 mm:ss/平台标签/「视频口播文案」标注），collectedResult item 构造补 mediaType/duration/platform 字段；采集记录列表同步显示
- [x] 4.3 locales/zh.js + en.js 成对新增视频采集文案（阶段提示/错误提示/卡片标签），跑 check-locale-sync
- [x] 4.4 Collection.test.js 补测试：域名路由（抖音/小红书/普通 URL）、视频卡片渲染、-6/-7/-8 错误显示、进度阶段提示

## 5. 文档与 PRD

- [x] 5.1 新增 01-docs/PRD-COLLECT-DOUYIN-XHS-VIDEO-ASR-2026-09-12.md：完整 PRD（背景/术语/功能范围 P0-P2/数据校验/流程图/功能逻辑/交互逻辑/显示项/提示文字/错误码表/非功能需求/测试计划）
- [x] 5.2 CHANGELOG.md 添加本次变更条目；01-docs/learnings.md 沉淀 ASR 选型与管线经验

## 6. 质量门禁与交付

- [ ] 6.1 全量相关测试：python-backend pytest（aggregation + video 相关）、apps/desktop vitest（Collection/aggregation IPC/preload）
- [ ] 6.2 双模型审查（opencode + Claude 并行 review git diff），Critical 修复后重审，结果写入 .ccg/tasks/collect-douyin-xhs-asr/review.md
- [ ] 6.3 提交推送 codex/collect-douyin-xhs-asr 分支，创建 PR，CI 通过后合并
