# PRD: 智能标签建议面板 Tab 化紧凑呈现（compact-tag-suggester-tabs）

- **日期**： 2026-10-03
- **状态**： 已确认（方案 A「Tab 切换」经用户决策简报选定）
- **关联**： openspec change `compact-tag-suggester-tabs`；capability `publish-page-right-rail`（delta）；上游 change `2026-09-28-optimize-publish-right-rail`（面板位置/联动/显隐记忆的原始契约）
- **影响版本**： 桌面端（apps/desktop）

---

## 1. 背景与问题

图文发布页「智能标签建议」面板（`apps/desktop/src/components/TagSuggester.vue`）当前把分析返回的**所有平台分组纵向堆叠渲染**：每平台一个块 = 平台名行 + 复制按钮 + 内容标签行（含分组小标题）+ 流量标签行（含热度角标）。实测 5 平台（知乎/微博/小红书/B站/头条）返回典型数据时整卡高度 ~800px：

- 定时发布、最佳发布时间、可见性、AI 声明等表单字段被整体挤出首屏；
- 用户填完标签要滚动很长的距离才能回到发布主流程；
- 面板默认展开（显隐记忆默认 `tagSuggester: true`），首次进入页面即遭遇该巨型块。

上游 spec `publish-page-right-rail` 已确立「任务闭环优先于辅助信息」「智能面板贴邻所服务字段」，但**未约束面板自身的纵向密度**——本变更补上这一层。

## 2. 目标与非目标

### 目标

1. 面板展开高度可控：5 平台典型数据下内容区高度 ≈300px（上限 340px，±10%），不随平台数量线性增长。
2. 每平台代表性标签在汇总视图零交互直达（点击填入路径不变）。
3. 完整分组信息（内容/流量、热度角标）一次 Tab 点击可达，不丢失任何现有信息。
4. 既有契约（平台联动、点击填入、复制、空态收敛、显隐记忆、防抖）全部保持。

### 非目标

- 不改 `intelligenceSuggestTags` IPC 请求/响应契约；
- 不引入 Element Plus Tabs 等新组件依赖；
- 不改面板位置（继续贴邻标签/话题输入区）、不改默认展开行为；
- 不处理标签建议算法本身（推荐质量是另一个话题）。

## 3. 方案总述

平台标签区从「全平台纵向堆叠」改为 **Tab 页切换**：

```
┌─────────────────────────────────────────────────┐
│ 智能标签建议                                   ✕ │
├─────────────────────────────────────────────────┤
│ 提取关键词：                                     │
│ [新能源汽车] [锂电池原理] [充电策略] …            │  ← 常显区（不变）
│ 相关话题：[技术] [编程]                           │  ← 常显区（不变）
├─────────────────────────────────────────────────┤
│ [汇总] [知乎] [微博] [小红书] [B站] [头条]        │  ← Tab 行（新增，动态项）
├─────────────────────────────────────────────────┤
│ 知乎   [内容标签×4] [流量标签×2] [复制]      (+2) │  ← 汇总视图：
│ 微博   [#标签×6]                            (+3) │     每平台一行摘要
│ 小红书 [#标签×5] [流量×1]                        │
│ …                                               │
├─────────────────────────────────────────────────┤
│ AI 生成 · 热门库校准 ✓                           │  ← 状态行（不变）
└─────────────────────────────────────────────────┘
```

- **汇总 Tab**（默认）：每平台一行 = 平台名 + 最多 6 个标签 + 「+N」省略徽标 + 该平台复制按钮。
- **平台 Tab**：完整渲染该平台内容/流量分组与热度角标（与现状单平台分组渲染一致）。
- 「各平台标签：」小标题移除（Tab 行已承载该语义）。

## 4. 功能逻辑

### 4.1 状态模型

| 状态 | 类型 | 初值 | 说明 |
| --- | --- | --- | --- |
| `activeTab` | `ref<string>` | `'__all__'` | `'__all__'`=汇总；其余为平台 key（如 `'zhihu'`） |
| `SUMMARY_TAG_LIMIT` | 常量 | `6` | 汇总行标签容量上限 |
| `platformGroups` | computed | — | 现状保留：`{platform, detail, tags}[]` |
| `summaryRows` | computed | — | 新增：汇总行视图模型 |

### 4.2 Tab 派生与回落规则

1. Tab 项集合 = `['__all__'] + platformGroups.map(g => g.platform)`，**动态生成**，跟随分析结果与平台联动。
2. `watch(platformGroups)`：若 `activeTab` ∉ 当前集合 → 重置为 `'__all__'`。触发场景：用户更改发布目标后重新分析、content 变化导致平台分组更新、组件重挂载。
3. Tab 切换**只改视图状态**，不触发 `intelligenceSuggestTags`（纯前端切换，防抖逻辑不动）。

### 4.3 汇总行视图模型（summaryRows）

对每个 `g in platformGroups`：

```
totalTags = g.detail ? [...content, ...traffic] : g.tags   // 与 allTags() 同序
visible   = totalTags.slice(0, SUMMARY_TAG_LIMIT)
overflow  = Math.max(0, totalTags.length - SUMMARY_TAG_LIMIT)
```

- `visible` 渲染为可点击标签（`apply-tag` 行为与现状一致）；
- `overflow > 0` 时行尾渲染 `+overflow` 徽标，**不可点击**，`title` = 「完整标签见「{平台名}」标签页」；
- 数组守卫：`g.detail?.content` / `g.detail?.traffic` / `g.tags` 非数组按 `[]` 处理；平台分组 `tags` 为空仍渲染平台名与复制按钮（与现状一致，空分组不隐藏）。

### 4.4 平台 Tab 渲染

- 选中平台 Tab 时，只渲染该平台的分组块：`byPlatformDetail` 存在 → 内容标签 + 流量标签两分组（热度角标 `hotHeat`）；不存在 → fallback 单组标签（现状分支原样保留，仅作用域从「全部平台」缩小到「选中平台」）。
- 复制按钮：`copyPlatformTags(g.platform, allTags(g))` 全量复制，与现状一致。

### 4.5 数据校验（渲染层）

| 输入 | 校验 | 失败行为 |
| --- | --- | --- |
| `activeTab` 非法值 | computed 归一化：不在 Tab 集合内 → 按 `'__all__'` 渲染 | 不报错，回落汇总 |
| `suggestions.byPlatform` 缺失/空对象 | 沿用现状 `v-if="suggestions.byPlatform"` | 整个平台区不渲染，状态行仍显示 |
| `g.detail` 部分字段缺失 | `g.detail = detail[p] \|\| null`（现状），null 走 fallback 分支 | fallback 单组渲染 |
| `matchedTopics` 缺失 | `hotHeat` 返回 null（现状） | 不渲染热度角标 |
| localStorage 不可用 | composable 内部降级默认值（现状） | 面板用默认显隐 |

## 5. 交互逻辑

### 5.1 交互流（主路径）

```
用户输入标题/正文（>3 字符）
  → 防抖 800ms 后请求 intelligenceSuggestTags（平台=已勾选，空则全量目录）
  → 返回分组
  → Tab 行出现：「汇总」默认选中
  → 用户在汇总行看到目标标签 → 点击 → apply-tag → 追加进标签输入框（去重、联动描述）
  → （可选）点平台 Tab → 看完整分组/热度 → 点击填入或复制
```

### 5.2 交互明细

| 交互 | 行为 |
| --- | --- |
| 点击「汇总」/平台 Tab | 切换视图，`aria-selected` 同步，无请求 |
| 点击汇总行/平台 Tab 内任意标签 | `apply-tag`（三入口统一追加管道，现状） |
| 点击汇总行/平台 Tab「复制」 | 复制该平台**全量**标签（空格连接），toast「已复制 {平台} 标签」（现状） |
| 平台从发布目标移除 → 重新分析 | 若当前 Tab 平台消失 → 回落「汇总」 |
| 分析失败 | 一行错误提示 + 重试（现状，Tab 区不渲染） |
| 内容 <3 字符 | 空态一行提示（现状） |
| 面板收起/展开 | 显隐记忆持久化（现状），收起态为「显示智能标签」按钮（现状） |

### 5.3 键盘与无障碍

- Tab 行：`role="tablist"`；Tab 项 `role="tab"` + `aria-selected="true|false"` + `type="button"`；
- 现有 `:title="applyTagHint"`（点击填入提示）在所有可点击标签上保留；
- `+N` 徽标带 `title`，屏幕阅读器可达。

## 6. 显示项与文案

### 6.1 显示项清单（面板展开态，自上而下）

| # | 显示项 | 来源 | 变化 |
| --- | --- | --- | --- |
| 1 | 标题「智能标签建议」+ ✕ 关闭 | i18n `tagSuggest.title` | 不变 |
| 2 | 「提取关键词：」+ 关键词标签 | 分析结果 `keywords` | 不变 |
| 3 | 「相关话题：」+ 话题标签 | `relatedTerms`（空则不渲染） | 不变 |
| 4 | Tab 行「汇总 / 知乎 / …」 | `platformGroups` 动态 | **新增** |
| 5 | 汇总行（平台名+标签×N+「+N」+复制） | `summaryRows` | **新增**（替代原纵向分组块） |
| 6 | 平台完整分组（内容/流量+热度） | `byPlatformDetail` / fallback | 保留（移入平台 Tab） |
| 7 | 来源/校准状态行 | `source` / `calibrated` / `fallback` | 不变 |

### 6.2 文案与 i18n（zh/en 成对，locale 同步门禁约束）

| 键 | zh | en | 用途 |
| --- | --- | --- | --- |
| `tagSuggest.tabAll` | 汇总 | All | 汇总 Tab 标题 |
| `tagSuggest.moreTags` | 完整标签见「{platform}」标签页 | Full tags in the {platform} tab | `+N` 徽标 title（`{platform}` 为翻译后平台名） |

既有键**全部保留原义**：`title/contentTags/trafficTags/copyTags/loadingAI/loadingLocal/sourceAI/sourceLocal/calibrated/notCalibrated/aiNotConfigured/fallbackNotice/hotMatch/emptyContent/analysisFailed/retry/applyTagHint/tagsCopied`。

移除的**展示元素**：「各平台标签：」小标题（`tagSuggest.platformTags` 键暂留不删，避免 en 侧键位漂移；模板中不再引用）。

## 7. 流程与状态机

```
[面板关闭] --点击「显示智能标签」--> [展开·无结果]
[展开·无结果] --content>3字符 防抖后请求--> [loading 骨架]
[loading] --成功且有 byPlatform--> [展开·Tab 化结果(汇总默认)]
[loading] --成功无 byPlatform--> [展开·仅关键词/话题]（现状兜底结构）
[loading] --失败--> [一行错误+重试] --重试成功--> [Tab 化结果]
[Tab 化结果] --platformGroups 变化且 activeTab 失效--> 回落[汇总]
[Tab 化结果] --content 清空--> [展开·无结果]（现状重置逻辑）
任意态 --✕--> [面板关闭]（显隐记忆写入）
```

## 8. 验收标准

1. 5 平台典型数据下，面板展开内容区高度 ≤340px（±10%）——真机截图验证。
2. 默认选中「汇总」，每平台一行；单平台 >6 标签时出现「+N」且无第二行。
3. 点击平台 Tab 显示完整分组与热度角标；再点「汇总」回到摘要。
4. Tab 切换期间 `intelligenceSuggestTags` 调用次数不增加（单测断言）。
5. 所选平台从结果中消失后选中态回落「汇总」（单测断言）。
6. 既有 17+ 用例全绿（含适配）；eslint 0 error；locale 成对检查 PASS。
7. publish-form 浅/暗视觉基线重建后像素测试 PASS（QM-4）。
8. Electron 真机：点击填入、复制 toast、显隐记忆、错误重试全部正常。

## 9. 风险与回滚

| 风险 | 缓解 | 回滚 |
| --- | --- | --- |
| 视觉基线漂移连锁 | PR 内同步重建基线 | revert PR 即恢复基线+组件 |
| 用户依赖旧「全平台一屏」浏览 | 汇总 Tab 已覆盖主要浏览诉求；平台 Tab 一步可达 | revert |
| Tab 状态边界 bug | 归一化 computed + 回落 watch + 单测 | 组件内热修 |

## 10. 记忆与文档同步

- 内置记忆 / 外部记忆（`01-docs/learnings.md`）/ EverOS：交付后按 AGENTS.md 记忆体系规则三路沉淀并回读验证；
- CHANGELOG 前插；`.quality-gates.md` 执行记录；openspec 归档随合并后进行。
