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
