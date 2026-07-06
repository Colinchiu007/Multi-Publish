# OpenMontage 集成分析报告 v3（修正版）

**日期**: 2026-07-06
**产品定位修正**: Multi-Publish = 一站式内容创作 + 自动发布平台
**范围**: OpenMontage 全部模块按"内容创作管线"视角重新评估

---

## 核心架构：内容创作管线

```
用户输入 (文字/图片/视频/URL)
    │
    ▼
┌─────────────────────────────────────────────────┐
│ Pipeline 编排 (pipeline_defs/ + pipeline_loader) │
│   ├─ 创意阶段: research → proposal → script      │
│   ├─ 制作阶段: scenes → assets → compose         │
│   └─ 交付阶段: publish                           │
├─────────────────────────────────────────────────┤
│   AI 视频生成 (tools/video/)    15 家提供商       │
│   AI 图像生成 (tools/graphics/) 14 家提供商       │
│   AI 音频/TTS (tools/audio/)   7+ 家提供商        │
│   素  材  库  (tools/video/stock_sources/) 15 源  │
│   视  频  分 析  (tools/analysis/) 12 种分析      │
│   视  频  增  强  (tools/enhancement/) 6 种       │
│   字  幕  生  成  (tools/subtitle/)               │
├─────────────────────────────────────────────────┤
│   基础设施: base_tool / registry / config         │
│   检查点: checkpoint / scoring / slideshow_risk   │
└─────────────────────────────────────────────────┘
    │
    ▼
PreCheck 引擎 → 多平台发布器 → RPA 引擎
```

---

## 逐模块集成计划

### Phase 0: 基础设施 (P0, ~4,000 行)

| 文件 | 用途 | 集成方式 |
|------|------|---------|
| `tools/base_tool.py` | 所有工具的基类 (ToolTier/Stability/Result) | 直接复制到 `packages/python-backend/src/multi_publish/video_creation/` |
| `tools/tool_registry.py` | 工具注册与发现 | 同上 |
| `tools/cost_tracker.py` | API 预算管理 (WARN/CAP/OBSERVE) | 同上 |
| `lib/config_model.py` | Pydantic 配置模型 + YAML 加载 | 同上 |
| `lib/env_loader.py` | .env 加载 | 已有替代 |

### Phase 1: AI 视频生成 (P0, ~18,000 行)

**15 家视频提供商:**
| 提供商 | 文件 | 说明 |
|--------|------|------|
| Hunyuan | `tools/video/hunyuan_video.py` | 腾讯混元 |
| Kling | `tools/video/kling_video.py` | Kling |
| Runway | `tools/video/runway_video.py` | Runway Gen |
| VEO | `tools/video/veo_video.py` | Google VEO |
| WAN | `tools/video/wan_video.py` | Wan 2.1 |
| CogVideo | `tools/video/cogvideo_video.py` | CogVideo |
| Minimax | `tools/video/minimax_video.py` | Minimax |
| Grok | `tools/video/grok_video.py` | Grok Video |
| HeyGen | `tools/video/heygen_video.py` | HeyGen |
| Seedance | `tools/video/seedance_video.py` + `_replicate.py` | Seedance |
| LTX | `tools/video/ltx_video_local.py` + `_modal.py` | LTX Video |
| HiggsField | `tools/video/higgsfield_video.py` | HiggsField |
| ComfyUI | `tools/_comfyui/` | ComfyUI 工作流 |
| HyperFrames | `tools/video/hyperframes_compose.py` | HyperFrames |

**视频处理工具:**
| 文件 | 功能 |
|------|------|
| `video_compose.py` | 视频合成编排 |
| `video_selector.py` | 提供商选择 |
| `video_stitch.py` | 多片段拼接 |
| `video_trimmer.py` | 视频裁剪 |
| `auto_reframe.py` | 自动重构图 |
| `silence_cutter.py` | 静音剪切 |
| `remotion_caption_burn.py` | 字幕烧录 |
| `showcase_card.py` | 展示卡片 |
| `green_screen_*.py` | 绿幕合成 |
| `clip_cache.py` | 片段缓存 |
| `clip_search.py` + `corpus_builder.py` | 素材搜索 |

**素材源 (15 个):**
Pexels, Pixabay, NASA, ESA, Archive.org, Wikimedia, Videvo, Mixkit, Coverr, Unsplash, Dareful, NARA, NOAA, JAXA, LOC

### Phase 2: AI 图像生成 (P0, ~3,500 行)

| 提供商 | 文件 |
|--------|------|
| Flux | `tools/graphics/flux_image.py` |
| DALL-E | `tools/graphics/openai_image.py` |
| Imagen | `tools/graphics/google_imagen.py` |
| Grok | `tools/graphics/grok_image.py` |
| Recraft | `tools/graphics/recraft_image.py` |
| Pixabay | `tools/graphics/pixabay_image.py` |
| Pexels | `tools/graphics/pexels_image.py` |
| ComfyUI | `tools/graphics/comfyui_image.py` |
| Local Diffusion | `tools/graphics/local_diffusion.py` |

### Phase 3: AI 音频/TTS/音乐 (P1, ~3,700 行)

**TTS (7 家):** ElevenLabs, OpenAI, 豆包, Google, Piper, TTS Selector
**音乐 (5 家):** Suno, Pixabay Music, Freesound, Music Library, Music Generator

### Phase 4: 视频分析 (P1, ~4,200 行)

**12 种分析能力:** 场景检测, 人脸跟踪, 帧采样, 视频理解, 视觉QA, 转录, 音频分析, 构图验证, 视频下载

### Phase 5: 增强/字幕/录制 (P2, ~3,200 行)

**图像增强:** 人脸修复, 人脸增强, 眼部增强, 去背景, 调色, 超分
**字幕生成:** subtitle_gen
**屏幕录制:** screen_recorder, cap_recorder

### Phase 6: Pipeline 编排 (P1, ~1,000 行)

**13 个 Pipeline 定义:** animated-explainer, cinematic, talking-head, avatar-spokesperson, character-animation, animation, clip-factory, hybrid, screen-demo, documentary-montage, localization-dub, podcast-repurpose, framework-smoke

### Phase 7: 角色动画 (P3, ~900 行)

character_animation.py

---

## 整合策略

### 架构决策

```
packages/python-backend/src/multi_publish/
├── video_creation/          # 新增: OpenMontage 视频创作引擎
│   ├── base_tool.py         # Phase 0: 工具基类
│   ├── tool_registry.py     # Phase 0: 注册表
│   ├── cost_tracker.py      # Phase 0: 预算
│   ├── config_model.py      # Phase 0: 配置
│   ├── providers/           # Phase 1-3: AI 提供商
│   │   ├── video/           #   15 家视频提供商
│   │   ├── image/           #   9+ 家图像提供商
│   │   └── audio/           #   7+ 家音频提供商
│   ├── pipeline/            # Phase 6: Pipeline 编排
│   │   ├── loader.py
│   │   ├── checkpoint.py
│   │   └── definitions/     # 13 个 pipeline YAML
│   ├── analysis/            # Phase 4: 视频分析
│   ├── enhancement/         # Phase 5: 视频增强
│   └── stock_sources/       # Phase 1: 15 素材源
└── publishers/              # 已有: 发布器
```

### 依赖管理

- **核心依赖**: httpx, pydantic, pyyaml, jsonschema
- **视频提供商**: 各自 SDK (可选, pip extras)
- **素材源**: 各自 API 客户端 (可选)
- **FFmpeg**: 必需 (已有)

### 与现有系统的集成点

| 集成点 | 说明 |
|--------|------|
| `publishers/base.py` ← `video_creation/` | 创作完成的内容直接传入发布器 |
| `precheck.py` ← `analysis/` | 预检引擎调用视频分析做质量门禁 |
| `models.py` ← `config_model.py` | 统一配置模型 |
| `tikhub_bridge.py` ← `stock_sources/` | 素材搜索集成 |
| `core/task_queue.py` ← `pipeline/` | Pipeline 任务编排 |
| `render-engine.js` ← `providers/video/` | Python 渲染引擎替代/补充 JS Remotion |

---

## 工作量估算

| Phase | 内容 | 文件数 | 行数 | 预估 |
|-------|------|-------|------|------|
| Phase 0 | 基础设施 | ~5 | ~4,000 | 1-2 天 |
| Phase 1 | AI 视频生成 | ~52 | ~18,000 | 5-7 天 |
| Phase 2 | AI 图像生成 | ~15 | ~3,500 | 1-2 天 |
| Phase 3 | AI 音频/TTS/音乐 | ~14 | ~3,700 | 1-2 天 |
| Phase 4 | 视频分析 | ~13 | ~4,200 | 2-3 天 |
| Phase 5 | 增强/字幕/录制 | ~13 | ~3,200 | 1-2 天 |
| Phase 6 | Pipeline 编排 | ~20 | ~1,000 | 2-3 天 |
| Phase 7 | 角色动画 | ~2 | ~900 | 0.5 天 |
| **总计** | | **~130+** | **~38,500** | **~14-21 天** |
