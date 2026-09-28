## Context

发布页单篇模式（`apps/desktop/src/views/Publish.vue`）为 `cohere-content-split` 双栏：`flex-main`（flex:2，表单）+ `flex-side`（flex:1，min-width 280px）。右栏现有顺序：TagSuggester → OptimalTimeTip → TitleAssistantPanel → publish-action-card（sticky top:16px）→ progress → 草稿箱 → result。三个智能面板按输入阈值动态显隐（combinedContent>3 / title>2 / title>5），TagSuggester 平台列表硬编码 `['zhihu','weibo','xiaohongshu','bilibili','toutiao']`。约束：并发分支 `fix-title-assistant-relevance` 正在修改 TitleAssistantPanel.vue 与 locales（`intelligence.*` 键），本 change 必须避开该组件；locale 新增文案受 CI Gate 7 成对检查约束。

## Goals / Non-Goals

**Goals:**
- 主行动（发布目标+快速发布）首屏可见，右栏只承载任务闭环
- 智能面板贴邻所服务字段，利用左栏空白
- 建议内容与用户所选平台联动，标签可点击填入
- 空态不浪费卡片级空间；显隐状态跨刷新记忆

**Non-Goals:**
- 不改批量模式布局与发布流程逻辑（usePublishFlow / useBatchPublish / usePublishDrafts）
- 不改 PublishTargetSelector 内部行为
- 不修改 TitleAssistantPanel.vue（并发冲突规避，其 visible/close 接口保持原样复用）
- 不做后端 intelligence API 的任何改动

## Decisions

**D1 面板迁移在 Publish.vue 模板层完成，组件接口最小化。**
TagSuggester / OptimalTimeTip / TitleAssistantPanel 三个组件的挂载点从 `flex-side` 移到 `flex-main` 对应 `cohere-form-item` 附近：标签建议置于 `publish-metadata-grid`（标签/话题/@好友）之后；最佳发布时间置于「定时发布」form-item 之后；标题助手置于标题 form-item 之后。备选「左栏底部统一堆叠」被否——失去贴邻上下文，用户视线要在字段与建议之间长距离往返。
理由：模板层迁移对组件零侵入，TitleAssistantPanel 完全不用改，规避并发冲突。

**D2 平台联动走 props 单向数据流。**
TagSuggester 新增 `platforms` prop（string[]，默认空数组=全量）。Publish.vue 传 `selectedPlatforms`；组件内 watch `platforms` 与现有 `content` watch 共用同一防抖（800ms）重新请求。备选「组件内直接读 platformStore + 发布页选中状态」被否——组件耦合发布页状态、破坏单向数据流、单测需 mock store。
回退语义：`platforms` 为空数组时请求全量目录（与现状一致），保证未选平台时面板不出空态。

**D3 标签点击填入用 `apply-tag` 事件 + 父级去重。**
TagSuggester 对建议标签（关键词/相关话题/平台标签）加点击 emit `apply-tag(tag)`；Publish.vue 的 handler 把标签并入 `article.tags`（经 `normalizePublishStringList` 规范后 Set 去重再写回）。备选「组件直接改父状态」被否——Vue 单向数据流。
去重放在父级 handler 而非 normalize 函数：`normalizePublishStringList` 是发布契约（`publish-contract.js`）的既有实现，改它的去重语义会波及所有调用方。

**D4 空态收敛为组件内单行提示。**
OptimalTimeTip 的 `notEnoughData` 分支与 TagSuggester 的 `error` 分支改为「一行提示 + 展开箭头」：默认一行（图标+短文案+展开/关闭），展开后显示原有完整空态说明与重试。组件自包含，props 不变。备选「父级 v-if 隐藏整卡」被否——用户失去知情权（不知道为什么没有建议）。

**D5 显隐记忆用轻量 composable。**
新增 `apps/desktop/src/composables/usePanelVisibilityPrefs.js`：`readPanelPrefs()/writePanelPrefs()` 封装 localStorage（key: `publish.panelVisibility.v1`），try/catch 包裹（隐私模式/磁盘满降级默认值）。Publish.vue 初始化 `showTagPanel`/`showTitlePanel` 时读取，watch 时写入。备选「Publish.vue 内联 localStorage」被否——不可单测且散乱。

**D6 右栏顺序：action-card 置顶 + sticky 保留。**
`flex-side` 内 publish-action-card 移到第一位，`position: sticky; top: 16px` 保留（右栏内容超过视口时仍钉住）。progress → 草稿箱 → result 顺序保持。sticky 从「滚动后可见的兜底」升级为「初始即首屏 + 滚动时钉住」双保险。

**D7 i18n 键命名空间隔离。**
新增文案避开并发分支的 `intelligence.*` 键空间：TagSuggester 沿用其既有 `tagSuggest.*` 命名空间（`applyTagHint`/`retry`），OptimalTimeTip 与 Publish.vue 层文案挂 `publishPage.*`（`optimalTimeNoData` 等），zh/en 成对。CI 基线扫描禁止渲染端非 locales 文件新增中文字面量，故 OptimalTimeTip 新文案必须走 i18n 键（该组件既有硬编码中文属基线存量，保持不动）。

## Risks / Trade-offs

- [左栏因面板贴邻展开而变长] → 实测左栏有约 37% 视口空白可吸收；面板均可收起，收起态只剩一行入口按钮。
- [与 fix-title-assistant-relevance 分支合并冲突] → 不碰 TitleAssistantPanel.vue；locales 键空间隔离；若 Publish.vue 因对方后续改动冲突，PR rebase 时以功能语义合并。
- [selectedPlatforms 高频变化触发标签建议请求风暴] → 复用组件现有 800ms 防抖，platforms 与 content 任一变化都只重置计时器。
- [localStorage 不可用] → composable try/catch 降级默认显隐，功能不崩。
- [视觉回归基线漂移] → 发布页视图基线需在实现完成后重新截取，旧基线必然失效（这是本 change 的目的本身）。

## Migration Plan

纯渲染层变更，无数据迁移、无 IPC/接口变更。回滚 = revert 该 PR。发布灰度无需特殊处理（桌面应用随版本发布）。

## Open Questions

无。
