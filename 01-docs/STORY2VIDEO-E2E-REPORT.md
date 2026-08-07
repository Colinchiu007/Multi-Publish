# Story2Video 视频创作流水线 E2E 真实测试报告（2026-08-06）

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
