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
| 提示词优化 | 已接入（外部 sidecar；本地真实服务已验收） | **图片**：Multi-Publish 通过 `PromptBridge` 调用 `prompt-engine` 批量优化；平台/风格枚举和数值范围与其 Pydantic 合同一致，结果数量不一致会阻断。**视频（2026-08-12）**：新增 `domain=video` 领域，videogen `videogen_generate` 前批量优化、混合模式视频场景提示词改写后提交 `generateVideo`；结构化 video 字段（shot/camera/motion_intensity/scene_transition/continuity_token）；契约文件 `video-prompt-engine-contract.js` 与图片契约分文件分命名（详见 §3.1.2.2） |
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
| 2026-08-08 | 克隆音色 voice_id 合规 | `cloneVoice` 用 `buildMiniMaxCloneVoiceId` 生成合规 id（长度[8,256]/首字母英文字母）；存量非法克隆标记失效并自动回退默认音色（旁白 0/1 第一层根因）。PR #413 | PRD 7.1.16 |
| 2026-08-08 | 异步 T2A 查询层级 | 官方查询响应 `status/file_id` 在顶层、实现只读 `data.*` 致 90s 超时；轮询改为顶层与 data 双层兼容（旁白 0/1 第二层根因，真实验证 synthesize 13s 成片 20s）。PR #414 | PRD 7.1.15 |
| 2026-08-08 | 场景时长归一（其他会话） | 图片动效归一化到场景时长、移除单图轮播选项、UTF-8 manifest。PR #396 | PLAN-STORY2VIDEO-SCENE-DURATION-2026-08-08.md |
| 2026-08-09 | 视频合成子进度条 | compose 阶段子百分比进度条：引擎 `onProgress` 发射（preflight 0 → validated 3 → 逐片段 3+72·k/N → concat 87 → narration 89 → bgm 92 → webm 95 → verify 98 → done 100）；失败冻结 <100 杜绝假成功；执行器字段级 fail-closed 写入 `context.compose_progress`；前端 mini bar + 「正在合成片段 k/N · p%」/「视频合成 p%」。详见本节 3.1.10 与总 PRD 7.1.9.1 | PRD 7.1.9.1 / 3.1.10 |
| 2026-08-09 | 运行中任务持久化 + 托盘后台运行 | 运行中编排 run 阶段级落盘 running 快照（`saveRunning`）+ 退出兜底 `saveRunningState()`；`resumeOrchestration` 支持 running 快照断点续跑（内存中已运行幂等返回 `alreadyRunning`）；窗口关闭时有运行任务且托盘可用 → 隐藏到托盘后台继续（dev 图标缺失回退内嵌占位图）；历史 running 卡片新增「继续生成」按钮。详见总 PRD 7.1.21 | PRD 7.1.21 |
| 2026-08-09 | 本地克隆音色删除/设为默认 + 媒体导入反馈 | 删除本地克隆音色为本地管理语义：adapter 不支持 `deleteVoice`（如 MiniMax 官方 clone API 无删除端点）时跳过远端删除，直接清理本地 registry 记录/样本/偏好，不再误报「音色克隆服务暂时不可用」；新增 `ModelProviderManager.supportsAdapterMethod` 能力查询。克隆「设为默认」先同步下拉再保存偏好，默认克隆行显示「默认」徽标 + 高亮 + 「已设为默认」禁用态。媒体导入失败提示全部透传类别宾语（背景音乐等），新增 `MEDIA_PATH_UNRESOLVED` 细分（路径解析失败 vs 文件不可读/被占用），主进程复制文件对 Windows 占用做 ≤3 次有界重试。详见总 PRD 7.1.22 | PRD 7.1.22 |
| 2026-08-09 | 窗口关闭行为跨平台化（macOS 前瞻） | 平台决策收敛到 `services/window-close-policy.js`：darwin 关闭窗口不拦截（系统约定，进程留在 Dock、activate 重建窗口）、win32/linux 维持「运行任务+托盘可用→隐藏托盘」；托盘图标按平台回退（darwin 模板图标 setTemplateImage，其余占位图）；快照写入 POSIX rename 原子优先、Windows copy 回退。回归：window-close-policy 6 / window 51 / system-tray 28 / run-state-store 17 测试通过 | PRD 7.1.21（跨平台行） |
| 2026-08-11 | CreateView 历史记录已暂停状态支持 | CreateView.vue historyStatusLabel() 新增 paused 映射、过滤器新增「已暂停」选项、暂停环节提示、断点续跑按钮、CSS 样式。详见本节 3.1.12 | PRD 7.1.24 |
| 2026-08-11 | CreateView 历史记录组件拆分与 UI 优化 | 提取 CreateViewHistory.vue 独立组件、卡片式布局+状态色条、运行中脉冲动画、信息分层、失败原因展示、操作按钮分层、记录计数、空状态优化。详见 3.1.13 | PRD 7.1.25 |
| 2026-08-12 | 视频提示词统一走 prompt-engine video 领域 | videogen `videogen_generate` 前批量优化（数量/空项 fail-closed）、混合模式视频场景提示词改写、结构化 video 字段、契约文件 `video-prompt-engine-contract.js`（与图片契约分文件分命名）；详见 §3.1.2.2。PR #548 + prompt-engine #18 | PRD 7.1.33 |
| 2026-08-11 | CreateHistory.vue stale running 检测 | 独立历史页面 loadPipelines() 新增 stale running 检测（30 分钟阈值），与 CreateView.vue 一致。详见 3.1.14 | PRD 7.1.26 |
| 2026-08-11 | usePipelineHistory composable 提取 | 消除 CreateView/CreateHistory 历史记录逻辑重复，统一 stale 检测、轮询、辅助方法。详见 3.1.15 | PRD 7.1.27 |
| 2026-08-11 | CreateViewHistory 卡片 UI 增强 | 状态图标、运行脉冲、进度条光泽、流水线标签、状态阴影。详见 3.1.16 | PRD 7.1.28 |
| 2026-08-11 | failed 任务统一显示为已暂停 + UI 增强 | failed 状态统一转为 paused、暂停环节推导、阶段进度显示、筛选器优化、CSS 增强（左侧色边框/暂停脉冲/卡片圆角）。详见 3.1.17 | PRD 7.1.29 |
| 2026-08-11 | 视频创作模块 UI/UX 深度优化 | 视图切换胶囊化、流水线卡片悬停增强、返回按钮/详情头部卡片化、输入框聚焦效果、配置区展开动画、操作栏阴影、模式切换胶囊化、历史记录 fadeIn 动画/工具栏卡片化/状态徽章大写/时间图标、响应式断点。详见 3.1.18 | PRD 7.1.30 |
| 2026-08-11 | failed 状态保留原始值 + 暂停环节显示修正 | failed 不再统一转为 paused，保留原始状态；前端区分执行失败和已暂停；新增 historyStatusClass()；筛选器新增执行失败；失败提示显示 pausedStage；卡片 hover 增强。详见 3.1.19 | PRD 7.1.31 |
| 2026-08-10 | 历史记录已暂停状态 + UI 优化 | 后端 getHistory() 持久化 running 快照自动转为 paused 状态并记录 pausedStage（暂停环节名称）；前端历史记录流水线卡片重构：状态徽章前置、卡片左侧状态色条（running 蓝/failed 红/paused 橙/completed 绿/cancelled 灰）、运行中脉冲动画、暂停环节提示「暂停环节：xxx」、失败状态提示；openPipeline() 支持 paused 状态跳转恢复；CSS 全面优化（间距、圆角、字号、hover 效果）。详见本节 3.1.11 | PRD 7.1.23 |

**待真实验收项**（需真实 provider 账号/API，见 `E2E-PENDING.md`）：✅ MiniMax 异步 T2A 成片（2026-08-08 已通过：旁白 1/1、成片 20s）；分段图片/下载交互、失败任务历史展示、provider 异常横幅；真实克隆音色生成成片（待办 C-1，需重新克隆后验证）。

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

> **视频+图片轮播混合能力（2026-08-11 新增）**：Story2Video 支持「视频增强」模式——AI 只生成最值得动态化的场景片段，其余场景图片轮播，控制成本/额度/耗时。两种模式：`fixed`（成片前段按顺序约 20%-30% 用 AI 视频，默认 25%）与 `ai-judged`（LLM 按场景精彩度选择，总占比钳制在 20%-40% 且 ≤ maxScenes）；`off` 保持纯图片轮播零变化。流水线在 optimize 与 generate_assets 之间新增 `select_video_scenes` 阶段；视频场景片段必须显式携带 TTS 旁白音频（见 PRD §7.1.25 旁白音频合同 W10）。完整的数据校验/流程/交互/提示文字/降级策略/验收标准见 [PRD.md §7.1.25](PRD.md)。
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

### 3.1.2.1 图片提示词统一走 prompt-engine 合同（2026-08-09 落地）

> 设计（manifest / PRD）与实现长期背离：manifest 与本文档早已声明 optimize 阶段走 prompt-engine，但
> `story2video_optimize` 实现直连默认 LLM。2026-08-09 起实现与契约对齐：**所有图片提示词优化统一经
> prompt-engine（PromptBridge / 127.0.0.1:8013）完成风格检测 → 改写 → 输出校验**，不再直连默认 LLM。

#### 1) 流程（数据流）

```
split（分句）→ domain_enrich（历史内容领域增强，可选）
  → optimize（story2video_optimize）＝ 逐场景调用 prompt-engine POST /v1/optimize
       ├─ 1. 无实质内容守卫：纯数字/纯符号/过短文案直接透传原文（skipped_optimize=true），不调用服务
       ├─ 2. 请求构造：platform/style 别名归一 + 边界收敛 + auto_detect_style + context
       ├─ 3. 有界并发（默认 3）逐场景请求，瞬态错误有界重试（限流 2500ms×attempt，其他 800ms×attempt）
       ├─ 4. 输出校验 fail closed：error 优先 → 结构（422 detail/非法）→ 内容（空串/超长截断/拒绝文本）
       └─ 5. 结果写回 context.optimize（含 providerId='prompt-engine'、model_used、platform、style、
             detected_categories、candidates），断点续传 optimize_resume 与进度 optimize_progress
  → generate_assets（图片 + TTS）→ compose（ffmpeg）→ publish（可选）
```

#### 2) 数据校验（prompt-engine 请求/响应契约）

| 项 | 规则 | 边界/默认 |
|----|------|-----------|
| `prompt` | 必填非空 | ≤2000 字符（超长截断） |
| `platform` | 枚举 + 别名归一 | 7 项：midjourney / stable_diffusion / dalle / tongyi / yizhang / jimeng / generic；别名 dall-e(-2/-3)→dalle、stable-diffusion(-xl)/sdxl/stability→stable_diffusion、通义万相→tongyi、文心一格→yizhang、即梦→jimeng；非法回退 generic |
| `style` | 枚举 + 别名归一 | 14 项：realistic / cartoon / anime / oil_painting / watercolor / pixel / cyberpunk / fantasy / photography / 3d_render / minimalist / abstract / portrait / landscape；别名 cinematic→photography、3d-render→3d_render；非法回退 realistic |
| `creative_level` | 整数 1-10 | 默认 5；越界收敛 |
| `max_length` | 整数 50-2000 | 默认 300；越界收敛 |
| `num_candidates` | 整数 1-5 | 默认 1 |
| `auto_detect_style` | boolean | 默认 true；style 未指定且开启时省略 style 交由服务端检测，返回 detected_categories |
| `negative_prompt` | 字符串 | ≤500 字符，超长截断 |
| `context` | 字符串或对象 | 字符串→`{ synopsis }`；对象逐层检查敏感键（api_key/token/secret/password 等），命中即拒绝 |
| 输出 `optimized_prompt` | 非空字符串 | trim 后为空 → 阶段失败；超过 max_length → 截断并告警 |
| 输出 `error` | 优先检查 | 非空即失败（服务端配额/业务失败兜底返回原文+error，**忽略 error 会把未优化原文当成成功**） |
| 输出 `detail` | 422 形态 | FastAPI 校验拒绝返回 `{ detail: [...] }` → 阶段失败并展示 msg |
| 输出 `platform/style/model_used/key_source/detected_categories/candidates` | 元数据透传 | 保留到 optimize entry 供日志/后续 UI 展示 |

#### 3) 功能逻辑

- **统一契约**：`story2video_optimize`、通用 `OPTIMIZE`、`OPTIMIZE_BATCH` 三类图片提示词优化路径全部走 PromptBridge，共用 `prompt-engine-contract.js`（枚举/别名/请求构造/输出校验单一来源），杜绝三处漂移。
- **fail closed（服务不可用）**：prompt-engine（8013）未运行/连接失败/超时/配额错误时 optimize 阶段失败并给出可操作错误，**不静默回退默认 LLM，不把原文当优化结果**；瞬态网络错误走有界重试，业务错误（error 非空）不重试。
- **断点续传**：已完成场景结果按 index 写入 `optimize_resume`；重启复用已完成项，只优化未完成项；全部成功后清理。
- **进度上报**：阶段开始即写入 `optimize_progress = { done, total }`，前端展示「共 N 个场景，已完成 X 个」。
- **内容守卫**：纯数字/纯符号/过短文案跳过优化直接透传（避免模型编造）；prompt-engine 返回拒绝文本（cannot generate 等）且有实质内容时回退原文并标记 `optimize_note='llm_rejected_use_original'`；思考块 `<think>` 防御性剥离。
- **依赖**：PromptBridge 启动 prompt-engine（`PROMPT_DIR` 指向安装目录），bootstrap 用 allSettled 容错启动；manifest 契约要求「prompt-engine 未运行时返回明确错误」。

#### 4) 交互逻辑与显示项

| 显示项 | 位置 | 行为 |
|--------|------|------|
| 提示词风格（提示词写法） | 外观折叠区「提示词风格」下拉 | realistic/cinematic/anime/watercolor/minimalist；只控制提示词写法与组织，不替代图片风格 |
| 图片风格（视觉审美） | 外观折叠区「图片风格」下拉 | cinematic/realistic/anime/watercolor/minimalist；进入 generate_assets，不参与提示词风格回退 |
| 创意程度 | 受控默认（表单隐藏） | 版本化默认 5，1-10 |
| 负向提示词 | 高级折叠区「负向提示词」textarea | ≤500 字符，trim 后透传 negative_prompt |
| 平台（目标平台） | 受控默认（表单隐藏） | 默认 generic；后续可按图片生成服务商派生 |
| 阶段清单 | 运行页条目式阶段 | 「文案拆分 / 内容增强 / 画面提示词优化 / 生成图片与旁白 / 合成轮播视频 / 发布（可选）」 |
| optimize 进度 | 运行页阶段详情 | 「共 N 个场景，已完成 X 个」 |
| 错误提示 | 阶段失败/检查点 | 区分「prompt-engine 未运行（检查 PROMPT_DIR / 8013）」「服务返回：<error>」「请求超时」「422：<detail>」「场景 #N 优化失败：<原因>」 |

#### 5) 服务依赖与验收边界

- prompt-engine（`D:\\Data\\projects\\prompt-engine`，FastAPI / 8013）为图片提示词优化的**前置依赖**；本地已可 import 且 `.env` 已配置 LLM/各 provider key。
- 真实优化质量（LLM 改写效果、风格检测准确率、配额）属于**外部验收边界**：单元/集成测试用 mock PromptBridge / 本地 HTTP stub 覆盖契约与 fail-closed 行为，不冒充真实 8013 + provider 验收通过（见 learnings 与 quality-gates 记录）。
- `creative_level ≤ 3` 走 prompt-engine 模板直出（免 LLM key），`> 3` 需要 LLM key（未配置时服务端返回 error → fail closed）。

### 3.1.2.2 视频提示词统一走 prompt-engine video 领域合同（2026-08-12 落地）

**目标**：项目内所有 AI 视频生成（videogen 流水线、Story2Video 混合模式）的提示词统一经 prompt-engine（8013）`domain=video` 完成改写与输出校验，不再裸传 provider、不再把图片优化提示词直接当视频提示词用。

#### 1) 数据流

```text
videogen：storyboard 场景提示词 → PromptBridge.optimizeVideosBatch（domain=video）→ 数量/空项校验 → callAdapter('generateVideo')
混合模式：select_video_scenes 选中场景 → optimizeVideo 改写 → generateSceneVideo；优化失败 → 该场景回退图片轮播（不中断整线）
```

#### 2) 请求/响应契约（对齐 prompt_engine/models.py video 领域）

- **请求**：`domain=video`（缺省 image 零回归）；`platform` 视频平台枚举（sora/kling/veo/runway/wan/seedance/minimax/hunyuan/cogvideo/ltx/higgsfield/grok/agnes/generic_video）；style/creativeLevel(1-10)/maxLength(50-2000，默认 500)/numCandidates(1-5)/negativePrompt(≤500)/context（对象透传 + 敏感凭据键拦截）。
- **批量契约**：`/v1/optimize/batch` 单批上限 **20 条**（prompt-engine `BatchOptimizeRequest.max_length`，2026-08-12 由 10 上调）；服务端有界并发 8（防 LLM 并发风暴，结果顺序与请求一致）；videogen 场景数 ≤12 单批通过，>20 由调用方分块兜底（videogen CHUNK_SIZE=20）。
- **响应**：`optimized_prompt` 渲染单串（provider 直用）+ 结构化 `video` 字段（shot/camera/motion_intensity 1-10/scene_transition/continuity_token/duration_hint）；`extractOptimizedVideoPrompt` 按 error→detail→空串 fail-closed，字段越界收敛、缺失给默认。

#### 3) 集成点

- **videogen**：`videogen_generate` 前批量优化；场景 ≤20 单批（覆盖 storyboard 上限 12），>20 按 ≤20 分块并合并；结果数量与场景数不一致、含空提示词、8013 未运行或 PromptBridge 未注入 → 阶段明确失败，不静默绕过。
- **混合模式**：`optimizeVideo` 改写后再 `generateSceneVideo`；优化失败按总 PRD 7.1.x 混合语义回退图片轮播（不中断整条流水线）。

#### 4) 验收边界

- 单元/集成测试不依赖真实 8013：mock PromptBridge 覆盖请求命中 domain=video、空/error/数量不匹配失败、结构化字段收敛。
- 真实 8013 smoke 与 LLM key 为外部验收边界：本机新代码实例已验证 MiniMax-M3 返回结构化字段（shot/camera/motion_intensity/scene_transition/continuity_token）；生产 8013 已重启新分支并端到端验证。

### 3.1.4.1 历史记录加载与本地模式合同（2026-08-09 完整落地）

> 覆盖三轮修复：① 未登录历史回退设备级本地命名空间（不再抛「无法识别当前用户」）；② 失败原因映射为可操作建议
> （不再只弹笼统「请稍后再试」）；③ IPC 访问控制层放行本地只读历史通道（真实端到端定位 code:-3 根因）。
> 视频创作历史是**设备本地数据**，未登录不可用属于可用性缺陷；fail-closed 仅适用于账号/评论等跨用户数据域。

#### 1) 流程（数据流）

```
用户打开「视频创作 → 历史记录」tab
  → CreateView.loadHistory() 并行两个只读请求（Promise.allSettled + 5s 竞速超时）：
       ├─ story2video:list-projects   → Story2VideoProjectService.listProjects()（本地 SQLite 项目索引，owner 隔离）
       └─ pipeline:history            → PipelineEngine.getHistory()（本会话内存 run + 持久化失败快照，设备级）
  → 合并：运行中流水线置顶 → 已完成项目 → 终态流水线（按 projectId 去重，项目优先）
  → 未登录（localMode=true）时顶部显示「本地模式」提示条
  → 任一请求失败（code!=0 / 非数组 / 超时 / reject）：
       ├─ 收集失败 message → historyLoadFailureDetail() 按原因映射可操作建议
       └─ 弹「历史记录暂时无法加载」+ detail 建议行（不泄漏内部错误文本）
```

#### 2) 数据校验与边界

| 项 | 规则 |
|----|------|
| owner 解析 | `_ownerSubject()`：store 缺失 → fail-closed 抛「项目存储不可用」；身份解析无有效 sub（未登录）→ 回退设备级命名空间 `__legacy__`；有有效 sub → 按 sub 隔离（`user:<sha256(sub)>:` 键空间） |
| 读写透传 | `getUserSetting/setUserSetting` 显式传 owner（settings-store 第三参），legacy 键为原 key `story2video_projects_v1`，登录键带 `user:` 前缀——未登录读写真正落在本地空间，不静默丢弃 |
| localMode 标记 | `story2video:list-projects` 在 owner 为 `__legacy__` 时返回 `localMode: true`（仅用于提示条展示，不影响数据归属） |
| IPC 访问控制 | 只读历史通道 `story2video:list-projects` / `story2video:get-project` / `pipeline:history` 列入 PUBLIC_CHANNELS，未登录可调用（项目按 owner 隔离、run 历史设备级）；`story2video:delete-project` 等写/敏感通道保持 authenticated 收紧 |
| 已登录隔离 | 登录后项目在用户空间读写；未登录期间 legacy 数据不混入登录用户空间，反之亦然（不串写） |
| 存储不可用 | 保持 fail-closed：明确错误，不静默降级 |

#### 3) 功能逻辑

- **未登录可用**：身份服务启用但未登录（或未配置身份服务）时，历史读写回退 `__legacy__` 设备级命名空间，本地历史可用；已登录按 sub 隔离。
- **失败原因映射**（`historyLoadFailureDetail`，zh/en 双语、主进程中文错误也有 en 兜底）：未登录/登录过期 → 登录引导；本地存储异常 → 重启 + 磁盘检查；加载超时 → 重进历史重试 + 重启；无法识别的原因 → 返回空（不展示内部错误文本，弹窗保留通用文案）。
- **防御**：`ResultView.loadProject` 对 `get-project` code:-3 单独映射登录引导（避免未来收紧时落泛化失败）。
- **竞态**：并发 loadHistory 只保留最新请求（requestId）；进入历史 tab 必触发 loadHistory（localMode 不残留过期值）。

#### 4) 交互逻辑与显示项

| 显示项 | 位置 | 行为 |
|--------|------|------|
| 本地模式提示条 | 历史视图顶部（`data-testid="history-local-mode-banner"`） | 未登录（localMode=true）时显示；已登录/登录态变化后随下次 loadHistory 刷新 |
| 历史列表 | 历史视图 | 运行中置顶 + 项目 + 终态流水线；空时显示「暂无创作记录」 |
| 错误弹窗 | 应用内弹窗 | 标题「提示」+ 通用文案 + detail 建议行（仅当可映射原因时）+ 「知道了」按钮 |
| 空态 | 历史视图 | 「暂无创作记录」（无数据时） |

#### 5) 提示文字（zh / en）

| 场景 | 中文 | English |
|------|------|---------|
| 本地模式提示条 | 当前为本地模式，仅显示本机记录。 | Local mode — showing records on this device only. |
| 历史加载失败（通用） | 历史记录暂时无法加载，请稍后再试。 | History is unavailable right now. Please try again shortly. |
| 失败原因·未登录 | 当前未登录或登录已过期。请登录后重试；未登录时仅显示本机记录。 | You are not signed in or your session expired. Sign in to retry; local records remain available offline. |
| 失败原因·本地存储 | 本地存储异常。请重启应用后重试；若持续出现请检查本地磁盘空间与权限。 | Local storage is having issues. Restart the app to retry; if it persists, check local disk space and permissions. |
| 失败原因·超时 | 加载超时。请关闭后重新进入历史记录重试；若持续出现请重启应用。 | Loading timed out. Close and reopen the history list to retry; if it persists, restart the app. |

#### 6) 安全边界与已知边界

- 只读通道放行不扩大数据暴露：list-projects/get-project 返回面受 owner 隔离（未登录仅见 legacy 空间）；pipeline:history 为设备级 run 历史（不过滤 owner，本地数据），已注释限定。
- 边界：未登录创建的本地项目在登录后不可见（本地单用户通常持续登录或不登录），后续如需「登录后合并本地数据」另行设计；`pipeline:history` 若未来需按会话/owner 过滤，应先收紧通道再实现。

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
| ElevenLabs 用户克隆 | 仅在 capability 数据和专用 adapter 合同均验证后显示“新增克隆音色”；用户可新增、删除、设为默认 | 只有用户明确授权且远端 `cloneVoice` 成功后，可信主进程才把验证后的样本 `Buffer` 写入 owner-scoped 私有 `userData/voice-clone-samples`；SQLite registry 只保存受限相对目录和 `sampleCount` 等最小元数据，不保存源路径、文件名或音频字节。格式、大小、时长、模型、端点和删除语义由该 provider/model 的版本化 capability 数据驱动，不能统一猜测。**删除语义（2026-08-09）**：删除本地克隆音色 = 本地管理（registry 记录 + 本地样本 + 偏好清理）；仅当 adapter 支持 `deleteVoice`（如 ElevenLabs `DELETE /v1/voices/{id}`）时才先执行远端删除，不支持（如 MiniMax）时纯本地删除，不得报「服务不可用」（详见总 PRD 7.1.22）。 |
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
- **工作分辨率上限（2026-08-09）**：中间分辨率长边封顶 3840 且按比例缩放（`computeWorkResolution`）——4K 输出按 2x 原本会产生 7680×4320（8K）中间画布，内存/编码时长爆炸；封顶后 4K 输出中间仍为 3840×2160，1080p 输出中间保持 3840×2160 不变。4K 输出本身受运营开关 `videoCreation.maxOutputResolution` 控制（详见 PRD.md 7.1.20）。

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
- **已实现（Batch 5b）**：自适应校准——按「语言 / 语言+provider / 语言+provider+voiceId」维度对 5a 样本滚动求
  实际字/s ÷ 静态基准的中位数系数（≥3 样本启用，冷启动回退静态表）；**en 单位口径（claude 5a W1）由校准自然吸收**：
  校准比基于字符口径，en 样本充足后系数 ≈ 4~5，估算自动纠偏为字/s 语义。
- **已实现（Batch 5b）**：创建页实时预估行——文案输入下方展示「预估分镜数 · 旁白时长区间（±15%）· 成本约 ¥X」
  （图片单价 0.1 元/张、TTS 0.05 元/秒为本地默认常量，标注估算仅供参考；无样本时静态估算并提示「样本积累后自动校准」）。
- ⚠️ 校准消费方说明：自适应校准当前仅驱动**创建页预估显示**；实际切分仍以用户配置的 targetCharsPerScene 为准（不改变成片行为）。
- ⚠️ 已知限制（显示层）：样本按 `split.language` 配置值归档——默认 `auto` 用户的 zh/en 样本会混入 auto 桶（3.3 基准）；
  「en 系数 ≈4~5」仅在显式选择 en 语言时成立；预估行时长与成本随校准自动修正，冷启动/跨语言切换以静态估算为准并提示。

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

### 3.1.10 视频合成子进度合同（2026-08-09）

**背景**：compose 阶段此前仅显示「进行中」+ 耗时；本变更新增子百分比进度条，解决耗时占比最大的合成环节无进度可感知的问题。

**数据契约**：`context.compose_progress = { phase, percent, segmentsDone, segmentsTotal, message? }`
- 引擎 `Story2VideoComposeEngine.compose(assetManifest, options, onProgress)` 新增可选回调（兼容 `options.onProgress`，第三参优先）；发射值经 `normalizeComposeProgressUpdate` 归一化（percent 取整钳制 [0,100]、segmentsTotal ≥1 整数、segmentsDone ∈ [0,total]、phase 非空）。
- 执行器 `StageExecutor.COMPOSE` 将 `options.onProgress` 透传，回调内字段级校验（phase 已知枚举、percent 有限且 [0,100]、计数整数且范围正确）通过后写入 `run.context.compose_progress`；非法值丢弃（fail-closed）。
- renderer 经既有 3s 轮询 `pipelineGetRunContext` 读取（无新增 IPC 通道）。

**阶段权重**：preflight 0 → validated 3 → segments（k/N）3+72·k/N（k=N 精确 75）→ concat 87 → narration 89 → bgm 92（可选）→ webm 95（可选）→ verify 98 → done 100。

**进度不变式**：
1. percent 单调不降、整数 0-100；
2. `percent === 100` ⟺ 合成成功（`code === 0`）；全部失败路径冻结在最后有效值（<100），杜绝假成功；
3. `segmentsTotal` 恒等于场景数（≥1）；
4. 结构为纯原始值对象（IPC structuredClone 安全）；
5. 与 `optimize_progress`/`assets_progress` 并存互不影响；成功后 `context.compose`（结果）与 `context.compose_progress` 同时存在，结果读取仍走 `context.compose`。

**前端展示与交互**：
- compose running 且 percent 合法时，阶段条目渲染子进度条（mini bar，`data-testid="story2video-stage-compose-progress"`，宽 100%/高 4px/`--primary` 填充，0.3s 过渡）。
- 详情文案：`phase === 'segments'` 且 `segmentsTotal > 0` 时「正在合成片段 k/N · p%」（en：`Composing segment k/N · p%`）；其余「视频合成 p%」（en：`Composing p%`）；无 `compose_progress`（历史 run/旧数据/引擎早退）→ 不渲染（安全降级）。
- 文案沿用 `translateWithLocaleFallback` 内联 fallback（`story2video.composeSegments` / `story2video.composeProgress`），不写入 locale 静态文件（规避 i18n 插值陷阱）。

**边界与后续**：失败冻结（片段 ≤75 / 拼接 87 / 旁白 89 / BGM 92 / webm 95 / 校验 98）；N=1 快速 3→75→100；暂停/恢复后 compose 重跑并重发进度；并发 run 按 context 隔离；`renderSegment` 单段重试不写进度。后续演进（v1 不做）：ffmpeg `-progress pipe:1` 段内实时百分比、chunked 拼接段级 onStep 插值。详细合同见总 PRD 7.1.9.1。


### 3.1.11 历史记录已暂停状态与 UI 优化（2026-08-10）

**背景**：此前应用重启后，持久化的 running 快照在历史记录中仍显示为「运行中」，用户无法区分"真正在运行"和"因关闭应用而中断"的任务。同时历史记录列表 UI 过于紧凑，信息层次不清晰。

**一、已暂停状态（后端）**

- **触发条件**：PipelineEngine.getHistory() 从 RunStateStore 加载持久化快照时，若 snapshot.status === running，自动将返回的 status 归一化为 paused（因为应用重启后该任务不再处于运行状态）。
- **暂停环节**：同时从快照的 currentStage 索引计算 pausedStage 字段（阶段名称字符串），记录任务在哪个环节被中断（如 nimate、compose 等）。
- **数据结构**：返回的 persisted 条目新增字段 pausedStage: string | null。
- **不影响的场景**：内存中真正在运行的 run（_runs Map）保持 status: running 不变；已终态的 _history 条目保持原 status 不变；RunStateStore 中的持久化快照本身不被修改（只读投影）。

**二、前端交互与显示逻辑**

| 场景 | 状态显示 | 状态徽章颜色 | 左侧色条 | 底部提示 | 点击行为 |
|------|----------|-------------|---------|---------|---------|
| 运行中（内存中真实运行） | 运行中 | 蓝底白字 | 蓝色 | 「实时同步」 | 跳转 /create 恢复查看 |
| 已暂停（重启后中断） | 已暂停 | 橙底深棕字 | 橙色 | 「暂停环节：xxx」 | 跳转 /create 断点续跑 |
| 生成失败 | 生成失败 | 红底深红字 | 红色 | 「生成失败」 | 跳转 /create 恢复查看 |
| 已完成 | 已完成 | 绿底深绿字 | 绿色 | 无 | 跳转结果页 |
| 已取消 | 已取消 | 灰底深灰字 | 灰色 | 无 | 跳转 /create |

**三、UI 布局重构**

- 卡片结构：状态徽章移至信息区右侧（第一行），阶段标签和提示移至第二行（pipeline-card-bottom），通过分割线视觉分隔。
- 状态色条：卡片左侧 3px 色条，颜色由 `:class="effectiveStatus(p)"` 动态绑定，一眼区分状态。
- 运行中脉冲：running 状态圆点带 pulse-dot 动画（1.5s 周期透明度闪烁）。
- 阶段标签：字号从 11px 增至 12px，padding 从 2px 6px 增至 3px 8px，新增 failed（红）、paused（橙）、cancelled（灰）三种状态色。
- 容器宽度：从 960px 拓宽至 1080px，内边距从 24px 增至 24px 32px。
- 列表间距：卡片间距从 8px 增至 12px。
- hover 效果：新增 translateY(-1px) 微位移 + 加深阴影。

**四、前端核心方法**

- **effectiveStatus(p)**：前端状态归一化方法。后端返回的 status 为 paused/failed/cancelled/completed 时直接透传；当 status === 'running' 时，遍历 p.stages 数组检查是否有 stage.status === 'failed'，若存在则返回 'paused'（表示后端标记为运行中但实际已中断）。所有模板绑定（状态徽章、色条、提示文案、计数器）均调用此方法而非直接读取 p.status。
- **pausedStageOf(p)**：获取暂停环节名称。优先读取 p.pausedStage（后端快照预计算值），fallback 到遍历 stages 数组找到第一个 status === 'failed' 的 stage，返回其 name || stage 字段。用于渲染"暂停环节：xxx"提示文字。

**五、数据校验**

- pausedStage 仅在 snapshot.currentStage 为有效索引且对应 stage 存在时填充，否则为 null。
- stageLabel() 函数对 pausedStage（字符串）调用时走 shortName() 路径（截断 10 字符 + ...）。
- statusLabel() 的 paused 映射为「已暂停」。
- effectiveStatus() 的 running→paused 判定仅基于 stages 数组中是否存在 failed 状态的 stage，不依赖其他字段。
- pausedStageOf() 返回值可能为 null（无失败环节时），模板中通过 v-if 控制提示文字的显示/隐藏。

**五、openPipeline 路由**

- paused 状态与 running/failed/cancelled 同等处理：跳转 /create 页面恢复。
- 由 CreateView.vue 通过 pipelineResumeOrchestration(runId) 执行断点续跑。

**六、相关文件**

- 后端：apps/desktop/electron/services/pipeline-engine.js（getHistory 方法）
- 前端：apps/desktop/src/views/CreateHistory.vue（模板 + 脚本 + 样式）
- 测试：apps/desktop/src/views/CreateHistory.test.js 22/22 通过；pipeline-engine.test.js 37/37 通过；run-state-store.test.js 19/19 通过。vite build 通过。
### 3.1.12 CreateView 历史记录视图已暂停状态支持（2026-08-11）

**背景**：3.1.11 仅覆盖了 CreateHistory.vue（独立历史记录页面）的已暂停状态支持，但 CreateView.vue 中的「历史记录」视图（创作页内嵌的历史列表）仍缺少 paused 状态的显示、过滤和交互支持。后端 getHistory() 已返回 paused 状态数据，但前端 CreateView 无法正确展示。

**一、问题**

- historyStatusLabel() 缺少 paused 映射：后端返回 status: paused 的条目在 CreateView 历史列表中显示为原始字符串 "paused" 而非「已暂停」。
- 过滤器下拉菜单缺少「已暂停」选项：用户无法按暂停状态筛选历史记录。
- 暂停环节信息缺失：CreateView 历史列表不显示 pausedStage（暂停在哪个阶段），用户无法直观了解任务中断位置。
- 断点续跑按钮缺失：failed 状态有「从断点继续」按钮，但 paused 状态没有。

**二、修复内容**

1. historyStatusLabel()（CreateView.vue methods）：新增映射 paused: '已暂停'。完整映射：{ completed: '已完成', failed: '已暂停', cancelled: '已取消', running: '进行中', paused: '已暂停', pending: '等待中' }
2. 过滤器选项（CreateView.vue 模板）：在状态过滤下拉菜单中新增 option value="paused"「已暂停」。filteredHistory 计算属性已通过 item.status === this.historyFilter 精确匹配，无需额外修改。
3. 暂停环节提示（CreateView.vue 模板）：新增暂停环节提示 span，条件为 h.status === 'paused' && h.pausedStage。仅在 status 为 paused 且 pausedStage 非空时显示。
4. 断点续跑按钮（CreateView.vue 模板）：原逻辑 v-if="h.status === 'failed' && historyItemResumable(h)" 修改为 v-if="(h.status === 'failed' || h.status === 'paused') && historyItemResumable(h)"。paused 状态与 failed 状态共享「从断点继续」按钮逻辑。
5. CSS 样式（CreateView.vue 样式）：.history-status.paused 使用 --status-waiting-bg/text 变量；.history-paused-hint 11px 字号琥珀色文字+浅黄背景。

**三、数据流**

后端 getHistory() 将 running 快照归一化为 paused 状态并附带 pausedStage 字段 → IPC pipeline:history → CreateView.vue loadHistory() → history 数组包含 paused 条目 → filteredHistory 支持 paused 过滤 → 模板渲染 historyStatusLabel 显示「已暂停」、暂停环节提示显示阶段名称、按钮显示「从断点继续」。

**四、交互逻辑**

| 场景 | 状态显示 | 过滤选项 | 提示 | 按钮 | 点击行为 |
|------|----------|---------|------|------|---------|
| 运行中 | 进行中 | 进行中 | 返回流水线创作查看进度 | 继续生成 | resumeHistoryItem |
| 已暂停 | 已暂停 | 已暂停 | 暂停环节：xxx | 从断点继续 | resumeHistoryItem |
| 生成失败 | 生成失败 | 生成失败 | 无 | 从断点继续（可恢复时） | resumeHistoryItem |
| 已完成 | 已完成 | 已完成 | 无 | 打开 | openHistory |
| 已取消 | 已取消 | 已取消 | 无 | 无 | openHistory |

**五、显示项**

- 状态徽章：.history-status + :class="h.status" 动态样式
- 暂停环节文字：琥珀色背景 + 深琥珀色文字
- 时间戳：formatTime(h.updatedAt || h.completedAt || h.createdAt)
- 操作按钮：打开 / 删除 / 从断点继续 / 继续生成（按状态条件显示）

**六、提示文字**

| 位置 | 文字 | 条件 |
|------|------|------|
| 状态过滤下拉 | 已暂停 | 新增选项 |
| 历史条目状态 | 已暂停 | status === paused |
| 历史条目提示 | 暂停环节：{stageName} | status === paused 且 pausedStage 非空 |
| 操作按钮 | 从断点继续 | (failed 或 paused) 且 historyItemResumable |

**七、相关文件**

- 前端：apps/desktop/src/views/CreateView.vue（historyStatusLabel、过滤器、模板、CSS）
- 后端（无变更）：apps/desktop/electron/services/pipeline-engine.js（getHistory 已返回 paused 数据）
- 测试：CreateHistory.test.js 22/22 通过；views-deep2.test.js 7/7 通过；pipeline-engine.test.js 37/37 通过。


### 3.1.13 CreateView 历史记录组件拆分与 UI 优化（2026-08-11）

**背景**：CreateView.vue 原为 3575 行的巨型单文件组件，历史记录视图与流水线创作、快速渲染混杂在同一文件中。本次重构将历史记录视图提取为独立组件 CreateViewHistory.vue，并全面优化 UI。

**一、组件拆分**

1. 新建 `apps/desktop/src/views/CreateViewHistory.vue`：独立的历史记录视图组件。
2. CreateView.vue 通过 props 传入数据，通过 events 传回用户操作。
3. 历史记录 CSS 从 CreateView.vue 迁移到 CreateViewHistory.vue。
4. CreateView.vue 从 3575 行减少到 3515 行。

**二、组件 API**

| 类型 | 名称 | 说明 |
|------|------|------|
| Prop | history | 历史记录数组 |
| Prop | historyLoading | 加载状态 |
| Prop | historyFilter | 过滤状态（v-model） |
| Event | update:historyFilter | 过滤状态变更 |
| Event | open-history | 打开历史项 |
| Event | resume-history | 恢复/继续 |
| Event | delete-history | 删除 |

**三、UI 优化**

1. 卡片式布局 + 左侧状态色条（completed=绿/failed=红/running=蓝/paused=橙/cancelled=灰）
2. 运行中脉冲动画（蓝色边框呼吸效果）
3. 信息分层：标题行 → 提示行 → 阶段进度 → 底部操作
4. 失败原因截断展示（最多 60 字符）
5. 操作按钮分层：主操作（恢复，蓝色）+ 次操作（打开/删除）
6. 记录计数显示
7. 空状态图标+引导提示

**四、相关文件**

- 新增：apps/desktop/src/views/CreateViewHistory.vue
- 修改：apps/desktop/src/views/CreateView.vue（引入组件、移除内联模板和样式）
- 构建：vite build 通过，CreateView chunk 141KB
### 3.1.14 CreateHistory.vue 独立页面 stale running 检测（2026-08-11）

**背景**：3.1.12 仅在 CreateView.vue 的 loadHistory() 中添加了 stale running 检测（updatedAt 超过 30 分钟的 running 任务自动标记为 paused），但 CreateHistory.vue（独立历史记录页面 `#/create/history`）的 loadPipelines() 缺少相同的检测逻辑。用户在独立历史页面看到的仍然是"运行中"而非"已暂停"。

**一、修复内容**

1. CreateHistory.vue loadPipelines()：在数据加载成功后、schedulePipelineRefresh() 之前，新增 stale running 检测循环。
2. 检测逻辑与 CreateView.vue 完全一致：
   - 阈值：STALE_RUNNING_THRESHOLD_MS = 30 * 60 * 1000（30 分钟）
   - 判断：updatedAt 存在且 (now - updatedAt) > 阈值
   - 处理：status 从 running 改为 paused；自动推断 pausedStage（从 stages 数组找到 running 状态的阶段，或取最后一个阶段）
3. 模板已有 paused 状态支持（暂停环节提示、状态徽章、CSS 样式），无需修改模板。

**二、数据流**

pipelineHistory() IPC 返回 → loadPipelines() 加载 → stale running 检测循环（mutate status/pausedStage） → schedulePipelineRefresh() → 模板渲染。

**三、与 CreateView.vue 的一致性**

两处 stale running 检测逻辑完全相同（阈值、推断算法、字段名），确保用户无论从哪个入口查看历史记录，看到的状态一致。

**四、相关文件**

- 修改：apps/desktop/src/views/CreateHistory.vue（loadPipelines 方法）
- 测试：CreateView.test.js 129/129 通过

### 3.1.15 usePipelineHistory composable 提取（2026-08-11）

**背景**：历史记录加载、stale running 检测、轮询刷新、辅助方法（状态标签、阶段状态、时间格式化）在 CreateView.vue 和 CreateHistory.vue 中存在重复实现。提取为共享 composable 消除重复、统一行为。

**一、composable 设计**

```javascript
// apps/desktop/src/composables/usePipelineHistory.js
export function usePipelineHistory(options = {}) {
  // 响应式状态
  history, historyLoading, historyLocalMode, historyFilter, filteredHistory, story2videoResuming
  // 方法
  loadHistory(callbacks), destroy()
  // 辅助方法
  historyItemResumable(item), historyStageState(stage), historyStageLabel(stage),
  historyStageTitle(stage), formatTime(iso), truncateError(error)
}
```

**二、接口说明**

| 类型 | 名称 | 说明 |
|------|------|------|
| Ref | history | 历史记录数组（运行中置顶） |
| Ref | historyLoading | 加载状态 |
| Ref | historyLocalMode | 本地模式标记 |
| Computed | historyLocalModeText | 本地模式提示文字 |
| Ref | historyFilter | 过滤状态 |
| Computed | filteredHistory | 过滤后的历史记录 |
| Ref | story2videoResuming | 恢复中状态 |
| Method | loadHistory(callbacks) | 加载历史记录，callbacks.onError 用于弹窗 |
| Method | destroy() | 清理轮询定时器 |
| Method | historyItemResumable(item) | 判断是否可断点恢复 |
| Method | historyStageState(stage) | 阶段状态分类 |
| Method | historyStageLabel(stage) | 阶段名称 |
| Method | historyStageTitle(stage) | 阶段标题（名称+状态） |
| Method | formatTime(iso) | 时间格式化 |
| Method | truncateError(error) | 错误信息截断 |

**三、依赖**

- API：pipelineHistory(), story2videoListProjects()（来自 @/api/publisher）
- 工具：historyLoadFailureDetail()（来自 @/i18n/story2video-locale）
- 超时：HISTORY_LOAD_TIMEOUT_MS = 5000

**四、消除的重复**

| 逻辑 | CreateView.vue 原实现 | CreateHistory.vue 原实现 | composable |
|------|----------------------|------------------------|------------|
| loadHistory/loadPipelines | ~60 行 | ~20 行 | 1 个方法 |
| stale running 检测 | ~15 行 | ~15 行（本次新增） | 内置于 loadHistory |
| scheduleHistoryRefresh | ~10 行 | ~8 行 | 内置 |
| refreshRunningHistory | ~30 行 | 无 | 内置 |
| historyStageState/Label/Title | ~15 行 | ~15 行（stageTitle） | 3 个方法 |
| formatTime | ~3 行 | ~3 行 | 1 个方法 |
| truncateError | ~3 行 | 无 | 1 个方法 |

**五、相关文件**

- 新增：apps/desktop/src/composables/usePipelineHistory.js（252 行）
- 待迁移（后续 PR）：CreateView.vue 和 CreateHistory.vue 改为使用 composable

### 3.1.16 CreateViewHistory 卡片 UI 增强（2026-08-11）

**背景**：在 3.1.13 组件拆分基础上，进一步优化历史记录卡片的视觉层次和交互反馈。

**一、视觉增强**

1. **状态图标**：状态徽章前增加图标（✓已完成/✕失败/—已取消/⟳进行中/⏸已暂停/○等待中），提升可扫描性。
2. **运行中脉冲**：状态徽章 running 样式增加 status-pulse 动画（2s 周期 opacity 闪烁）。
3. **进度条光泽**：运行中阶段的进度段增加 shimmer 光泽动画（2s 周期从左到右扫过），直观表示"正在处理"。
4. **流水线标签**：卡片标题行右侧新增流水线名称标签（浅灰背景），便于区分不同流水线的任务。
5. **状态阴影**：running 状态卡片增加蓝色微阴影，paused 状态增加琥珀色微阴影，增强状态感知。

**二、交互增强**

1. **操作按钮间距**：resume/open/delete 按钮增加 gap: 4px，提升可点击区域。
2. **按钮 hover**：保持原有 hover 效果（蓝色边框+文字色），delete 按钮 hover 变红。

**三、数据校验**

- historyStatusIcon() 方法：对未知 status 返回空字符串，不会崩溃。
- 流水线标签：仅在 h.pipeline 或 h.name 存在时显示，通过 pipelineName() 翻译。
- 所有新增样式使用 CSS 变量 + 回退值，兼容亮/暗主题。

**四、相关文件**

- 修改：apps/desktop/src/views/CreateViewHistory.vue（模板 + 脚本 + 样式）
### 3.2 参数配置（Remotion 快速路径）
### 3.1.17 failed 任务统一显示为"已暂停" + 暂停环节信息（2026-08-11）

**背景**：此前 failed 状态的任务在历史记录中显示为"生成失败"，与用户期望的"已暂停"不一致。用户希望所有因失败/超时/崩溃而中断的任务统一显示为"已暂停"，并显示暂停环节信息。

**一、数据校验**

1. 状态转换：usePipelineHistory.js 的 loadHistory() 中，failed 状态的任务统一转换为 paused。
2. 暂停环节推导：若 pausedStage 字段不存在，从 stages 数组中按优先级推导：
   - 优先取 status === 'failed' 的阶段
   - 其次取最后一个 status !== 'completed' 的阶段
   - 最后取数组最后一个阶段
3. 恢复按钮判断：historyItemResumable() 同时支持 failed 和 paused 状态，内容策略类错误仍不显示恢复按钮。

**二、流程**

```
用户打开历史记录
  -> loadHistory() 并行请求 projects + pipeline runs
  -> 对每个 run.status === 'failed' 的任务：
      1. run.status = 'paused'
      2. 若无 pausedStage -> 从 stages 推导
  -> 排序：running 置顶 -> projects -> 其余
  -> 渲染 CreateViewHistory 组件
```

**三、功能逻辑**

| 场景 | 原状态 | 显示状态 | 暂停环节 | 恢复按钮 |
|------|--------|----------|----------|----------|
| 超时/崩溃导致失败 | failed | 已暂停 | 从 stages 推导 | 显示 |
| 内容策略拒绝 | failed | 已暂停 | 从 stages 推导 | 不显示 |
| 30分钟无更新的 running | running->paused | 已暂停 | 从 running 阶段推导 | 显示 |
| 正常完成 | completed | 已完成 | - | 不显示 |

**四、交互逻辑**

1. 状态筛选：筛选器仅保留全部/已完成/已取消/进行中/已暂停五个选项，移除了生成失败。
2. 暂停提示：暂停状态的卡片显示 暂停环节：{pausedStage} 提示行。
3. 阶段进度：暂停任务同样显示阶段进度条，暂停阶段使用琥珀色柔和脉冲动画。
4. 恢复操作：点击从断点继续按钮触发 resume-history 事件。

**五、显示项**

| 元素 | 位置 | 内容 |
|------|------|------|
| 状态色条 | 卡片左侧 4px | paused 状态为琥珀色 |
| 状态徽章 | 标题行右侧 | 暂停 已暂停，琥珀色背景+边框 |
| 暂停环节提示 | 标题行下方 | 暂停环节：{阶段名}，琥珀色背景条 |
| 阶段进度条 | 提示行下方 | 暂停阶段为琥珀色 active 段+柔和脉冲 |
| 操作按钮 | 卡片底部 | 从断点继续+打开+删除 |
| 时间戳 | 卡片底部左侧 | updatedAt/completedAt/createdAt 格式化 |

**六、提示文字**

| 场景 | 文字 |
|------|------|
| 暂停有阶段名 | 暂停环节：optimize |
| 暂停无阶段名 | 暂停环节：（空） |
| 运行中 | 返回流水线创作查看进度 |
| 恢复按钮（可用） | 从断点继续 |
| 恢复按钮（恢复中） | 恢复中... |

**七、删除的重复代码**

- CreateView.vue 中内联的 stale running 检测逻辑（15行）已移除，统一由 usePipelineHistory.js composable 处理。

**八、相关文件**

- 修改：apps/desktop/src/composables/usePipelineHistory.js
- 修改：apps/desktop/src/views/CreateView.vue
- 修改：apps/desktop/src/views/CreateViewHistory.vue
- 修改：apps/desktop/src/views/CreateView.test.js

### 3.1.18 视频创作模块 UI/UX 深度优化（2026-08-11）

**背景**：在完成组件拆分和功能修复后，视频创作模块的 UI/UX 仍有优化空间。用户要求深度分析所有前端界面 UI 和交互体验，然后整体优化。

**一、优化范围**

1. **CreateView.vue** — 主视图（视图切换、流水线详情、配置区、操作栏）
2. **CreateViewHistory.vue** — 历史记录视图（工具栏、卡片列表、状态徽章）

**二、视图切换（view-tabs）优化**

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 容器样式 | border-bottom 分割线 | 圆角胶囊容器 + 背景色 + 边框 |
| 标签样式 | 无圆角，底部下划线 | 圆角 8px，背景色过渡 |
| 悬停效果 | 无 | 背景色变化 |
| 激活状态 | 底部下划线 | 背景色 + 阴影（凸起效果） |
| 过渡动画 | 无 | 0.2s ease 过渡 |

**三、流水线卡片（pipeline-card）优化**

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 边框 | 1px solid var(--border) | 1px solid var(--hairline, rgba(0,0,0,0.08)) |
| 内边距 | 16px 20px | 18px 22px |
| 过渡效果 | 0.2s | 0.25s cubic-bezier(0.4, 0, 0.2, 1) |
| 悬停阴影 | 0 4px 16px | 0 6px 20px |
| 悬停位移 | translateY(-2px) | translateY(-3px) |
| 按下效果 | 无 | translateY(-1px) + 更小阴影 |

**四、返回按钮（back-btn）优化**

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 样式 | 纯文本链接 | 带边框的按钮 |
| 交互 | 无过渡 | 边框色变化过渡 |

**五、详情头部（detail-header）优化**

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 容器 | 无背景 | 卡片式背景 + 圆角 + 边框 |
| 标题 | 无字间距 | letter-spacing: -0.01em |
| 描述 | 14px | 13px + line-height: 1.5 |

**六、输入区域优化**

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| textarea 聚焦 | 无特殊样式 | 边框色变化 + 蓝色外发光 |
| textarea 背景 | 无 | var(--surface) |
| 输入框聚焦 | 无特殊样式 | 边框色变化 + 蓝色外发光 |
| 下拉框聚焦 | 无特殊样式 | 边框色变化 + 蓝色外发光 |
| 上传区域 | 基础虚线边框 | 更大圆角 + 背景色过渡 + 悬停蓝色 |
| 字符计数 | 纯文本 | 带背景色的标签样式 |
| 预估信息 | 纯文本 | 左侧蓝色边框 + 背景色 |

**七、配置区（s2v-config-section）优化**

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 折叠区边框 | var(--border) | var(--hairline) + 过渡 |
| 展开状态 | 无特殊样式 | 边框色变为蓝色 |
| 摘要行 | 无悬停效果 | 悬停背景色变化 |
| 字号 | 无 | 14px |

**八、操作栏（action-bar）优化**

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 内边距 | 12px 16px | 14px 20px |
| 圆角 | 无 | 底部圆角 10px |
| 阴影 | 无 | 顶部微阴影 |
| 启动按钮 | 基础样式 | 字重 600 + 圆角 8px + 悬停阴影/位移 |

**九、模式切换（mode-tabs）优化**

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 容器 | 无 | 胶囊容器 + 背景色 |
| 标签 | 圆角 20px 边框 | 圆角 8px 无边框 |
| 激活状态 | 实心背景 | 背景色 + 阴影（凸起效果） |

**十、历史记录视图（CreateViewHistory.vue）优化**

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 容器 | 无动画 | fadeIn 入场动画 |
| 工具栏 | 无边框 | 卡片式背景 + 圆角 + 边框 |
| 卡片圆角 | 8px | 10px |
| 卡片悬停 | 2px 位移 | 1px 位移 + 更大阴影 |
| 卡片按下 | 无 | 回弹效果 |
| 状态徽章 | 11px 2px 8px | 10px 3px 10px + 大写 |
| 标题文字 | font-weight: 500 | font-weight: 600 + letter-spacing |
| 操作按钮 | 4px 10px | 5px 12px + font-weight: 600 |
| 恢复按钮悬停 | 无阴影 | 蓝色阴影 |
| 阶段进度段 | 3px 8px | 4px 10px + font-weight: 500 |
| 时间显示 | 纯文本 | 带 🕐 图标前缀 |
| 底部区域 | 无分隔线 | 顶部 1px 分隔线 |
| 流水线标签 | 11px | 10px + font-weight: 500 + 大写 |
| 卡片间距 | 8px | 10px |

**十一、响应式优化**

| 断点 | 优化内容 |
|------|----------|
| ≤720px | 减小页面内边距、视图切换横向滚动、配置网格单列、启动按钮全宽 |
| 721-1024px | 适中内边距、流水线网格最小宽度 260px |

**十二、交互逻辑**

1. 视图切换：点击标签切换视图，无额外逻辑
2. 卡片悬停：translateY 位移 + 阴影放大，0.2s 过渡
3. 卡片按下：回弹到 translateY(0)，更小阴影
4. 输入框聚焦：蓝色边框 + 外发光，0.15s 过渡
5. 配置区展开：边框色变为蓝色，摘要行背景色变化
6. 操作栏：底部固定，顶部微阴影分隔
7. 模式切换：胶囊容器，激活项凸起效果

**十三、显示项**

| 组件 | 显示项 |
|------|--------|
| 视图切换 | 胶囊容器内的 3 个标签（流水线创作/快速渲染/历史记录） |
| 流水线卡片 | 类型徽章 + 稳定性圆点 + 标题 + 描述 + 阶段数 + 成本 + 可用性 |
| 详情头部 | 卡片式容器 + 标题 + 描述 |
| 输入区域 | textarea + 字符计数 + 预估信息（带左侧蓝色边框） |
| 配置区 | 折叠式卡片 + 摘要行 + 展开内容 |
| 操作栏 | 启动按钮 + 进度条 + 控制按钮 |
| 历史记录工具栏 | 状态筛选下拉 + 记录计数 |
| 历史记录卡片 | 左侧色条 + 标题 + 流水线标签 + 状态徽章 + 提示信息 + 阶段进度 + 时间 + 操作按钮 |

**十四、提示文字**

| 场景 | 文字 |
|------|------|
| 空状态 | 暂无创作记录 / 开始创作后，记录将在此显示 |
| 加载中 | 加载中... |
| 本地模式提示 | 当前为本地模式（未登录），历史记录仅保存在本机 |
| 恢复按钮 | 从断点继续 / 继续生成 |
| 删除按钮 | 删除 |
| 打开按钮 | 打开 |

**十五、相关文件**

- 修改：apps/desktop/src/views/CreateView.vue（CSS 优化）
- 修改：apps/desktop/src/views/CreateViewHistory.vue（CSS 优化）

### 3.1.19 failed 状态保留原始值 + 暂停环节显示修正（2026-08-11）

**背景**：3.1.17 将 failed 状态统一转换为 paused，导致用户无法区分"执行失败"和"用户暂停"。本次修正保留 failed 原始状态，在前端层区分显示。

**一、数据校验**

1. **状态保留**：usePipelineHistory.js 的 loadHistory() 中，failed 状态不再转换为 paused，保留原始值。
2. **暂停环节推导**：若 failed 任务无 pausedStage 字段，从 stages 数组中按优先级推导：
   - 优先取 `status === 'failed'` 的阶段
   - 其次取最后一个 `status !== 'completed'` 的阶段
   - 最后取数组最后一个阶段
3. **stale running 检测**：running 状态超过 30 分钟无更新的任务，标记 `_originalStatus = 'running'` 后转为 paused（此逻辑不变）。
4. **恢复按钮判断**：`historyItemResumable()` 同时支持 failed 和 paused 状态，内容策略类错误（`needs_user_input`/`content_policy`/`可能需要修改文案`）仍不显示恢复按钮。

**二、流程**

```
用户打开历史记录
  -> loadHistory() 并行请求 projects + pipeline runs
  -> 对每个 run.status === 'running' 且 updatedAt > 30min 的任务：
      1. run._originalStatus = 'running'
      2. run.status = 'paused'
      3. 若无 pausedStage -> 从 stages 推导
  -> 对每个 run.status === 'failed' 且无 pausedStage 的任务：
      1. 从 stages 推导 pausedStage（不改变 status）
  -> 排序：running -> projects -> paused -> failed -> 其余
  -> 渲染 CreateViewHistory 组件
```

**三、功能逻辑**

| 场景 | 原状态 | 显示状态 | 暂停/失败环节 | 恢复按钮 |
|------|--------|----------|---------------|----------|
| 超时/崩溃导致失败 | failed | 执行失败 | 从 stages 推导（显示为"失败环节"） | 显示 |
| 内容策略拒绝 | failed | 执行失败 | 从 stages 推导 | 不显示 |
| 30分钟无更新的 running | running->paused | 已暂停 | 从 running 阶段推导（显示为"暂停环节"） | 显示 |
| 用户手动暂停 | paused | 已暂停 | 使用已有 pausedStage | 显示 |
| 正常完成 | completed | 已完成 | - | 不显示 |

**四、交互逻辑**

1. **状态筛选**：筛选器包含全部/进行中/已暂停/执行失败/已完成/已取消六个选项。
2. **失败提示**：
   - 有 pausedStage：显示"失败环节：{阶段名}"
   - 无 pausedStage 有 error：显示截断的错误信息（60字符）
   - 无 pausedStage 无 error：显示"执行过程中出现错误"
3. **暂停提示**：暂停状态的卡片显示"暂停环节：{pausedStage}"提示行。
4. **阶段进度**：运行中和暂停任务显示阶段进度条；暂停阶段使用琥珀色柔和脉冲动画。
5. **恢复操作**：点击"从断点继续"按钮触发 resume-history 事件。
6. **卡片悬停**：hover 时 translateY(-1px) + box-shadow 增强，0.15s ease 过渡。

**五、显示项**

| 元素 | 位置 | 内容/样式 |
|------|------|-----------|
| 状态色条 | 卡片左侧 3px | running 蓝 / paused 橙 / failed 红 / completed 绿 / cancelled 灰 |
| 状态徽章 | 标题行右侧 | 图标 + 文本（✓已完成 / ✕执行失败 / —已取消 / ⟳进行中 / ⏸已暂停 / ○等待中） |
| 失败徽章 | 同上 | 红色背景 + 1px 红色半透明边框 |
| 暂停徽章 | 同上 | 琥珀色背景 + 1px 琥珀色半透明边框 |
| 失败环节提示 | 标题行下方 | ⚠ 失败环节：{阶段名}，红色背景条 |
| 暂停环节提示 | 标题行下方 | ⏸ 暂停环节：{阶段名}，琥珀色背景条 |
| 运行中提示 | 标题行下方 | 🔄 返回流水线创作查看进度，蓝色背景条 |
| 阶段进度条 | 提示行下方 | 各阶段小方块（done/active/failed/pending），暂停阶段琥珀色脉冲 |
| 操作按钮 | 卡片底部 | 从断点继续 + 打开 + 删除 |
| 时间戳 | 卡片底部左侧 | updatedAt/completedAt/createdAt 格式化 |

**六、提示文字**

| 场景 | 文字 |
|------|------|
| 失败有阶段名 | ⚠ 失败环节：optimize |
| 失败无阶段名有错误 | ⚠ {截断的错误信息} |
| 失败无阶段名无错误 | ⚠ 执行过程中出现错误 |
| 暂停有阶段名 | ⏸ 暂停环节：generate_assets |
| 运行中 | 🔄 返回流水线创作查看进度 |
| 恢复按钮（可用） | 从断点继续 |
| 恢复按钮（恢复中） | 恢复中... |
| 筛选器选项 | 全部 / 进行中 / 已暂停 / 执行失败 / 已完成 / 已取消 |

**七、CSS 增强**

| 选择器 | 样式 |
|--------|------|
| `.history-item` | border-radius: 10px; transition: all 0.15s ease |
| `.history-item:hover` | transform: translateY(-1px); box-shadow: 0 2px 12px rgba(0,0,0,0.06) |
| `.history-status.failed` | background: var(--status-failed-bg); border: 1px solid rgba(239,68,68,0.15) |
| `.history-status.paused` | background: rgba(217,119,6,0.1); border: 1px solid rgba(217,119,6,0.2) |
| `.history-item.status-failed` | border-left: 3px solid var(--status-failed-text, #991b1b) |
| `.history-item.status-paused` | border-left: 3px solid var(--status-waiting-text, #d97706) |
| `.history-failed-hint` | 失败环节提示行样式 |
| `.history-paused-hint` | 暂停环节提示行样式 |

**八、相关文件**

- 修改：apps/desktop/src/composables/usePipelineHistory.js（状态保留 + pausedStage 推导 + 排序）
- 修改：apps/desktop/src/views/CreateViewHistory.vue（状态显示 + 筛选器 + CSS 增强）
- 新增：apps/desktop/src/views/video-creation/（PipelineSelector + StageProgress + ConfigSummary + ErrorDialog）





### 3.1.20 代码-设计分离与历史记录卡片优化（2026-08-11）

#### 一、变更背景

历史记录卡片（CreateViewHistory.vue）原先将 ~512 行 CSS 内联在组件的 `<style scoped>` 中，与模板逻辑耦合。同时存在以下问题：

1. **CSS 语法错误**：`video-creation-tokens.css` 中 `[data-theme="dark"]` 块提前关闭，导致 `--banner-attention-text` 和 `--ep-*` 暗色模式变量悬空
2. **硬编码颜色**：部分样式直接使用 rgba 值而非 CSS 变量，暗色模式覆盖不完整
3. **信息密度不足**：卡片仅显示标题、状态、提示行、进度条和操作按钮，缺少时长、模式等元信息
4. **布局冗余**：时间信息放在底部 footer，与操作按钮挤在同一行

#### 二、代码-设计分离方案

##### 1) 文件结构

| 文件 | 职责 | 行数 |
|------|------|------|
| `apps/desktop/src/styles/history-panel.css` | 历史记录卡片全部样式（从 Vue 抽取） | ~101 |
| `apps/desktop/src/styles/video-creation-tokens.css` | Design Token 定义（含暗色模式） | ~189 |
| `apps/desktop/src/views/CreateViewHistory.vue` | 模板 + 逻辑（无内联样式） | ~235 |

##### 2) 引入方式

`CreateViewHistory.vue` 的 `<script>` 块顶部添加：

```js
import '@/styles/history-panel.css'
```

- 不使用 `<style scoped>`，样式通过 class 命名空间隔离（`.history-*` 前缀）
- 好处：样式可被 DevTools 全局审查、可被其他组件复用、Vite HMR 热更新更快

##### 3) CSS 变量使用规范

所有颜色值必须使用 CSS 变量，格式：`var(--token-name, fallback)`。禁止直接写 rgba/hex。

已定义的变量族：

| 变量族 | 用途 | 示例 |
|--------|------|------|
| `--status-*-bg/text` | 状态语义色 | `--status-failed-bg: #fee2e2` |
| `--history-*` | 历史记录专用 | `--history-running-border: #93c5fd` |
| `--hairline` | 边框线 | `rgba(0,0,0,0.06)` |
| `--surface` | 卡片背景 | `#fff` |

#### 三、历史记录卡片 UI 优化

##### 1) 卡片信息层次（从上到下）

| 层级 | 内容 | 样式 |
|------|------|------|
| 第一行 | 标题 + 流水线标签 + 状态徽章 | 标题 14px bold，标签 10px uppercase，徽章 10px 带边框 |
| 第二行 | 状态提示（运行中/已暂停/失败） | 带图标的小字提示，背景色区分 |
| 第三行 | 元信息（时间、时长、模式、项目ID） | 12px 灰色，图标 + 文字 |
| 第四行 | 阶段进度条（仅运行中/已暂停） | 圆角分段条，活跃段有 shimmer 动画 |
| 底部 | 操作按钮（从断点继续/打开/删除） | 按钮组右对齐 |

##### 2) 状态视觉映射

| 状态 | 左边框色 | 状态徽章背景 | 提示行 |
|------|----------|-------------|--------|
| running | `--status-running-text` (#1d4ed8) | rgba(29,78,216,0.08) | 🔵 返回流水线创作查看进度 |
| paused | `--status-waiting-text` (#92400e) | rgba(217,119,6,0.1) | 🟠 暂停环节：{stage} |
| failed | `--status-failed-text` (#991b1b) | #fee2e2 | 🔴 失败环节：{stage} |
| completed | `--status-completed-text` (#065f46) | rgba(6,95,70,0.08) | 无 |
| cancelled | `--status-cancelled-text` (#6b7280) | #f3f4f6 | 无 |

##### 3) 新增元信息行

```html
<div class="history-meta">
  <span class="history-meta-item">🕐 {时间}</span>
  <span class="history-meta-item">⏱ {时长}</span>
  <span class="history-meta-item">⚙ {模式}</span>
  <span class="history-meta-item">📁 {项目ID前8位}</span>
</div>
```

- `formatDuration(ms)`：毫秒转 "X 分钟 Y 秒" 或 "Y 秒"
- 时长来源于后端返回的 `duration` 字段
- 模式来源于 `mode` 字段（如"文字标准模式"）
- 项目ID仅显示前 8 位，hover 时 title 显示完整 ID

##### 4) 操作按钮逻辑

| 状态 | 可用操作 | 条件 |
|------|---------|------|
| running | 继续生成 | 始终可用 |
| paused | 从断点继续 | `historyItemResumable(h) === true` |
| failed | 从断点继续 | `historyItemResumable(h) === true` 且 error 不含 needs_user_input |
| completed | 打开 | `h.projectId` 存在 |
| * | 删除 | `h.projectId` 存在 |

#### 四、CSS 语法修复

`video-creation-tokens.css` 暗色模式修复：

- **问题**：`[data-theme="dark"]` 块在第 173 行提前关闭，`--banner-attention-text` 和 `--ep-*` 变量悬空
- **修复**：移除第 173 行的多余 `}`，将所有暗色模式变量正确嵌套在 `[data-theme="dark"]` 内
- **验证**：大括号计数 { = 2, } = 2，平衡

#### 五、数据校验

| 字段 | 类型 | 必填 | 校验规则 |
|------|------|------|---------|
| `h.status` | enum | 是 | running/paused/failed/completed/cancelled |
| `h.title` | string | 否 | 为空时 fallback 到 `pipelineName(h.pipeline)` |
| `h.pausedStage` | string | 否 | running 超时自动推导，failed 从 stages 推导 |
| `h.duration` | number(ms) | 否 | 非数字或 null 时不显示 |
| `h.mode` | string | 否 | 非空时显示 |
| `h.stages` | array | 否 | 仅 running/paused 时显示进度条 |

#### 六、相关文件

- **修改**：`apps/desktop/src/views/CreateViewHistory.vue`（移除内联 CSS，添加 CSS import，新增 meta 行和 formatDuration）
- **修改**：`apps/desktop/src/styles/video-creation-tokens.css`（修复暗色模式 CSS 语法）
- **新增**：`apps/desktop/src/styles/history-panel.css`（从 Vue 抽取的历史记录样式）


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


### 3.1.21 BasePythonBridge 懒启动自愈（2026-08-11）

#### 一、变更背景

视频创作流水线依赖 Python Bridge（SplitterBridge、PromptBridge）提供后台服务。此前当 Bridge 进程意外退出（崩溃、看门狗放弃、启动失败）后，业务调用方（如 optimize()、_post()）直接抛出 xxx is not running 错误，用户需要手动重启应用。本次在 BasePythonBridge 基类中新增 nsureRunning() 方法，实现懒启动自愈。

#### 二、实现方案

##### 1) ensureRunning() 方法（base-python-bridge.js:281-293）

`
async ensureRunning () {
  if (this.isRunning) return          // 已运行则跳过
  if (this._starting) return this._starting  // 并发调用共享同一 Promise
  this.log.info(this.name, ${this.name} is not running, attempting lazy-start...)
  this.restartCount = 0
  this._starting = this.start().catch((e) => {
    this.log.error(this.name, Lazy-start failed: )
    throw e
  }).finally(() => { this._starting = null })
  return this._starting
}
`

##### 2) _post() 方法改造（base-python-bridge.js:228-231）

原来 _post() 在 isRunning === false 时直接 reject。改造后：
`
if (!this.isRunning) {
  try { await this.ensureRunning() } catch (e) {
    throw new Error(${this.name} is not running and lazy-start failed: )
  }
}
`

##### 3) 子类显式调用

PromptBridge 的 optimize() 和 optimizeBatch() 方法在调用 _post() 前额外调用 wait this.ensureRunning()，确保 Bridge 可用。

#### 三、行为变化

| 场景 | 改造前 | 改造后 |
|------|--------|--------|
| Bridge 未启动时调用 optimize() | 抛出 "xxx is not running" | 自动尝试启动，成功则继续，失败则抛出 "lazy-start failed" |
| Bridge 启动中重复调用 | 无保护 | 共享同一 _starting Promise，不重复 spawn |
| Bridge 崩溃后首次调用 | 直接报错 | 自动重启 + 重试 |

#### 四、数据校验

- _starting 字段类型：Promise<void> | null
- nsureRunning() 返回值：Promise<void>
- 并发安全：多次调用共享同一个 _starting Promise

#### 五、错误处理

- 懒启动失败时，错误信息包含原始异常的 message
- 日志级别：启动尝试为 info，失败为 error
- 不影响看门狗和正常重启逻辑

#### 六、影响范围

| 文件 | 变更类型 |
|------|----------|
| ase-python-bridge.js | 新增 nsureRunning() 方法 + _post() 改造 |
| prompt-bridge.js | optimize() 和 optimizeBatch() 前置调用 |
| splitter-bridge.js | 同上模式 |

#### 七、回归验证

- ase-python-bridge.test.js：新增 ensureRunning 懒启动测试（并发调用共享 Promise、启动失败抛出、已运行跳过）
- 2e-full-pipeline.test.js：E2E 测试自动启动 Splitter Bridge 而非仅 attach


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
| `youtube-4k` | 3840×2160 | YouTube 4K（受运营开关 `videoCreation.maxOutputResolution=4k` 控制；关闭时该模板的分辨率归一化为 1920×1080，见 PRD.md 7.1.20） |
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

---

## 九、UI/UX 优化方案（2026-08-11）

### 9.1 优化背景

视频创作模块经过多轮迭代，功能已基本完善，但代码组织和用户体验存在优化空间。本次优化旨在：
1. 改善代码可维护性
2. 提升用户体验
3. 增强可访问性
4. 优化响应式设计

### 9.2 组件架构优化

#### 9.2.1 当前问题
- **CreateView.vue** 过于庞大（3531行），混合了多个职责
- 组件间有重复代码（如历史记录加载逻辑）
- 缺乏可复用的UI组件

#### 9.2.2 优化方案

**新增组件：**

| 组件 | 职责 | 行数 |
|------|------|------|
| `PipelineSelector.vue` | 流水线选择网格 | ~200行 |
| `StageProgress.vue` | 阶段进度显示 | ~180行 |
| `ErrorDialog.vue` | 错误对话框 | ~120行 |
| `ConfigSummary.vue` | 配置摘要预览 | ~100行 |

**Composable 集成：**

| Composable | 职责 | 状态 |
|------------|------|------|
| `usePipelineHistory.js` | 历史记录管理 | 已创建，待接入 |
| `usePipelineConfig.js` | 配置状态管理 | 待创建 |
| `usePipelineUI.js` | UI状态管理 | 待创建 |

### 9.3 UI/UX 增强

#### 9.3.1 流水线选择优化

**当前状态：**
- 基础卡片网格布局
- 无加载状态
- 无视觉层次

**优化后：**
- 添加加载骨架屏
- 改进卡片视觉层次
- 添加键盘快捷键
- 优化hover效果

#### 9.3.2 配置区域优化

**当前状态：**
- 6个折叠区过于复杂
- 无配置预览
- 无一键重置

**优化后：**
- 添加配置摘要预览
- 改进折叠区设计
- 添加一键重置功能
- 优化表单布局

#### 9.3.3 历史记录优化

**当前状态：**
- 基础列表展示
- 无批量操作
- 无搜索功能

**优化后：**
- 添加批量操作
- 添加搜索功能
- 改进排序选项
- 优化卡片设计

### 9.4 可访问性改进

#### 9.4.1 键盘导航
- 所有交互元素添加 `tabindex`
- 添加 `aria-label` 和 `aria-describedby`
- 改进焦点指示器
- 优化Tab顺序

#### 9.4.2 屏幕阅读器
- 添加适当的 ARIA 角色
- 动态内容更新通知
- 状态变化提示
- 错误信息无障碍

#### 9.4.3 颜色对比度
- 确保文本对比度符合 WCAG 2.1 AA 标准
- 状态颜色区分明显
- 焦点指示器清晰

### 9.5 响应式设计改进

#### 9.5.1 移动端优化
- 流水线网格单列布局
- 历史卡片自适应
- 触摸交互优化
- 表单元素适配

#### 9.5.2 平板端优化
- 流水线网格双列布局
- 配置区域分栏
- 历史卡片双列

#### 9.5.3 桌面端优化
- 流水线网格三列布局
- 配置区域完整展示
- 历史卡片多列

### 9.6 实施计划

#### 阶段 1：组件拆分（2天）
- 拆分 CreateView.vue 为独立组件
- 集成 usePipelineHistory.js
- 创建新的 composable

#### 阶段 2：UI 增强（2天）
- 改进流水线卡片设计
- 优化配置区域
- 改进历史记录界面

#### 阶段 3：无障碍访问（1天）
- 添加 ARIA 标签
- 改进键盘导航
- 测试屏幕阅读器

#### 阶段 4：响应式设计（1天）
- 改进移动端布局
- 优化触摸交互
- 测试不同设备

#### 阶段 5：测试和文档（1天）
- 编写组件测试
- 更新 PRD 文档
- 创建用户指南

### 9.7 预期效果

#### 9.7.1 代码质量
- CreateView.vue 从 3531 行减少到约 800 行
- 组件职责清晰，易于维护
- 测试覆盖率提高

#### 9.7.2 用户体验
- 更流畅的交互体验
- 更清晰的视觉层次
- 更好的响应式设计

#### 9.7.3 可访问性
- 符合 WCAG 2.1 AA 标准
- 完整的键盘导航
- 良好的屏幕阅读器支持

### 9.8 验收标准

- [ ] 所有新组件通过单元测试
- [ ] 键盘导航完整可用
- [ ] 屏幕阅读器可访问
- [ ] 移动端布局正常
- [ ] 性能无明显下降
- [ ] 现有功能不受影响



### 9.9 组件接入状态（2026-08-11 更新）

#### 已接入组件

| 组件 | 接入位置 | 接入方式 | 状态 |
|------|----------|----------|------|
| PipelineSelector.vue | CreateView.vue | 替换内联流水线网格（原22行→10行） | ✅ 已接入 |
| StageProgress.vue | CreateView.vue | 替换内联阶段进度（原25行→8行） | ✅ 已接入 |

#### 未接入组件及原因

| 组件 | 原因 | 替代方案 |
|------|------|----------|
| ErrorDialog.vue | 独立overlay与设计系统UiModal不一致 | 保留UiModal |
| ConfigSummary.vue | 与现有配置表单功能重复 | 不插入避免UI冗余 |

#### 数据校验

- **PipelineSelector**：pipelines数组每项需包含name、category、estimatedCost、available字段；loading/error为Boolean/String
- **StageProgress**：stages数组每项需包含name、status（completed/running/failed/waiting_approval/pending/cancelled）；progressPercent为0-100数值

#### 交互逻辑

- **PipelineSelector**：点击卡片触发select事件（传递pipeline对象）；加载中显示骨架屏；错误状态显示重试按钮
- **StageProgress**：自动根据status显示对应图标和颜色；运行中阶段显示子进度条（compose阶段）；显示每个阶段的耗时

#### 显示项

- **PipelineSelector**：分类标签（AI生成/说话头像/电影感等）、稳定性指示点（production/beta/experimental）、阶段数、消耗等级、可用性
- **StageProgress**：总进度百分比、已用时间、完成摘要、各阶段名称/状态图标/状态文本/耗时

#### 提示文字

- PipelineSelector加载态："加载流水线列表..."
- PipelineSelector错误态：错误信息 + "重试"按钮
- StageProgress阶段状态：等待中/运行中/已完成/失败/等待确认/已取消
- StageProgress时间格式："X分Y秒" 或 "Y秒"
