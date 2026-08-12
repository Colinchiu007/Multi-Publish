# Proposal: Story2Video 全能创作 — 流水线更名、历史提示词本地语言翻译、分镜素材自选创作模式

## Why

用户需求（2026-08-12）：① 非英语界面下，历史记录里的提示词文本框旁展示只读的本国语言翻译；② 将「图片轮播」流水线更名为「全能创作」，多语言同步；③ 在「全能创作」的「视频增强」区新增「创作模式」（全自动 / 分镜素材自选），自选模式按场景生成多张图片 + 1 个视频供用户逐场景单选后，再继续 TTS 与视频合成。当前流水线全自动生成单张图片/单个视频，历史记录无提示词翻译，流水线名为「图片轮播」。

## What Changes

- 流水线展示名「图片轮播 / Image Carousel」→「全能创作 / Omni Creation」，zh/en 与相关提示文案同步（configurationTitle、access_denied、selectVideoScenesOff 等）
- 历史记录/项目详情（ResultView 分段编辑）中，「画面提示词」文本框下方展示只读的本国语言翻译（界面语言非 en 时）；翻译在流水线 optimize 后按场景生成并随分段持久化（失败降级不阻塞）
- 「视频增强」区新增「创作模式」单选：`全自动（推荐）`（默认，即现有流水线）/ `分镜素材自选`；选择自选时展示成本提示文案，并出现素材模式单选：`全部图片轮播` / `视频+图片轮播`
- 分镜素材自选后端流程：generate_assets 按模式生成候选（全部图片轮播=每场景 2 图；视频+图片轮播=AI 视频场景 2 图 + 1 视频、其余 2 图），**不生成 TTS、不合成**，以 `scene_asset_selection` 检查点暂停
- 新增分镜素材选择交互：每个场景单选（有视频默认视频，纯图默认第 1 张），全部确认后经新 IPC 提交选择 → 进入新增 `finalize_assets` 阶段生成 TTS 并组装最终素材清单 → compose → publish
- 视频+图片轮播模式下，AI 视频场景判定沿用现有 videoMode（off/fixed/ai-judged）逻辑，且视频场景的 2 图 + 1 视频使用同一优化后提示词
- 数据校验：新配置字段纳入 normalizer 白名单与枚举校验、上次选项持久化白名单、UI 恢复校验、断点快照兼容
- 补充 PRD 与相关文档（数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字）

## Capabilities

### New Capabilities

- `story2video-omnipotent-creation`: 流水线更名与 i18n——「图片轮播」→「全能创作」，zh/en 文案、配置标题、错误提示、阶段摘要同步更新，禁止硬编码
- `story2video-prompt-translation-history`: 历史记录提示词本地语言翻译——非 en 界面下，分段「画面提示词」旁只读展示本国语言翻译；翻译随流水线生成并持久化，失败 fail-open
- `story2video-creation-mode`: 创作模式与分镜素材自选——配置契约（creation.mode / creation.materialMode）、候选生成规则、scene_asset_selection 检查点、选择确认 IPC、finalize_assets 阶段、默认选择规则与交互显示

### Modified Capabilities

- `story2video-video-carousel-blend`: 视频+图片轮播混合模式与「视频增强」配置区——新增创作模式入口，manual+video-image 沿用 select_video_scenes 判定与同提示词生成 2 图 + 1 视频；manual+all-images 忽略视频模式
- `story2video-parameter-governance`: 前端 s2vConfig 隐藏/治理清单——新增 creation.mode / creation.materialMode 字段契约与白名单，禁止越界提交

## Impact

- 代码：apps/desktop（CreateView 视频增强区、SceneAssetSelection 选择面板、ResultView 分段翻译展示、i18n zh/en、create-view-utils）、electron services（story2video-text-config normalizer、story2video-stages generate_assets/finalize_assets、pipeline-engine 动态阶段、ipc-handlers/pipeline 新 IPC、run-state-store 暂停快照）、tests（contract/e2e/ui）
- 契约：story2videoTextConfig 新增 creation 段；IPC 新增 pipeline:confirmSceneAssets；阶段清单在 manual 模式插入 finalize_assets
- 风险：高（流水线核心路径 + 交互 + 持久化 + 多语言）；Token/积分消耗在自选模式显著增加（UI 提示）
- 不改变：TTS 音色/图片/视频供应商契约、视频生成判定逻辑语义、断点续跑既有语义
