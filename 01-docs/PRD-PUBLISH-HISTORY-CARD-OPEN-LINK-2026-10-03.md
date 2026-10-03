# PRD：发布记录卡片整体点击打开平台作品链接

- **变更编号**：feature/publish-history-card-open-link
- **日期**：2026-10-03
- **状态**：已确认（CEO 口头需求：发布记录页列表中的具体发布记录内容卡片，点击整个卡片（除链接和按钮外）后，打开新标签来打开对应的平台链接网页）
- **关联文档**：`01-docs/PRD-HREF-SCHEME-GUARD-2026-09-29.md`（href 协议判据合同）、`01-docs/PRD-PUBLISH-HISTORY-LOGIN-GATE-2026-09-15.md`（发布记录页）、`01-docs/PRD-TAB-INDEPENDENT-HOME-2026-09-22.md`（应用内标签页体系）

---

## 1. 背景与问题

发布记录页（`/history`，`apps/desktop/src/views/PublishHistory.vue`）的记录卡片目前只有两个可点区域：

- 「详情」按钮 → 打开记录详情弹窗；
- 失败记录的「重试」按钮 → 重新提交失败任务。

用户要看发布作品的实际效果（播放/点赞/评论在平台上的表现），需要：先点「详情」→ 在详情弹窗里找到「作品链接」→ 再点链接。路径长，且卡片上根本看不出「这条记录有平台链接可点」。

竞品对齐参照（多平台发布工具惯例）：发布成功后返回的 `result.url`（平台作品页地址）应可直接触达。本需求把触达面扩大到**整张卡片**。

## 2. 目标与非目标

### 2.1 目标

1. 发布记录列表卡片（records 面板的 `article.record-card`）支持**整体点击**：点击卡片上除按钮/链接外的任意区域，在应用内顶部标签栏**新开一个标签页**，加载该记录的平台作品链接网页。
2. 与既有交互零冲突：卡片内既有按钮（详情/重试/复选框）、详情弹窗内的链接行为不变。
3. 安全判据单一来源：URL 一律经 `safeHttpUrl`（`packages/shared-utils/src/safe-http-url.browser.js`，渲染端 ESM 孪生）判定；非 http/https 不产出可点行为。
4. 双视图（列表/网格）与两套工具栏（普通/批量管理）行为一致。

### 2.2 非目标（明确不做）

1. **不改**详情弹窗的结构与「作品链接」行（它仍保留 `target="_blank"` 锚点）。
2. **不做**失败记录的智能跳转猜测（无 `result.url` 时点击卡片无响应，不引导去重试）。
3. **不做**卡片悬浮态的链接预览、右键菜单、中键/修饰键（Ctrl/Cmd/Shift）特殊处理。
4. **不改**草稿箱卡片的点击行为（草稿无平台链接语义）。
5. **不改**主进程 `page-manager` 的任何代码（URL 门禁完全由渲染端 `safeHttpUrl` 收口）。

## 3. 用户故事与验收标准

### US-1：有平台链接的记录，点卡片直达作品页

- **Given** 发布记录列表存在一条 `result.url` 为合法 http/https 的记录
- **When** 用户点击该卡片除「详情」「重试」按钮、复选框、详情弹窗锚点以外的任意区域（标题、统计区、状态徽标、缩略图、空白处等）
- **Then** 应用内顶部标签栏新增一个标签页，加载 `result.url`；若标签创建成功，显示成功提示「已在新标签页打开作品链接」

**验收**：
- AC-1 点击卡片主体区域调用 `tabStore.createTab({ url, platform, title })`，参数与记录字段对应（url=平台链接，platform=记录平台 id，title=「作品 · {记录标题}」）。
- AC-2 创建成功（返回 tabId）显示 `historyPage.cardLinkOpened` 提示。
- AC-3 同一卡片在创建请求进行中重复点击不重复发请求（进行中守卫）。

### US-2：无链接/链接非法的记录，点卡片不产生误导

- **Given** 记录无 `result.url`、或 URL 非 http/https（`javascript:`、协议相对 `//host`、缺协议等）
- **When** 用户点击该卡片
- **Then** 不调用任何打开通道，页面无跳转、无报错。

**验收**：
- AC-4 `safeHttpUrl(result.url)` 为 null 时不调用 `createTab`，也不 `window.open`。
- AC-5 悬浮提示如实呈现：可点卡片 `title="点击打开平台作品链接"`；不可点卡片 `title="暂无平台链接"`。悬浮提示属于提示文案，不构成可点性承诺。

### US-3：卡片内交互元素的点击不冒泡为卡片点击

- **Given** 用户点击卡片内任何按钮或交互控件
- **When** 点击事件冒泡
- **Then** 卡片级打开逻辑**不**触发。

**验收**：
- AC-6 点击「详情」「重试」按钮、批量管理复选框 label、详情弹窗锚点，均不触发 `createTab`（测试锁：逐个元素断言 `createTab` 未被调用）。
- AC-7 详情弹窗内「作品链接」锚点保持 `target="_blank" rel="noopener"` 与 `safeHttpUrl` 判据（href-scheme-contract 锁既有断言不回归）。

### US-4：`window.open` 降级通道（应用内标签失败时的系统浏览器兜底）

- **Given** 记录有合法 `result.url`，但 `tabStore.createTab` 返回 null（page-manager 桥不可用或标签创建失败；store 合同：内部吞错返回 null，从不抛错）
- **When** 组件降级调用 `window.open(url, '_blank')`（当前实现中该调用**仅**在此降级分支可达；「键盘 Enter 直开」属未来设想，非现状）
- **Then** 主进程 `window.js` 的 `setWindowOpenHandler → openExternalUrl → isAllowedExternalUrl`（更严判据：`new URL()` 解析 + 协议白名单 + 拒绝 userinfo）兜底，交系统默认浏览器打开。

**验收**：
- AC-8 渲染层新增 `window.open` 调用点登记进 `apps/desktop/src/href-scheme-contract.test.js` 的 `OPEN_SITES_GUARDED_IN_MAIN`，理由写明「卡片点击 fallback：主进程更严判据兜底」。
- AC-9 该登记锁与「登记表站点必须存在」双向断言通过。

## 4. 显示项变更

| 区域 | 变更 | 明细 |
|------|------|------|
| 卡片悬浮提示（可点） | 新增 | `title="点击打开平台作品链接"`（`historyPage.cardOpenHint`） |
| 卡片悬浮提示（不可点） | 新增 | `title="暂无平台链接"`（`historyPage.cardNoLinkHint`） |
| 打开成功提示 | 新增 | 「已在新标签页打开作品链接」（`historyPage.cardLinkOpened`），走页面顶部 `actionMessage`（与重试/删除提示同一承载） |
| 打开失败提示 | 新增 | 「打开作品链接失败，请重试」（`historyPage.cardLinkOpenFailed`），同一承载 |
| 卡片光标 | 变更 | 可点卡片 `cursor: pointer`；不可点卡片保持默认 `cursor` |
| 其余显示项 | 不变 | 状态徽标、审核徽标、发布方式徽标、失败原因行、统计区、缩略图全部保持原样 |

## 5. 交互流程

```
用户点击 record-card
  │
  ├─ 点击目标是 [详情/重试按钮、复选框、弹窗锚点等交互元素]？
  │     └─ 是 → 元素自身逻辑（@click 内部无冒泡拦截需求：这些元素不注册卡片级
  │             打开逻辑，冒泡到卡片 handler 时因 closest('a,button,label,input')
  │             命中而被忽略）→ 流程结束
  │
  ├─ selectionMode（批量管理）下点击卡片？
  │     └─ 是 → 不打开链接（批量模式下卡片点击 = 误触风险面）→ 流程结束
  │
  ├─ 记录 result.url 经 safeHttpUrl 判定 → null？
  │     └─ 是 → 无响应（title 显示「暂无平台链接」）→ 流程结束
  │
  ├─ 该卡片已有进行中的打开请求？
  │     └─ 是 → 忽略本次点击 → 流程结束
  │
  └─ 走 tabStore.createTab({ url, platform, title })
        ├─ 返回 tabId → actionMessage = 「已在新标签页打开作品链接」
        ├─ 返回 null → 降级 window.open(url, '_blank')（主进程兜底 → 系统浏览器）
        └─ 抛错 → actionMessage = 「打开作品链接失败，请重试」
```

交互细节：

1. **事件委托式冒泡过滤**：卡片级 `@click` 处理器内用 `closest()` 判定点击起点是否落在 `a, button, label, input, [role=tab]` 内；命中则直接 return。不为每个子元素逐个加 `@click.stop`（避免侵入子组件模板，也避免将来新增子元素时漏加 stop）。
2. **批量管理模式排除**：`selectionMode` 为 true 时卡片点击不打开链接。原因：批量模式下卡片选择靠复选框，整卡点击极易误触打开。
3. **进行中守卫**：`openingCardId` ref 记录进行中打开的记录 id；请求 settle 后清除。同一卡片进行中重复点击被忽略；不同卡片互不阻塞。
4. **键盘可达性**：卡片本身保持 `article` 语义不变（不加 tabindex/role，避免与既有 roving tabindex 体系冲突）；键盘路径经详情弹窗的作品链接锚点（天然可达）。`window.open` 直开通道保留为程序化入口（含未来快捷键扩展）。
5. **成功/失败反馈**：统一走页面既有 `actionMessage`（面板工具栏右侧，role=status），不新增弹窗/toast。

## 6. 数据校验规则

| 校验点 | 规则 | 失败行为 |
|--------|------|----------|
| URL 协议 | `safeHttpUrl(record.result.url)` 非 null（仅接受完整 `http://` / `https://` 前缀；拒绝 `javascript:`、`data:`、协议相对 `//host`、缺协议、含控制字符清洗后放行等一切非白名单形态） | 不产出打开行为；title 显示「暂无平台链接」 |
| URL 类型 | `result.url` 必须是 string；数字/对象/数组一律视为无链接 | 同上 |
| platform | `String(record.platform || '')`，空串允许（标签标题用平台中文名兜底「未知平台」） | 不阻断打开 |
| title | `作品 · {recordTitle(record)}`；`recordTitle` 兜底「未命名发布任务」 | 不阻断打开 |
| 进行中状态 | `openingCardId === record.id` 时忽略点击 | 静默忽略 |

> `resultValue(record, 'url')` 既有函数（仅 string/number 返回字符串）复用为取值入口；safeHttpUrl 判据挂在其结果上。

## 7. 功能逻辑（实现落点）

| 文件 | 变更 |
|------|------|
| `apps/desktop/src/views/PublishHistory.vue` | ① `article.record-card` 绑定 `:title`（可点性提示）与 `@click`（`onCardClick`）；② 新增 `onCardClick(event, record)`：`closest` 过滤交互元素 → selectionMode 排除 → 调 `openCardLink`；③ 新增 `openCardLink(record)`：safeHttpUrl 判定 → 进行中守卫（`openingCardIds` Set）→ `tabStore.createTab`，返回 null 降级 `window.open`，promise 拒绝（合同外漂移）显示失败提示；④ 新增 `isCardClickable / cardClickHint`（title 与光标绑定用，与打开路径共用 `cardLinkUrl` 单一真源）；⑤ 样式：`.record-card.is-clickable { cursor: pointer }` |
| `apps/desktop/src/locales/zh.js` / `en.js` | 成对新增 `historyPage.cardOpenHint / cardNoLinkHint / cardTabTitle / cardLinkOpened / cardLinkOpenFailed` 五键 |
| `apps/desktop/src/href-scheme-contract.test.js` | `OPEN_SITES_GUARDED_IN_MAIN` 登记 `src/views/PublishHistory.vue`（窗口 open fallback，主进程更严判据兜底） |
| `apps/desktop/src/views/PublishHistory.test.js` | 新增「卡片点击打开平台链接」describe（见 §8 测试计划） |
| `01-docs/PRD-PUBLISH-HISTORY-CARD-OPEN-LINK-2026-10-03.md` | 本文档 |
| `CHANGELOG.md` | Unreleased 追加本次变更 |

不修改：主进程任何文件、`stores/tab.js`、草稿卡片、详情弹窗结构。

## 8. 测试计划（TDD 先行）

新增 describe：`PublishHistory 发布记录卡片点击打开平台链接`。测试矩阵：

| # | 场景 | 断言 |
|---|------|------|
| T1 | 点击卡片主体（`.record-title-row` h2）且记录有合法 `result.url` | `pageManager.createNewTabPage` 被调一次，参数 `{ url, platform: 'zhihu', title: '作品 · 已发布文章' }` |
| T2 | 点击卡片内「详情」按钮 | 弹窗打开且 `createNewTabPage` 未被调用 |
| T3 | 点击卡片内「重试」按钮 | `retryTask` 被调且 `createNewTabPage` 未被调用 |
| T4 | 批量管理模式下点击卡片 | `createNewTabPage` 未被调用 |
| T5 | 无 `result.url` 的记录点卡片 | `createNewTabPage` 未被调用，无异常 |
| T6 | `result.url = 'javascript:alert(1)'` 点卡片 | `createNewTabPage` 与 `window.open` 均未被调用 |
| T7 | `result.url` 缺协议（`example.com/xxx`）点卡片 | 同 T6 |
| T8 | createTab 成功（返回 tabId） | 显示「已在新标签页打开作品链接」 |
| T9/T10 | createTab 返回 null（含桥不可用被 store 吞错的合同形态） | `window.open` 被调（系统浏览器兜底），不崩 |
| T10b | createTab promise 拒绝（合同外漂移兜底分支） | 显示「打开作品链接失败，请重试」，`window.open` 不被调，无未捕获异常 |
| T11 | 可点卡片 title 提示正确 | `title="点击打开平台作品链接"` |
| T12 | 不可点卡片 title 提示正确 | `title="暂无平台链接"` |
| T13 | 进行中重复点击 | 第二次点击不重复发 createTab |
| T14 | 详情弹窗锚点回归 | `detail-link` 保持 safeHttpUrl 判据与 noopener（防本变更回归既有合同） |

mock 策略（按组件合同，QM-6 评审后如实修订）：`vi.mock('@/stores/tab')` 注入 `createTab` mock——组件测试只锁「对 store 的调用契约」；store→pageManager 桥→IPC 的集成由 Collection.test.js / Comments.test.js 与 tab store 自身测试覆盖（文件内既有用例用 `vi.mock('@/stores/platforms')` 规避 pinia，拖真实 pinia 会使既有用例集体红）。`window.open` 用 `vi.spyOn(window, 'open')`。

## 9. 安全与合规

1. **协议判据单一来源**：渲染端一律 `safeHttpUrl`（PRD-HREF-SCHEME-GUARD 合同）；`window.open` fallback 由主进程 `isAllowedExternalUrl`（更严：`new URL()` 解析 + 协议白名单 + 拒绝 userinfo）兜底。两层判据按 sink 分工，不合并、不放松。
2. **Vue 3 不净化 href**：本变更不新增任何 `:href` 绑定（卡片点击走 JS 通道），不触碰既有锚点。
3. **无新增依赖、无 IPC 参数脱壳风险**：`createTab` 参数为纯 JSON 字面量（string），无 reactive proxy。
4. **noopener**：详情弹窗既有锚点保持 `target="_blank" rel="noopener"`。

## 10. 风险与权衡

| 风险 | 处置 |
|------|------|
| 批量模式下整卡点击误触 | selectionMode 直接排除打开行为 |
| 无链接记录点了没反应被误解为 bug | title 如实提示「暂无平台链接」；不做引导跳转 |
| createTab 在 page-manager 未初始化（如窗口最小化到托盘后）失败 | 降级 window.open 系统浏览器兜底，用户路径不断 |
| 误放行非 http/https URL | safeHttpUrl 拒绝 + 主进程 second gate；T6/T7 双测锁 |

## 11. 质量门禁映射（QM）

- QM-2：require 路径无新增；无 IPC reactive 参数；注释语法合规。
- QM-4：涉及 UI 文件（.vue）→ 发布前跑视觉回归（本变更为交互增强，无布局改动；PR 合入前跑 `test:visual:pixel` 若可用）。
- TDD：测试先行（本 PRD §8 矩阵先写测试后写实现）。
- QM-6：PR 流程中执行双模型评审并回写 `.quality-gates.md`。
- locale 成对修改：zh/en 四键成对（CI Gate 7 拦截）。
