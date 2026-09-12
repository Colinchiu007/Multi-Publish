# 双模型审查记录 — rewrite-to-video-entry（2026-09-13）

## 审查执行

- Claude（backend=claude）：完整审查报告已返回（2 Critical / 4 Major / 6 Minor）
- opencode（backend=opencode）：两次调用均只回显角色未执行审查（会话立即 completed，无实质输出）——按 CCG「子代理降级」纪律，审查以 Claude 结果 + 主代理复核为准，opencode 侧第三次重试中

## Claude 审查发现与处置

### Critical（全部修复）

| # | 发现 | 处置 |
|---|------|------|
| C1 | RewriteView 两个独立防重入标志挡不住跨按钮并发（连点去发布+视频创作 → 双草稿 + savedDraftId 覆盖错乱） | 已修复：合并为单一互斥锁 navigatingToDestination |
| C2 | _loadDraftForRewrite 内联 6000 码点截断对非编排流水线误截（talking-head 等无此上限，长文案应完整保留） | 已修复：预填时不截断，截断推迟到 selectPipeline 选中编排流水线时由 enforceStory2VideoTextLimit 统一执行（此时 selectedPipeline 已赋值，守卫通过）；补回归测试「预填 6500 字不截断 → 选中编排截断到 6000 + 弹窗」 |

### Major（全部修复）

| # | 发现 | 处置 |
|---|------|------|
| M1 | 灰显卡片缺 aria-disabled（键盘/屏幕阅读器无禁用语义） | 已修复：:aria-disabled="isTextIneligible(pipeline) ? 'true' : null" |
| M2 | catch 块吞掉 draftList IPC 失败（与草稿不存在同语义混淆） | 已修复：catch 也走 draftLoadFailed toast |
| M3 | selectPipeline 灰显守卫在 video-clone/film-engineering 特殊路由之前，拦截吞掉路由跳转语义 | 已修复：特殊路由分支提前，守卫后移，并注释说明（两者在带文案场景正常路径已被 UI 灰显拦截，程序化调用仍可路由） |
| M4 | is-text-ineligible 与 is-unavailable 并存时「开发中」徽章与「不适用」提示双原因混淆 | 已修复：灰显时 CSS 隐藏 availability-badge |

### Minor（择要修复）

| # | 发现 | 处置 |
|---|------|------|
| m1 | TEXT_BASED_PIPELINES 未 Object.freeze | 已修复 |
| m2 | p.title === pipelineName 死代码 | 已修复（移除） |
| m3 | RewriteView.test factory 的 $router mock 死代码 | 保留（既有代码，非本次引入，避免测试文件噪声） |
| m4 | textIneligibleHint fallback 仅中文 | 保留（key 已 zh/en 注册，fallback 不会触达；与组件内 t() 既有模式一致） |
| m5 | draftList 拉全量找单条 | 范围外（既有模式，follow-up：draftGet(id) API） |

## 修复后验证

- 单元测试 321/321 通过（CreateView 281 + RewriteView 32 + PipelineSelector 8）
- locale --cjk PASS（基线 1688）/ --keys PASS（890 keys）
- 视觉回归：rewrite / create-editor / create-view-default 三视图 PASS；像素门禁 6 个失败与主仓库 main 完全一致（预存环境问题，与本次变更无关）

## 第二轮双模型审查（修复后最终代码，2026-09-13）

### 执行情况

- **opencode（backend=opencode）**：第三次调用成功完成完整审查（会话 ses_f69571314ffekL30ym2pniNe9K）。结论：**通过**，无 Critical / Major，4 Minor。审查过程实际运行了 322 测试全绿 + lint + worktree 依赖校验，并核验了 draftSave→draftList 的 id 契约链路与 TEXT_BASED_PIPELINES 白名单与 16 条 PIPELINES key 的逐一吻合。
- **Claude（backend=claude）**：复审确认 6 处修复（C1/C2/M1-M4）全部正确落地，修复间无交互冲突，无新增 Critical/Warning。

### opencode 发现（4 Minor）与处置

| # | 发现 | 处置 |
|---|------|------|
| m1 | 空 content 草稿误置灰显 flag（CreateView.vue:2896 textPrefilledFromDraft=true 与 draft.content 解耦，其他入口带空 content 草稿跳入会无意义禁用非文案型流水线） | **已修复**：_loadDraftForRewrite 对空 content 草稿提前 return，不预填不灰显；补回归测试「空 content 草稿不置灰显 flag 也不预填」 |
| m2 | 灰显卡片键盘无障碍缺口（title 仅 hover 可见，焦点不可读） | 记录为已知取舍（aria-disabled 已提供语义；follow-up 可追加 aria-label） |
| m3 | query.pipeline 匹配从 name/title 降级为仅 name，中文标题旧链接不再自动选中 | 记录为已知取舍（方向正确：title 匹配可能选中灰名单；主链路均传 name） |
| m4 | 灰名单 ∩ 开发中徽章归因失真（available=false 的灰显卡片只见「不适用」不见「开发中」） | PRD 已明确决策的取舍，保持 |

### Claude 复审 Info 项（均不阻塞）

- catch 块 toast 复用 draftLoadFailed key，语义上「草稿不存在」与「IPC 异常」未区分 → follow-up 可拆 draftLoadError key
- pipelineName 在白名单但 pipelines 数组未含该流水线时静默不选中 → 低概率边界，非本次引入

### 修复后验证

- 单元测试 **323/323 通过**（CreateView 283 + RewriteView 33 + PipelineSelector 8，含新增空 content 草稿用例）

### 最终结论

双模型审查闭环：opencode 通过（0 Critical / 0 Major / 4 Minor，m1 已修复）+ Claude 复审通过（修复确认，无新增问题）。代码达到可合并状态。
