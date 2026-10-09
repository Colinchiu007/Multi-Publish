## Why

「热门选题 → 一键发布 → 直接发图文」链路的最后一跳丢参数：`HotTopics.goToDestination()` 的图文分支执行 `router.push('/publish')`，**不带任何草稿参数**；而 `Publish.vue` 的 `onMounted` 只在 `route.query.draft` 存在时才 `loadDraft`。两者组合使发布页表单恒为空——5 条选题改写全部成功（E2E 实测 5/5 草稿落库）、进度区如实显示「改写完成，已生成 5 条草稿」，但点「去发布」后用户看到的是空白表单，必须自己进草稿箱逐条点「加载」（5 条 = 5 次手工装载）。发布去向弹窗承诺的「改写内容将自动填入文案输入框」因此不成立。

同时，即使草稿能装载，批量模式下逐条目勾选发布目标是 O(N 条 × M 平台) 次点击（5 条 × 8 平台 = 40 次），而「多选题目的一次性分发」正是热门选题批量改写的使用场景。

参考产品（蚁小二 4.0 逆向：`D:\Data\projects\_逆向工程_蚁小二4.0\可复用代码分析.md` §9 统一发布流程模板、`RPA分析报告.md` 架构图）把发布任务当作一等对象——用户一次表达「发这些内容到这些账号」，引擎负责队列、并发（concurrency=3）、进度双通道与重试。本次按同一取向在渲染层做最小落地。

## What Changes

- `HotTopics.vue`：`goToDestination()` 图文分支改为带参数跳转——**多条**走 `?drafts=<id,id,...>`，**单条**保留 `?draft=<id>`（不改变单篇语义）；只交接 `status === 'success' && draftId` 的条目。
- `Publish.vue`：新增交接接收端
  - `parseHandoffDraftIds(value)`：支持字符串/数组，按 `,` 切分 → 去空白 → 去重 → 限量 50；非法入参返回 `[]`。
  - `applyDraftHandoff(ids)`：`loadDrafts()` 后按 `String(draft.id)` 精确匹配装载；**幂等键 = 已装载的 id 串**（keep-alive 的 `onActivated` 重复激活不得回滚用户编辑）；全未命中时提示且**不记账**、不进入空批量态。
  - 触发点三处：`onMounted`、`onActivated`、`watch(() => route.query.drafts)`；`?drafts=` 与 `?draft=` 同时出现时批量优先。
  - 交接后预置发布目标：勾选全部「可发布平台」（平台目录 ∩ 有账号）并写入各平台默认账号。
  - 批量区新增「批量设置发布目标」工具条：平台复选框 + 「应用到全部条目」（逐条仍可单独调整）。
- `useBatchPublish.js`：抽出 `createArticleItem()` 作为条目默认字段面的**唯一真源**（`addArticle` 与装载共用，防止新增字段只改一处导致装载条目缺字段）；新增 `seedArticlesFromDrafts(draftList)` 与 `applyTargetsToAll({ platforms, accounts })`。
- `locales/zh.js` + `locales/en.js`：新增 `publishPage.handoff.*`（3 条）与 `publishPage.batchTargets.*`（5 条）成对文案。
- 回归锁：`HotTopics.test.js`（2 例）、`Publish.test.js`（6 例）、`useBatchPublish.test.js`（7 例）。

**不变的红线**：

- 不改改写引擎、不改平台适配器、不改发布 IPC 契约。
- 不改视频去向（`生成视频` 仍取最后一条草稿跳 `/create`）。
- 不自动提交：装载后仍需用户点「批量发布」，预置目标只是省去勾选。

## Capabilities

### New Capabilities

- `hot-topics-publish-handoff`: 热门选题批量改写产物到发布页的交接契约（参数形态、装载语义、幂等与失败语义）与批量发布目标分发（平台 + 默认账号一次应用）。

### Modified Capabilities

（无——既有发布链路的能力契约未变，本期只补交接入口。）

## Impact

- **渲染端代码**：`apps/desktop/src/views/HotTopics.vue`、`apps/desktop/src/views/Publish.vue`、`apps/desktop/src/composables/useBatchPublish.js`、`apps/desktop/src/locales/{zh,en}.js`。
- **测试**：`HotTopics.test.js` + `Publish.test.js` + `useBatchPublish.test.js`（均既有文件内追加，无需新增 workflow 接线）。
- **文档**：`01-docs/PRD-HOT-TOPICS-PUBLISH-HANDOFF-2026-10-09.md`（新增，含数据校验/流程/交互/显示项/提示文字/参考产品对照）、`CHANGELOG.md`、`openspec/records/hot-topics-publish-handoff.md`。
- **风险面**：
  1. 预置全部可发布平台 ⇒ 用户若未取消勾选会把内容发到更多平台。缓解：仍需手动点提交 + 逐条可改；已在 PRD §12.4 如实登记为产品取舍。
  2. 幂等键为「id 串」，若两轮交接恰好产生相同 id 集合（理论上不可能，草稿 id 含时间戳+随机）会跳过装载——代价是一次手工装载，不会误覆盖。
  3. `loadDrafts()` 全量拉取后内存匹配，草稿量级增大后需要主进程按 id 批量取（PRD §12.2 遗留）。
- **不触碰**：主进程、平台适配器、Python 后端、CI workflow。
