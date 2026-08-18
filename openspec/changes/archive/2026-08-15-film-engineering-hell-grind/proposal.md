## Why

用户需要一个"影视工程"新流水线，把开源 AI 电影《Hell Grind》（95 分钟、115,451 个素材、162 个分镜文件夹，官方已开源提示词体系）的真实工程资产（分镜结构、真实提示词、角色/场景参考素材、提示词架构方法论）复刻进 Multi-Publish。当前应用只有 Story2Video 等"文本→视频"流水线，缺少"从真实电影工程中学习/复用/剧本套用"的能力。用户可浏览真实分镜、一键复制提示词、勾选分镜生成资源、输入自己的剧本按 Hell Grind 的工程方法套用（剧情不同、方法复刻）。

## What Changes

- 新增 `film-kit` 数据资产目录（film-manifest / shot-library / reference-registry / prompt-doctrine / 精选参考图），内容源自 Higgsfield 公开项目页 API（公开可读）与 OSideMedia/higgsfield-ai-prompt-skill（MIT）的真实语料；全量语料本地归档、精选版入库（<=5MB）。
- 新增主进程服务 `services/film-engineering/`：kit 加载校验（fail-closed）、分镜库查询、一键复制文本组装、剧本套用引擎（分场→Hell Grind 分镜模板映射→提示词组装，可选 PromptBridge LLM 润色）、导出 JSON/Markdown、选中分镜资源生成（复用 assetGenerator）。
- 新增 `film-engineering` 流水线注册（PIPELINES + StageExecutor 阶段：film_load_template / film_adapt_script / film_select_shots / film_export_prompts）。
- 新增 IPC 通道（film-engineering:*），全部 withSenderCheck + 参数校验。
- 新增前端路由 `/film-engineering` 与三栏视图（分镜树/详情/操作面板），含一键复制、分镜勾选、剧本套用、导出；文案进 locales zh/en 成对。
- 文档：PRD-video-creation.md 新增 3.1.23 章节、ARCH-FILM-ENGINEERING-2026-08-14.md、learnings 复盘、i18n-glossary 产品名词。

## Capabilities

### New Capabilities

- `film-engineering`: 影视工程流水线能力——film-kit 数据资产 schema 与加载校验、分镜库查询与一键复制文本、剧本套用引擎（分场/模板映射/提示词组装/LLM 增强降级）、film-engineering 流水线阶段契约、IPC 参数校验与 fail-closed 行为、前端交互契约（分镜浏览/复制/选择/套用/导出）。

### Modified Capabilities

<!-- 无既有 spec 需求变更：不动 story2video 既有行为，仅新增独立能力与注册点（PIPELINES 数组新增条目属扩展，不改变既有流水线需求）。 -->

## Impact

- 代码：`apps/desktop/electron/services/film-engineering/*`（新增）、`apps/desktop/electron/film-kit/*`（新增）、`apps/desktop/electron/services/pipeline-engine.js`（PIPELINES 新增 1 条）、`apps/desktop/electron/core/container.setup.js`（注册 stages+IPC）、`apps/desktop/electron/ipc-handlers/film-engineering.js`（新增）、`apps/desktop/src/views/film-engineering/*`（新增）、`apps/desktop/src/router/index.js`（新增路由）、`apps/desktop/src/locales/{zh,en}.js`（成对新增）、`apps/desktop/src/i18n/pipeline-labels.js`（新增卡片标签）。
- 依赖：无新增第三方运行时依赖（分场复用 story2video-engine；LLM 增强复用 PromptBridge）。
- 文档：PRD-video-creation.md / ARCH / learnings / i18n-glossary / openspec/specs/film-engineering。
- 测试：新增 6+ 个服务/契约/前端测试文件；回归 pipeline-engine 既有测试。
