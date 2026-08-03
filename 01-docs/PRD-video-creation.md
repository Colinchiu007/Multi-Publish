# PROJECT-003 Multi-Publish — 视频创作模块 PRD

> **版本**: v1.8
> **日期**: 2026-07-29
> **状态**: 实现基线已更新（持续迭代）
> **产品定位**: 将 OpenMontage 的视频生成能力集成到 Multi-Publish 桌面客户端，实现"创作→渲染→发布"完整闭环  
> **目标用户**: 自媒体创作者、内容运营、企业内容团队  

---

## 一、产品概述

### 1.1 背景

Multi-Publish 已实现 15 个平台的统一发布能力（RPA 驱动），并已在桌面端接入本地视频创作链路。

OpenMontage 资料仍作为能力参考；当前产品的权威实现是 Electron 主进程的
`story2video-compose` 混合编排：Python 后端提供清单和可选外部服务，Electron
`StageExecutor` 负责阶段编排，`Story2VideoComposeEngine` 通过 ffmpeg 生成成片。

旧版“仅移植 Remotion 前端、Python/编排完全缺失”的描述是历史状态，不再代表当前代码。

### 1.2 核心价值

| 价值 | 说明 |
|------|------|
| **零服务端成本** | 利用用户本地算力渲染，无需 ECS |
| **创作→发布闭环** | 一个桌面应用完成从视频制作到多平台发布 |
| **分层渲染能力** | Story2Video 默认走 Electron + ffmpeg；Remotion 提供独立快速渲染，Python `video_compose` 可选 HyperFrames runtime |
| **渐进式能力** | 从简单文字→视频到专业电影感制作逐步解锁 |
| **复用已有资产** | 已发布的图文内容可直接转为视频素材 |

### 1.3 与已有系统的关系

```
Multi-Publish 现有系统（发布侧）
    │
    ├── RPA 发布引擎（已上线 15 平台）
    ├── 账号/Cookie/定时发布（已上线）
    │
    └── ✅ 视频创作模块（本 PRD）
         │
         ├── CreateView.vue（流水线选择、编排检查点、历史入口）
         ├── story2video-compose（split → domain_enrich → optimize → generate_assets → compose → publish）
         ├── Electron ffmpeg 合成（字幕、动效、转场、BGM、水印、分辨率/FPS）
         └── PublisherRouter（显式开启且有平台时发布）
```

### 1.4 当前实现基线（2026-07-26）

| 能力 | 当前状态 | 说明 |
|------|----------|------|
| 文案分句 | 已接入（双层） | 场景层优先由 `smart-sentence-splitter` 决定；仅连接拒绝、超时、连接重置等服务不可用错误可降级到本地场景分句，无论桥接层以 reject 还是失败对象返回。字幕层始终在每个场景内部由本地逻辑二次切分 |
| 提示词优化 | 已接入（外部 sidecar；本地真实服务已验收） | Multi-Publish 通过 `PromptBridge` 调用 `prompt-engine` 批量优化；平台/风格枚举和数值范围与其 Pydantic 合同一致，结果数量不一致会阻断 |
| 历史领域增强 | 已接入 | `contentType=history` 自动识别时代/朝代并生成 `imagePromptSeed` |
| Story2Video 标准模式 | 已接入 | `story2video-compose` 只接受文案；图片、音频、视频素材模式不再属于该流水线 |
| TTS | 已接入 | text 标准模式通过已配置 TTS adapter 生成逐段旁白；edge-tts 优先，ffmpeg 静音音频作为离线降级。生成阶段时长可为估算值，compose 必须以 ffprobe 的真实音频时长生成字幕时间轴并避免截断。结果页仍可替换单段旁白，但上传音频不是该模式的创作输入 |
| 外部模型 Provider | 已接入（外部待验收） | `ModelProviderManager` 已把选择的图片/TTS/STT provider 接入资产链；豆包 App ID 与加密 Access Token 已映射到 adapter。真实凭据、网络和配额不属于本地自动化验收 |
| 图片 Provider 合同 | 已接入 | 使用注册 ID `dall-e`，兼容旧 `openai-image`；Imagen 将数量和宽高映射为 `sampleCount` 与宽高比；远程图片 URL 仅接受 HTTPS，解析结果必须是固定的可公开路由地址；仅已配置且主机名、协议、端口完全匹配的本机 loopback Provider endpoint 可下载；下载响应按流式 25MiB 上限读取，DNS 和远程下载共用 30 秒总预算；ComfyUI 因缺 workflow、轮询和下载输出合同而在 S2V 主链显式失败 |
| 合成 | 已接入 | Electron + ffmpeg；支持按场景多页定时字幕、图片动效、转场、BGM、水印和输出校验 |
| 模板 | 已接入 | 7 个模板预设和自定义模板库；CreateView 可将预设映射到运行参数（不等同于 7 个 Remotion Composition） |
| 发布 | 已接入 | 未选择平台时明确 `skipped`；开启发布但缺 router/凭据时失败，不报告假成功 |
| 结果交付/ZIP | 已接入 | 编排完成自动进入结果页；本地播放 URL 由主进程生成，可下载、复制路径、打开目录，并以流式 ZIP 导出 |
| 本地项目历史 | 已接入 | 完成项目按用户隔离持久化，最多保留 100 项；重启后可恢复成片和分段媒体。失败运行断点续作与云历史不在本地合同内 |
| 分段项目编辑 | 已接入 | 结果页支持编辑、排序、删除、替换旁白、图片/视频重试和重新合成；不再把旧项目 `batch` 编辑器列为缺失 |
| 旁白与转录 | 已接入（TTS） | text 标准模式由配置的 TTS Provider 生成逐段旁白并交付完整旁白；上传音频和手动 STT 不属于该模式 |
| 成片裁剪 | 已接入 | 通过 Python `VideoTrimmer` + ffmpeg 真实裁剪；结果页提供双范围控件和区间预览 |
| 创作模式 | 已收敛 | `story2video-compose` 仅保留 `text`；`image/remix/gallery/audio/batch` 不再作为该流水线的创作模式 |
| 媒体安全约束 | 已接入 | text 标准模式只直接接收 BGM（<=15MB）；普通流水线与结果页使用的图片/旁白工具仍执行格式、大小和受控路径校验，不构成 Story2Video 创作模式 |
| 时长约束 | 已接入 | text 标准模式成片 <=10 分钟；普通流水线/结果编辑使用旁白工具时仍执行总时长和单段时长限制，合成前通过 ffprobe 二次校验 |

运行前提：本地可执行 `ffmpeg`；`8002`（场景分句）和 `8013`（提示词）是外部服务边界。
8002 不可用时允许明确标记的本地场景降级，非法响应仍阻断；8013 不可用时阻断优化阶段。
2026-07-26 已在开发环境通过真实 `PipelineEngine` 六阶段 E2E，但安装包内 sidecar/依赖仍需目标环境验收。
真实多平台发布还需要已配置账号、凭据和
`PublisherRouter`，本地合成测试不等于发布验收。

### 1.5 语义服务维护与交付边界（已确认）

分句引擎和生图提示词优化引擎是与 Multi-Publish 并行维护的两个独立 Python 项目，
不是当前 Multi-Publish npm workspace 内的源码包：

| 项目 | 权威源码与算法 | Multi-Publish 侧责任 | 本地 REST 合同 |
|------|----------------|---------------------|----------------|
| `smart-sentence-splitter` | `D:\Data\projects\smart-sentence-splitter` | 进程生命周期、目录/端口配置、健康检查、错误边界、阶段编排 | `python -m splitter.api.rest_api`；`GET /health`；`POST /v1/split`；默认 `127.0.0.1:8002` |
| `prompt-engine` | `D:\Data\projects\prompt-engine` | 进程生命周期、目录/端口配置、请求字段映射、批量结果数量校验、错误边界、阶段编排 | `python -m prompt_engine.api`；`GET /health`；`POST /v1/optimize`、`POST /v1/optimize/batch`；默认 `127.0.0.1:8013` |

实际调用链为：

```text
StageExecutor
  -> ServiceBus
  -> SplitterBridge / PromptBridge
  -> 本地 Python sidecar REST API
```

`apps/desktop/electron/services/splitter-bridge.js` 和 `prompt-bridge.js` 使用
`SPLITTER_DIR`、`PROMPT_DIR` 指定两个独立项目根目录；未设置时回退到当前工作目录，
因此开发、部署和打包环境必须显式提供正确的目录与 Python 依赖。Bridge 支持
`start()` 启动子进程，也支持 `attach()` 连接已经运行的服务；当前 Electron 正常启动流程
默认调用 `start()`，外部服务模式必须由启动编排明确采用 attach 策略，不能仅因端口存在就
推断两个实现已经被应用内置。

Multi-Publish 中的 `packages/story2video-engine/src/text-segmentation.ts` 是独立的
TypeScript 文本/场景/字幕切分工具，`history-prompt.ts` 是本地领域增强和 `promptSeed`
生成逻辑；Electron 主链使用兼容 CommonJS 实现
`apps/desktop/electron/services/story2video-segmentation.js` 执行字幕二次切分和场景降级。
正常场景边界仍由 8002 决定，8013 仍是提示词优化主链；修改这些本地逻辑不会自动修改两个
Python sidecar 的算法行为。

当前 Electron 安装包的 `files`/`extraResources` 只包含应用代码、配置、Playwright 和
Remotion 资源，不包含上述两个项目源码、Python 运行时或其依赖。因此 8002/8013 当前仍是
独立运行时边界；不能把本地 Bridge 能够 `spawn` 理解为安装包已经完成 sidecar 分发。干净
Windows 安装环境中的 Python、依赖、服务启动和真实接口验收必须单独记录。

**维护决策规则：**

1. 调整正常场景分句算法/模型或 prompt 优化策略、模板、Provider 时，在对应独立 Python 仓库修改、测试、提交和推送。
2. 调整 Electron 启停、端口、超时、错误提示、阶段顺序、UI、参数归一化或结果适配时，在 Multi-Publish 修改。
3. 调整本地字幕二次切分、字幕时间轴或 8002 不可用时的场景降级算法时，在 Multi-Publish 修改，并保证服务正常路径不被本地算法改写。
4. 修改 REST 路径、请求/响应字段、枚举、默认值、错误码或批量结果语义时，必须同时修改两个仓库，并用真实 8002/8013 服务做跨仓库回归。
5. 发布前必须分别确认独立仓库的 commit/分支和 Multi-Publish 的适配 commit；禁止只更新一侧后宣称接口已完成。

---

## 二、用户旅程

### 2.1 核心流程

```
用户输入（文字文案/主题）
    │
    ▼
场景构建器（自动或手动编排场景）
    │
    ▼
六阶段混合流水线（StageExecutor + Story2VideoComposeEngine/ffmpeg；Remotion 为独立快速路径）
    │
    ▼
预览与调整
    │
    ▼
导出 → 直接进入发布流程（复用现有发布系统）
```

### 2.2 角色与权限

| 角色 | 能做什么 | 心智模型 |
|------|---------|---------|
| **新手创作者** | 输入文字→选主题→一键生成 | "像做 PPT 一样做视频" |
| **进阶创作者** | 选择模式、调整参数、叠加字幕和背景音乐 | "像剪映一样灵活" |
| **专业创作者** | 自定义场景/时长/叠层、选择模板预设、手动推进检查点 | "像 AE 一样精确" |

---

## 三、功能需求

### 3.1 创作模式（P0-P2）

| 优先级 | 模式 | 说明 | 输入 | 底层引擎 |
|--------|------|------|------|---------|
| **P0** | Story2Video 文字→视频 | 输入文案自动生成分镜、图片、旁白和成片 | 多行文本 + 参数 | `story2video-compose` 六阶段 + ffmpeg |
| **P1** | 说话头像 | 上传视频 + 文案，生成带字幕的讲话视频 | 视频文件 + 文本 | 独立 Remotion TalkingHead（与 S2V 主链分开） |
| **P1** | 电影感短片 | 素材视频 → 电影感渲染 | 视频素材 + 描述 | 独立 Remotion CinematicRenderer |
| **P1** | 标题叠加 | 视频 + 图文标题叠加 | 视频 + 标题文字 | 独立 Remotion TitledVideo |
| **P1** | 拼贴爆破 | 多段视频合成拼贴效果 | 多个视频片段 | 独立 Remotion CollageBurst |
| **P2** | 歌词同步 | 音乐视频歌词叠加 | 视频 + 歌词时间轴 | 独立 Remotion LyricOverlay |
| **P2** | 屏幕录制 | 录制屏幕 + 自动标注 | 屏幕操作 | 独立工具链（不属于 S2V 六阶段） |
| **P2** | AI 视频生成 | 文字→AI 生成视频片段 | 描述文字 | 第三方 AI（Hunyuan/Kling 等） |

### 3.1.1 Story2Video 标准模式合同

| 模式/能力 | 当前状态 | 当前合同 |
|-------------|----------|----------|
| `text` 文案成片 | 标准模式 | 分句 → 领域增强（可选）→ prompt-engine → 图片/TTS → ffmpeg |
| `image/remix/gallery/audio/batch` | 排除 | 不属于 `story2video-compose`；普通视频流水线和结果页编辑能力不因此删除 |
| 单图/单段重试 | 已实现 | 项目结果页可重生目标图片并重新渲染单段视频，也可仅重渲染视频；失败会回滚旧媒体并清理本次临时产物 |
| 本地结果交付 | 已实现 | 安全本地播放、下载、复制路径、打开目录、流式 ZIP |
| 合成音频下载 | 已实现 | 完整旁白轨持久化到项目目录并可单独下载；ZIP 同时包含成片、旁白和分段媒体 |
| 本地历史恢复 | 已实现 | 项目按用户隔离存储并限制为最近 100 项；可筛选、打开和删除，重启后仍可恢复完成项目 |
| 成片裁剪 | 已实现 | 结果页选择起止时间、预览区间并调用真实 ffmpeg 裁剪；输出必须是可读媒体文件 |
| 云端历史/分享链接 | 未实现 | 本地 file URL、复制路径和打开目录不是可对外访问的分享链接；失败运行也不支持云端断点续作 |
| 音色克隆/外部 Provider | 部分实现 | 常规 provider 的配置、凭据映射和 adapter 调用已接入；音色克隆未实现，真实服务仍需要凭据、网络和配额验收，不能以本地静音降级冒充 |
| 会员/视频配额 | 外部产品边界 | 旧项目依赖独立 orchestrator 的 membership/quota；当前仅有通用 entitlement 基础，S2V 未按旧套餐扣减视频配额 |

### 3.1.2 Text 参数合同

| 参数组 | 兼容字段与默认值 | 六阶段映射 |
|--------|------------------|------------|
| 基础 | `mode=text`、`prompt` 必填、`size=720x1280`、`seconds=8` | 创建运行前校验；`size` 映射专属输出，`seconds` 保留为兼容目标时长 |
| 分句 | `language=zh`、`mode=balanced`、`maxSentenceLength=200`、`targetSeconds=6`、`speechRate=1`、`minWords=10`、`maxWords=50` | `split` stage options；发送 8002 前映射到 `SplitRequest.config.sentence_tokenizer/scene`，不得作为会被忽略的顶层扩展字段 |
| 提示词 | `platform=generic`、`style=realistic`、`creativeLevel=5`（1-10）、`maxLength=null`（启用时 50-2000）、`negativePrompt<=500`、`numCandidates=1`（1-5）、`autoDetectStyle=true`、`context=''` | `optimize` stage options，字段转换为 prompt-engine snake_case；空 `maxLength/context` 不发送，文本上下文转换为 `{ synopsis }`，对象上下文按 JSON 字典透传；图片风格不参与提示词风格回退 |
| 图片 | `style=cinematic`、`effect=zoom-in`、Provider/模型可选 | `generate_assets` 与 `compose` |
| 旁白 | 豆包兼容音色 ID、`speed=1`、`volume=1`、`pitch=0`、`emotion=default` | `generate_assets` 与 `compose`；凭据仍由加密 Provider 管理器持有 |
| 字幕 | `enabled=false`、Noto Sans SC 字体栈、`size=size3`、`style=style1` | `compose`，兼容字号映射后交给 ffmpeg |
| BGM | `enabled=false`、`volume=5`（兼容范围 0-10） | 启用且有受控路径时转换为 ffmpeg `0-1` 音量 |
| 版本/效果 | `generateBase=true`、`generateMerged=true`、`perImageDuration=6`、`transition=fade` | 至少选择一个版本；无旁白场景时使用 `perImageDuration` |
| 输出/发布 | 独立分辨率、FPS、格式；平台、标题、描述、标签、封面可选 | `compose` 与 `publish`，未启用发布时明确 `skipped` |

所有运行参数必须是纯 JSON；归一化器只接受白名单字段并在创建 run 之前拒绝非法值。API Key、Access Token 和 Provider Secret 不得写入运行参数、项目历史或结果清单。

### 3.1.3 双层分句与字幕同步合同

| 层级 | 权威实现 | 输出与降级合同 |
|------|----------|----------------|
| 场景层 | `smart-sentence-splitter` 8002 | 正常响应的 `scenes` 是图片、视频提示词和逐场景 TTS 的唯一边界；Multi-Publish 不得再次改写。仅 `ECONNREFUSED`、`ETIMEDOUT`、`ECONNRESET`、服务未运行等不可用错误可使用本地场景降级；业务错误或缺失 `scenes` 的非法响应必须失败 |
| 字幕层 | Multi-Publish 本地逻辑 | 对每个场景的 `text` 独立二次切分，目标为每页 8-15 个字符，优先在标点后断开；字幕不得跨越场景，按顺序拼接后必须等于该场景规范化文本 |
| 可观测性 | 运行结果与项目清单 | 每个场景持久化 `sceneSource`、`subtitleSource`、`degraded`、`fallbackReason`、`subtitleBlocks` 和 `subtitleTimeline`；`tier_used=tier3_rule` 仍表示经过 8002，只是 sidecar 内部选择规则层，不等于本地降级 |

Story2Video 的 `target_duration/base_words_per_second/speech_rate/min_words/max_words` 必须转换为
8002 实际消费的 `config.scene.target_seconds/base_words_per_second/speech_rate/min_words_per_segment/max_words_per_segment/enforce_sentence_boundary/allow_single_sentence_overflow`；
`max_sentence_length` 同步写入 `config.sentence_tokenizer`。字幕页长度和时间轴选项只由本地逻辑消费，
不得混入 8002 请求。为兼容 sidecar 现有中文算法，`min_words/max_words` 名称保留但计量单位是字数/字符数。

字幕时间轴必须在 compose 阶段基于 ffprobe 读取的逐场景真实音频时长生成，不能把
edge-tts 文件大小估算当作最终时长。每个场景的首个字幕从 `0` 开始，字幕区间连续且
不重叠，最后一页的 `endTime` 必须精确等于该场景有效时长；TTS 语速变化导致音频时长
变化时，时间轴按字幕可见字符和标点停顿权重等比例缩放。旧项目没有 `subtitleBlocks`
时，compose 需从场景文本现场生成，以保持重新合成兼容。

当前 TTS Provider 未统一提供词级/音素级时间戳，因此本合同保证“按真实总时长的分页近似同步”，
不宣称逐词精准对齐。未来 Provider 提供可信词级时间戳时，可在不改变场景边界的前提下替换页内分配算法。

### 3.1.4 媒体工具与时长限制

| 媒体 | 格式 | 大小 | 时长 |
|------|------|------|------|
| 图片（普通流水线/结果编辑） | JPEG / PNG / WebP | 单图 <=10MB | 不适用 |
| 旁白音频（结果编辑/STT 工具） | WAV / M4A / MP3 | 单文件 <=50MB | 总计 <=15 分钟；多文件时单段 <=3 分钟 |
| 背景音乐（text 标准模式） | WAV / M4A / MP3 | 单文件 <=15MB | 成片混音以视频结束为准 |
| 输出视频 | MP4 / WebM | 由本地磁盘决定 | Story2Video 成片 <=10 分钟 |

这些媒体工具不恢复 `image/audio/gallery/batch` 创作模式。前端先检查扩展名和文件大小；可信 preload 将用户选择的音频复制到应用临时目录，
主进程再做 canonical path、符号链接、大小和 ffprobe 时长检查。任意磁盘文件选择因此
无需把整个盘符加入白名单。流水线完成、失败或取消时删除导入的临时媒体。

### 3.2 参数配置（Remotion 快速路径）

以下 Cut 参数属于独立 Remotion 快速路径，不等同于 `story2video-compose` 的 scene schema：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | string | 自动生成 | 场景唯一标识 |
| `type` | enum | `text_card` | 场景类型（15+ 种） |
| `text` | string | — | 场景文本内容 |
| `source` | string | — | 视频/图片源路径 |
| `in_seconds` | number | — | 开始时间（秒） |
| `out_seconds` | number | — | 结束时间（秒） |
| `animation` | string | `ken-burns` | 动画效果 |
| `chartData` | array | — | 图表数据 |
| `chartSeries` | array | — | 折线图序列 |

### 3.3 叠加层（Remotion 快速路径，P1）

| 类型 | 说明 | 参数 |
|------|------|------|
| `section_title` | 章节标题 | 文字 + 副标题 + 颜色 |
| `stat_reveal` | 数据揭示 | 数字 + 标签 + 动画 |
| `hero_title` | 大标题展示 | 标题 + 副标题 |
| `provider_chip` | 多来源标签 | 来源列表 + 轮播速度 |

### 3.4 字幕系统（P1）

| 功能 | 说明 |
|------|------|
| S2V 烧录字幕 | 已实现：逐场景文本、字号/颜色/边框/背景样式 |
| 逐词高亮 | 仅独立 Remotion 快速路径；S2V 主链未实现词级时间轴 |
| 多页显示 | 已实现：每个场景内部本地二次切分，ffmpeg 通过独立的 `[start,end)` 半开 `enable` 区间分页显示，边界帧不会同时叠加前后两页 |
| TTS 同步 | 已实现：以 ffprobe 真实音频时长按字幕文本权重分配，末页精确结束；未提供词级时间戳时不宣称逐词精准同步 |

### 3.5 音频系统（P1）

| 轨道 | 说明 | 参数 |
|------|------|------|
| 旁白（Narration） | 已实现：TTS 或逐段本地音频 | 文件路径 + 独立旁白音量（0-2，合成时写入 ffmpeg） |
| 背景音乐（Music） | 已实现：本地 BGM 循环混音 | 源路径 + 音量 |
| 音效（SFX） | 未接入 S2V 主链 | 源路径 + 时间点 + 音量 |

### 3.6 主题系统（P0）

| 主题 | 适用场景 |
|------|---------|
| `clean-professional` | 商务、教育、产品介绍 |
| `flat-motion-graphics` | 科技、创意、短视频 |
| `minimalist-diagram` | 数据分析、流程图解 |
| `anime-ghibli` | 故事讲述、品牌短片 |

### 3.7 媒体配置（P0）

| 预设 | 分辨率 | 适用平台 |
|------|--------|---------|
| `youtube-landscape` | 1920×1080 | YouTube、B站 |
| `youtube-4k` | 3840×2160 | YouTube 4K |
| `youtube-shorts` | 1080×1920 | YouTube Shorts |
| `tiktok` | 1080×1920 | 抖音/TikTok |
| `instagram-reels` | 1080×1920 | Instagram Reels |
| `wechat` | 1080×1920 | 微信视频号 |
| `bilibili` | 1920×1080 | B站 |
| `xiaohongshu` | 1080×1440 | 小红书 |
| `generic-hd` | 1920×1080 | 通用 |
| `cinematic` | 2560×1080 | 电影感 21:9 |
| `linkedin` | 1920×1080 | LinkedIn |
| `instagram-feed` | 1080×1080 | Instagram 信息流 |

---

## 四、非功能需求

### 4.1 性能

| 指标 | 目标 |
|------|------|
| Remotion 渲染（30s 视频） | ≤ 5 分钟 |
| FFmpeg 合成（30s 视频） | ≤ 30 秒 |
| 渲染队列 | 串行执行（队列管理） |
| 进度更新 | 每 5% 更新一次 |
| UI 响应 | 渲染不阻塞界面 |

### 4.2 可用性

| 场景 | 处理 |
|------|------|
| 运行时缺少打包资源 / ffmpeg | 阻断对应能力并给出安装或修复指引，不在应用运行时联网安装依赖 |
| 首次运行 | 检查随应用打包或锁定的渲染资源；不执行在线 `npm install` 或 Playwright 下载 |
| 渲染超时 | 10 分钟超时自动取消 |
| 渲染失败 | 错误详情展示 + 重试按钮 |
| 用户关闭窗口 | before-quit 终止子进程 |
| 并发渲染 | 任务队列 maxConcurrent=1 |
| 网络不可用 | 离线模式，依赖本地已安装工具 |

### 4.3 安全性

| 项目 | 要求 |
|------|------|
| API Key | 本地加密存储；仅在调用用户主动选择的 Provider 时发送给该 Provider，不能宣称外部生成全程离线 |
| 用户素材 | 默认不上传云端；用户主动选择外部图片/TTS/STT Provider 时，仅把完成请求所需的提示词、文本或已导入媒体发送给该 Provider，并受其服务条款约束 |
| 渲染子进程 | 沙箱隔离 |
| 取消渲染 | 完整进程树清理 |

---

## 五、历史阶段规划与当前补齐项

> 下列 Phase 1-5 是早期 Remotion/Python 路线的规划记录，已完成的部分不再作为当前待办。
> `image/remix/gallery/audio/batch` 已明确排除，不再作为 Story2Video 待迁移能力。
> 当前外部产品缺口只包括音色克隆、旧 orchestrator 会员配额，以及云历史/云分享。已接入的 Provider 仍需在真实
> 凭据、网络和配额齐全的目标环境完成外部验收。
> 分段编辑、单段重试、完整旁白、本地项目历史、流式 ZIP 和真实裁剪已经接通；
> 本地路径操作不等同于云端分享链接。

### 历史 Phase 1（P0）— 基础渲染（已被六阶段链路替代）
- 已完成：独立 Remotion Composition 注册、参数校验和渲染 IPC。
- 已由现行链路覆盖：CreateView 输入、字幕/音频参数、结果预览和发布入口。

### 历史 Phase 2（P1）— 多模式扩展（独立 Remotion 路径）
- 已完成：TalkingHead、CinematicRenderer、CollageBurst、LyricOverlay 等独立 Composition。
- 这些 Composition 不会自动成为 `story2video-compose` 的阶段；需要单独走 Remotion IPC。

### 历史 Phase 3（P1）— Python 工具链（已接入，能力按运行环境可用性计）
- 已完成：Python 后端桥接和 YAML 清单；具体 provider 是否可用取决于本地依赖与凭据。
- S2V 默认使用本地 `AssetGenerator`，外部服务不可用时必须明确失败或降级。

### 当前补齐项（P1/P2）— 交付体验与外部能力
- [x] text 标准模式：唯一创作输入为文案；图片和逐段旁白由生成阶段产生。
- [x] 结果页项目编辑：编辑/排序/删除分段、替换旁白、图片/视频重试和重新合成；这不是 `batch` 创作模式。
- [x] 普通流水线/工具继续支持图片、音频、视频素材和逐段 STT，不受 Story2Video text-only 合同影响。
- [x] `image/remix/gallery/audio/batch` 明确排除，不计入 Story2Video 功能缺口。
- [x] 结果页本地交付：预览、下载、完整旁白、逐段媒体、复制路径、打开目录和流式 ZIP 导出。
- [x] 本地项目历史：用户隔离持久化、最近 100 项、筛选/打开/删除和重启恢复。
- [x] 真实视频裁剪：双范围选择、区间预览和 ffmpeg 输出校验。
- [ ] 云端分享链接、失败运行断点续作和跨设备历史。
- [ ] 音色克隆，以及 Doubao/MiMo 等外部 Provider 的真实凭据和网络验收。

### 历史 Phase 5（P2）— 增强与完善（不等同于 S2V 主链待办）
- [ ] 绿幕合成
- [ ] 人脸增强 / 去背景 / 上采样
- [ ] 自动裁切（人脸跟踪）
- [x] 视频修剪（ffmpeg 精确起止时间；未实现独立静音检测剪切）
- [ ] 自定义 Playbook 生成

---

## 六、验收标准

### 当前 `story2video-compose` 验收
- [x] 仅文案模式可通过 CreateView 发起六阶段编排，图片/音频/视频输入在 UI 和主进程两层被拒绝。
- [x] 独立 `Story2VideoTextConfig` 覆盖兼容默认值、边界校验、阶段映射和项目持久化。
- [x] Story2Video 输出配置与其他视频流水线隔离，切换流水线不会继承分辨率或素材状态。
- [x] Story2Video 在视频创作列表中优先显示；创建页只暴露实际由六阶段链路消费的参数。图片比例由输出分辨率唯一推导，不能与成片尺寸冲突；不支持的情绪、字幕字体和离线占位图不作为可选项。
- [x] 旁白有可探测音频时长时以音频时长决定场景时长；“无旁白场景时长”只作为无可用音频时长时的回退，不承诺强制截断旁白。
- [x] 结果页本地视频和旁白预览通过仅绑定 127.0.0.1 的短期令牌媒体服务提供，不向 renderer 暴露绝对路径；CSP 仅允许该回环来源的媒体请求。
- [x] 图片动效、转场、字幕、BGM、水印、分辨率/FPS 和 MP4/WebM 输出有自动化合同测试与真实 ffmpeg 验证。
- [x] 场景层正常路径由 8002 的 `scenes` 决定；仅服务不可用时本地降级，非法响应不降级，并在运行结果和项目清单保留来源字段。
- [x] Story2Video 分句别名映射到 8002 的 `config.sentence_tokenizer/scene`；自定义时长、语速和场景字数不会被 FastAPI 静默忽略，字幕选项不发送给服务。
- [x] 每个场景独立生成 8-15 字目标的字幕块；字幕不跨场景，旧项目缺少字幕块时可在 compose 阶段兼容生成。
- [x] 分页字幕时间轴以 ffprobe 真实 TTS 时长生成，区间连续不重叠，语速变化时等比例缩放，最后一页精确结束。
- [x] 缺失音频时长不会被固定截断；短片段转场会自动收敛或降级。
- [x] 输出文件必须非空并通过 ffmpeg 解码校验。
- [x] 图片/音频/BGM 输入格式、大小、路径和总时长受控；成片不超过 10 分钟。
- [x] 编排完成自动进入结果页；完成项目、完整旁白和分段媒体按用户持久化，最多保留 100 项。
- [x] 分段编辑、排序、删除、替换旁白、图片/视频重试和重新合成有项目服务与 UI 回归测试。
- [x] ZIP 导出不把全部视频读入内存；真实裁剪使用 ffmpeg，并可在 UI 中选择和预览区间。
- [x] 分段持久化使用受信任的段位序号命名，即使上游 `segment.index` 重复也不会覆盖图片、旁白或分段视频；原始索引仅作为元数据保留。
- [x] 本地播放、复制路径、打开目录和 ZIP 源文件只接受受控 Story2Video 临时区或项目目录；外部保存目录只能由主进程原生保存对话框明确授权。
- [x] 历史内容在 `contentType=history` 时经过领域增强，富化提示词再进入批量 prompt-engine 优化；完成项目保留 `contentType` 选项。
- [x] 已选择图片 Provider 时，`dall-e`/Imagen 参数合同有回归测试；ComfyUI 因缺完整输出协议在 S2V 主链 fail-closed。
- [x] 开发环境真实 `PipelineEngine` 已调用 8002/8013，依次完成六阶段并通过 ffmpeg 解码；默认图片/旁白为明确标记的占位图/静音降级，发布按配置跳过。
- [ ] 目标安装环境的 8002/8013 sidecar、真实图片/TTS Provider 和真实多平台发布仍需单独验收。
- [ ] 音色克隆、旧会员配额、云分享和跨设备历史仍需外部能力或产品设计；被排除的五种旧模式不计入缺口。

### 独立 Remotion 快速路径验收（历史设计范围）
- [x] Composition 注册、参数校验和渲染 IPC 已接入。
- [ ] 每个 Composition 的真实渲染包验收不作为 `story2video-compose` 门禁。

---

## 七、排除项

- ❌ 不改动现有发布流程
- ❌ 不修改 OpenMontage 源码（直接复用或引用）
- ❌ 不引入 TypeScript（Multi-Publish 用纯 JS）
- ❌ 不引入外部视频编辑时间轴 UI（保持简洁参数化）
- ❌ 不引入在线协作功能
- ❌ 不引入视频存储/CDN 方案（用户本地管理）

---

## 八、风险评估

| 风险 | 影响 | 概率 | 应对 |
|------|------|------|------|
| Node.js 版本兼容 | 渲染失败 | 中 | 版本检测 + 明确最低要求 |
| 用户本地 GPU 不足 | AI 渲染慢 | 高 | 云端 API 备选 + 进度提示 |
| Remotion API 变更 | 渲染崩溃 | 低 | 锁定版本号 |
| OpenMontage Python 工具依赖复杂 | 环境配置困难 | 中 | 自动化懒加载 + 错误引导 |
| AI 服务 API 变更/停服 | 特定功能不可用 | 中 | 多提供商备选 + 降级提示 |
