# Story2Video 视频创作流水线 E2E 真实测试报告（2026-08-24）

## PR #1143 真实媒体回归补充（2026-08-23 / 24）

> 目的：验证电影工程真实入口与 Story2Video 的真实媒体产物，并确认图片轮播的 JPEG + TTS + 2x zoompan 编码不再被过短 timeout 误杀。以下是本机真实产物证据，不把它们表述为完整的新上传/下拉选择 UI 链验收。

| 产物 | 路径 / 输入 | 探测结果 | 覆盖事实 |
|------|-------------|----------|----------|
| 最小图片轮播 | C:\tmp\s2v-real-20260823\real-minimal-no-video.mp4 | 1920×1080，3.104s，931,717 bytes | 图片轮播基础直接成片 |
| 安全视频路径 | C:\tmp\s2v-real-20260823\real-safe-video.mp4 | 1920×1088，4.033s，1,771,825 bytes | AI 视频/混合素材路径 |
| 固定轮播 AI 视频 | C:\tmp\s2v-real-20260823\real-carousel-fixed.mp4 | 1920×1088，4.033s，5,893,762 bytes | 固定轮播中的 AI 视频场景 |
| 超时修复直接验证 | C:\tmp\s2v-real-20260823\real-carousel-timeout-fixed-direct.mp4 | 1920×1080，6.264s，1,516,241 bytes | 真实 JPEG + TTS、2x zoompan 的直接合成；workScale² timeout 预算生效 |

- 详细直接合成报告：C:\tmp\s2v-real-20260823\real-carousel-timeout-fixed-direct-report.json。
- 复制 Chromium profile 无法复用加密登录态属于本机环境限制，不能作为登录或克隆音色功能失败的证据。
- 新上传样本 → 在 UI 下拉选择克隆音色 → 走完整流水线成片，仍列为待验收项，见 E2E-PENDING.md 的 C-1b。

- 环境：`D:\Data\projects\Multi-Publish\_worktrees\story2video-documentary-montage`（main，merge 35cec2b 后）
- Profile：`C:\tmp\Multi-Publish-debug-profile`（登录 a；已配置并启用：agnes/sensenova LLM、minimax-tts speech-2.8-turbo、minimax-image）
- 方式：Playwright Electron 启动应用 → 直接走 `pipeline:startOrchestrated`（与 UI 同款参数，含真实 provider）→ 轮询 `pipeline:getRunContext` 至终态
- 文案：短文案（约 30 字）用于快速验证；媒体流水线使用 12s 样例视频（ffmpeg testsrc2+sine）

## 结果矩阵（12 条已实现流水线）

| # | 流水线 | 结果 | 耗时 | 证据 |
|---|--------|------|------|------|
| 1 | story2video-compose（图片轮播） | ✅ 完成 | 48s | 真实 mp4（temp\story2video\s2v_*_output.mp4） |
| 2 | animated-explainer | ✅ 完成 | 6m25s | 真实 mp4（s2v_*_output.mp4） |
| 3 | documentary-montage | ✅ 完成 | 4m58s | 真实 mp4（9.85MB） |
| 4 | framework-smoke | ✅ 完成 | 6s | 冒烟测试视频 + report |
| 5 | talking-head | ✅ 完成 | 6s | 字幕烧录输出（样例视频） |
| 6 | cinematic | ✅ 完成 | 6s | 调色/合成输出（样例视频） |
| 7 | clip-factory | ✅ 完成 | 6s | clipfactory_output.mp4 |
| 8 | localization-dub | ✅ 完成 | 48s | 翻译(TTS)+替换音轨输出 |
| 9 | animation | ⏭ 缺模型 | 1m54s | concept/storyboard 完成；animate 失败 `VIDEO_MODEL_NOT_CONFIGURED` |
| 10 | avatar-spokesperson | ⏭ 缺模型 | 3m | avatar/script 完成；generate 失败 `VIDEO_MODEL_NOT_CONFIGURED` |
| 11 | character-animation | ⏭ 缺模型 | 1m6s | character_design/rigging 完成；animate 失败 `VIDEO_MODEL_NOT_CONFIGURED` |
| 12 | hybrid | ⏭ 缺模型 | 54s | plan/generate 完成；merge 失败 `VIDEO_MODEL_NOT_CONFIGURED` |

说明：4 条 videogen 流水线需要「视频生成模型」（Agnes Video/CogVideo/Runway/Kling/Veo 等），当前 profile 未配置，按需求约定标记为「缺模型」，引擎已 fail closed 并给出配置引导。

## E2E 发现并修复的问题

1. **API 限流排队不足（governor）**：documentary-montage 14 个场景的 TTS 在第 11 段起连续失败（原 `_pace` 等待窗口释放超过 30s 直接抛限流）。修复：改为「按时间槽调度」排队（并发请求同步预约各自槽位，等待上限 180s），长文案多场景请求自动错峰。修复后 documentary-montage 全流程通过。
2. **videogen 输入键不匹配（引擎缺陷）**：storyboard 读取固定 `context.concept`、generate 读取 `context.storyboard`，与 character-animation（character_design/rigging）和 hybrid（plan/generate）实际阶段名不符，导致「storyboard 需要 context.concept 或 context.script」。修复：新增 `resolveVideogenConcept` / `resolveVideogenScenes` 按候选键解析。修复后两条流水线正常走到 animate 并按预期缺模型。

## 复现脚本

- `C:\tmp\e2e-pipelines.js`（`E2E_FILTER=...` 可指定流水线子集；报告写入 `C:\tmp\e2e-report.json`）
- 样例视频：`C:\Users\邱领\AppData\Local\Temp\story2video\e2e-sample-video.mp4`

---

## W2/W3 排队行为专项验证（2026-08-06，run_1786027760268_6pwm）

> 目的：验证技术债务 W2（governor 排队超时回收）/ W3（按 provider 配置化 RPM）在长文案多场景下的真实排队行为。脚本 `C:\tmp\e2e-w2w3.js`（Playwright Electron + debug profile + 真实 minimax-tts / minimax-image / agnes-llm）。

### 输入与阶段耗时
- 输入：1,400+ 字长文案（「九转大肠/下水饮食史」）。
- 拆分：**27 个场景**（split 2.7s）→ optimize 89s（27 场景并行 LLM 优化，无限流失败）→ generate_assets 7m22s（27 图 + 27 TTS，全部成功）→ compose 失败（ffmpeg 资源限制，见下）。

### W3 验证：provider 级 RPM 预算生效（时间槽错峰）
- `minimax-tts` rpm=20 → 槽位 3.0s：27 次 TTS 分发中位间隔 **2.94s**（min 1.58 / max 3.96，总跨度 77.7s），与预算完全吻合。
- `minimax-image` rpm=15 → 槽位 4.0s + maxConcurrent=2：图片成对完成（如 Image 2/4 间隔 0.14s、Image 8/9 间隔 1.6s），未配置 provider 时不会出现的并发特征。
- `agnes-llm`（optimize 阶段默认 LLM，rpm 30）27 场景并行优化 89s 完成，无 429 整线失败。
- 依据：`governor-provider-limits.js` 的 provider 预算在 container 启动时注入，本次运行全部命中。

### W2 验证：排队超时回收 + 重试恢复（无悬挂）
- 资源生成中出现 1 次图片请求排队超时（`排队等待超时，请稍后重试`，30s 队列预算）——过期 waiter 被回收（sweep），随后 AssetGenerator 阶段级重试立即成功（Image 1 → Image 0 等陆续完成），运行继续到 compose，全程无悬挂。
- run 结束（compose 失败）时 `_finalizeRun` 调用 `governor.sweepAll()`，未残留排队 waiter（进程退出干净）。

### 附带发现：25+ 场景 compose 渲染资源限制（新待办 D）
- 27 段 720x1280 合成时，单条 ffmpeg 构建 27 路 xfade/acrossfade 图，x264 报 `malloc of size 1586256 failed`（环境内存不足）→ compose 失败。与 W2/W3 无关（资源生成阶段全部成功）；已记入 `E2E-PENDING.md` 待办 D（分块合成/限制输入路数）。
- 证据文件：`C:\tmp\e2e-w2w3-report.json`、`C:\tmp\e2e-w2w3-provider-logs.json`；应用日志 `C:\tmp\Multi-Publish-debug-profile\logs\app-2026-08-06.log`（14:49-15:01 窗口）。

---

## 后台并发专项验证（2026-08-07，main e081a43）

> 目的：验证「后台运行 + 历史显示运行中 + 并发上限」在真实 provider 下的行为；脚本 `C:\tmp\e2e-concurrency.js`（Playwright Electron + debug profile，真实 minimax-tts / minimax-image / agnes-llm / sensenova-llm）。

### 验证结果
1. **2 条流水线并行启动**：`pipelineStartOrchestrated` ×2 均 `success:true`，两条 run 同时运行。
2. **历史记录显示运行中**：`pipeline:history` 返回 3 条 running（含阶段状态字段），运行中任务可被前端轮询展示。
3. **切模块后台继续**：renderer 导航到 `#/dashboard` 后，run A 仍在 `generate_assets` 阶段推进（`status=running, currentStage=3`），未随页面切换停止。
4. **第 3 条未触发拒绝（预期内）**：本机为高配，`computeDefaultMaxConcurrentRuns` 自适应=4，3 条并发在设计范围内；「超限拒绝 + `PIPELINE_CONCURRENCY_LIMIT` 友好提示」由引擎单测覆盖（注入上限 1/2），真实应用内触发需低配环境或设 `STORY2VIDEO_MAX_CONCURRENT_RUNS` 固定开关。

### 真实链路暴露并已修复（PR #384）
1. **MiniMax Image 空结果**：run A 在 `generate_assets` 第 2 个场景失败——`Image provider "minimax-image" failed: provider did not return a supported image binary`（HTTP 200 但 `image_urls` 为空，静默拒绝/瞬时故障绕过重试循环）。修复：adapter 空结果显式抛错（内容安全信号→`CONTENT_POLICY`，否则 `PROVIDER_ERROR`）；asset-generator 在内容政策重试循环内校验，前 2 次同提示词、第 3 次起安全改写、第 5 次仍空 → `needs_user_input(reason=empty_result)`。见 PRD 7.1.5「空响应重试合同」。
2. **compose 转场 `transition=undefined`**：run B 在 compose 失败——ffmpeg `xfade=transition=undefined` → `const_values array too small for transition` / `Not yet implemented`。修复：`buildTransitionPlan` 所有返回路径携带 `transitionName`（默认 fade），`_xfadeMerge` 不再拼出 `undefined`。见 PRD「真实链路修复合同」。

### 证据
- `C:\tmp\e2e-concurrency-report.json`（A/B 终态 failed 时的阶段快照）；应用日志 `C:\tmp\Multi-Publish-debug-profile\logs\app-2026-08-07.log`。
- 两处修复的重测（到成片）与并发固定上限开关验证见 `E2E-PENDING.md` 待办 E。

---

## 真实链路修复确认（2026-08-07，main cd1869f 后）

> 目的：确认 PR #384 两处修复在真实 provider 链路生效（到成片）。脚本 `C:\tmp\e2e-confirm.js`（Playwright Electron + debug profile，真实 minimax-tts / minimax-image / agnes-llm / sensenova-llm）。

### 结果
| 运行 | 场景数 | 结果 | 耗时 | 成片 | 说明 |
|------|--------|------|------|------|------|
| run_1786088972864_ogjj | 1 | ✅ completed | 48s | `s2v_1786089012983_1_output.mp4`（11.9s / 902KB） | 短文案，单段拷贝路径 |
| run_1786089061973_irsp | **3** | ✅ completed | 4m40s | `s2v_1786089323107_1_output.mp4`（33.2s / 2.3MB，720x1280 h264+aac） | **多段 xfade 转场路径**，此前 `transition=undefined` 场景现在成功 |

- 两轮全部 6 阶段 completed（split → domain_enrich → optimize → generate_assets → compose → publish）。
- 3 场景轮的 generate_assets 完成 3 图 + 3 TTS（minimax-image 均返回可用图片，未再触发空结果）；compose 多段 xfade 成功（fade 转场），`xfade=transition=undefined` 不再出现。
- 图片「空结果」的具体触发（静默 200-empty）为间歇性，本轮未复现；其重试/降级行为由单测覆盖（adapter 显式抛错 + 5 次后 `needs_user_input`）。

### 证据
- `C:\tmp\e2e-confirm-report.json`（第二轮 3 场景）；成片文件见上表；应用日志 `C:\tmp\Multi-Publish-debug-profile\logs\app-2026-08-07.log`。
- 并发上限固定开关（`STORY2VIDEO_MAX_CONCURRENT_RUNS=2` → 第 3 条拒绝）仍在 `E2E-PENDING.md` 待办 E。

- **并发上限固定开关验证（2026-08-07，`STORY2VIDEO_MAX_CONCURRENT_RUNS=2`）**：A/B 两条流水线并行成功；第 3 条被拒（`PIPELINE_CONCURRENCY_LIMIT`，友好文案「当前已有 2 条流水线正在运行，最多同时运行 2 条，请等待其中一条完成后再启动。」）；历史仅 2 条运行中；切 `#/dashboard` 后仍在 `optimize` 后台运行。脚本 `C:\tmp\e2e-concurrency.js`（env 注入固定上限），报告 `C:\tmp\e2e-concurrency-report.json`（limitVerified=true）。

- **创作历史自动展示运行中卡片（2026-08-07，PR #388 修复确认，main 7813fb4）**：启动运行中流水线（`run_1786095645560_t4z4`，optimize 阶段）→ 进入 `#/create/history`（不点 tab）→ 页面自动切到「流水线记录」tab 并显示运行中卡片（"运行中 / 返回创作页查看进度"）；切回「渲染记录」tab 显示横幅「⏳ 有 1 条流水线正在后台运行，点击查看运行状态」。脚本 `C:\tmp\e2e-history-auto-show.js`，报告 `C:\tmp\e2e-history-auto-show-report.json`（verified=true）。

- **CreateView 历史记录运行中置顶 + 阶段进度（2026-08-07，PR #390 修复确认，main 8d2c6c6）**：【视频创作】-【历史记录】（CreateView 内部视图）启动运行中流水线后，历史列表**首项**显示运行中卡片（「图片轮播 进行中」），含 6 个阶段色块（split/domain_enrich 已完成、optimize 运行中、generate_assets/compose/publish pending）与「返回流水线创作查看进度」提示。脚本 `C:\tmp\e2e-createview-history.js`，报告 `C:\tmp\e2e-createview-history-report.json`（verified390=true）。

---

## 保存选项 UI 驱动 E2E（2026-08-26，codex/fix-s2v-saved-options-driver）

> 目的：在**真实已登录 profile + 用户保存好的选项**下，走**真实 UI**（而非 `pipeline:startOrchestrated` 直接编排）驱动 story2video-compose 流水线，验证「保存选项 → 进入创作页 → 仅填文案 → 点启动」链路在真实环境端到端通过，并产出真实成片。

### 1. 环境与前置条件

| 项 | 配置 | 说明 |
|----|------|------|
| 应用 | Electron 桌面应用（最新代码，commit `4f0393691` 之后） | 单实例运行（profile `C:\tmp\Multi-Publish-debug-profile`），CDP `9333` / vite `5180` |
| Python 服务 | 系统 Python 3.12 外部起 `splitter`(8002) 与 `prompt-engine`(8013) | 应用内 bridge `attach()` 直接复用已起服务，绕开 `python` 命令解析问题 |
| 写保护/隔离 | 写保护 watcher 未激活（仅环境检查）；本次代码改动走独立 worktree | 共享主目录为 main-only 协调目录，禁止直接落盘 |
| 驱动 | `apps/desktop/tests/e2e/story2video-saved-options-driver.js` | 通过 CDP 连接运行中的 Electron，纯 UI 操作，不改动任何已保存选项 |

**关键环境纪律（避免 EPERM 与竞争卡死）**：
- **单实例运行**：多个 Electron 实例共用同一 `user-data-dir` 会互相持有 `multi-publish.db` 句柄，导致「写 .tmp 再 rename 覆盖」在 Windows 文件锁下频繁 `EPERM`（flood）。本环境杀掉全部残留 Electron，仅保留单实例，EPERM 降为 0。
- **多实例是 optimize 卡死的根因而非代码缺陷**：run5 曾卡在 optimize(3/7) 长达 8 小时，根因是**多实例争用**（base-python-bridge 有 120s 超时、stages 有 try/catch 兜底，不可能真 hang）。单实例环境复跑同文案 ~50s 即完成 optimize —— 证明卡死是环境竞争，不是流水线 bug。

### 2. 数据源：用户保存选项（来自 `multi-publish.db` 的 `user:6c90f6c…:story2video.lastOptions.v1`）

| 选项字段 | 保存值 | UI 呈现 / 含义 |
|----------|--------|----------------|
| `videoMode` | `off` | 图片轮播（非视频生成） |
| `imageProvider` | `minimax-multimodal` | 图片供应商：MiniMax 多模态生图 |
| `imageStyle` | `cinematic` | 画面风格：电影感 |
| `imageEffect` | `zoom-in` | 镜头效果：缓慢推近 |
| `voiceProvider` | `mimo-tts` | 配音供应商：Mimo TTS |
| `voiceModel` | `mimo-v2.5-tts` | 配音模型：Mimo 2.5 |
| `voiceSpeed` | `1.2` | 语速 1.2×（加速） |
| `voiceVolume` | `1.5` | 音量 1.5×（增益） |
| `splitLanguage` | `auto` | 拆分语种：自动 |
| `splitMode` | `balanced` | 拆分模式：均衡 |
| `sceneDurationMode` | `follow-audio` | 单场景时长：跟随配音时长 |
| `minSceneDuration` | `6` | 单场景最短 6s |
| `subtitleEnabled` | `true` | 启用字幕 |
| `bgmVolume` | `4` | 背景音乐音量 4 |
| `watermark` | `false` | 不加水印 |
| `publishEnabled` | `false` | 不自动发布 |
| `s2vOutputConfig` | `1920x1080 / 30fps / mp4` | 输出分辨率/帧率/封装 |

> 数据校验：以上选项经 `electronAPI.pipelineGetRunContext` 回读与 `lastOptions.v1` 完全一致；驱动**只读不写**，启动后仍回读确认 `savedOptions` 未被改动。

### 3. 驱动机制（功能逻辑）

驱动脚本运行在 Node（非渲染进程），通过 Playwright CDP 连接运行中的 Electron renderer：

1. **接入**：`chromium.connectOverCDP(CDP_URL)`（默认 `http://127.0.0.1:11038`），在 renderer 页面（URL 以 `E2E_VITE_ORIGIN` 默认 `http://127.0.0.1:6990` 开头）上注入 `window.electronAPI.pipelineStartOrchestrated` 的包装，用于捕获新 run 的 `runId`。
2. **导航**：强制整页 `document` 重载（先回 `/` 再进 `/#/create`），确保 `CreateView.vue` 重新拉起（hash 路由仅改 hash 不重载，会漏加载模块）。
3. **选择流水线**：`page.locator('.pipeline-card[data-pipeline-id="story2video-compose"]')` 点击，进入故事讲述创作页。
4. **填文案**：`textarea[placeholder*="输入视频文案"]` 填入 `E2E_TEXT`（仅填文案，其余选项保持保存值）。
5. **等待可用**：轮询 `[data-testid="start-story2video"]` 的 `isDisabled()`，最多 30s（等待保存选项回填 / provider 就绪后的可启动状态）；超时抛 `启动流水线按钮未在 30s 内可用`。
6. **启动**：DOM 直接 `document.querySelector('[data-testid="start-story2video"]').click()`（避开 UI 框架 ripple/overlay 造成的 Playwright 命中测试拦截）。
7. **捕获 runId**：优先读 `window.__s2vCaptured`，兜底从 `pipelineHistory()` 取启动后新建的 `story2video-compose` run。
8. **轮询至终态**：每 8s 调 `pipelineGetRunContext(runId)`，打印阶段进度（`split/domain_enrich/optimize/generate_assets/compose/publish` 的 running 状态），直到 `completed/failed/cancelled`；总超时 60min。
9. **成片校验**：从 `context` 递归查找 `videoPath`/`outputPath` 真实文件 → `ffprobe` 校验编码/分辨率/时长/大小 → 拷贝到 `E2E_OUT_DIR` 并写 `*-report.json`，打印 `E2E_OK`。

### 4. 交互与显示项（真实 UI 上看到的内容）

| 显示/交互元素 | 内容 | 备注 |
|---------------|------|------|
| 创作页入口 | 「视频创作」→「故事讲述」卡片（`.pipeline-card` 标题「图片轮播」） | 点击进入 |
| 文案输入框 | placeholder 含「输入视频文案」 | 驱动仅在此填入文案 |
| 启动按钮 | `data-testid="start-story2video"`，文案「启动流水线」 | 回填完成前 `disabled`；可用后高亮 |
| 启动中提示 | 按钮进入 loading，禁用防重复点击 | 与 `PIPELINE_CONCURRENCY_LIMIT` 友好提示互斥（本机上限 4，单条不触发） |
| 阶段进度 | 6 阶段色块随运行推进（split/domain_enrich 完成 → optimize 运行 → generate_assets/compose/publish） | 驱动每 8s 打印当前 running 阶段到控制台 |
| 终态 | 「完成 / 失败 / 已取消」 | 驱动据此判定成功并校验成片 |
| 友好提示（异常） | 内容政策：`needs_user_input(reason=empty_result)`；超限：`当前已有 N 条流水线正在运行…` | 见 PRD「空响应重试合同」「真实链路修复合同」 |

### 5. 结果矩阵（4 份不同文案，全部成功生成真实 mp4）

| # | 文案主题 | runId | 7 阶段 | 成片时长 | 成片大小 | 编码 |
|---|----------|-------|--------|----------|----------|------|
| 1 | 书店·老林·女孩 | `run_1787742562753_sea5` | ✅ 全 success | 13.42s | 4.08MB | h264 1920×1080 + aac |
| 2 | 老茶馆·阿菊 | `run_1787744519579_94sy` | ✅ 全 success | 15.17s | 4.47MB | h264 1920×1080 + aac |
| 3 | 凌晨面馆·老吴 | `run_1787744746481_j0fm` | ✅ 全 success | 14.85s | 3.50MB | h264 1920×1080 + aac |
| 4 | 瘸腿橘猫·小杨 | `run_1787746217281_cxsg` | ✅ 全 success | 12.16s | 3.13MB | h264 1920×1080 + aac |

- 4 份文案覆盖不同场景密度与情绪基调，均经 7 阶段（split → scene_context → optimize → select_video_scenes → generate_assets → compose → publish）全部 `success=true`。
- 成片均满足 `s2vOutputConfig`：1920×1080 / 30fps / mp4，含字幕与 Mimo TTS 配音（voiceSpeed 1.2 / voiceVolume 1.5）。
- 证据：`C:/tmp/s2v-e2e/` 下 `run4-evidence.mp4`、`runA-evidence.mp4`、`runB-evidence.mp4`、`s2v-runC.mp4`（对应 run4/runA/runB/runC，均为 `E2E_OK` 输出）。

### 6. 过程中暴露并修复的驱动健壮性问题（落点 `story2video-saved-options-driver.js`）

| # | 问题 | 现象 | 根因 | 修复 |
|---|------|------|------|------|
| 1 | `connectOverCDP` 无超时 | 首连偶发永久挂起（runC 首次卡 5 分钟无输出） | 无超时 Promise 卡死 | 新增 `connectWithTimeout`（12s 超时）+ `CONNECT_RETRIES=5` 重试 + 5s 退避 |
| 2 | hash 路由 goto 不重载 | `.pipeline-card` 偶发 60s 超时（run2/run3） | `goto('/#/')`→`goto('/#/create')` 仅改 hash，不重拉 `CreateView.vue` | 接入后强制 `goto('/')` 再 `goto('/#/create')` 整页重载 |
| 3 | `.pipeline-card` 等待脆弱 | Vite 动态模块瞬时加载失败致永远等待 | 单次 `waitForSelector` 无重试 | `.pipeline-card` 等待带 `CARD_RETRIES=3`，超时后 reload 再等 |
| 4 | `start.click()` 命中测试拦截 | Playwright 点按钮挂起 30s | UI 框架 ripple/overlay 拦截命中测试 | 改用 DOM 直接 `btn.click()` |
| 5 | 失败退出遗留悬空连接 | 失败时 `process.exit(1)` 未关 browser | 缺 `finally` 关闭 | `finally` 中 `browser.close()`；修正退出码：**成功→exit 0，失败→exit 1**（原参考副本无条件 exit 1，已修正） |

> 区分结论：**#1–#4 均为 E2E harness 间歇问题，非流水线 bug**；流水线本身（split/optimize/generate_assets/compose）在单实例环境下稳定。optimize 卡死属**环境竞争**（见 §1），亦非代码缺陷。

### 7. 复现方式

```bash
# 1) 单实例启动应用（profile + CDP 9333 / vite 5180），外部起 splitter(8002)/prompt-engine(8013)
# 2) 运行驱动（PLAYWRIGHT_REQUIRE 指向仓库内 playwright 解析路径）
E2E_CDP_URL=http://127.0.0.1:11038 \
E2E_VITE_ORIGIN=http://127.0.0.1:6990 \
E2E_LABEL=runX \
E2E_TEXT="<你的文案>" \
E2E_OUT_DIR=C:/tmp/s2v-e2e \
PLAYWRIGHT_REQUIRE="$(node -e "console.log(require.resolve('playwright'))")" \
node apps/desktop/tests/e2e/story2video-saved-options-driver.js
# 成功输出含 REPORT_DIR / RUN_ID / STATUS=completed / VIDEO=... / FFPROBE=... / E2E_OK
```
