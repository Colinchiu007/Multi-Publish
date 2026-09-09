<!--
PRD: 文案改写前端入口 (Rewrite Frontend Entry)
日期: 2026-09-09
分支: codex/rewrite-frontend-entry
关联包: packages/rewrite-engine (后端已就绪)
-->

# PRD: 文案改写前端入口

## 1. 背景与目标

packages/rewrite-engine 改写引擎后端已完整实现（多策略文案改写、LLM 推理、策略匹配、KnowledgeBase 个人知识库），但前端缺少独立入口：
- 无左侧菜单入口
- 无独立改写页面
- 改写完成后的「存入草稿→去发布→图文/视频双通道」流程缺失

目标：为改写引擎提供完整的前端入口与操作流程。

## 2. 功能范围

### 2.1 左侧菜单入口
- 在「更多」菜单组末尾添加「文案改写」菜单项
- 点击打开独立改写页面 /rewrite

### 2.2 独立改写页面 (RewriteView.vue)

输入区：
- 大文本输入框（textarea），最少 20 字，最多 6000 字
- 实时字符计数显示
- 改写中禁用输入

配置区：
- 「结合爆款库」checkbox：默认勾选。勾选后改写参数 userSettings.purpose=engagement、tone=storytelling，后端策略匹配器优先匹配 category=viral 策略（如故事化爆款、干货知识等）
- 「结合个人经历」checkbox：默认不勾选。勾选后启用 KnowledgeBase 上下文注入（knowledgeContext 模板变量），改写 prompt 将包含用户偏好、写作风格和历史成功案例
- 「改写模式」：抄袭规避模仿 / 扩写爆款 / 选题创作，默认「选题创作」
- 「目标平台」：通用 / 抖音 / 小红书 / 公众号 / B站 / 知乎
- 「开始改写」按钮：内容 ≥20 字时启用，点击后调用 aiRewrite IPC

结果区（改写完成后显示）：
- 改写元信息：策略名、AI味等级、原文/结果字数
- 可编辑的结果 textarea
- 「存入草稿」按钮：调用 draftSave IPC 将内容存入草稿箱
- 「去发布」按钮：先自动存入草稿，再弹出 PublishDestinationModal

数据校验：
- 内容 ≥20 Unicode 字符：提示「请输入至少 20 字的文案内容」
- 内容 ≤6000 Unicode 字符：rewrite-engine 后端校验
- 调用 AI 前必须登录：提示「AI 改写需要登录后使用，是否立即登录？」

### 2.3 发布去向弹窗 (PublishDestinationModal.vue)

弹窗包含两个大尺寸 banner 按钮：

1. 直接发图文
   - 描述：打开图文发布页，改写内容将自动填入文案输入框
   - 点击后 router.push('/publish?draft=<draftId>')
   - Publish.vue 的 mounted() 已有 loadDraft 处理，无需额外改动

2. 生成视频
   - 描述：打开视频创作流水线页，改写文本将自动填入文案输入框
   - 按钮下方有「流水线选择」下拉列表，默认「故事讲述」（story2video-compose）
   - 点击后 router.push('/create?draft=<draftId>&pipeline=<pipelineId>')
   - CreateView.vue 的 mounted() 新增 _loadDraftForRewrite 加载草稿并自动选择流水线

交互细节：
- 遮罩层点击关闭弹窗
- 右上角关闭按钮
- role=dialog + aria-modal 无障碍支持

### 2.4 采集页改写增强 (Collection.vue)

在现有采集结果改写区域新增：
- 改写按钮前的两个 checkbox：「结合爆款库」（默认勾选）、「结合个人经历」（默认不勾选）
- 改写完成后显示「存入草稿」和「去发布」按钮
- 「去发布」弹出 PublishDestinationModal

按钮状态逻辑：
- 采集后无改写结果：改写按钮可用，存入草稿/去发布隐藏
- 改写中：改写按钮禁用，存入草稿/去发布隐藏
- 改写有结果：改写按钮可用，存入草稿/去发布可见
- 无采集结果：改写按钮隐藏

### 2.5 图文发布页预填充 (Publish.vue)
- 无需改动：已有 mounted() 中 loadDraft(String(draftId)) 处理 /publish?draft=<id>，改写内容直接填入 article.content

### 2.6 视频创作页预填充 (CreateView.vue)
- 新增 _loadDraftForRewrite(draftId) 方法
- 读取草稿（draftList API）并填入 pipelineText
- 设置 inputMode = 'text'
- 如果 URL 含 pipeline=<name>，自动匹配并调用 selectPipeline()
- mounted() 末尾自动检测 route.query.draft

## 3. 技术映射

- 结合爆款库 → userSettings.purpose=engagement、tone=storytelling → strategy-manager 匹配 category=viral
- 结合个人经历 → checkbox 选中标记 → KnowledgeBase.getContextSummary() → knowledgeContext
- 故事讲述流水线 → pipeline=story2video-compose → CreateView.selectPipeline()

## 4. 交互流程

入口1: 左侧菜单「更多」→「文案改写」→ /rewrite 独立页面
入口2: 采集页 → 采集成功 → [改写] → checkbox 配置 → 改写
        ↓
     输入文案 (textarea)
        ↓
     配置选项（结合爆款库 / 结合个人经历 / 模式 / 平台）
        ↓
     [开始改写] 按钮
        ↓
     AI 改写中...
        ↓
     改写结果（可编辑）
        ├── [存入草稿] → 草稿箱存储
        └── [去发布] → 选择发布去向弹窗
                          ├── 直接发图文 → /publish?draft
                          └── 生成视频 [流水线选择:▾] → /create?draft&pipeline

## 5. 国际化 (i18n)

rewritePage 区块（文案改写页面）：
- title: 文案改写 / Copy Rewrite
- subtitle: AI 驱动的多策略文案改写引擎... / AI-powered multi-strategy...
- inputSection: 输入文案 / Input content
- inputPlaceholder: 输入或粘贴需要改写的文案内容... / Enter or paste content...
- configSection: 改写设置 / Rewrite settings
- useViralLibrary: 结合爆款库 / Use viral library
- useViralLibraryHint: 优先匹配爆款文案策略... / Prioritize viral content...
- usePersonalExperience: 结合个人经历 / Use personal experience
- usePersonalExperienceHint: 注入本地知识库中的个人偏好... / Inject local knowledge base...
- modeLabel: 改写模式 / Rewrite mode
- modeImitate: 抄袭规避模仿 / Plagiarism-safe imitation
- modeExpand: 扩写爆款 / Expand viral content
- modeCreate: 选题创作 / Topic creation
- platformLabel: 目标平台 / Target platform
- rewriteBtn: 开始改写 / Rewrite
- rewritingBtn: 改写中... / Rewriting...
- resultSection: 改写结果 / Result
- metaStrategy: 策略 / Strategy
- metaAiTaste: AI味等级 / AI-taste level
- metaLength: {original} 字 → {result} 字 / {original} → {result} chars
- saveDraft: 存入草稿 / Save draft
- goPublish: 去发布 / Publish
- draftSaveFailed: 存入草稿失败 / Failed to save draft
- needLogin: AI 改写需要登录后使用，是否立即登录？ / AI rewrite requires login...
- tooShort: 请输入至少 20 字的文案内容 / Please enter at least 20 chars
- charCount: 字 / chars

publishDestination 区块（发布去向弹窗）：
- title: 选择发布去向 / Choose publish destination
- subtitle: 改写内容已存入草稿箱，请选择下一步操作 / Rewritten content saved to drafts...
- article: 直接发图文 / Publish image-text
- articleDesc: 打开图文发布页，改写内容将自动填入文案输入框 / Open the image-text publish page...
- video: 生成视频 / Generate video
- videoDesc: 打开视频创作流水线页，改写文本将自动填入文案输入框 / Open the video pipeline page...
- pipelineLabel: 流水线选择 / Pipeline
- close: 关闭 / Close

## 6. 文件变更清单

- apps/desktop/src/views/RewriteView.vue 新增：独立改写页面
- apps/desktop/src/views/RewriteView.test.js 新增：12 个单元测试
- apps/desktop/src/components/PublishDestinationModal.vue 新增：发布去向选择弹窗
- apps/desktop/src/router/index.js 修改：+1 行 /rewrite 路由
- apps/desktop/src/layouts/YixiaoerSidebar.vue 修改：+1 行菜单项
- apps/desktop/src/views/Collection.vue 修改：checkbox + 按钮 + 弹窗
- apps/desktop/src/views/CreateView.vue 修改：草稿预填充
- apps/desktop/src/locales/zh.js 修改：rewritePage + publishDestination
- apps/desktop/src/locales/en.js 修改：rewritePage + publishDestination

## 7. 质量检查

- [x] SFC 编译通过（vue/compiler-sfc parse + compileScript + compileTemplate）
- [x] 单元测试 12/12 通过
- [x] i18n zh/en 成对（rewritePage + publishDestination 区块）
- [x] 登录门控（useLoginGate.ensureLogin）
- [x] 传入内容校验（≥20 字前端拦截，≤6000 字后端校验）
- [x] 草稿存储走正式 IPC（draftSave/draftList）
- [ ] 视觉回归（需启动 Electron 桌面应用手动验收）
- [ ] CI 通过（待 push 后验证）

