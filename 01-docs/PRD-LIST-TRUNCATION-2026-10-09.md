# PRD：三列表渲染截断 + 加载更多（M-15 批次 D，第一部分）

- 文档类型：修复型 PRD（含数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字）
- 日期：2026-10-09
- 来源：前端深度审查报告 M-15（报告正文编号）+ 治理方案 §10.2
- 分支：`batch-d-pagination-m15`
- worktree：`D:\Data\projects\mp-worktrees\mp-batch-d-pagination-m15`

---

## 1. 问题（用户会遇到什么）

**账号管理 / 文案库 / 热门选题三个页面的列表都是"筛选后全量渲染"**：

| 页面 | 数据源 | 全量渲染的后果 |
|---|---|---|
| 账号管理 | `visibleAccounts`（filter 后不截断） | 账号数到数百时，一次挂载数百张重组件卡片（15+ prop / 10+ 事件），每次 store 变更触发全量 patch，页面明显卡顿 |
| 文案库 | `filteredItems`（同形态） | 文案长期积累后列表越来越长，滚动与渲染越来越慢 |
| 热门选题 | `filteredTopics`（同形态） | 榜单按多渠道聚合，条目数随刷新次数增长 |

这不是"当前必现的 bug"，而是**随数据量增长必然劣化**的结构缺口（报告 M-15 定性）。
治理方案 §6 明确：**不引入虚拟滚动**（报告建议 `el-pagination`/截断+加载更多，成本最低）。

## 2. 方案（渲染层截断 + 加载更多）

三个页面统一引入同一套形态（抽成 `LoadMoreRow.vue` 组件 + 各自的截断 computed）：

### 2.1 数据校验 / 触发条件

| 页面 | 渲染上限（首屏） | 每次加载更多 | 数据校验 |
|---|---|---|---|
| Accounts | 48（网格 4 列 × 12 行） | +48 | 无需校验：截断只影响渲染，不改数据 |
| CopyLibraryView | 30 | +30 | 同上 |
| HotTopics | 30 | +30 | 同上 |

- 截断阈值是**渲染上限**而非数据上限：数据永远完整地在 store / computed 里；
- 筛选/搜索变化时**不重置**渲染上限（用户加载数量是显式意图，切换筛选后
  条目变少时截断提示自然消失）。

### 2.2 功能逻辑

```js
const copyRenderLimit = ref(30)                                    // 渲染上限
const renderedItems = computed(() => filteredItems.value.slice(0, copyRenderLimit.value))
const itemsTruncated = computed(() => filteredItems.value.length > renderedItems.value.length)
```

- 模板 `v-for` 从 `filteredItems` 改为 `renderedItems`；
- 「加载更多」按钮点击 ⇒ 上限 +30 ⇒ 下一批进入渲染；
- 全部加载完（`truncated === false`）后按钮与提示**自动消失**。

**Accounts 特例——"全选"语义**：`selectAll` / `allFilteredSelected` 仍基于
`visibleAccounts`（截断后集合）。这是**有意取舍**：账号页的全选按钮在卡片网格
上方，用户看到的卡片集合就是全选的作用范围；若把隐藏的账号也选中，用户无法
看到/取消这些选择，反而危险。文案库/选题库的全选同样基于各自渲染集合。

### 2.3 交互逻辑

- 「加载更多」按钮不弹窗、不跳转，原地追加渲染下一批；
- 多次点击可加载完全部（每批 30/48 条），全部加载后按钮消失；
- 截断提示 `role="status"`（读屏可感知），不抢焦点。

## 3. 显示项与提示文字（locale，zh/en 成对）

| key | zh | en |
|---|---|---|
| `accountsPage.shownTruncated` | 已显示前 {shown} 个，共 {total} 个账号 | Showing first {shown} of {total} accounts |
| `accountsPage.loadMoreAccounts` | 加载更多账号 | Load more accounts |
| `copyLibrary.shownTruncated` | 已显示前 {shown} 条，共 {total} 条文案 | Showing first {shown} of {total} copies |
| `copyLibrary.loadMoreCopies` | 加载更多文案 | Load more copies |
| `hotTopics.shownTruncated` | 已显示前 {shown} 条，共 {total} 条选题 | Showing first {shown} of {total} topics |
| `hotTopics.loadMoreTopics` | 加载更多选题 | Load more topics |

提示的措辞原则（如实告知，同 M-11 的触顶提示）：
"已显示前 N 个"明确说明**没有**看到全部，配"共 M 个"给出总量预期，
用户不会被"没显示"误导为"不存在"。

## 4. 三处重复的消除

三个页面的「截断提示 + 加载更多」模板/样式完全同形态 —— 抽成
`components/LoadMoreRow.vue`（props: hint / button-text；emit: more），
消除三处重复模板与三份重复样式。

## 5. 验证与反证

| 测试 | 内容 |
|---|---|
| `accounts-truncation.test.js` | 60 账号 ⇒ 渲染 48 + 按钮出现 + "共 60"文案；点击后数量增加；全部加载后按钮消失 |
| **反证（内嵌）** | 把渲染上限调到 1000（>总数 60）⇒ 「加载更多」必须消失——若仍显示说明截断判据失效 |
| `m15-truncation-hot-topics.test.js` | 40 选题 ⇒ 渲染 30；加载后 40 且按钮消失；**全选仍作用于全量 40 条**（不受截断影响） |
| 既有回归 | Accounts 116 + CopyLibraryView 9 + HotTopics 42 全绿 |

## 6. 非目标

- 不引入虚拟滚动（方案 §6 明确不做）；
- 不改数据层（store 仍持有全量）；
- 不做"每页 N 条"的传统分页器（当前"加载更多"对滚动列表更自然，M-15 落地
  后续可在数据量实证后评估是否切换 el-pagination）。
