# PRD — 文案改写页「自动改写入口」完成后直接定位改写结果区（2026-10-09）

> 分支：`fix-rewrite-jump-focus` · 状态：实施中 · 作者：AI（质量节拍完整流程）

## 1. 背景与问题

热门选题页（HotTopics）点击某选题的【创作文案】按钮，会跳转到文案改写页
（`/rewrite?topic=<选题>`）并**自动开始改写**。但页面打开后停留在第一屏（输入框 + 配置区），
改写完成后结果卡片出现在页面下方的「改写结果」区，首屏没有任何状态变化。

用户不知道改写其实已经完成，以为页面只是「带入了文案输入内容」，还要自己往下翻才能发现结果。
这造成认知断层：**状态已完成，感知却还是初始态**。

### 1.1 用户扩展需求（2026-10-09 确认）

> 「所有需要改写并跳转到文案改写页的情况，都要这样处理（直接跳转到"改写结果"位置）」

即：**凡是跳转到改写页后会自动开始改写的入口**，改写完成后都必须把视口定位到改写结果区；
**不自动改写的入口**（用户手动点击「开始改写」）保持现状首屏。

## 2. 入口清单（判定表）

| # | 入口 | 跳转形式 | 自动改写 | 本期行为 |
|---|------|---------|:-------:|---------|
| 1 | 热门选题·单条【创作文案】 | `/rewrite?topic=xxx` | ✅ | 完成后定位结果区 |
| 2 | 热门选题·批量【创作文案】（首条自动开始） | `/rewrite?topic=xxx` | ✅ | 完成后定位结果区 |
| 3 | 收藏选题【创作文案】（HotTopicsFavorites 复用同一跳转） | `/rewrite?topic=xxx` | ✅ | 完成后定位结果区 |
| 4 | 文案库（采集页）【改写】交接 | `/rewrite?from=collection`（sessionStorage 载荷） | ✅ | 完成后定位结果区 |
| 5 | 爆款分析【带入标题】 | `/rewrite?titleHint=xxx` | ❌ 仅预填 | 保持首屏（无自动改写，不存在「已改完却不自知」） |
| 6 | 侧边栏直接进入改写页 | `/rewrite` | ❌ | 保持首屏 |

**判定规则（单一真源，实现在 RewriteView 内）**：入口是否定位结果区由改写页自身判定——
`topic` query 或 `from=collection` 交接均属「自动改写入口」（`autoFocusResult` 标志）。
不在调用方逐个加参数：改写页单点收敛，未来新增自动改写入口只改一处。

## 3. 功能逻辑

### 3.1 状态定义

```
autoFocusResult: boolean（组件内非响应式即可，仅在挂载期被置位一次）
  ├── onMounted: route.query.topic 非空            → true
  ├── onMounted: route.query.from === 'collection'
  │              且交接载荷有效（consumeLibraryHandoff 实际取到载荷并触发自动改写） → true
  └── 其余（无 query / 仅 titleHint / 无效交接载荷）→ false（永不滚动）
```

### 3.2 触发时机（与改写结果写回同一事务点）

- `startRewrite()` 成功分支：`rewriteResult` 已赋值、`rewriteMeta`/`rewriteTitle` 已就绪后，
  在同步赋值序列末尾调用 `focusRewriteResult()`。
- **仅在 `autoFocusResult === true` 时执行滚动**；手动点击「开始改写」不滚动（用户本就在看着页面）。

### 3.3 滚动行为

```
目标元素：.rewrite-result-card（改写结果卡片，v-if="rewriteResult" 渲染后存在）
方式：el.scrollIntoView({ behavior: 'smooth', block: 'start' })
时序：await nextTick() 保证 v-if 新挂载的卡片已进入 DOM 再取引用
引用：模板 ref rewriteResultCardEl（组件实例级引用，生产与测试环境一致；
     不用 document.querySelector——@vue/test-utils 默认挂载到游离 DOM，全局查询拿不到）
守卫：typeof el.scrollIntoView === 'function' 才调用（jsdom/降级环境安全，与 ResultView.vue 同模式）
失败静默：取不到元素（理论不可能，防御式）不报错、不影响改写成功主流程
```

### 3.4 不做什么（Non-Goals）

- **不改写失败时滚动**：失败时错误横幅 `.rewrite-error` 显示在配置卡内（首屏可见），
  无需滚动；结果卡片 `v-if="rewriteResult"` 不渲染，目标不存在。
- **不自动折叠/隐藏输入区**：输入区保留原样，用户可上滑回看并微调后重新改写。
- **不加 loading 骨架屏/进度条**：本期只解决「完成后定位」，改写中状态已有 textarea disabled 反馈。
- **不改变 titleHint 入口行为**：它本就不自动改写。

## 4. 交互逻辑（时序）

```
用户在热门选题点【创作文案】
  → router.push('/rewrite?topic=…')
  → RewriteView onMounted：填入 topic、mode=create、autoFocusResult=true
  → Promise.resolve().then(() => startRewrite())   // 登录门禁 + DOM 就绪后自动开始
  → aiRewrite IPC 往返（用户停留在首屏，textarea 禁用中）
  → 成功：rewriteResult/rewriteTitle/rewriteMeta/quality 赋值
  → await nextTick() → 结果卡片挂载
  → focusRewriteResult()：.rewrite-result-card.scrollIntoView(smooth, start)
  → 用户视口落到改写结果区，立刻看到成品 ✅
```

文案库交接入口（`from=collection`）时序相同，仅载荷来源为 sessionStorage（读后即焚）。

## 5. 边界与数据校验

| 场景 | 期望 |
|------|------|
| topic 带入但改写失败（引擎 error / IPC 异常） | 不滚动，错误横幅在首屏可见 |
| topic 带入但登录门禁拒绝（ensureLogin false） | startRewrite 提前 return，不滚动 |
| `/rewrite?from=collection` 无有效载荷（直接访问） | 不自动改写 → autoFocusResult=false → 不滚动 |
| topic 与 from 同时存在 | topic 优先（互斥既有语义），按 topic 场景滚动 |
| 手动开始改写（无 query 带入） | 不滚动 |
| titleHint 预填 + 手动改写成功 | 不滚动 |
| 结果卡片尚未挂载（nextTick 前取引用） | nextTick 守卫保证取到；取不到则静默跳过 |
| 连续两次改写（同页 re-rewrite） | 仅自动改写入口第一次自动定位；手动重改不滚动（autoFocusResult 语义为「入口带入的首次改写」） |

**关于最后一条的取舍**：`autoFocusResult` 在挂载期置位后不因手动重改清除。若用户在自动改写入口
完成后又手动改了一次，第二次成功也会滚动——这是可接受甚至符合直觉的（视口已在结果区附近，
滚动幅度小、无副作用）；不为「理论上不该滚」增加状态复杂度（P5 explicit over clever）。

## 6. 显示项与提示文字

- **不新增任何用户可见文案**：本变更纯视口定位，无新字符串 → 不涉及 locales zh/en 成对修改。
- 复用既有提示：改写成功 toast（`collection.rewriteSuccess`）、失败横幅（既有 `rewrite-error`）。

## 7. 测试计划（TDD，回归锁）

文件：`apps/desktop/src/views/RewriteView.test.js`（与被测组件同目录，模式：组件挂载 + 行为断言）

1. **topic 带入 + 改写成功 → 滚动到结果卡片**：mock `Element.prototype.scrollIntoView` spy，
   mount（query=topic）→ 断言 spy 被调用且调用目标是 `.rewrite-result-card` 元素、
   参数 `{ behavior: 'smooth', block: 'start' }`。
2. **from=collection 交接 + 改写成功 → 滚动到结果卡片**：seed sessionStorage 载荷后同上。
3. **无 query 手动改写成功 → 不滚动**：spy 不被调用（防「手动场景被误滚」回退）。
4. **titleHint 入口改写成功 → 不滚动**（间接被用例 3 覆盖 query 缺省路径，显式补一条防未来 query 变化）。
5. **改写失败（引擎返回 error）→ 不滚动**：mock aiRewrite 返回 `data.error`，断言 spy 未调用。

反证要求：删除实现中的 `focusRewriteResult()` 调用 → 用例 1/2 必须变红；
删除 `autoFocusResult` 条件判断（无条件滚动）→ 用例 3/4/5 必须变红。

## 8. 验收标准（可验证）

- [ ] 用例 1-5 全绿（vitest，RewriteView.test.js 全量）。
- [ ] RewriteView 既有全量测试（1452 行既有断言）无回归。
- [ ] HotTopics.test.js / Collection.test.js 无回归（调用方零改动，防误伤）。
- [ ] 真机路径（手动验证项，PR 记录）：热门选题点【创作文案】→ 自动改写完成后视口落在结果区。

## 9. 影响范围

- `apps/desktop/src/views/RewriteView.vue`：+1 状态、+1 方法、成功分支 +1 调用点（约 15 行）。
- 其余文件零改动；无 IPC/主进程/打包影响（QM-1 打包门禁不适用——纯渲染层 .vue 逻辑，
  由 vitest 组件测试覆盖；视觉回归门禁 QM-4 按「重构不改变外观」豁免，见 PR 记录）。
