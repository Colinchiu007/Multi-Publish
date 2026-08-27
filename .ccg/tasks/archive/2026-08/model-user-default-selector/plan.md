# 用户默认模型 ID 选择（下拉） + 运营中心模型种子自动填充

## 需求（用户确认版，2026-08-27）
1. 桌面端用户可以为自己已添加的模型供应商选择「默认模型 ID」（下拉列表，只能选择不能输入编辑）。
2. 供应商支持的模型列表：只能通过运营中心设置/更改；数据库种子值初始化经运营中心「获取模型ID URL」拉取填充（程序运行一次填充初始值）。
3. 默认模型 ID 双数据：运营中心初始预设（default_model）+ 用户自己的设置值（user_default_model）。
4. 语义：用户没改 → 用运营中心预设值；用户改过 → 用用户值。

## 设计
- 存储：桌面端 `model_providers.config.user_default_model`（无 DB schema 迁移；applyCatalog 目录同步只写目录键，天然不覆盖用户值）。
- 统一解析函数（model-provider-manager.js 导出纯函数）：
  resolveProviderDefaultModel(provider, type):
    1. config.user_default_model（非空且 ∈ models）
    2. config.default_model（非空且 ∈ models）
    3. capability_models[type]（多模态能力路由）
    4. models[0]
- 接入点：
  - prompt-bridge.js llmModelFor（LLM 优化/推理）
  - story2video-stages.js resolveCapabilityModel（视频/图片生成器默认）
  - story2video-project-service.js _defaultVideoGenerator / _imageModelFor / _transcriptionProvider
  - videogen-stages.js getLlmConfig / getVideoProviderConfig
- 前端 ModelProviders.vue：
  - 编辑/新增弹窗：models 输入框 → 只读展示（预设供应商）；自定义供应商保留输入
  - 新增「默认模型」el-select（选项=models；含「跟随运营默认」空选项；值存 form.config.user_default_model）
  - 卡片显示当前生效默认模型（用户值优先，否则运营默认）
- ops-center：
  - ensure_catalog_seeded 后对「models_url 非空 && models 为空」预设 best-effort 自动 fetch（复用 fetch_models_from_url，SSRF 防护已有）
  - ModelPresets.vue 增加「批量获取模型ID」按钮（串行逐条调 fetch-models，失败跳过汇总提示）
  - 前端编辑表单 default_model 校验已存在（∈ models）

## 数据校验
- user_default_model：非空必须 ∈ models；编辑保存时前端校验；目录同步后失效 → 解析回退（保留原值，UI 提示）
- default_model：已有校验（ops-center 400 + 目录自洽）
- models：预设只读；自定义可编辑（沿用 7.4.5.3 ⑤）

## 测试
- 桌面端：model-provider-manager (resolveProviderDefaultModel 优先级/回退/不覆盖)、prompt-bridge llmModelFor、前端 useModelProviderCrud
- ops-center：pytest（seed 自动 fetch mock、批量获取）

## 文档
- PRD 7.4.5.5 重写为最终合同（数据校验/流程/功能逻辑/交互/显示项/提示文字）
- ops-center 相关小节（模型种子自动填充 + 批量获取）
- 01-docs/learnings.md 追加本次要点
