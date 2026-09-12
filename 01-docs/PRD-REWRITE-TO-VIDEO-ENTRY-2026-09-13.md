<!--
PRD: 文案改写 → 视频创作入口 + 带文案场景流水线灰显 (Rewrite to Video Entry)
日期: 2026-09-13
分支: codex/rewrite-to-video-entry
关联: PRD-REWRITE-FRONTEND-ENTRY.md（改写前端入口）、PRD-REWRITE-ENGINE.md（改写引擎）
-->

# PRD: 文案改写 → 视频创作入口 + 带文案场景流水线灰显

## 1. 背景与目标

文案改写页（/rewrite）改写完成后，用户若想把改写文案做成视频，需要先点【去发布】→ 弹窗选「生成视频」→ 才能到达视频创作页，路径偏长且弹窗里混有图文选项。同时，视频创作页的 16 条流水线中并非所有流水线都消费文案输入——素材型/链接型/录屏型流水线拿到预填文案毫无意义。

目标：
1. 改写结果区提供直达【视频创作】按钮（一步到达，不经弹窗）。
2. 带文案进入视频创作页的所有场景（query.draft 入口），不适配文案的流水线卡片灰显不可点击，悬浮提示「该流水线类型不适用」。
3. 补齐既有预填链路缺陷：草稿失效静默失败、超长文案赋值路径绕过字数校验、跳转按钮无防重入。

## 2. 流水线适配性分析（核心决策依据）

按「pipelineText 是否作为视频的文本基础被消费」划分（依据 pipeline-engine.js / stage-executor.js / 各 stages 执行器源码）：

| 流水线 | 类型 | 文案消费方式 | 适配度 | 处理 |
|--------|------|--------------|--------|------|
| story2video-compose 故事讲述 | 完整文案→视频 | split 阶段逐句分镜，6000 字上限 | 最适配 | 可选（推荐首选） |
| talking-head 口播视频 | 口播文案必填 | 按行/分段切分字幕 | 适配（需另传视频素材） | 可选 |
| localization-dub 本地化配音 | 源文案必填 | 按行分句→翻译→配音 | 适配（需源视频） | 可选 |
| animated-explainer AI讲解 | 主题→AI生成 | text 作为主题提炼大纲 | 长文触发保真模式但仍二次提炼 | 可选 |
| documentary-montage 纪录蒙太奇 | 主题→AI生成 | text 作为主题 | 同上 | 可选 |
| animation / character-animation / hybrid / avatar-spokesperson | 主题→AI生成 | videogen 系列，≥300字自动 fidelity 保真 | 同上 | 可选 |
| cinematic 电影感短片 | 素材驱动 | 文案无消费 | 不适配 | 灰显 |
| clip-factory 视频切片 | 素材驱动 | 长视频切片，文案无关 | 不适配 | 灰显 |
| screen-demo 屏幕演示 | 素材驱动 | 屏幕录制 | 不适用 | 灰显 |
| podcast-repurpose 播客转视频 | 音频驱动 | 文案从音频转录来 | 不适用 | 灰显 |
| video-clone 视频克隆 | 链接/视频导入 | 文案非输入 | 不适用 | 灰显 |
| framework-smoke 框架冒烟 | 无关 | 冒烟测试 | 不适用 | 灰显 |
| film-engineering 影视工程 | 剧本套用 | 期望剧本格式 | 不匹配 | 灰显 |

**结论**：不是所有流水线都适合。白名单（TEXT_BASED_PIPELINES，9 条）：story2video-compose、talking-head、localization-dub、animated-explainer、documentary-montage、animation、character-animation、hybrid、avatar-spokesperson。灰名单（7 条）：cinematic、clip-factory、screen-demo、podcast-repurpose、video-clone、framework-smoke、film-engineering。

白名单内主题型流水线的取舍说明：它们虽会二次提炼，但 videogen 系列对 ≥300 字长文自动切 fidelity 保真模式（videogen-stages.js resolveStoryboardMode），改写文案作为「创作种子」是合法用法，保留用户选择自由；灰名单流水线的文案输入完全不被消费，填入无意义，故禁用。

## 3. 功能规格

### 3.1 改写页【视频创作】按钮（RewriteView.vue）

**位置**：改写结果区操作行，【存入草稿】与【去发布】之间（即【去发布】左侧）。

**显示项**：
- 样式类 cohere-btn-secondary（与存入草稿同级，去发布保持唯一 primary 强调）
- 文案：🎬 视频创作 / 🎬 Create Video（i18n key: rewritePage.goVideo）
- data-testid="btn-video-create"
- 改写结果为空时整块结果区不渲染（沿用 v-if="rewriteResult"），按钮随之隐藏

**点击流程（goToVideoCreate）**：
1. 守卫：rewriteResult.trim() 为空 → 直接 return（理论不可达，结果区已隐藏）
2. 防重入：goingToVideoCreate 标志，连点只执行一次
3. 若 savedDraftId 为空 → await saveToDraft()（复用现有草稿保存：draftSave IPC + 成功通知 + 知识反馈 adopted）
4. 若保存失败（savedDraftId 仍空）→ 不跳转（saveToDraft 内已 notifyError 提示）
5. router.push({ path: '/create', query: { draft: savedDraftId } }) —— 不带 pipeline 参数，用户在创作页自选流水线（灰显机制兜底引导）

**与【去发布】弹窗链路的关系**：去发布弹窗保留（图文/视频双去向语义完整）；新按钮是「明确知道要去视频创作」用户的捷径，两者并存。

**goToPublish 同步加固**：防重入互斥锁（原实现连点会重复存草稿产生重复草稿）。

**防重入与草稿时效（审查加固）**：
- 单一互斥锁 navigatingToDestination：goToPublish 与 goToVideoCreate 共用，跨按钮并发点击（连点去发布+视频创作）也只执行一次存草稿+跳转，不会产生双草稿
- 草稿时效：新改写结果产生或用户编辑结果 textarea 时置空 savedDraftId——再次点视频创作/去发布会按当前文案重存新草稿，不会携带过期旧文案跳转

### 3.2 视频创作页带文案场景灰显（CreateView.vue + PipelineSelector.vue）

**触发条件（flag 生命周期）**：
- _loadDraftForRewrite 成功找到草稿并预填后 → textPrefilledFromDraft = true
- 组件存活期内保持 true（用户切换/返回流水线列表仍灰显——带入的文案仍在输入框里）
- 草稿不存在 → flag 保持 false（无文案可带入，全部流水线正常可选）
- 覆盖所有 query.draft 入口：改写页新按钮、改写页弹窗、合集页 Collection.vue、热门选题 HotTopics.vue 等

**PipelineSelector 新增 prop**：
- textOnly: Boolean（默认 false）——CreateView 以 :text-only="textPrefilledFromDraft" 传入

**灰显卡片行为**：
- 视觉：is-text-ineligible 类 → opacity 0.45 + grayscale(0.6) + cursor: not-allowed，hover 无浮起/阴影/描边
- 悬浮提示：原生 title 属性 =「该流水线类型不适用」/ "This pipeline type is not applicable"（i18n key: pipelineSelector.textIneligible）
- 交互禁用：click 与 keydown.enter 都经 onCardActivate 守卫，灰显卡片不 emit select
- 可用性：卡片保留 role=button / tabindex（悬浮提示依赖 hover），aria-label 不变

**双保险守卫**：CreateView.selectPipeline 入口同步拦截——textPrefilledFromDraft 为 true 且目标流水线不在白名单时直接 return（即使 UI 被绕过——如程序化调用——也不进入不适配流水线）。

**守卫与独立页路由的顺序（审查决策记录）**：video-clone / film-engineering 的「跳转专属页」路由分支位于灰显守卫之前——它们是路由跳转而非进入通用配置详情，且两者在带文案场景的正常路径已被 UI 灰显拦截；程序化调用仍可路由到专属页（保留入口可达性）。其余灰名单流水线的程序化调用被守卫直接 return。

**query.pipeline 自动选择的过滤**：带 draft 跳转且 URL 带 pipeline 参数时（历史链接、合集页跳转），若该流水线不在白名单（如旧链接指向 cinematic），忽略不选中——避免预填了文案却自动进入不消费文案的流水线。

### 3.3 预填链路缺陷修复（CreateView._loadDraftForRewrite）

**草稿失效提示（原静默失败）**：
- 原行为：draftId 在 draftList 中找不到 → 静默 return，用户跳转过来文案没带过来、无任何提示
- 新行为：showS2VOptionsToast 提示「未找到要带入的草稿，请返回上一页重新发起」/ "Draft not found. Please go back and try again"（i18n key: story2video.draftLoadFailed），3200ms 自动消失

**超长文案校验时机（审查修正：截断推迟到选中流水线时）**：
- 原行为：enforceStory2VideoTextLimit 仅在 textarea @input 触发；_loadDraftForRewrite 直接赋值 pipelineText 绕过校验，超 6000 码点文案静默进入
- 新行为：预填时不截断（6000 上限仅是 story2video-compose 编排流水线的约束，talking-head/localization-dub 等文案型流水线无此上限，预填截断会误伤）；截断统一推迟到 selectPipeline 选中编排流水线时执行——此时 selectedPipeline 已赋值，enforceStory2VideoTextLimit 的守卫通过，超长截断 + showStory2VideoErrorDialog 弹「文案超长」提示
- 回归测试：预填 6500 字不截断 → 选中 story2video-compose 后截断到 6000 码点 + 弹窗可见（CreateView.test.js「超长草稿预填不在加载时截断」）

## 4. 数据校验汇总

| 场景 | 校验规则 | 处理 |
|------|----------|------|
| 改写结果为空 | rewriteResult.trim() 空 | 按钮不渲染（结果区 v-if）；方法入口二次守卫 |
| 草稿保存失败 | draftSave 返回 code≠0 或抛异常 | notifyError（saveToDraft 内已有），不跳转 |
| 重复点击 | goingToPublish / goingToVideoCreate 标志 | 静默忽略后续点击 |
| 草稿 id 失效 | draftList 找不到该 id | toast 提示 3.2s，不置灰显 flag |
| 文案超 6000 码点（选中编排流水线时） | Array.from(pipelineText).length > 6000 | 码点截断至 6000 + 错误弹窗；预填与选中非编排流水线时不截断 |
| query.pipeline 非白名单 | isTextBasedPipeline(pipelineName) false | 忽略该参数，不自动选中 |
| 灰显流水线被程序化选中 | selectPipeline 入口守卫 | 直接 return |

## 5. 交互流程

改写页 /rewrite：输入文案 → 开始改写 → 改写结果区出现三个按钮：

- 【💾 存入草稿】：仅存草稿
- 【🎬 视频创作】：未存草稿先 draftSave（成功/失败提示）→ 成功则 router.push /create?draft=<id> → 失败停留原页
- 【🚀 去发布】：弹窗选择直接发图文（/publish?draft）或生成视频（/create?draft&pipeline），保留原有链路

视频创作页 /create?draft=<id>：

1. mounted → _loadDraftForRewrite(id)
2. 草稿存在 → pipelineText=content（超 6000 码点截断+弹窗）→ inputMode=text → textPrefilledFromDraft=true
3. 草稿不存在 → toast「未找到要带入的草稿…」
4. 流水线列表（text-only=true）：白名单 9 条卡片正常可点（story2video-compose 排最前）；灰名单 7 条卡片灰显 + title「该流水线类型不适用」+ 点击/回车无效
5. 用户选中白名单流水线 → 配置详情（文案已预填）→ 启动生成

## 6. 显示项与提示文字清单

| 项 | 中文 | 英文 | i18n key |
|----|------|------|----------|
| 改写页新按钮 | 🎬 视频创作 | 🎬 Create Video | rewritePage.goVideo |
| 灰显卡片悬浮提示 | 该流水线类型不适用 | This pipeline type is not applicable | pipelineSelector.textIneligible |
| 草稿失效 toast | 未找到要带入的草稿，请返回上一页重新发起 | Draft not found. Please go back and try again | story2video.draftLoadFailed |
| 超长文案弹窗 | 复用现有文案超长提示 | 同左 | story2video.text_too_long |

## 7. 技术实现

**新增常量**：pipeline-labels.js 导出 TEXT_BASED_PIPELINES（白名单数组）与 isTextBasedPipeline(id) 判定函数——单一事实来源，PipelineSelector 与 CreateView 共用，避免两处清单漂移。

**文件变更清单**：
- apps/desktop/src/i18n/pipeline-labels.js：+TEXT_BASED_PIPELINES + isTextBasedPipeline
- apps/desktop/src/views/video-creation/PipelineSelector.vue：+textOnly prop + is-text-ineligible 类 + title 提示 + onCardActivate 守卫
- apps/desktop/src/styles/pipeline-selector.css：+is-text-ineligible 灰显样式
- apps/desktop/src/views/CreateView.vue：+textPrefilledFromDraft data + text-only 传参 + _loadDraftForRewrite 增强（失效提示/超长截断/flag/query.pipeline 过滤）+ selectPipeline 守卫
- apps/desktop/src/views/RewriteView.vue：+视频创作按钮 + goToVideoCreate + goingToPublish/goingToVideoCreate 防重入
- apps/desktop/src/locales/zh.js / en.js：+3 组 key 成对
- .github/scripts/locale-cjk-baseline.json：+2 条 fallback 字面量基线（translateWithLocaleFallback 的 zh 兜底参数，既有模式）
- 测试三件套：PipelineSelector.test.js（+3）、RewriteView.test.js（+3）、CreateView.test.js（+3）

## 8. 测试覆盖

**PipelineSelector.test.js（8 用例，新增 3）**：
- textOnly 下灰名单卡片（framework-smoke）含 is-text-ineligible 类 + title 提示 + click/enter 不触发 select
- textOnly 下白名单卡片（story2video-compose）不灰显、无 title、click 正常 emit
- 默认（非 textOnly）所有卡片可点击无灰显

**RewriteView.test.js（32 用例，新增 3）**：
- 改写成功后视频创作按钮渲染（data-testid + 文案「视频创作」）
- 点击按钮：先 draftSave 一次 → router.push { path:'/create', query:{ draft } } 且 query.pipeline undefined
- 草稿保存失败：不跳转

**CreateView.test.js（280 用例，新增 3）**：
- _loadDraftForRewrite 成功：pipelineText 预填 + inputMode=text + textPrefilledFromDraft=true
- 草稿不存在：flag 保持 false + s2vOptionsToast 含失败提示
- textPrefilledFromDraft=true 时 selectPipeline('cinematic') 被拦截（selectedPipeline 仍 null），story2video-compose 正常进入

## 9. 质量检查

- [x] 单元测试 322/322 通过（CreateView 281 + RewriteView 33 + PipelineSelector 8）
- [x] locale zh/en 成对（3 组新 key 双语验证）
- [x] CI Gate 7 --cjk PASS（基线 1688 条）
- [x] CI Gate 7 --keys PASS（890 key 存在）
- [x] 防重入守卫（双按钮）
- [x] 灰显双保险（UI 层 + selectPipeline 方法层）
- [ ] 双模型审查（opencode + Claude）
- [ ] 视觉回归（按钮区 + 灰显卡片截图）
- [ ] CI 通过（待 push 后验证）

## 10. 范围外（follow-up）

- draftList IPC 整体失败的 toast（invokeWithFallback 吞掉场景）
- 创作页内手动清空文案后灰显是否恢复（当前保持灰显——文案是「带入意图」的证据）
- 主题型流水线选中时提示「文案将被二次提炼」的预期管理文案
