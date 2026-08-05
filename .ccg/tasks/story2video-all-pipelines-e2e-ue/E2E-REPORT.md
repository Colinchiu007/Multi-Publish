# 视频创作真实 E2E 报告（2026-08-06）

## 环境

- 代码：`_worktrees/story2video-notifications-i18n-fix` main=7b6dfd8（PR #362/#363 已合并）
- Profile：`C:\tmp\Multi-Publish-debug-profile`（已登录 `a`，identity-session + entitlement 有效，UI 显示“已连接”）
- 已配置真实模型：minimax-image(image-01)、minimax-tts(speech-2.8-turbo)、agnes-llm、sensenova-llm
- 驱动：Playwright Electron（dev 模式 Vite 5174，登录 profile），真实调用 8002 分句 / prompt_engine(8013) / MiniMax 图片与 TTS / FFmpeg 合成

## story2video-compose（图片轮播）— ✅ 真实生成 PASS

- 输入文案：「海边的清晨，阳光洒在沙滩上。海浪轻轻拍打着岸边，海鸥在天空中盘旋。」
- 流程：视频创作 → 图片轮播 → 输入内容 → 启动流水线（按钮可用）→ 六阶段自动执行 → 完成
- 产物（`story2video-projects/<user>/run_1785955845694_kqjm/`）：
  - `project.json`：`status=completed`
  - `segment_0000_image.jpg`（237KB，真实生成图片）
  - `narration.m4a`（138KB）+ `segment_0000_audio.mp3`（140KB，真实 TTS）
  - `segment_0000_video.mp4` + `video.mp4`（526KB，最终合成）
- ffprobe（捆绑 `.media-tools/ffprobe.exe`）：`h264 720x1280 30fps + aac`，`duration=8.615s`
- UI：创作历史显示该运行「已完成」2026/8/6 02:51:09，可「打开」
- 页面错误：0（无 pageerror / console error）
- 截图：`D:/tmp/e2e-real-final.png`

## 其余 13 条流水线 — ❌ 无真实执行引擎（实现缺口，非模型缺失）

- 证据（代码）：`pipeline-engine.js:6-17`（state_machine 仅跟踪状态）、`stage-executor.js:16-24`（旧 13 条无 stage.type → MANUAL_CHECKPOINT）、`pipeline-engine.js:600-612`（仅 story2video 归一化并 autoAdvance）、Python 后端仅单步工具无编排器。
- 证据（UI 实测，代表例「数字人口播」）：点击启动后停留首阶段「进行中」，其余阶段「等待中」，进度 **0%** 持续不变，无产物生成、无自动推进。
- 结论：这 13 条流水线当前**无法产生真实视频**，需要先实现执行引擎（每条流水线都是完整产品级管线）或在前端明确标识为未实现。

## 判定矩阵（14 条）

| 流水线 | 真实生成 E2E | 证据 |
|---|---|---|
| story2video-compose | ✅ 通过 | 上述真实产物 + ffprobe + project.json=completed |
| 其余 13 条 | ❌ 无法 | state_machine 占位 + UI 0% 停滞 |

## 13 条非 s2v 流水线逐条 UI 实测扫描（2026-08-06 03:18）

驱动：Playwright Electron + 登录 profile；每条：点卡片 → 记录表单 → 输入文案 → 启动 → 等 8s → 记录进度/阶段 → 取消清理。结果全部一致：启动可用 → 进度恒 0% → 首阶段「进行中」无推进、无产物、无错误。

| pipeline | 表单标记 | 启动后 8s 进度 | 卡住阶段 |
|---|---|---|---|
| animated-explainer | 输入内容/视觉风格/高级配置/输出设置/素材/旁白 | 0% | 内容调研 |
| talking-head | +上传/字幕 | 0% | 上传素材 |
| cinematic | 通用 | 0% | 导入素材 |
| animation | 通用 | 0% | 创意概念 |
| avatar-spokesperson | 通用 | 0% | 选择数字人 |
| character-animation | 通用 | 0% | 角色设计 |
| clip-factory | 通用 | 0% | 分析 |
| documentary-montage | 通用 | 0% | 内容调研 |
| hybrid | 通用 | 0% | 规划 |
| localization-dub | 通用 | 0% | 转录 |
| podcast-repurpose | 通用 | 0% | 分析 |
| screen-demo | +录制 | 0% | 录制 |
| framework-smoke | 通用 | 0% | 验证 |

结论不变：13 条流水线无真实执行引擎（state_machine 占位）。每条运行均已取消，未留下停滞运行记录。

## story2video 复跑（多场景）— ✅ PASS（2026-08-06）

- 输入（3 句/2 场景）：「春天来了，公园里的花朵竞相开放。孩子们在草地上放风筝。傍晚时分，夕阳把天空染成了金色。」
- 新 run `run_1785957902304_dca8`：2 张生成图片（segment_0000/0001_image.jpg）+ 3 段音频（2×segment_audio + narration.m4a）+ 分段视频×2 + 最终 video.mp4。
- ffprobe：h264 720x1280 + aac，duration=10.867s（多场景时长正确变长）。project.json=completed，页面零错误。

## 真实 provider 调用链证据（model_provider_logs，rowid 倒序）

- `agnes-llm chatCompletion success` ×3（两次运行的 LLM 增强/优化，默认 LLM=agnes-llm）
- `minimax-image generateImage success` ×3（1+2 张图片，latency 15s 级）
- `minimax-tts synthesize success` ×3
- 即：Agnes LLM → MiniMax Image → MiniMax TTS → FFmpeg 合成，全部真实成功。

## animated-explainer（AI 讲解视频）— ✅ 真实生成 PASS（2026-08-06 04:06）

- 输入主题：「人工智能的起源与三次浪潮」（纯文本）
- 流程：视频创作 → AI 讲解视频 → 输入主题 → 启动流水线 → 8 阶段自动完成（内容调研→方案提议→脚本撰写→分镜规划→素材准备→剪辑→视频合成→发布）
- 真实 provider 调用（model_provider_logs）：agnes-llm chatCompletion（4 次规划链）+ minimax-image generateImage ×10（约 17s/张）+ minimax-tts synthesize
- 产物：`story2video-projects/<user>/run_1785960181270_25q0/`：10 张真实 JPG（130-340KB）+ narration + 分段视频 + `video.mp4`
- ffprobe：`h264 1920x1080 30fps + aac`，duration=98.97s，size=7.77MB；project.json `pipeline=animated-explainer status=completed`，6+ 分段
- 中间修复（已提交）：scenes JSON 解析容错 + 行级兜底；默认图片/TTS provider 自动解析（避免本地降级）；项目持久化泛化
- 页面零错误；UI 创作历史可打开该完成项目

## 已跑通流水线汇总（真实生成）
| 流水线 | 状态 | 产物 |
|---|---|---|
| story2video-compose | ✅ | 8.6s / 10.9s 竖屏视频 |
| animated-explainer | ✅ | 98.97s 横屏 1080p 讲解视频 |
| 其余 12 条 | ❌ 无引擎/缺模型 | 见 ENGINE-FEASIBILITY.md |

## clip-factory（视频切片工厂）— ✅ 真实生成 PASS（2026-08-06 05:16）

- 输入：ffmpeg 生成的 3 色块测试视频（640x360 12s，t=4/t=8 硬切）
- 流程：视频创作 → 视频切片工厂 → 视频素材上传 → 启动流水线 → 4 阶段（分析→片段提取→添加字幕→导出）自动完成
- 场景检测：`select='gt(scene,0.3)',metadata=print` 解析出 t=4/t=8 两个切点 → 3 个片段
- 产物：`story2video-projects/<user>/run_1785964594990_kzos/`：3 个 segment 视频 + `video.mp4`
- ffprobe：`h264 640x360`，duration=12.0s，size=12312；project.json `pipeline=clip-factory status=completed segments=3`
- 关键修复（已提交）：runTool 合并 stderr（metadata 走 stderr）；视频媒体导入路径链路；输出目录进允许媒体根；_finalizeRun 保存条件补 clip-factory；UI 结果提取兼容 context.export

## 已跑通流水线汇总（真实生成）
| 流水线 | 状态 | 产物 |
|---|---|---|
| story2video-compose | ✅ | 8.6s / 10.9s 竖屏视频 |
| animated-explainer | ✅ | 98.97s 横屏 1080p 讲解视频 |
| clip-factory | ✅ | 12s 切片高亮（3 片段合并） |
| 其余 11 条 | ❌ 无引擎/缺模型 | 见 ENGINE-FEASIBILITY.md |

## cinematic（电影感短片）— ✅ 真实生成 PASS（2026-08-06 05:46）

- 输入：640x360 测试视频（12s）
- 流程：视频创作 → 电影感短片 → 视频素材上传 → 启动流水线 → 4 阶段（导入素材→调色→视频合成→渲染）自动完成
- 处理：FFmpeg eq 调色（对比度/亮度/饱和度）→ 淡入淡出 + 1920x1080 缩放/加黑边 → 渲染
- 产物：`story2video-projects/<user>/run_1785966369023_4oho/video.mp4`
- ffprobe：`h264 1920x1080`，duration=12.0s，size=45632；project.json `pipeline=cinematic status=completed segments=1`
- 关键修复：resolveComposeOutput 精确匹配含 videoPath 的输出（cinematic 的 stage 名 compose 与 saveRun 上下文键冲突导致未持久化）；FFmpeg pad 用冒号语法避免 x 语法解析失败

## 已跑通流水线汇总（真实生成）
| 流水线 | 状态 | 产物 |
|---|---|---|
| story2video-compose | ✅ | 8.6s / 10.9s 竖屏视频 |
| animated-explainer | ✅ | 98.97s 横屏 1080p 讲解视频 |
| clip-factory | ✅ | 12s 切片高亮（3 片段合并） |
| cinematic | ✅ | 12s 1080p 电影感短片 |
| 其余 10 条 | ❌ 无引擎/缺模型 | 见 ENGINE-FEASIBILITY.md |

## framework-smoke（框架冒烟测试）— ✅ 真实生成 PASS（2026-08-06 05:55）

- 流程：视频创作 → 框架冒烟测试 → 输入文案 → 启动流水线 → 2 阶段（验证→报告）自动完成
- 验证：FFmpeg/ffprobe 可用 + 流水线注册表 + stageExecutor
- 产物：`story2video-projects/<user>/run_1785966955900_t2hw/video.mp4`（testsrc 测试视频）
- ffprobe：`h264 640x360 + aac`，duration=2.0s；project.json `pipeline=framework-smoke status=completed segments=1` + report.md

## 已跑通流水线汇总（真实生成）
| 流水线 | 状态 | 产物 |
|---|---|---|
| story2video-compose | ✅ | 8.6s / 10.9s 竖屏视频 |
| animated-explainer | ✅ | 98.97s 横屏 1080p 讲解视频 |
| clip-factory | ✅ | 12s 切片高亮（3 片段合并） |
| cinematic | ✅ | 12s 1080p 电影感短片 |
| framework-smoke | ✅ | 2s 冒烟测试视频 + 报告 |
| 其余 9 条 | ❌ 无引擎/缺模型 | 见 ENGINE-FEASIBILITY.md |

## talking-head（口播视频）— ✅ 真实生成 PASS（2026-08-06 06:03）

- 输入：640x360 测试视频 + 3 段口播文案
- 流程：视频创作 → 口播视频 → 视频素材上传 + 文案 → 启动流水线 → 4 阶段（上传素材→转录→字幕生成→渲染）自动完成
- 处理：文案分句（均分时长）→ SRT → FFmpeg subtitles 烧录（cwd 相对路径规避 Windows 转义）
- 产物：`story2video-projects/<user>/run_1785967419639_e126/video.mp4`
- ffprobe：`h264 640x360`，duration=12.0s；project.json `pipeline=talking-head status=completed segments=3`
- 边界：用户提供文案时无需语音识别；无文案 fail closed（提示配置识别模型）

## 已跑通流水线汇总（真实生成）
| 流水线 | 状态 | 产物 |
|---|---|---|
| story2video-compose | ✅ | 8.6s / 10.9s 竖屏视频 |
| animated-explainer | ✅ | 98.97s 横屏 1080p 讲解视频 |
| clip-factory | ✅ | 12s 切片高亮（3 片段合并） |
| cinematic | ✅ | 12s 1080p 电影感短片 |
| framework-smoke | ✅ | 2s 冒烟测试视频 + 报告 |
| talking-head | ✅ | 12s 字幕烧录口播视频 |
| 其余 8 条 | ❌ 无引擎/缺模型 | 见 ENGINE-FEASIBILITY.md |
