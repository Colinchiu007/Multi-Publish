# Design: compact-tag-suggester-tabs

## 方案对比与选型

| 方案 | 描述 | 密度收益 | 结论 |
| --- | --- | --- | --- |
| A. Tab 切换（选定） | 汇总 Tab 一行/平台摘要 + 平台 Tab 完整分组 | ~800px → ~300px | ✅ 与「平台联动」心智一致，点击填入路径不变 |
| B. 手风琴折叠 | 每平台折叠头，展开看详情 | 类似 A | ❌ 高频点击填入多一步展开 |
| C. max-height 滚动 | 纯 CSS 限高 + 内部滚动 | 最小改动 | ❌ 双滚动条、标签难找，止血方案 |
| D. 摘要行 + 展开 | 全局「显示全部」展开 | 中等 | ❌ 展开态回到旧高度问题 |

选 A 的核心依据：用户填写标签的高频动作是「看到合适的 → 点一下」，摘要行直接暴露每平台最有代表性的前 6 个标签，零额外交互；完整分组（含热度角标）只对确有需要的用户展示，一次 Tab 点击可达。

## 现状与改动映射

现状（`TagSuggester.vue:58-109`）：

```html
<div v-if="suggestions.byPlatform">
  <div>各平台标签：</div>
  <div v-for="g in platformGroups"> <!-- 纵向堆叠，无高度约束 -->
    平台名 + 复制按钮
    [byPlatformDetail] 内容标签行 + 流量标签行
    [fallback] 单组标签行
  </div>
  来源/校准状态行
</div>
```

改为：

```html
<div v-if="suggestions.byPlatform">
  <div role="tablist">汇总 | 知乎 | 微博 | ...</div>   <!-- Tab 行，动态项 -->
  <div v-if="activeTab === '__all__'">               <!-- 汇总：每平台一行 -->
    <div v-for="g in platformGroups" class="ts-summary-row">
      平台名 · 前6个标签 · (+N) · 复制
    </div>
  </div>
  <div v-else>                                        <!-- 平台 Tab：完整分组 -->
    （现状的 detail/fallback 两分支，仅渲染选中平台）
  </div>
  来源/校准状态行（保留）
</div>
```

## 关键决策

1. **Tab 值用平台 key 而非展示名**：`activeTab` 存 `'__all__'` 或平台 key（如 `'zhihu'`），展示名经 `platformLabel()` 翻译，避免 i18n 切换时状态失效。
2. **Tab 回落规则**：`watch(platformGroups)` 时若 `activeTab` 不在当前分组集合中 → 重置为 `'__all__'`；Tab 切换本身不触发请求（纯视图状态），不改防抖逻辑。
3. **汇总摘要容量**：`SUMMARY_TAG_LIMIT = 6`，标签列表切片 `g.tags.slice(0, 6)`；省略徽标 `+N` 用剩余数计算，`title` 提示「完整标签见该平台标签页」。detail 结构下摘要取 `content + traffic` 合并前 6 个（与 `allTags()` 同序）。
4. **复制按钮在摘要行保留**：汇总 Tab 每行右端保留该平台「复制」（复制内容 = 全量标签，与现状 `copyPlatformTags(g.platform, allTags(g))` 完全一致，不因摘要截断而只复制前 6 个）。
5. **高度约束落地方式**：不写死 `max-height` 截断内容（避免内部滚动条），而是靠「一行/平台 + Tab」的结构性密度达标；样式上仅对摘要行做固定行高与单行省略（`white-space: nowrap` 不适用 flex wrap 标签，改为限定标签个数），必要时对平台 Tab 内容区加 `max-height + overflow-y:auto` 兜底（仅平台 Tab，默认视图不出现）。
6. **无障碍**：Tab 行用 `role="tablist"` / `role="tab"` / `aria-selected`，面板既有结构不变；不引入 Element Plus Tabs 组件（其样式令牌与本卡不适配，且会带来额外包面）——手写轻量 Tab（两个 class + click handler），与组件内现有「手写轻量结构」风格一致。
7. **默认展开维持**：`usePanelVisibilityPrefs` 的 `tagSuggester: true` 默认值**不动**——Tab 化后面板默认展开高度可控，此前「默认收起」的止血动机消失；显隐记忆契约（刷新保持）继续成立。
8. **i18n 新键**（zh/en 成对）：`tagSuggest.tabAll`（汇总）、`tagSuggest.moreTags`（+{n} 的 title：完整标签见该平台标签页）。渲染层不新增硬编码中文（locale 同步门禁）。

## 数据校验

- `activeTab` 只允许 `'__all__'` 或 `platformGroups` 中存在的平台 key，其余值一律按 `'__all__'` 处理（渲染前 computed 归一，不信任持久状态）。
- 摘要切片对 `g.tags` / `g.detail` 做数组守卫：非数组按空数组处理（沿用现状 `allTags()` 的容错思路，detail 为 null 时走 fallback 分支）。
- `+N` 计算 `Math.max(0, total - SUMMARY_TAG_LIMIT)`，total 为 0 的平台行仍渲染平台名与复制按钮（与现状一致：空分组不隐藏）。

## 风险与回归面

| 风险 | 缓解 |
| --- | --- |
| 既有 17 个 TagSuggester 用例依赖「全平台分组同时可见」 | TDD 逐条评估：文案类断言（「各平台标签」标题移除需改断言）、结构类断言（进入对应平台 Tab 后断言）；不删行为覆盖 |
| publish-form 视觉基线漂移 | 基线刷新纳入本 PR（跑基线重建脚本），PR 描述注明 |
| Tab 状态在 platforms 变化后残留 | watch 回落规则 + 回归用例 |
| 汇总行标签换行导致密度回退 | 容量切片 6 个 + 行内 gap 4px，实测宽度内不换行；若溢出由省略徽标兜底 |

## 测试策略

- 单元（vitest）：Tab 契约新用例（默认汇总、切换平台 Tab、切换不重发请求、平台消失回落、+N 截断、复制按钮全量复制、无障碍属性）+ 既有用例适配。
- 视觉：publish-form 浅/暗基线重建，`--single` 验证。
- 手动：Electron 真机检查 5 平台高度、Tab 切换、点击填入、复制提示。
