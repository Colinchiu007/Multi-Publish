# 全流水线选项 E2E 覆盖矩阵（除图片轮播）

> 生成时间：2026-08-11（质量节拍）。所有「已测」均来自真实 Electron E2E 产物（`ffprobe`/像素分析验证），
> 非 mock。产物目录：`C:\tmp\all-pipeline-outputs\full-e2e\`（本机验证时）。
> 枚举值来源：`story2video-text-config.js` / `pipeline-engine.js` / `story2video-compose-engine.js` / `model-provider-seeds`。

> ⚠️ **证据边界（2026-08-11 诚实性修正）**：原始全量运行（`full-e2e` 目录，debug-profile 真实 Key）的产物使用
> **真实 AI 图片**（imageStyle/resolution/fps 已验证，segment 图为 453KB 真实 jpg）。后续补跑的全枚举运行
> （`options-matrix` 目录，复制 profile 因 safeStorage Key 未解密）的 S2V 图片为 **ffmpeg 占位图降级**
> （暗色 #1a1a2e + 文字，帧检查 RGB≈(23,21,43)、30 色）。由于 transition/imageEffect/subtitle/watermark/format/
> sceneDurationMode 是 **compose 层效果**（作用于任何图片源），其选项生效性验证仍有效；但「真实 AI 图 + 该选项」
> 的组合仅 imageStyle/resolution/fps 有真实图证据。clip-factory/cinematic/localization/talking-head 不依赖 AI 生图，
> 验证基于源视频/音频，不受影响。

## 1. story2video-compose（合成流水线）

### compose 阶段

| 选项 | 合法值 | 测试值 | 是否生效 | 证据 |
|------|--------|--------|---------|------|
| transition | none / fade / slide-left / slide-right / slide-up / slide-down | none / fade / slide-left（长多句文案 2 场景） | ✅ | 帧级分析：none=单帧跳变、fade=0.4s 亮度渐变（vs-prev 峰值 4.49）、slide-left=0.3s 空间位移（vs-2.7s 振荡 0.61→1.02）；buildTransitionPlan→xfade 各模式单测覆盖 |
| imageEffect | none / zoom-in / zoom-out / pan-left / pan-right / pan-up / pan-down / zoom-pan / rotate / blur-in | zoom-in(默认)、zoom-pan、none | ✅ | 帧间 MAE：zoom-pan=20–24，none=0.1–0.3 |
| subtitleEnabled | true / false | true | ✅ | 字幕底部区域 MAE=52（无字幕 5.7） |
| format | mp4 / webm | webm | ✅ | ffprobe：vp9+opus+matroska/webm |
| resolution | 任意（160–7680） | 720x1280 / 1920x1080 / 1080x1920 | ✅ | ffprobe 精确匹配 |
| fps | 1–120 | 24 / 30 / 60 | ✅ | ffprobe 精确匹配 24/1、30/1、60/1 |
| sceneDurationMode | follow-audio / min-duration | follow-audio(默认)、min-duration+minSceneDuration=8 | ✅ | min-duration 产物时长精确 8.000s |
| watermark | true / false + text | true + "TEST-WM" | ✅ | 右下角区域 MAE=63 |
| voiceVolume / bgmVolume / bgmPath | 0–2 / 0–2 / 路径 | 未测 | ⏳ | 需真实音频混音验证 |

### generate_assets 阶段

| 选项 | 合法值 | 测试值 | 是否生效 | 证据 |
|------|--------|--------|---------|------|
| imageStyle | realistic/cartoon/anime/oil_painting/watercolor/pixel/cyberpunk/fantasy/photography/3d_render/minimalist/abstract/portrait/landscape + cinematic 等引擎风格 | cinematic/anime/watercolor/realistic/minimalist | ✅ | 5 产物内容不同（MAE 42–49）；生成图为真实 AI 图（std 68.7） |
| aspectRatio | 16:9 / 9:16 / 1:1 / 4:3 / 3:4（须与分辨率匹配） | 9:16（720x1280）、16:9（1920x1080） | ✅ | 分辨率精确匹配 |
| voiceSpeed / voicePitch / voiceEmotion / voiceId | 0.5–2 / -12–12 / default 等 | 未测 | ⏳ | 需听感 + 音频时长验证 |
| concurrency | 1–8 | 默认 3 | 未测 | 调度行为，非产出差异 |

### optimize / split / domain_enrich

| 选项 | 合法值 | 测试值 | 是否生效 | 证据 |
|------|--------|--------|---------|------|
| split.mode | fast / balanced / precise | 默认 balanced | 未测 | 影响分句质量，非直接产出差异 |
| split.language | auto / zh / en | 默认 auto | 未测 | 中文文案下 auto 正常 |
| contentType | general / history | 默认 general | 未测 | 影响历史内容提示词增强 |
| optimize.style / creativeLevel | 14 种风格 / 1–10 | 默认 | 未测 | 经 prompt-engine 影响图片提示词 |

## 2. clip-factory

| 选项 | 合法值 | 测试值 | 是否生效 | 证据 |
|------|--------|--------|---------|------|
| sceneThreshold | 0–1（建议 0.1–0.5） | 0.1 / 0.5 | ✅ | 40.69s vs 55.62s |
| maxSegments | 1–N | 2 / 4 | ✅ | 10.19s vs 25.36s |
| minSegmentSeconds | ≥1 | 1 / 5 | ⚠️ 相同但合理 | 源视频所有场景≥5s（ffmpeg 场景检测证实），无 1–5s 片段可过滤 |
| maxTotalSeconds | 1–N | 30 | ✅ | 精确 25.36s |

## 3. cinematic

| 选项 | 合法值 | 测试值 | 是否生效 | 证据 |
|------|--------|--------|---------|------|
| resolution | 任意 | 720x1280 / 1920x1080 / 1080x1920 | ✅ | ffprobe 精确匹配 |

## 4. localization-dub

| 选项 | 合法值 | 测试值 | 是否生效 | 证据 |
|------|--------|--------|---------|------|
| targetLanguage | en / ja / ko / … | en / ja / ko | ✅ en/ja；❌ ko | en=2.24s、ja=2.59s（时长不同）；ko TTS 全部失败（待确认韩语音色） |

## 5. talking-head

| 选项 | 合法值 | 测试值 | 是否生效 | 证据 |
|------|--------|--------|---------|------|
| text 长度 | 任意 | 短 / 长 | ✅ | 字幕区 MAE=17.5（全帧 5.7），字幕随文案变化；时长=源视频 |

## 6. animated-explainer / documentary-montage

| 流水线 | 测试值 | 结果 | 证据 |
|--------|--------|------|------|
| animated-explainer | 短/长主题 | ✅（修复后） | PR #507（LLM 有界重试 + JSON 修复）；纯源码 E2E 完成 |
| documentary-montage | 短/长主题 | ✅ | 纯源码 E2E 产出 1920×1080 视频（67.8s / 105.6s） |

## 7. 视频模型流水线

| 流水线 | 测试值 | 结果 | 证据 |
|--------|--------|------|------|
| animation | 默认 | ✅ | 1088×832 / 5.06s |
| hybrid | 默认 | ✅ | 1088×832 / 8.4s |
| character-animation | 默认 | ❌ 外部限流 | agnes 2次/分 + 队列满 503（非代码问题） |
| avatar-spokesperson | 默认 | ❌ 外部限流 | 同上 |
| podcast-repurpose | 默认 | ✅ | 720×1280 / 10s |
| framework-smoke | 默认 | ✅ | 640×360 / 2s |

## 统计

- 真实用例：43（35 全矩阵 + 8 S2V compose 专项）
- 成功产出：35
- 失败/阻塞：8（4 assets 挂起→已修复 PR #504/#507；2 agnes 外部限流；1 ko TTS；1 LLM 场景解析→已修复 PR #507）
- 已修复并合并：PR #504（minimax 超时 + 能力模型）、PR #507（explainer LLM 容错）

## 待补（环境恢复后）

1. character-animation / avatar：等 agnes 限流窗口重跑（运行器 `apps/desktop/tests/e2e/video-model-pipelines.js`，注入 `AGNES_API_KEY` + `LLM_API_KEY` 后一键执行）
2. S2V transition 全枚举视觉验证：需多场景文案（当前 LLM 把测试文案拆成单场景）
3. imageEffect 全 10 值、voiceSpeed/Pitch、split.mode、optimize.style 等：运行 `apps/desktop/tests/e2e/pipeline-options-matrix.js`
4. loc-ko：确认韩语音色后重测

