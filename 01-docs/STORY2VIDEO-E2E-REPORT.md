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
