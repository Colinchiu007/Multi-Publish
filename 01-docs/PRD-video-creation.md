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
         ├── CreateView.vue（流水线选择、图片轮播全自动编排〔通用 checkpoint 保留〕、历史入口）
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

### 1.6 近期迭代修订记录（2026-08-07 / 08）

> 本节汇总最近多轮针对【视频创作】-【图片轮播】的稳定性、体验与交付修复。
> 详细合同见 `01-docs/PRD.md` 7.1.12-7.1.15 与历史/后台运行章节；本模块 PRD 与总 PRD 以总 PRD 为准。

| 日期 | 范围 | 核心内容 | 主文档 |
|------|------|----------|--------|
| 2026-08-07 | 模型服务异常检测 | ProviderAnomalyBus（慢响应 llm/tts/audio 30s、image 60s、video 120s；超时/网络错误）→ `pipeline:getRunContext` 下发 `providerWarnings` → 前端非阻塞横幅；`callAdapter` 有界超时（视频 10min/其余 2min）；pipeline-engine 阶段/运行执行日志；提示词优化进度前置 `optimize_progress`。PR #397 | PRD 7.1.12 |
| 2026-08-08 | 提示与反馈规范 | 弹窗标题统一「提示」/「Notice」（去掉「{流水线名} 提示」）；选项保存 toast 改操作栏上方绝对定位（不挤占启动按钮）；媒体校验细分（格式/大小/不可读）+ 文件要求常驻提示（i18n）。PR #398 | PRD 7.1.13 |
| 2026-08-08 | 失败任务历史 | `RunStateStore.listFailed()` + `getHistory()` 合并持久化失败快照（重启后仍显示）；失败状态文案「生成失败」。PR #399 | PRD 历史章节 |
| 2026-08-08 | 视频预览修复 | 媒体服务 Content-Type 补齐图片类型（分段图片显示）；下载统一走主进程 `story2video:save-as`（系统保存对话框）。PR #400 | PRD 7.1.14 |
| 2026-08-08 | MiniMax 异步 T2A | `speech-2.8-*` 异步模型改走 `/t2a_async_v2` → 轮询 → 下载（修复生成图片与旁白阶段整段失败）；资源进度前置 `assets_progress={0/N,0/M}`。PR #402 | PRD 7.1.15 |
| 2026-08-08 | 场景时长归一（其他会话） | 图片动效归一化到场景时长、移除单图轮播选项、UTF-8 manifest。PR #396 | PLAN-STORY2VIDEO-SCENE-DURATION-2026-08-08.md |

**待真实验收项**（需真实 provider 账号/API，见 `E2E-PENDING.md`）：MiniMax 异步 T2A 成片、分段图片/下载交互、失败任务历史展示、provider 异常横幅。

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
| **专业创作者** | 自定义场景/时长/叠层、选择模板预设和结果编辑；图片轮播仍固定自动执行 | "像 AE 一样精确" |

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
| `text` 文案成片（外显“图片轮播 / Image Carousel”） | 标准模式 | 分句 → 领域增强（可选）→ prompt-engine → 图片/TTS → ffmpeg |
| `image/remix/gallery/audio/batch` | 排除 | 不属于 `story2video-compose`；普通视频流水线和结果页编辑能力不因此删除 |
| 单图/单段重试 | 已实现 | 项目结果页可重生目标图片并重新渲染单段视频，也可仅重渲染视频；失败会回滚旧媒体并清理本次临时产物 |
| 本地结果交付 | 已实现 | 安全本地播放、下载、复制路径、打开目录、流式 ZIP |
| 合成音频下载 | 已实现 | 完整旁白轨持久化到项目目录并可单独下载；ZIP 同时包含成片、旁白和分段媒体 |
| 本地历史恢复 | 已实现 | 项目按用户隔离存储并限制为最近 100 项；可筛选、打开和删除，重启后仍可恢复完成项目 |
| 成片裁剪 | 已实现 | 结果页选择起止时间、预览区间并调用真实 ffmpeg 裁剪；输出必须是可读媒体文件 |
| 云端历史/分享链接 | 未实现 | 本地 file URL、复制路径和打开目录不是可对外访问的分享链接；失败运行也不支持云端断点续作 |
| 音色克隆/外部 Provider | 部分实现 | 常规 provider 的配置、凭据映射和 adapter 调用已接入；音色目录/偏好与克隆能力须按 provider/model 单独实现和验收，不能以本地静音降级冒充 |
| 会员/视频配额 | 外部产品边界 | 旧项目依赖独立 orchestrator 的 membership/quota；当前仅有通用 entitlement 基础，S2V 未按旧套餐扣减视频配额 |

### 3.1.2 Text 参数合同

| 参数组 | 兼容字段与默认值 | 六阶段映射 |
|--------|------------------|------------|
| 基础 | `mode=text`、`prompt` 必填、`size=720x1280`、`seconds=8` | 创建运行前校验；`size` 映射专属输出，`seconds` 保留为兼容目标时长 |
| 分句 | `language=auto`、`mode=balanced`、`maxSentenceLength=200`、`targetSeconds=6`、`speechRate=1`、`minWords=10`、`maxWords=50` | `split` stage options；发送 8002 前映射到 `SplitRequest.config.sentence_tokenizer/scene`，不得作为会被忽略的顶层扩展字段 |
| 提示词 | `platform=generic`、`style=realistic`、`creativeLevel=5`（1-10，运营受控默认）、`maxLength=null`（启用时 50-2000）、`negativePrompt<=500`、`numCandidates=1`（1-5）、`autoDetectStyle=true`、`context=''` | `optimize` stage options，字段转换为 prompt-engine snake_case；空 `maxLength/context` 不发送，文本上下文转换为 `{ synopsis }`，对象上下文按 JSON 字典透传；图片风格不参与提示词风格回退 |
| 图片 | `style=cinematic`、`effect=zoom-in`、Provider/模型可选 | `generate_assets` 与 `compose` |
| 旁白 | provider/model 绑定的 `voiceId`、`speed=1`、`volume=1`、`pitch=0`（运营受控默认）、`emotion=default` | `generate_assets` 与 `compose`；凭据仍由加密 Provider 管理器持有 |
| 字幕 | `enabled=false`、Noto Sans SC 字体栈、`size=size3`、`style=style1` | `compose`，兼容字号映射后交给 ffmpeg |
| BGM | `enabled=false`、`volume=5`（兼容范围 0-10） | 启用且有受控路径时转换为 ffmpeg `0-1` 音量 |
| 版本/效果 | `generateBase=true`、`generateMerged=true`、`transition=fade` | 至少选择一个版本；场景时长跟随旁白音频，音频时长不可探测时回退默认 6 秒 |
| 输出/发布 | 独立分辨率、FPS、格式；平台、标题、描述、标签、封面可选 | `compose` 与 `publish`，未启用发布时明确 `skipped` |

所有运行参数必须是纯 JSON；归一化器只接受白名单字段并在创建 run 之前拒绝非法值。API Key、Access Token 和 Provider Secret 不得写入运行参数、项目历史或结果清单。

### 3.1.5 图片轮播全自动与多语言显示（P1）

以下是本轮任务的产品与验收合同，**不是**外部供应商能力、打包验证或 PR 已成功交付的声明；相应状态必须以实际
provider 验收、测试和发布证据为准。

`story2video-compose` 是历史、IPC、项目清单和编排使用的稳定机器 ID，**不得改名**。它的产品外显名称必须从 locale
资源读取：默认中文为“图片轮播”，英文为“Image Carousel”。所有已注册流水线的名称、描述、类别、阶段和状态都必须使用同一套
locale key；未知内部 ID 只能安全回退为原始 ID，不能以 slug 标题化伪造英文。

| 需求 | 合同 | 验收 |
|------|------|------|
| 默认语言 | 默认 `zh`，缺失 key 回退 `en`；切换语言后卡片、详情、历史和阶段清单同步更新 | 中英文渲染测试覆盖所有 pipeline registry ID 与六个 Story2Video 阶段 |
| 启动动作 | 创作者确认文案与参数后，按钮统一显示“启动流水线”；Story2Video 固定提交 `autoAdvance=true` 与 `checkpointPolicy='none'` | 从 `split` 连续执行到 `completed`、`failed` 或 `needs_user_input`，不得在 optimize/generate_assets/compose/publish 因默认 checkpoint 暂停 |
| 运行反馈 | 图片轮播只使用“文案拆分、内容增强、画面提示词优化、生成图片与旁白、合成轮播视频、发布（可选）”的条目式阶段清单；显示当前项、完成、跳过、失败或需要处理，**不显示 S2V 百分比进度** | pipeline snapshot 顶层的 `stages` 能准确映射 `completed/running/pending/skipped/failed/needs_user_input`，错误保留可读摘要和取消入口 |
| 无人工检查点 | 图片轮播不暴露 guided/manual checkpoint、继续或推进操作；其他流水线的通用编排能力不因此删除 | 禁止只隐藏按钮却仍让后端因 `checkpointRequired` 暂停 |
| 内容政策耗尽 | `needs_user_input` 是不可在原 run 上继续的用户输入状态，不是人工 checkpoint；用户修改文案后必须取消旧运行并新建运行 | 无 resume/advance 路径、无占位图、无 `allowPartialAssets` 静默成功 |
| 受控默认 | 分句语言默认“自动识别”；音调、并发数和创意强度从图片轮播表单隐藏，只由版本化、可审计、可回滚的受控默认值决定 | 表单不发送用户随意填写的上述工程参数；无有效远程配置时使用本地已测试安全默认值 |

“图片风格”和“提示词风格”不得合并：前者用于图片供应商的最终视觉审美，后者用于提示词优化器的文本表达、组织和指令策略。
两项必须同时保留并有简短差异说明；不得因枚举名称相似而把其中一项作为另一项的回退值。

### 3.1.6 TTS 音色目录、个人音色与偏好（P1/P2）

创作端不再让用户任意输入“音色 ID”。用户先选择已启用的 TTS provider 与模型，再从与该组合匹配的音色目录选择。
目录、能力快照和选择偏好都必须存到**当前用户作用域**的本地 SQLite settings；新建运行恢复“用户 + provider + model”的
合法默认选择，历史项目只读取自己的版本化运行快照，**不得**被上次全局偏好覆盖。

#### 目录、状态、刷新和回退合同

| 数据/状态 | 约束 |
|------|------|
| `providerId` / `modelId` / `voiceId` | 三元组唯一；均须与已启用 provider、模型及能力版本匹配 |
| 内置目录与 adapter 目录 | 优先调用具备能力且已认证的 `ModelProviderManager.callAdapter(providerId, 'listVoices')`；静态内置音色也须规范化入库并带 catalog/version 来源 |
| SQLite 缓存 | 保存非敏感元数据、catalog/capability 版本和 `syncedAt`；有效缓存不重复请求 provider，显式刷新或失效才重新同步 |
| `catalogStatus` | 仅可为 `ready`、`cached`、`refreshing`、`stale`、`unavailable` 或 `unsupported`，并向用户说明当前来源与限制 |
| 刷新失败回退 | 仅可使用仍与 provider/model/capability 匹配的最后一次成功缓存或静态内置目录，并明确为 `stale`/`cached`；没有合法回退时禁用选择并显示错误，禁止伪造列表或接受任意 ID |
| 默认选择 | 每位用户、每个 provider/model 最多一个默认；音色删除、失效或模型不匹配时清除，选择 provider 默认项或要求用户重新选择 |
| 持久化禁止项 | 不得保存 API Key、Bearer token、原始 provider 错误体、原始 prompt、音频字节、renderer 文件路径或 data URL |

#### Provider 能力分层与个人音色

| 能力类型 | 用户体验 | 约束 |
|------|------|------|
| 内置/可列举音色 | provider/model 选择后显示缓存目录；支持时可显式刷新 | 只调用该 adapter 已实现、已认证且经能力注册的 `listVoices`；失败遵循目录回退合同 |
| ElevenLabs 用户克隆 | 仅在 capability 数据和专用 adapter 合同均验证后显示“新增克隆音色”；用户可新增、删除、设为默认 | 只有用户明确授权且远端 `cloneVoice` 成功后，可信主进程才把验证后的样本 `Buffer` 写入 owner-scoped 私有 `userData/voice-clone-samples`；SQLite registry 只保存受限相对目录和 `sampleCount` 等最小元数据，不保存源路径、文件名或音频字节。格式、大小、时长、模型、端点和删除语义由该 provider/model 的版本化 capability 数据驱动，不能统一猜测 |
| Doubao provider personal slot | UI 明确提示用户先到供应商官方控制台创建/管理音色，再点“刷新音色目录”；只有存在官方 API 证据和已验证的 `listVoices` adapter 时才显示并允许选择返回项 | 当前配置和 adapter 的已注册/已验证 TTS 调用合同**不证明**个人槽位已同步到本地；本任务不创建、本地复制或伪造槽位。证据或 adapter 缺失时显示 `unsupported`/`unavailable`，不显示假列表 |
| 不支持克隆 | 仅可选择内置/本地模型音色，并说明不支持个人音色复制 | 不出现上传入口，不把用户文件伪装为音色 |

新增、删除、默认切换和目录选择都必须以当前用户、provider/model 能力和活动运行引用为边界。克隆样本受控持久化仅发生在
`consent=true`、远端 `cloneVoice` 成功和可信主进程完成样本校验之后：目录必须是
`userData/voice-clone-samples/<owner-hash>/<storage-id>`，registry 的 `sampleStorage` 只允许
`relativeDir` 与 `sampleCount`，不得加入源路径、源文件名、绝对路径、data URL 或样本字节。删除按
`active → pending → remote_deleted → 本地清理 → 移除 registry` 推进；本地清理失败时保留 `remote_deleted` 供重试，且重试只做本地清理，
不得重复删除远端音色。删除仍需记录最小化的审计结果并处理活动运行引用；clone 元数据与选择持久化不构成在授权范围外保存样本的授权。

### 3.1.7 图片内容拒绝恢复（P1）

图片 provider 的内容政策拒绝不应使整批任务无解释失败，也不得以占位图伪装为真实生成。系统**仅**对可识别的内容拒绝执行受控恢复：
结构化 `CONTENT_POLICY` 代码，或与该 provider 明确安全/政策字段对应的严格允许信号。认证、限流、网络、超时、非法配置、空响应和未知
4xx/5xx 一律不进入内容重写循环。

1. 每个场景独立进行，最多 **5 次总图片生成尝试**（首次加最多 4 次安全化重写）；并发场景之间不得共享计数或 prompt。
2. 重写器仅消除可能的暴力、性化、仇恨、违法、有害或可识别个人细节，不扩大主题，并保留安全的主题、时代、动作和构图；内容信号不明确或重写失败时立即停止自动尝试。
3. 每次尝试只持久化场景序号、尝试序号、结果类别、provider/model、提示词版本哈希和非敏感安全审计摘要；UI 与持久化记录都不得展示原始 prompt、密钥或完整 provider 错误体。
4. 第 5 次仍被明确拒绝时，阶段状态为 `needs_user_input`，显示“可能存在内容风险，请修改文案后重新启动”的友好建议。用户必须取消旧 run，以修改后的文案创建新 run；不得 `resume`/`advance` 原 run，不得生成 ffmpeg 占位图，`allowPartialAssets` 也不得把它静默视为成功。

### 3.1.8 创作端简化、运营配置与需求来源边界（P1）

创作端默认只暴露用户有意义的选择。音调、并发数和创意强度从默认表单隐藏，执行时使用版本化、受控默认值；分句语言默认“自动识别”。
这些值允许由未来运营配置覆盖，但来源必须可审计、可回滚，并在无法取得有效运营配置时 fail closed 到本地经过测试的安全默认值。

独立运营后台位于 `D:\Data\projects\ops-center`。截至 2026-08-03，未确认 Multi-Publish 与该项目之间已存在可用的
运行时配置分发 API、鉴权或回滚合同；本任务**不接入** OpsCenter，产品、验证和 PR 状态均不得表述为已联通或已交付。
后续必须在独立 OpsCenter 任务中定义版本、授权、分发、回滚和端到端验收后才能接入。

本任务的近期对话审计只记录到 **1 条**包含实质需求的用户消息及 **2 条**图像附件标记；不存在可如实归档为 20 条的用户需求。
用户清单中的第 11 项为空，保持 `TBD`；没有明确文本前，不据此新增功能、数据收集或外部调用。
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

### 3.1.9 场景时长与图片动效设计合同（2026-08-08 补充）

#### 分镜目标时长（splitTargetSeconds）语义

- **用途**：文本→分镜切分的规划目标，**不直接决定**成片每场景时长。
- **目标字数公式**：`每分镜目标字数 = splitTargetSeconds × baseWordsPerSecond(3.3) × speechRate(1)`，再夹在
  `[minWords=10, maxWords=50]` 之间；分镜数量 ≈ 文案总字数 ÷ 每分镜目标字数。
- **取值建议**：默认 6 秒（中文实际产出约 4~5 秒旁白）；推荐 4~8 秒；低于 3 秒会被 minWords 打断、
  约 15 秒触达 maxWords=50 封顶后不再增长（10s×3.3×1=33 字，封顶约 15.2s）。
- **与 TTS 的关系**：它是 TTS 时长的**预估器而非控制器**。TTS 实际时长由 Provider、音色、语速、语言共同决定，
  与预估值存在偏差；成片以 ffprobe 真实音频时长为准。

#### 场景实际时长与 defaultSceneDuration

- 每个场景成片时长 = ffprobe 探测的**真实旁白音频时长**（`-shortest` 跟随音频），不承诺强制截断旁白。
- `defaultSceneDuration` 是内部默认 6 秒（UI 不暴露，可被 `params.defaultSceneDuration` 等运行参数覆盖），
  仅在“音频时长不可探测”时作为字幕时间轴与动效归一化的回退（best-effort，不强制 `-t` 对齐以免截断旁白）。
- `perImageDuration`（单画面时长/无旁白场景时长）已随“无旁白/纯图片轮播模式”下线而从
  renderer、normalizer、模板库与 YAML 彻底移除；旧项目历史配置中的该字段被兼容忽略。

#### 图片动效合同（归一化）

- zoompan 必须 `d=总帧数（时长×帧率）`：`d=1` 且输入为单帧静态图时 zoom 状态不累积，动效完全不可见（关键修复）。
- 动效进度按**场景有效时长**归一化：`effectDuration = audioDuration || reportedDuration || defaultSceneDuration`，
  `T = round(effectDuration × fps)`，进度表达式 `min(1, on/T)`；效果是每个场景动效在末帧恰好完成——
  短场景不再“动效没做完被切走”，长场景不再“动效提前定格”。
- zoompan 亚像素采样会造成画面跳动：输入先上采样到 2× 工作分辨率，在 2× 画布执行 zoompan 后再下采样回目标分辨率。

#### 场景时长模式（三层模型，已确认 2026-08-08）

**决策确认**：D1 双视图 + 默认时长视图（底层统一“每分镜目标字数”主控）；D2 最短场景时长 N=6；D3 开关默认关闭。

**现状**：跟随旁白（动态时长，场景长短随 TTS 实际音频）。「分镜目标时长」只是“每分镜字数”的间接换算
旋钮（`字数 = 秒 × baseWordsPerSecond × speechRate`），在有旁白时**不直接控制成片时长**，存在误导。

**三层模型（已实施，Batch 1-4，2026-08-08）**：

| 层 | 旋钮 | 语义 |
|----|------|------|
| ① 分镜粒度（split） | **每分镜目标字数**（`targetCharsPerScene` 主控，默认 20）；UI 提供「目标时长/目标字数」双视图，时长视图按 `baseWordsPerSecond × voice.speed` 反推字数并标注“估算” | 控制旁白内容密度与分镜数量 |
| ② 实际时长（compose） | 无旋钮：ffprobe 真实 TTS 音频为权威，不截断 | 成片真实时长 |
| ③ 节奏下限（compose） | **最短场景时长** `max(音频实际时长, N)` 静音补齐（UI 开关，默认关闭） | 唯一真正控制“展示时长”的旋钮 |

- **已实现（Batch 4）**：「分镜目标时长（秒）」误导性独立旋钮下线，改为**分镜粒度双视图**——
  时长视图编辑时由程序按 `baseWordsPerSecond(3.3) × voice.speed` 反推 `targetCharsPerScene` 并明示“估算，实际以旁白音频为准”；
  字数视图直接主控；两者换算 clamp 到 `[minWords, maxWords] ∩ [1,200]`，与 normalizer 幂等反推一致。
- **已实现（Batch 4）**：「启用最短场景时长」开关（默认关闭，即 `follow-audio`）+ N 输入（默认 6，1..60）；
  开启后提交 `sceneDurationMode='min-duration'` + `minSceneDuration=N`，短旁白场景以静音补齐。
- **保留并新增**「最短场景时长」作为节奏下限；补齐静音时，字幕时间轴、动效归一化、转场统一按
  `effectiveDuration = max(音频实际时长, N)` 计算，保证观感一致（Batch 3 已落地 compose 消费）。
- 已排除：**纯固定时长**（每个场景固定 N 秒）——会导致截断旁白，违反“不承诺强制截断旁白”合同。
- **已实现（Batch 5a）**：语言感知基准语速表（zh 4.5 字/s、en 2.8 词/s、其余含 auto 回退 3.3）——
  UI 估算与提交、normalizer 缺省值同源（renderer/主进程双副本 + 合同测试锁定一致）；
  时长↔字数换算按 `语言基准 × voice.speed` 进行（speechRate 单一来源延续）。
- **已实现（Batch 5a）**：TTS 时长样本采集点——compose 每场景记录真实旁白音频时长（`audioDuration`，
  与补齐后的视频片段 `duration` 分离），流水线 compose 成功后 best-effort 写入本地
  `story2video.ttsSamples.v1`（FIFO ≤500，样本含 language/provider/voiceId/speed/chars/durationSeconds，不存原文），
  为 5b 自适应校准提供数据源。
- 待后续（Batch 5b，P1）：音色系数表 + 真实 TTS 样本自适应校准（滚动修正）+ 运营后台实时预估（分镜数/时长区间/成本）。
  ⚠️ **en 单位口径（claude review W1，5b 必做）**：表值 en 按「2.8 词/s」设计，但实现链（targetCharsPerScene/本地切分/样本 chars）均按字符计——
  英文估算系统性偏小约 5×。5b 自适应校准必须显式处理 chars/words 比值（样本已存 chars + language），或届时把 en 表值改为字/s 口径。

**③ 节奏下限（compose）已实现（Batch 3，2026-08-08）**：

- 静音补齐启用条件（严格）：`sceneDurationMode === 'min-duration'` 且**真实探测到音频**（`audioDuration !== null && > 0`）
  且 `effectDuration = max(音频实际时长, N) > 音频实际时长` 时，才对该场景 `-t effectDuration` + 音频链 `apad` 静音 + 去掉 `-shortest`。
- **探测失败（audioDuration=null）一律走 follow-audio `-shortest` 路径**：不新增、不使用补齐 `-t`/`apad`，不保证节奏下限
  （best-effort；否则会把未知长度旁白硬截断到 N 秒，违反“不承诺强制截断旁白”合同——双模型审查 C1 要求）。
  注意：探测失败且场景携带上报 `duration` 时，沿用既有「`-t reportedDuration` + `-shortest`」上限语义（Batch 3 未改动），
  即补齐 `-t` 绝不会启用，但上报元数据超短时仍可能按上报值裁剪（旧语义，非本次引入）。
- 补齐语义统一：字幕时间轴末页停留到 `effectDuration`、动效归一化按 `effectDuration`、成片时长预检
  （`effectiveRequestedDuration`，上限 600s）计入补齐值，三者与场景循环共用同一 base 公式
  （`probed || reportedDuration || defaultSceneDuration`）；`renderSegment`（结果页单段重试）与 compose 同守卫。
- 补齐段动效帧数 `d = Math.ceil(effectDuration × fps)`（视频轨为 binding 流，向上取整避免尾部缺帧）；
  follow-audio 保持 `Math.round` 与历史一致。
- 旁白导出（完整 narration 音频）始终按原始音频拼接、**不补齐**；`data.duration`（成片）≥ `data.audioPath` 时长为正常现象。
- 行为副作用（预期）：min-duration 使片段变长 → 原本因“片段过短”被禁用的 xfade 转场会被启用；
  补齐静音吸收 acrossfade/amix 的过渡衰减，BGM 不再吞旁白尾音（利好，见 learnings）。

**进一步优化方向（候选，需逐项评估）**：
- voice-aware 估算表 + 真实 TTS 样本回填的**自适应校准**（“字数→实际时长”系数随音色滚动修正）；
- `voice.speed` 与 `split.speechRate` **单一来源联动**（切分估算与实际 TTS 语速一致，避免脱节）；
- 运营后台**实时预估**：文案总字数 → 预估分镜数 → 预估成片时长区间 + 预估成本（图片生成为主要成本）；
- 最短场景时长与 BGM：补齐静音段有 BGM 时自然填充，无 BGM 时接受静音。

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
> 历史基线中的外部产品缺口包括音色克隆、旧 orchestrator 会员配额，以及云历史/云分享。音色目录、克隆和个人槽位的本轮合同不构成已交付声明；已接入的 Provider 仍需在真实
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
- [x] 旁白有可探测音频时长时以音频时长决定场景时长；`defaultSceneDuration`（默认 6 秒，UI 不暴露）只作为音频时长不可探测时的回退，不承诺强制截断旁白；“无旁白场景时长/单画面时长（perImageDuration）”已随无旁白纯图片轮播模式下线。
- [x] 结果页本地视频和旁白预览通过仅绑定 127.0.0.1 的短期令牌媒体服务提供，不向 renderer 暴露绝对路径；CSP 仅允许该回环来源的媒体请求。
- [x] 图片动效、转场、字幕、BGM、水印、分辨率/FPS 和 MP4/WebM 输出有自动化合同测试与真实 ffmpeg 验证。
- [x] 图片动效按场景有效时长归一化：zoompan `d=总帧数` + 进度 `min(1, on/T)`，短场景动效不被切走、长场景不提前定格；回归覆盖字符串断言与（可选）真实 ffmpeg 帧级验证；`renderSegment` 上报时长与 compose 一致收敛到 0.1..3600。
- [x] `perImageDuration`（单画面时长/无旁白场景时长）已从 renderer/normalizer/模板库/YAML 移除；旧项目历史配置兼容忽略，`defaultSceneDuration` 保留为内部默认 6 秒回退。
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
- [x] 开发环境真实 `PipelineEngine` 已调用 8002/8013，依次完成六阶段并通过 ffmpeg 解码；测试/开发 fixture 的明确标记替代物不构成生产成功证据，尤其不得把明确 Content Policy 耗尽、认证、限流或网络失败改写为占位图/静音成功；发布按配置跳过。
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

## 图片轮播合同补充（2026-08-04）

- 稳定内部流水线 ID 保持 `story2video-compose`；仅通过 i18n 显示中文“图片轮播”和英文“Image Carousel”。
- 提交后固定全自动连续执行六阶段，并以阶段清单反馈状态；每个场景的图片内容政策拒绝最多重试 5 次，耗尽进入 `needs_user_input`，不得用占位图伪装成功。
- 分句语言默认 `auto`；音调、并发数、创意强度采用运营可审计的受控默认值。图片风格与提示词风格是两个独立语义字段，不得合并。
- OpsCenter（`D:\Data\projects\ops-center`）当前没有已确认租户/音色同步 API，本任务不接入也不写入；未来跨仓库合同须另行定义租户边界、版本、鉴权、失效、回滚和审计，不能臆造 endpoint/字段。
- Doubao 不在桌面端放置高权限 secret；后端 connector 交付前不显示伪造个人音色列表。
- 用户清单 item 11 内容为空且最近 20 轮记录不可重建，属于 TBD/审计限制；UE item 15 已获确认并进入实现，不代表真实 provider 或打包交付已完成。

- **用户音色样本归属**：上传、保存、删除、设默认及 owner-scoped userData/SQLite 元数据均属于桌面端前台用户功能；不得移交或写入 OpsCenter。OpsCenter 仅承载音调、并发数、创意强度等运营受控默认值，以及未来后台高权限凭据/目录同步，绝不保存或管理用户音频样本。

## 图片轮播 UE 实施与空白页错误边界（2026-08-05）

### 已确认的前端方案

story2video-compose 的创作配置使用五个可折叠区：基础、外观、声音、高级、发布；基础区默认展开，其余按需展开。音调、并发数、创意强度仍作为受控默认值发送但不作为用户输入展示，分句语言默认 auto。图片风格与提示词风格保留为两个独立字段，并在界面分别解释视觉输出与提示词组织的职责。

运行反馈统一为六项阶段清单（文案拆分、内容增强、画面提示词优化、生成图片与旁白、合成轮播视频、发布），展示阶段状态与摘要，不显示 Story2Video 百分比。启动按钮统一显示“启动流水线”；英文 locale 对应 “Start pipeline”。

### 身份与权益错误边界（2026-08-05）

图片轮播启动调用受保护的 `pipeline:startOrchestrated` IPC。未登录、登录会话失效或当前账号没有流水线权益时，主进程返回 `AUTH_ERROR`（桌面错误码 `-3`），renderer 必须显示稳定的 `story2video.access_denied` 本地化提示，明确要求用户登录并确认账号权益；不得把该状态伪装成普通生成失败，也不得通过开发变量绕过授权。权限错误仍应停止轮询、保留阶段清单的失败状态，并允许用户登录后重新提交。

本地调试可通过 `ELECTRON_USER_DATA_DIR` 复用仓库外固定 profile；profile 目录存在不等于身份状态有效，启动后必须以 `identity:get-state` 的 `authenticated`/`offline_authenticated` 结果为准。远程部署使用独立 userData，部署或交付前清理本地调试 profile，禁止将 Cookie、Local Storage、SQLite、DPAPI 凭据纳入版本库。

### 路由错误边界

懒加载组件（特别是 /create）失败时，router 通过共享响应式状态记录路径、友好错误和调试摘要。应用根布局优先渲染 RouteLoadError，提供“重试”和“刷新应用”，保证初始导航失败发生在 App 挂载前也不会出现裸白屏。错误仍写入 renderer console，便于诊断；正常加载路径不改变 CreateView 行为。

### 验收状态

本地 Vue build、路由状态回归和 Story2Video UI 合同测试属于可自动验证范围。真实 TTS provider 目录/个人槽位/用户音色克隆上传及图片敏感词降级必须在目标 provider 账号、网络和配额齐全时单独验收，不能以本地 mock、CI 或文档替代，状态保持 PENDING_EXTERNAL。
