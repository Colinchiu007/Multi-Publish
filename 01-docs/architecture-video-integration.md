# OpenMontage 视频集成 — 架构设计方案

> **版本**: v2.2
> **日期**: 2026-07-22
> **状态**: 当前实现基线（历史计划保留）
> **审查框架**: 质量节拍 Phase 1.1（技术架构）+ Phase 5（审查模式）  
> **相关文档**: PRD-video-creation.md, ADR-001, ADR-002, remotion-integration-design.md, refactoring-review-2026-07-08.md  

---

## 一、背景与真实现状

### 1.1 需要明确的事实

> 本文早期版本把 OpenMontage 资料、Remotion 组件和 Electron 服务的状态混在了一起。
> 当前权威链路是 `story2video-compose`：Python 清单/外部服务 + Electron JS 阶段执行器 +
> ffmpeg 合成。Remotion 仍支持独立的快速渲染路径，但不是 Story2Video 编排的合成器。

### 1.2 已集成的 Remotion Composer（独立快速渲染路径）

| 项目 | 文件数 | 说明 |
|------|--------|------|
| `packages/remotion-composer/src/` | 38 文件 | 比 OpenMontage（35 文件）多 3 个 |

**Remotion Root 当前注册 14 个 Composition（独立快速路径）：**
Explainer / CinematicRenderer / SignalFromTomorrowWithMusic / TalkingHead / TitledVideo /
HeroTitle / ProductReveal / ProductRevealVertical / CaptionOverlayOnly / CollageBurst / LyricOverlay /
EndTag / EndTagOverlay / Story2VideoSlideshow。

其中 `CompositionManager` 只对外管理 7 个稳定的用户入口：Explainer / TalkingHead /
CinematicRenderer / CollageBurst / TitledVideo / LyricOverlay / HeroTitle。其余是 fixture、overlay、
产品展示或 Story2Video 专用注册项，不应被误写成 Manager 已公开的 7 个入口。

**15+ 场景组件全部已复制：**
TextCard, TerminalScene, AnimeScene, HeroTitle, CaptionOverlay, StatCard, StatReveal, ComparisonCard, CalloutBox, ProductReveal, ScreenshotScene, ParticleOverlay, ProgressBar, ProviderChip, EndTag + 4 种图表

**新增文件（OpenMontage 没有的）：**
- `scene-builder.ts` — 场景输入→Cut 数组转换
- `props-validator.ts` — Composition props 校验
- `media-profiles.ts` — 媒体预设（分辨率/FPS/码率）

### 1.3 Python 后端与 Electron 混合职责

| 路径 | 文件数 | 说明 |
|------|--------|------|
| `packages/python-backend/src/multi_publish/video_creation/` | 当前运行时树 | 提供 providers、pipeline 定义和视频工具；文件数量会随同步变化，不作为功能完成度证据 |

**11 大类工具全部已复制：**

| 大类 | 覆盖范围 |
|------|---------|
| AI 视频生成 | Hunyuan / CogVideo / Grok / HeyGen / Kling / Runway / VEO / Wan / Minimax / Seedance / LTX / Higgsfield |
| AI 图像生成 | Flux / DALL-E / Recraft / Grok / Imagen / ComfyUI / 本地扩散 / Code Snippet / Diagram Gen / Math Animate |
| 音频系统 | 7 种 TTS（豆包/ElevenLabs/Google/OpenAI/Piper 等）+ 3 种音乐（Suno/MusicGen/FreeSound）+ 音频库/选择器 |
| 视频分析 | 场景检测 / 人脸跟踪 / 转写 / 音频分析 / 帧采样 / Composition 验证 / 视频分析 / Visual QA / 视频下载 |
| 视频增强 | 去背景 / 调色 / 眼部增强 / 人脸增强 / 人脸修复 / 上采样 |
| 视频处理 | 绿幕合成/处理 / 自动裁切 / 静音剪切 / 视频修剪 / Clip 搜索/缓存 / 字幕烧录 |
| 字幕系统 | subtitle_gen |
| 人物动画 | 唇形同步 / 说话头像 / 角色动画 |
| 屏幕录制 | 屏幕录制 / 截取选择器 |
| 素材检索 | 15 源（Pexels/Pixabay/NASA/Unsplash/Videvo/Wikimedia 等） |
| Pipeline 管线 | Python YAML 清单 + Electron StageExecutor 混合执行 |
| 视频合成后端 | Electron `Story2VideoComposeEngine` + ffmpeg；Python `video_compose` 可选 HyperFrames runtime |

### 1.4 接线状态（Electron 主进程服务层）

| 文件 | 状态 | 作用 | 测试 |
|------|------|------|------|
| `apps/desktop/electron/services/render-engine.js` | ✅ 已扩展 | 多 Composition 支持 + CompositionManager 内建 | ✅ 覆盖 Manager 的 7 个稳定入口 |
| `apps/desktop/electron/services/composition-manager.js` | ✅ 已实现 | 对外管理 7 个稳定 Composition 的参数校验；Root 另有 7 个 fixture/overlay/S2V 注册项 | ✅ 7/7 管理器入口 |
| `apps/desktop/electron/services/ai-generator.js` | ✅ 已实现 | 桥接 Python AI 工具；模型供应商由 `ModelProviderManager` 统一管理（当前预置 52 条） | ✅ 8/8 |
| `apps/desktop/electron/services/video-engine.js` | ✅ 已收敛 | 只公开已真实接通的 `trim`，不再转发假成功的通用 `/api/video/process` | ✅ |
| `apps/desktop/electron/services/pipeline-engine.js` | ✅ 已实现 | 内置管线 + `story2video-compose` 六阶段编排 | ✅ |
| `apps/desktop/electron/services/story2video-project-service.js` | ✅ 已实现 | 用户隔离的项目持久化、分段编辑/重试/重合成、STT 和最近 100 项清理 | ✅ |
| `apps/desktop/electron/ipc-handlers/ai.js` | ✅ 已实现 | ai:list-providers/generate/test-connection 等 | ✅ |
| `apps/desktop/electron/ipc-handlers/video.js` | ✅ 已实现 | video:process/analyze/mix-audio/search-stock 等 | ✅ |
| `apps/desktop/electron/ipc-handlers/pipeline.js` | ✅ 已实现 | pipeline:list/start/pause/resume/cancel 等 | ✅ |
| `apps/desktop/electron/ipc-handlers/story2video.js` | ✅ 已实现 | 项目 CRUD、受控媒体导入、分段操作、STT、真实裁剪、ZIP、本地播放 URL 和路径操作 | ✅ |
| `apps/desktop/electron/ipc-handlers/render.js` | ✅ 已扩展 | 新增 composition 管理 IPC | ✅ |
| preload source + bundle + main.js 接线 | ✅ 已接线 | Story2Video API 已进入生产 bundle；sandbox=true/false 均实际调用 IPC 验证 | ✅ |
| CreateView.vue | ✅ 已实现 | 文案/图片双模式 + 渲染 | ✅ |
| PipelineView.vue | 已移除 | S2V 管线浏览、配置和检查点已统一到 CreateView.vue | ✅ |
| CreateHistory.vue / ResultView.vue | ✅ 已实现 | 本地项目筛选/恢复与分段编辑、重试、裁剪、重新合成 | ✅ |
| PipelineBrowser.vue | ✅ 已修复 | IPC 调用已对接 publisher API | ✅ |

### 1.5 Story2Video 当前权威数据流

```text
CreateView.vue
  └─ preload.publish.js / pipelineStartOrchestrated
       └─ pipeline IPC（可信 sender + 参数校验）
            └─ PipelineEngine
                 ├─ split → SplitterBridge（8002）
                 ├─ domain_enrich → story2video-domain.js（可选 history）
                 ├─ optimize → PromptBridge（8013）
                 ├─ generate_assets → AssetGenerator / 本地图片与旁白摄取
                 ├─ compose → Story2VideoComposeEngine（Electron + ffmpeg）
                 ├─ publish → PublisherRouter（显式开启才执行）
                 └─ Story2VideoProjectService
                      ├─ 用户隔离项目目录 + 最近 100 项索引
                      ├─ 成片/完整旁白/分段媒体持久化
                      └─ ResultView → 编辑/重试/重合成/裁剪/ZIP/路径操作
```

`packages/python-backend/.../story2video-compose.yaml` 是阶段和产品契约，
但自定义的 `domain_enrich`、`generate_assets` 执行器在 Electron 启动时由
`registerStory2VideoStages()` 注入。合成结果必须是非空普通文件并通过 ffmpeg
解码校验；外部服务或发布凭据缺失时必须返回失败/跳过，而不是占位成功。

当前 `story2video-compose` 直接支持：`contentType`、模板预设、图片动效、转场、
字幕样式、BGM/音量、水印、分辨率/FPS、图片轮播输入和可选多平台发布。
旧项目的后生成 batch 编辑能力已经由本地项目服务覆盖：分段编辑、排序、删除、旁白替换、
图片/视频重试和重新合成均走真实媒体文件。逐段手动 STT、完整旁白、流式 ZIP、真实裁剪
和重启后的完成项目恢复也已接通。仍不支持的是 Sora/Supabase Remix、一次上传音频后自动
识别并分场景的专用模式、音色克隆、旧 orchestrator 会员配额以及云端分享/跨设备历史。

#### Provider 配置与调用边界

`ModelProviders.vue` 将用户配置通过 IPC 写入本地加密的 `model_providers` 存储，
`ModelProviderManager` 只在实际调用用户选择的 provider 时解密并构造 adapter 凭据。豆包
TTS/STT 的 App ID 存在配置字段，Access Token 复用加密 API Key；adapter 使用火山旧接口的
`Bearer;token` 认证形式并验证 TTS 业务成功码 `3000`。这条本地调用合同已覆盖单元测试，
但真实 Token、网络、配额和供应商响应仍须在目标环境单独验收。

Story2Video 的图片资源链统一使用注册 ID `dall-e`，并兼容历史 `openai-image` 配置；
OpenAI 图片请求按宽高选择横图或竖图尺寸，Imagen 将 `n` 和宽高映射为 `sampleCount` 与
宽高比。ComfyUI 当前只有提交 workflow 的 adapter，缺少 S2V 所需的 workflow 模板、异步
轮询和输出下载合同，所以资产生成器会显式失败，不能作为可用图片来源展示。

#### 媒体信任边界

```text
renderer File
  → preload webUtils.getPathForFile（可信解析）
  → story2video:import-media（sender 校验）
  → 复制到 os.tmpdir()/story2video/selected-media
  → stage/compose canonical path + 非 symlink + 格式/大小校验
  → ffprobe 时长校验
  → 成功产物复制到用户项目目录
  → run completed/failed/cancelled 时清理导入临时文件
```

用户可以从任意盘符选择旁白或 BGM，但路径本身不会成为永久授权。图片转为受限 data URL
并落到 run 临时目录。旁白仅 WAV/M4A/MP3 且 <=50MB，BGM <=15MB，图片仅
JPEG/PNG/WebP 且 <=10MB；成片 <=10 分钟，多段旁白单段 <=3 分钟、总输入 <=15 分钟。

默认可读根只包含 `os.tmpdir()/story2video`、`userData/story2video-projects` 和当前项目服务
显式传入的项目根；用户主目录、下载、文档、桌面、图片、音乐和视频目录不是 renderer 路径的
隐式授权范围。本地播放 URL、复制路径、打开目录和 ZIP 源文件均复用这个边界。ZIP 的外部保存
目录只能由主进程 `showSaveDialog` 返回后作为单次额外根加入，renderer 直接传入的外部目标路径
会被拒绝。

ZIP 使用 STORE + data descriptor 流式写入临时文件，按 64KB 分块计算 CRC32，再原子重命名；
默认最多 64 个文件、总源文件 <=512MB。该实现避免旧版 `readFile + Buffer.concat` 在大导出时
产生两倍以上内存峰值。

#### 项目持久化与媒体生命周期

`Story2VideoProjectService` 以身份 `sub` 的 SHA-256 目录隔离项目，并把索引写入用户设置。
每个项目保存 `project.json`、成片、完整旁白、BGM 和分段图片/音频/视频；索引只保留最近
100 项，淘汰或删除项目时同步删除受控目录。编辑、重试和重新合成采用“先持久化新清单，
再删除旧清单中不再引用的普通文件”的顺序，共享媒体仍被引用时不会删除。

路径边界同时 canonicalize 候选路径和允许根目录，目录符号链接/junction 不能把清理操作引向
项目目录之外。分段重试中途失败时恢复旧媒体引用，只留下失败状态和错误信息，并清理本次
生成的图片/视频。持久化媒体文件名以可信的数组位置生成，`sourceIndex` 只保留上游原始索引，
因此重复原始索引不能覆盖同次运行的其他分段产物。该历史是本机完成项目历史，不是云任务队列
或断点续作系统。

---

## 二、架构原则

### 2.1 核心决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 集成策略 | **文件已复制，只需建桥接层** | 代码已在项目中，不需要再复制 |
| Python 调用 | **复用 python-bridge.js** | 已有稳定的 Electron→Python 通信链路 |
| Composition 管理 | **独立 Remotion 快速路径** | `composition-manager.js` 对外管理 7 个稳定入口；Root 已注册 14 个 Composition，但不参与 Story2Video 六阶段 ffmpeg 合成 |
| 新服务注册 | **走 container.setup.js** | 遵循 ADR-002，全部通过 DI 容器获取 |
| UI 框架 | **Vue 3 + 现有路由** | 复用项目已有的 Vue 3 技术栈 |
| 启用策略 | **默认禁用** | 不干扰现有发布流程 |

### 2.2 架构层次（基于 ADR-002）

```
Layer 4 (Entry):  main.js / preload.js
     │
Layer 3 (IPC):    ipc-handlers/
     │              ├── render.js   (已有, 扩展 composition 管理)
     │              ├── ai.js       (✅ 已实现)
     │              ├── video.js    (✅ 已实现)
     │              └── pipeline.js (✅ 已实现)
     │
Layer 2 (Service): services/
     │              ├── render-engine.js       (已有, 扩展多 Composition)
     │              ├── composition-manager.js (✅ 已实现)
     │              ├── ai-generator.js        (✅ 已实现)
     │              ├── video-engine.js        (✅ 已实现)
     │              └── pipeline-engine.js     (✅ 已实现)
     │
Layer 1 (Core):    core/
                    ├── container.js            (已有)
                    ├── error-codes.js          (已有)
                    └── container.setup.js      (已有)
```

### 2.3 数据流

```
Vue 创作页 (选择流水线/模板预设 + 填参数)
    │ IPC (preload.js)
    ▼
ipc-handlers/ai.js / video.js / pipeline.js
    │ DI → Service
    ▼
ai-generator.js / video-engine.js / pipeline-engine.js (✅ 全部已实现)
    │ python-bridge.js (子进程)
    ▼
Python tools (已存在)
    │
    ├── 视频生成 → 输出文件路径
    ├── 音频生成 → 输出文件路径
    ├── 分析/增强 → 结构化数据
    └── 管线编排 → 检查点 + 进度

Vue 发布页 (发布已渲染视频 → 复用现有发布器)
```

---

## 三、历史实施计划（已完成或被现行六阶段链路替代）

> 本节保留早期 Remotion/Python 接入计划，作为变更记录，不是 Story2Video 当前待办。
> 当前开发应以第 1.5 节和 `PRD-video-creation.md` 的实现基线为准。

### Phase 1（P0）— Composition 管理（2 周）

**目标（已完成）**: 让 Electron 主进程能调用独立 Remotion 路径中 Manager 对外维护的 7 个 Composition

#### 新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| services/composition-manager.js | ✅ 已完成 | registerCompositions / listCompositions / getComposition / buildRenderProps / validateProps |
| `services/render-engine.js` | ✅ 已完成 | 通过 CompositionManager 列出、读取并渲染受管 Composition |
| `ipc-handlers/render.js` | ✅ 已完成 | 已注册 render:list-compositions / render:get-composition IPC |
| `packages/remotion-composer/src/Root.tsx` | ✅ 已有 | 已注册 14 个 Composition；其中 7 个由 Manager 对外维护 |

#### 接口定义

```javascript
// composition-manager.js
class CompositionManager {
  registerDefaultCompositions()     // 初始化时注册
  listCompositions()                // [{id, name, description, thumbnail}]
  getComposition(id)                // 返回单个 Composition 详情
  buildRenderProps(id, userParams)  // 用户参数 → render-engine props
  validateProps(id, props)          // 渲染前校验
}

// IPC 映射:
// render:list-compositions → compositionManager.listCompositions()
// render:get-composition → compositionManager.getComposition(id)
// render:start → compositionManager.buildRenderProps() + renderEngine.render()
```

#### 质量门禁

- [x] `render:list-compositions` 返回 7 个 Composition (7/7 测试通过)
- [ ] 每个 Composition 可渲染出 mp4 文件（独立的 Remotion 真实渲染/浏览器运行时验收，不是 Electron 接口接入缺口）
- [x] 旧调用（默认 Explainer）向后兼容 ✅
- [x] composition-manager.test.js 覆盖全部接口 (31 测试全通过 ✅)

---

### 历史 Phase 2（P1）— AI + 视频工具桥接（3 周）

**目标（历史）**: 通过 python-bridge.js 调用 Python 工具；现行模型供应商数量以 `ModelProviderManager` 为准

#### 新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| services/ai-generator.js | ✅ 已完成 | 桥接 AI 视频/图像/音频/TTS 生成；不维护独立 provider 数字 |
| services/video-engine.js | ✅ 已完成 | 桥接视频处理/分析/增强/字幕 |
| ipc-handlers/ai.js | ✅ 已完成 | ai:list-providers / ai:generate / ai:test-connection |
| ipc-handlers/video.js | ✅ 已完成 | video:process / video:mix-audio / video:analyze |

#### 架构

```
ai-generator.js
    │ 通过 python-bridge.js 调用
    ▼
Python 子进程: python <tool.py> --params <json>
    │
    ├── providers/video/hunyuan_video.py
    ├── providers/audio/elevenlabs_tts.py
    ├── providers/image/flux_image.py
    └── ...
```

```javascript
// ai-generator.js
class AIGenerator {
  listProviders(type)           // 'video'|'image'|'audio'|'tts'
  generate(type, provider, params, onProgress)
  testConnection(providerId)
  getProviderConfig(providerId)  // 不含 API Key
  updateProviderConfig(id, config)
  listModels(providerId)
}

// video-engine.js
class VideoEngine {
  mixAudio({narration, music, sfx}, output, onProgress)
  process(type, params, onProgress)  // green-screen|reframe|trim|bg-remove|...
  analyze(type, filePath)            // scene-detect|transcript|face-track
  searchStock(query, source, limit)
  generateSubtitle(audioPath, language)
  checkFfmpeg()
}
```

#### 历史质量门禁说明

> 这些门禁针对早期 Python 工具桥接；具体 provider、网络和凭据必须在目标环境单独验收，
> 不等同于 `story2video-compose` 的本地合成门禁。

---

### 历史 Phase 3（P2）— Pipeline 编排 + 完整 UI（4 周，现行链路已落地）

**目标**: 创建 pipeline-engine.js 和完整视频创作 UI

#### 新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| services/pipeline-engine.js | ✅ 已完成 | 内置管线与 story2video-compose 编排 |
| ipc-handlers/pipeline.js | ✅ 已完成 | pipeline:list/start/pause/resume/cancel/status |
| Vue 创作页面 (CreateView.vue) | ✅ 已完成 | 选择流水线/模板预设 → 编排检查点 → 合成/预览 |
| Vue Provider 配置页 (Providers.vue) | ✅ 已有 | AI Provider 配置管理 |
| Vue 管线执行页 (CreateView.vue) | ✅ 已完成 | 管线状态/检查点/进度与 S2V 参数 |

#### 接口

```javascript
// pipeline-engine.js
class PipelineEngine {
  loadPipeline(id)
  listPipelines()
  start(id, params)
  pause()
  resume()
  cancel()
  getStatus(id)
  getHistory()
}
```

#### Vue UI 页面规划

| 路由 | 页面 | 功能 |
|------|------|------|
| `/create` | 视频创作 | 选择流水线/模板预设 + 编排检查点 + 合成/预览 |
| `/create/provider` | Provider 配置 | API Key / 模型选择 / 测试连接 |
| `/create/pipeline` | 已移除 | 管线执行已统一到 CreateView（历史路由） |
| `/create/history` | 创作历史 | 用户隔离的本地项目列表、状态筛选、恢复/删除；不代表云端历史 |

#### 当前验证状态

- [x] `story2video-compose` 六阶段可通过合同测试和真实 ffmpeg 测试。
- [x] 检查点、运行上下文和自动推进有 IPC 合同测试。
- [x] 合成结果经过非空和 ffmpeg 解码校验。
- [x] 本地媒体导入、时长上限、结果导航和流式 ZIP 有真实文件合同测试。
- [x] 本地项目在重启后可恢复，最多 100 项；分段编辑/重试/重合成和媒体清理有真实文件测试。
- [x] preload 生产 bundle 在 sandbox=true/false 下都暴露并实际调用 Story2Video IPC。
- [x] VideoTrimmer 通过 Python/ffmpeg 真实裁剪，结果页有双范围选择和区间预览。
- [ ] 外部 8002/8013 服务和真实发布账号仍需目标环境验收。

---

## 四、与重构方案的关系

| 并行流 | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| **本架构** | composition-manager.js | ai-generator + video-engine | pipeline-engine + UI |
| **重构方案** | 文档治理 + TS 清理 | DI + main.js 拆分 | JS 巨石拆分 |

两个方案涉及的代码文件不重叠，可完全并行推进。

---

## 五、依赖与风险

### 5.1 运行依赖

| 依赖 | 用途 | 来源 |
|------|------|------|
| Node.js | Electron 运行时 | ✅ 已有 |
| Python 3.10+ | Python 工具执行 | ✅ 已有 |
| python-bridge.js | Electron↔Python IPC | ✅ 已有 |
| Remotion 4.0.x | 独立快速渲染 | ✅ 已在 remotion-composer 锁定 |
| FFmpeg/ffprobe | Story2Video 合成、音频混流和媒体时长探测 | ⚠️ 当前依赖系统可执行文件，安装包尚未内置 |
| 8002/8013 服务 | 文本分句与提示词优化 | ⚠️ 目标环境必须单独启动并验收 |

### 5.2 风险

| 风险 | 影响 | 概率 | Phase | 应对 |
|------|------|------|-------|------|
| Python 依赖冲突 | 工具无法运行 | 中 | 2 | 每组工具独立 venv |
| AI 服务 API 变更 | 功能不可用 | 中 | 2 | 多提供商备选 |
| Electron iframe 限制 | 预览无法内嵌 | 低 | 3 | 受控 file URL + IPC；生产和开发均不关闭 `webSecurity` |
| Remotion 渲染慢 | 用户体验差 | 低 | 1 | 进度条 + 可取消 |
| 系统 FFmpeg 缺失 | 合成与裁剪不可用 | 中 | 3 | 启动/执行前检测并明确报错，不在运行时静默安装 |
| 外部分句/提示词服务缺失 | 六阶段主链阻断 | 中 | 3 | 健康检查并明确失败，不伪造本地成功 |

---

## 六、测试策略

### 6.1 测试文件

| Phase | 测试文件 | 覆盖 |
|-------|---------|------|
| 1 | composition-manager.test.js | Composition 注册/参数校验/渲染 |
| 1 | render-engine.test.js | 多 Composition 渲染 |
| 2 | ai-generator.test.js | AI 工具调用（mocked） |
| 2 | video-engine.test.js | 视频处理/混音 |
| 3 | pipeline-engine.test.js | 管线加载/状态转换 |
| 3 | story2video-project-service.test.js | 项目持久化、分段生命周期、路径边界、STT |
| 3 | story2video-real-ffmpeg.node-test.cjs | 真实图片/旁白/转场/BGM/水印合成与解码 |
| 3 | preload-sandbox-verifier.test.js | 生产 preload bundle 双 sandbox IPC 合同 |
| 3 | test_video_trimmer.py | ffmpeg 裁剪参数、错误路径和真实输出 |

### 6.2 验证方式

- 单元测试：Vitest（Electron 侧）+ pytest（Python 侧）
- 集成测试：renderer → preload bundle → IPC → ProjectService/StageExecutor，以及 python-bridge.js 通信
- 真实媒体测试：ffmpeg/ffprobe 生成、裁剪、解码与时长检查
- 外部验收：8002/8013、真实 AI provider 和发布账号只在配置齐全的目标环境执行

---

## 七、时间线

| Phase | 周次 | 交付物 | 代码行预估 |
|-------|------|--------|-----------|
| 1 | ✅ 已完成 | composition-manager.js + render-engine 扩展 | ~500 行 JS (7/7 测试) |
| 2 | ✅ 已完成 | ai-generator.js + video-engine.js | ~800 行 JS (13/13 测试) |
| 3 | ✅ 已完成 | pipeline-engine.js + Vue UI + 本地项目服务；剩余项均为外部验收或后续产品范围 | ~2500 行 JS/Vue |

---

## 八、启用/禁用策略

视频创作功能默认禁用（设置页开关）。启用时：
1. 检测 Python 环境、ffmpeg/ffprobe 和外部服务 → 缺失时明确引导或阻断对应能力
2. 检测已随应用打包/锁定的 remotion-composer；Composition 只使用本地系统字体栈，不在应用运行时请求远程字体或执行在线 `npm install`
3. 加载 composition-manager.js 等新 Service
4. 在侧边栏添加"创作"入口

禁用时：
- 不加载任何视频创作相关 Service
- 侧边栏不显示"创作"入口
- 不影响现有发布流程



