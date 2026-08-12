# 视频提示词优化引擎设计分析（Video Prompt Optimization Engine）

> **版本**: v1.0
> **日期**: 2026-08-11
> **状态**: 设计已确认，Phase 1 实施中（2026-08-11 起，OpenSpec change video-prompt-optimize-engine）
> **范围**: 统一项目内所有 AI 视频生成的提示词产出/改写/校验，对标图片 prompt-engine（8013）机制
> **任务记录**: `.ccg/tasks/video-prompt-optimize-engine-analysis/task.json`

---

## 一、结论先行（TL;DR）

**推荐方案：把现有外部图片 prompt-engine（`D:\Data\projects\prompt-engine`，8013）升级为「领域化提示词引擎」——新增 `video` 领域，而不是另起炉灶建第二个 sidecar。**

理由：prompt-engine 已经有恰好可复用的两套骨架——**平台策略注册表**（`strategies/base.py:9-62`）和**分镜策略注册表**（`storyboard/base.py:9-74`，支持 `compose_batch(scenes, full_text)` 批量一致性），以及 LLM 多供应商（deepseek/gemini/minimax/openai_compat/xfyun）、KeyRouter、SQLite+内存缓存、RAG 知识库、敏感键拦截、fail-closed 校验。视频只需要在这些骨架上加"领域维度 + 视频平台策略 + 视频字段契约"，Multi-Publish 侧复用同一套 `prompt-engine-contract.js` + `PromptBridge` 通道，改动面最小、与"图片提示词统一走 8013"的既有治理完全同构。

**当前最大差距（调研实证）**：所有 AI 视频生成入口的提示词都是"裸奔"的——分镜 LLM 直接产出画面提示词就交给视频 provider（`apps/desktop/electron/services/videogen-stages.js:168` "供视频生成模型直接使用"），hybrid 模式把图片优化提示词原样当视频提示词用（`apps/desktop/electron/services/story2video-stages.js:667`），Python 侧 16 个视频 provider 全部 `payload = {"prompt": inputs["prompt"]}` 直传（如 `packages/python-backend/src/multi_publish/video_creation/providers/video/kling_video.py:88`）。视频独有的镜头/运动/时序/一致性维度完全缺失。

---

## 二、现状盘点（调研实证）

### 2.1 图片 prompt-engine 机制（要"对标"的样板）

| 层 | 现状 | 证据 |
|---|---|---|
| 服务 | 外部独立仓库 FastAPI，`/v1/optimize`、`/v1/optimize/batch`、`/v1/rewrite`、`/v1/storyboard/compose` 等 | `prompt_engine/api/rest.py:40-125, 757-762` |
| 平台策略 | 装饰器注册表 `@register(platform)`，每平台 `build_system_prompt` + `post_process` | `strategies/base.py:9-62`；已注册 midjourney/stable_diffusion/dalle/tongyi/yizhang/jimeng/generic/xiaohei_storyboard |
| 风格检测 | `StyleCategoryClassifier`：26 个 MJ 风格分类，keyword_match / llm_classify / vector_rag 三方法 | `models.py:40-115` |
| LLM 多供应商 | deepseek / gemini / minimax / openai_compat / xfyun + KeyRouter 按用户档位路由 | `llm/`、`key_router.py` |
| 分镜策略 | `StoryboardStrategy.compose_batch(scenes, full_text, scene_index)` 批量一致性 | `storyboard/base.py:55-74`；xiaohei 抽象→视觉隐喻（8 构图/14 动作/23 物体） |
| 缓存/评估 | SQLite+内存缓存（`/v1/cache/stats`）、evaluator、feedback | `rest.py:736-744`、`evaluator.py`、`feedback.py` |
| 契约单一来源 | Multi-Publish 侧 `prompt-engine-contract.js`：平台/风格枚举+别名归一、数值边界、敏感键拦截、fail-closed 提取 | `apps/desktop/electron/services/prompt-engine-contract.js:15-54, 134-259` |

### 2.2 所有 AI 视频生成入口（要"统一接管"的对象）

**入口 A — 桌面 videogen 流水线**（animation / avatar-spokesperson / character-animation / hybrid）
- 分镜阶段：默认 LLM 直接生成 `{"prompt": "画面提示词（主体/动作/构图/光线/风格，供视频生成模型直接使用）", "text", "duration"}`（`videogen-stages.js:165-171`），**无任何优化/校验/平台适配**
- 生成阶段：`callAdapter(providerId, 'generateVideo', { prompt, model, width, height, numFrames, frameRate })` 直传（`videogen-stages.js:355-385`）

**入口 B — Story2Video hybrid 混合模式**（部分场景视频化）
- `generateSceneVideo`：同一套 `generateVideo` 契约，10 分钟轮询 + 下载 + ffprobe 校验（`story2video-stages.js:372-434`）
- 视频提示词来源：`scene.imagePromptSeed || scene.prompt || scene.text || scene.content`（`story2video-stages.js:664-669`）——即**图片优化提示词被复用作视频提示词**，没有 motion/camera/时序语义

**入口 C — Python video_creation providers**（OpenMontage 移植，16 个 AI 视频 provider）
- hunyuan / kling / runway / veo / wan / cogvideo / minimax / grok / heygen / seedance / ltx(local+modal) / higgsfield / hyperframes / agnes（`providers/video/__init__.py:5-58`）
- 全部直传 `inputs["prompt"]`；参数仅 duration/aspect_ratio/model_variant/seed/negative_prompt（如 `kling_video.py:88-94`、`_shared.py:567-654`）
- 12 条 pipeline 定义（clip-factory/cinematic/documentary-montage/hybrid…，`pipeline/definitions/*.yaml`）无提示词优化环节

**入口 D — 本地 TS 分镜模板** `StoryboardPrompt`（`packages/story2video-engine/src/storyboard-prompt.ts`）——确定性模板式生图提示词（图片轮播用），是 prompt-engine xiaohei 策略的 TS 移植

### 2.3 既有治理约束（设计必须遵守）

- 8013 是**独立运行时边界**：改 REST 契约必须双仓库同步 + 真实服务跨仓库回归（`01-docs/PRD-video-creation.md:116-122`）
- 图片提示词统一走 8013 已有完整复盘与合同：枚举别名归一、error 优先 fail-closed、过短回退原文、`<think>` 剥离、`optimize.context` 注入（`01-docs/learnings.md:187-208, 5629-5726`；`01-docs/PRD.md:1216-1219, 1912-1950`）
- M+/中高风险任务须经 `/opsx:propose` 建 change（机制硬化规则）

---

## 三、目标与边界

**目标**：项目里**所有** AI 视频生成的提示词，统一经"视频提示词优化引擎"产出/改写/校验，像图片一样有单一契约、fail-closed、可回退、可审计。

**边界（本分析不含实施）**：
- 不含新的视频生成 provider 接入；只接管"提示词"这一环
- 不改动图片 prompt-engine 现有行为（`domain=image` 默认值保持兼容）
- 真正的三方验收（真实 provider 出片）仍属外部 acceptance，本引擎只保证"交给 provider 之前的提示词质量与契约"

---

## 四、推荐架构：prompt-engine 升级为双领域引擎

```
┌────────────────────────── Multi-Publish 桌面侧 ──────────────────────────┐
│ videogen 流水线          Story2Video hybrid            Python 流水线      │
│  (storyboard→generate)   (select_video_scenes→gen)    (pipeline stages)  │
│        │                       │                           │             │
│        ▼                       ▼                           ▼             │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ 统一调用点：PromptBridge.optimizeVideo / optimizeVideosBatch     │    │
│  │           （Python 侧：httpx 直连 8013 的同构 thin client）       │    │
│  └───────────────────────────────┬──────────────────────────────────┘    │
└──────────────────────────────────┼───────────────────────────────────────┘
                                   ▼  HTTP 127.0.0.1:8013
┌────────────────────── prompt-engine（外部仓库，v0.20+） ──────────────────┐
│ 领域层   domain: image（现状）| video（新增）                              │
│ 管道层   意图/场景检测 → 平台策略优化 → 结构化输出 → fail-closed 校验       │
│ 策略层   strategies/（图片平台） + strategies_video/（视频平台，新增）      │
│ 分镜层   storyboard/（xiaohei…） + video-storyboard（新增，批量一致性）     │
│ 基建层   LLM 多供应商 / KeyRouter / 缓存(sqlite+mem) / RAG / 敏感键拦截    │
└───────────────────────────────────────────────────────────────────────────┘
```

**为什么复用而不是新建 8014**：策略/分镜/缓存/KeyRouter/敏感拦截全部现成；Multi-Publish 的 Bridge 生命周期、健康检查、打包边界也现成。新建第二个 sidecar = 重复运维 + 契约双份 + 敏感键拦截双份，只有在你预期图片/视频两个引擎会彻底分叉（比如视频要独立部署到云端）时才值得。

---

## 五、机制设计（怎么实现）

### 5.1 请求/响应契约（对外）

```jsonc
POST /v1/optimize   // 兼容：domain 缺省 = image，字段与现状完全一致
{
  "domain": "video",                        // 新增，默认 image
  "prompt": "一只猫在窗台…",
  "platform": "kling",                      // 新增视频平台枚举
  "style": "cinematic",
  "creative_level": 5,
  "max_length": 500,
  "num_candidates": 1,
  "negative_prompt": "blurry, text, logo",
  "context": {                              // 扩展视频上下文
    "scene_type": "运动场景",
    "full_text": "…完整文案…",
    "narration": "对应解说词",
    "prev_scene": "…", "next_scene": "…",   // 前后场景 → 连续性
    "duration_hint": 5,
    "aspect_ratio": "16:9",
    "continuity_token": "char_zhangsan"     // 一致性令牌（角色/场景/风格）
  }
}
// 响应（结构化，兼容图片的 optimized_prompt 字符串）
{
  "optimized_prompt": "…渲染后的单串提示词（可直接喂 provider）…",
  "video": {
    "shot": "medium_wide", "camera": "dolly_in",
    "motion_intensity": 6, "subject_action": "…",
    "scene_transition": "cut", "duration_hint": 5,
    "continuity_token": "char_zhangsan"
  },
  "platform": "kling", "style": "cinematic",
  "model_used": "deepseek", "error": null
}
```

要点：**结构化输出 + 渲染单串**双形态——provider 直接用 `optimized_prompt`，上层编排（分镜编辑/重试/审计）读 `video` 字段。响应校验沿用 `extractOptimizedPrompt` 的 error→detail→空串 fail-closed 顺序（`prompt-engine-contract.js:199-259`），新增 video 字段 schema 校验。

### 5.2 处理管道（Pipeline）

```
输入归一（平台/风格别名、边界收敛、敏感键拦截）
  → ① 意图/场景检测：动作/叙事/展示/对比/对话 + 场景类型（复用 buildOptimizeContext 的对比/细节/全景推断，新增运动/转场/口播）
  → ② 平台策略优化：BaseStrategy 子类按 provider 生成 system prompt（Kling 运动语法 vs Veo 电影语言 vs Wan 写实）
  → ③ 结构化输出解析：LLM 输出 JSON → 规则后处理（剥 <think>、关键词注入、长度截断、negative 拼接）
  → ④ fail-closed 校验：非空、provider 长度上限、schema 合法；失败回退原文+error 标记（与图片一致）
  → ⑤ 缓存/评估：key = hash(domain, platform, prompt, style, creative_level, context, continuity_token)
```

### 5.3 平台策略（strategies_video/）——机制核心

沿用 `BaseStrategy` 抽象，但为视频新增两个方法维度：

| 策略 | 职责示例 | 典型内容 |
|---|---|---|
| `KlingVideoStrategy` | 运动控制语法 | subject + action + camera motion + 镜头时长；`duration` 语义（`kling_video.py:88-94` 支持 duration/aspect_ratio） |
| `VeoVideoStrategy` | 电影语言 | 景别/机位/光线/氛围；Veo 官方"叙述性提示词"风格 |
| `RunwayVideoStrategy` | Gen-4 分镜语义 | 首帧/尾帧引导、镜头连续性（image-to-video 时 `reference_image_url`/tail） |
| `WanVideoStrategy` | 中文写实/细节 | 主体一致性、物理合理性、禁止文字/logo |
| `Seedance/MiniMax/Hunyuan/CogVideo/LTX/HiggsField/Grok/Agnes…` | 各自参数面 | 对照各 adapter 实际请求体（`apps/desktop/electron/services/adapters/*.js`） |
| `GenericVideoStrategy` | 默认兜底 | 通用"主体/动作/环境/光色/镜头/风格"六要素模板，任何平台可用 |

### 5.4 分镜批量一致性（storyboard/video）——视频最独特的机制

视频和图片最大的差别是**跨镜头一致性**。复用 `StoryboardStrategy.compose_batch`（`storyboard/base.py:55-74`），实现一个 `VideoStoryboardStrategy`：

- 输入：`scenes[]`（每场景文案）+ `full_text` + `style` + `continuity_tokens`（角色/场景/风格描述）
- 输出：逐场景结构化视频提示词 + 全局 `continuity_token` 提取（如 `char_zhangsan: 30岁男性，蓝外套`），后续场景引用同一 token 保持角色/场景/风格稳定
- 这同时可以**替换 videogen 现在临时的分镜 LLM 调用**（`videogen-stages.js:165-171` 的 ad-hoc system prompt）——把分镜也收编进引擎，与 `/v1/storyboard/compose` 已有的故事板端点合并成 `/v1/storyboard/compose?domain=video`

### 5.5 成本护栏（视频专属）

视频生成贵且慢，引擎要内置省钱机制：`creative_level` 与 `num_candidates` 在视频域默认收敛（如 candidates 默认 1）；缓存命中优先；`max_length` 按 provider 上限收敛（Kling/Veo 各平台 token 预算不同）；hybrid 模式只优化被选中的 20-40% 动态场景（`01-docs/PRD.md:1563`）。

---

## 六、维度设计（"通过什么维度实现"）

| # | 维度 | 说明 | 现状 | 设计 |
|---|---|---|---|---|
| 1 | **领域 domain** | image / video 切换 | 仅 image | `domain` 字段，默认 image 兼容 |
| 2 | **平台 platform** | sora/kling/veo/runway/wan/seedance/minimax/hunyuan/cogvideo/ltx/higgsfield/grok/agnes + generic_video | 无（直传） | 视频平台枚举 + 别名归一（对齐 `prompt-engine-contract.js:15-42` 模式） |
| 3 | **内容要素** | 主体/动作/环境/道具/光色/风格 | 分镜 LLM 自由发挥 | 六要素结构化字段，缺失自动补全 |
| 4 | **镜头语言** | 景别(shot scale)/机位(camera angle)/运动(camera motion)/转场(transition) | 无 | `video.shot/camera/scene_transition` 枚举 + 约束 |
| 5 | **时序节奏** | 时长/帧数/运动强度/首尾帧(image-to-video) | duration 已有但 prompt 不含 | `motion_intensity(1-10)`、`duration_hint`、首尾帧引导词 |
| 6 | **跨镜头一致性** | 角色/场景/风格 token | 无 | `continuity_token` + `compose_batch` 批量生成 |
| 7 | **音频联动** | 旁白↔画面时序、字幕节奏、数字人口型 | 无 | `narration` 上下文；avatar 流水线专用约束（未来） |
| 8 | **约束/负向** | 画质、禁止文字/logo/水印、物理合理性、平台 token 上限 | 部分 adapter 支持 negative_prompt（`agnes-video.js:166`） | 视频 negative 模板库 + provider 上限收敛 |
| 9 | **安全** | 敏感键拦截、fail-closed、`<think>` 剥离、过短回退 | 图片侧已有 | 全部复用 + video schema 校验 |
| 10 | **评估闭环** | 缓存命中率、优化前后对比、provider 出片反馈 | 图片侧 evaluator/feedback | 视频域增加 cost/quality 采样记录 |

---

## 七、Multi-Publish 集成点（改动面清单）

| 文件 | 改动 |
|---|---|
| `apps/desktop/electron/services/video-prompt-engine-contract.js`（**新文件**，与图片契约分文件分命名） | 视频平台枚举/别名/边界 + `buildVideoOptimizeRequest` + `extractOptimizedVideoPrompt`（结构化校验）+ `normalizeVideoMeta` |
| `apps/desktop/electron/services/prompt-bridge.js` | `optimizeVideo` / `optimizeVideosBatch`（走 `video-prompt-engine-contract.js` 构造请求） |
| `apps/desktop/electron/services/story2video-stages.js` | hybrid `select_video_scenes` 选中场景先走视频优化再 `generateSceneVideo`（不再复用图片提示词，`667` 处改链） |
| `apps/desktop/electron/services/videogen-stages.js` | `videogen_storyboard` 后接批量视频优化（或直接换成 `storyboard/compose?domain=video`）；`videogen_generate` 前校验提示词 |
| `apps/desktop/electron/services/stage-executor.js` | 复用 OPTIMIZE_BATCH 的逐项 fail-closed 模式，新增视频批量校验 |
| `packages/python-backend/.../providers/video/*.py` | **不改** provider 内部（保持哑直传）；在 pipeline 编排层（asset-director/stage）加可选优化钩子 |
| `config/platforms.yaml` + 模型预设 | 视频平台枚举与桌面契约对齐 |

---

## 八、演进路径（分阶段，可回滚）

- **Phase 0（当前）**：本分析 → 确认后 `/opsx:propose` 建 change → PRD
- **Phase 1（最小闭环）**：prompt-engine 加 `domain=video` + `GenericVideoStrategy` + 结构化输出 + 双仓库契约/测试；Story2Video hybrid 视频场景提示词接管；验证：单场景真实 provider 出片对比优化前后
- **Phase 2（平台化）**：sora/kling/veo/runway/wan/seedance/minimax… 各平台策略；`compose_batch` 批量一致性 + continuity_token；videogen 分镜收编
- **Phase 3（质量闭环）**：candidates 对比、evaluator/feedback、成本护栏、缓存命中率监控、A/B 回归套件
- **Phase 4（可选）**：音频联动（旁白节奏→提示词）、视频域独立部署（仅当 scale 需要）

---

## 九、可用的调研/研究类 Skill（备查）

| Skill | 位置 | 适用点 | 建议 |
|---|---|---|---|
| **github-project-analysis** | `r1/github-project-analysis` | 竞品逆向：视频提示词/分镜开源项目扫描（dynamicprompts、prompt-optimizer、Infinity 等已有图片侧报告在 `C:\Users\邱领\projects\research\`） | ⭐ 最有价值——现有 `github-scan.md`/`reuse-checklist.md` 可直接扩展一轮"text-to-video prompt / storyboard prompt generator"扫描 |
| **web-access** | `r0/web-access` | **联网查各视频厂商官方提示词指南**（Veo/Kling/Runway/Sora 官方 prompt engineering 文档）——本分析中行业部分即属此缺口（本次 web_search 工具不可用，标注为记忆/常识） | ⭐ 实施前必做：视频维度表格需要厂商一手文档校准 |
| **gsd-domain-researcher / gsd-project-researcher** | GSD 角色 | AI 集成前的领域调研（若走 GSD 流程） | 按需 |
| **tracing-knowledge-lineages** | r1/superpowers | 追溯 prompt-engine 从图片到分镜的演进史，确定 video 扩展的最小切片 | 顺手可用 |
| **remembering-conversations** | r1/superpowers | 检索历史会话中是否有视频提示词讨论 | 顺手可用 |
| **ai-video-gen**（OpenMontage 已有 skill） | `D:\Projects\OpenMontage\.claude\skills\ai-video-gen\SKILL.md` | 已含多网关视频生成的提示词/参数权威指南（含 Seedance 2.0 提示词层），是维度表的现成素材 | ⭐ 直接引用，先读它的 Layer 3 prompting guide |
| context7 / openai-docs | 库文档 | 若有具体库/API 细节需要核对 | 按需 |

**建议组合**：`web-access`（厂商官方提示词指南，1-2 天）+ `github-project-analysis`（竞品扫描一轮，半天）+ `ai-video-gen`（现有素材）→ 产出《视频提示词维度词典 v1》作为 PRD 输入。

---

## 十、下一步（待确认）

1. 本文件是**分析**，不是实施——按惯例请先 review 方案
2. 确认方向后：走 **`/opsx:propose`** 建 change（M+/架构级，机制硬化规则要求）+ 质量节拍门禁
3. 实施前建议先跑一轮 **双模型交叉验证**（antigravity + Claude 并行 review 本设计；本次子代理后端 403，未执行外部模型分析，可稍后补跑）
4. 任务记录 `.ccg/tasks/video-prompt-optimize-engine-analysis/task.json`（分析阶段，未提交/归档，等确认后推进）


---

## 十一、v1.1 附注（2026-08-12）：最终方案升级为独立引擎 8020

v1.0 推荐的「8013 domain=video 分支」方案在实施阶段被用户要求否决：**视频提示词优化引擎必须与图片引擎完全分离**。

最终落地方案：
- **独立视频引擎**（prompt-engine 仓库 `video_prompt_engine/`，端口 8020）：独立包/知识库/缓存/策略/配置，源码不 import 图片 `prompt_engine.*`；支持 140 条视频种子、SQLite 双级缓存、JSON 结构化重试、veo/kling/hailuo/doubao/seedance/generic_video 六平台策略、输入分类、评估反馈闭环、中文输出（`output_language=zh`）。
- **Multi-Publish videogen 集成**：`VIDEO_PROMPT_PORT=8020` 启用独立引擎优先，失败/未配置回退 8013 `domain=video`（兼容；`video-prompt-engine-contract.js` 分文件分命名，与图片契约不混）。
- 契约单一来源仍为 `video-prompt-engine-contract.js`（独立引擎请求/响应 + 8013 兼容路径共用 `extractOptimizedVideoPrompt` 输出校验）。
