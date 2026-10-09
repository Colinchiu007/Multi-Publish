# PRD：热门选题 → 改写 → 一键发布图文 的批量交接（hot-topics-publish-handoff）

- 文档版本：v1.0
- 日期：2026-10-09
- 状态：已实现（分支 `hot-topics-publish-handoff`）
- 关联：`apps/desktop/src/views/HotTopics.vue`、`apps/desktop/src/views/Publish.vue`、`apps/desktop/src/composables/useBatchPublish.js`
- 证据来源：CDP E2E 实测（端口 9531 连接运行中的应用，走完「选 5 条选题 → 一键发布 → 直接发图文 → 5 条草稿生成 → 去发布」全流程）

---

## 1. 背景与问题

### 1.1 现状链路

「热门选题」页支持勾选多条选题后点「一键发布」，弹窗提供两个去向：

| 去向 | 弹窗文案 | 行为 |
|------|---------|------|
| 直接发图文 | 打开图文发布页，改写内容将自动填入文案输入框 | 逐条调用改写引擎生成文章 → 存草稿 → 跳发布页 |
| 生成视频 | 打开视频创作流水线页，改写文本将自动填入文案输入框 | 逐条改写 → 存草稿 → 取最后一条跳视频流水线 |

### 1.2 缺陷（E2E 实测复现）

2026-10-09 CDP E2E 实测：勾选 5 条热门选题 → 一键发布 → 直接发图文 → 改写区显示「改写完成，已生成 5 条草稿」→ 点「去发布」。

结果：发布页表单**全空**（标题 0 字、正文 0/10000 字），5 条草稿虽已落库，但页面未装载任何一条。

根因（第一性）：

- `HotTopics.goToDestination()` 图文分支执行 `router.push('/publish')`，**不带任何草稿参数**；
- `Publish.vue` 的 `onMounted` 仅在 `route.query.draft` 存在时才 `await loadDraft(String(draftId))`。

两者组合 ⇒ 表单恒为空。用户唯一的补救路径是手动打开「草稿箱」逐条点「加载」，5 条选题 = 5 次手工装载，与弹窗承诺的「改写内容将自动填入文案输入框」直接矛盾。

单条选题场景的承诺**同样不成立**（`?draft=` 从未被传入），只是 1 条时用户手工装载的代价小、不易暴露。

### 1.3 为什么必须在本期修

「热门选题 → 改写 → 发布」是本产品的核心增长链路之一：选题获取与改写都已完成（改写 5/5 成功、草稿 5/5 落库），失败点只在**最后一跳的参数传递**。这属于「链路已通但用户拿不到结果」的高性价比修复。

---

## 2. 目标与非目标

### 2.1 目标

1. 兑现弹窗承诺：批量改写完成后点「去发布」，发布页自动装载**全部**成功草稿。
2. 支持「多选题目的一次性分发」：N 条草稿应能一次性设定发布目标，而不是逐条 × 逐平台勾选。
3. 装载必须**不破坏**用户编辑（keep-alive 场景重复激活不得回滚内容）。
4. 失败要**如实、可定位**：草稿缺失、平台无账号等情况给明确文案，不静默、不硬凑。

### 2.2 非目标

- 不做「草稿箱批量选择 → 批量装载」的通用入口（本期只做热门选题交接，通用入口另立需求）。
- 不改改写引擎、不改平台适配器。
- 不做跨会话的发布任务持久队列（沿用既有批量发布链路）。
- 不改视频流水线去向（`生成视频` 仍取最后一条草稿跳 `/create`）。

---

## 3. 术语

| 术语 | 含义 |
|------|------|
| 交接（handoff） | 热门选题页把改写产物（草稿 id 集合）交给发布页的过程 |
| 批量装载 | 发布页按草稿 id 建立多条批量条目（`articles[]`） |
| 批量条目 | 批量模式下的一条待发布内容（标题/正文/标签/话题/发布目标各自独立） |
| 可发布平台 | 平台目录中存在账号的平台（无账号平台勾选后过不了提交校验） |
| 默认账号 | 平台维度的默认账号（`getDefaultAccount(platformId)`） |

---

## 4. 用户流程

### 4.1 修复后主流程（图文，5 条选题）

```
热门选题页
 1. 勾选 N 条选题（N ≤ 20，超出提示「批量上限」）
 2. 点「一键发布」→ 弹窗「选择发布去向」
 3. 点「直接发图文」
     ├─ 进度区逐条改写（0/5 → 5/5），每条显示：题目 / ⏳ / ✅ / ❌+重试
     └─ 每条成功即存草稿（draftSave），失败条目可单独重试
 4. 完成后显示「改写完成，已生成 5 条草稿」+「去发布」
 5. 点「去发布」→ 跳 /publish?drafts=<id1,id2,id3,id4,id5>
发布页
 6. 自动进入批量模式，装载 5 条条目（标题沿用选题名，正文为改写结果）
 7. 预置发布目标：勾选全部「可发布平台」并写入各平台默认账号
 8. 用户可逐条调整；也可用「批量设置发布目标」改平台后点「应用到全部条目」
 9. 点「批量发布 (N 个任务)」→ 走既有发布链路，逐平台回执进度
```

### 4.2 修复后单条流程

N=1 时 `goToDestination` 走 `?draft=<id>`，装载进**单篇编辑器**（保持既有语义，不做批量态切换）。

### 4.3 时序（失败与边界）

| 场景 | 行为 |
|------|------|
| 部分草稿已被删除 | 只装载存在的条目 + 提示「已装载 {loaded}/{total} 条草稿（其余草稿已被删除）」 |
| 全部草稿不存在 | 提示「所选草稿已不存在，请回到「热门选题」重新生成」；**不进入**批量模式、不渲染空条目、不记账 |
| 平台无可用账号 | 该平台不列入工具条选项（勾了也提交不了），如实少给选项 |
| 用户改过条目后切走再切回 | 同一批 id 幂等：不重新装载，保留用户编辑 |
| 新一轮交接（id 集合变化） | 重新装载（覆盖上一轮条目） |

---

## 5. 功能逻辑

### 5.1 交接参数

| 参数 | 形态 | 语义 |
|------|------|------|
| `?draft=<id>` | 单个草稿 id | 单篇编辑器装载（既有语义，无回归） |
| `?drafts=<id,id,...>` | 逗号分隔 | 批量装载（本期新增） |

两者同时出现时：**批量优先**（`?drafts=` 是完整集合，单篇参数视为冗余）。

### 5.2 交接发送端（HotTopics.vue）

- 取 `publishQueue` 中 `status === 'success' && draftId` 的条目（只交接真正落库的草稿）。
- 0 条成功：不跳转（按钮本就不渲染）。
- 1 条成功：`{ path: '/publish', query: { draft: id } }`。
- ≥2 条：`{ path: '/publish', query: { drafts: ids.join(',') } }`。

**为何只交接成功条目**：失败条目没有 `draftId`，无法回溯；让用户先重试失败条目，比塞入空条目更诚实。

### 5.3 交接接收端（Publish.vue）

1. `parseHandoffDraftIds(value)`：支持字符串/数组入参，按 `,` 切分 → 去空白 → 去重（`Set`）→ 截断到上限 50。非法入参（`undefined`/`null`/空串/非字符串）返回 `[]`。
2. `applyDraftHandoff(ids)`：
   - 计算幂等键 `key = ids.join(',')`；与 `handoffAppliedKey` 相同则**短路返回 0**（不重装载）。
   - `await loadDrafts()` 拉草稿全量（草稿真源是主进程 store，只在内存列表里查 id，避免逐条 IPC）。
   - 以 `Map` 按 `String(draft.id)` 精确匹配；`found` 为命中列表。
   - `found.length === 0` → 提示 + 返回 0（**不记账**，便于用户回到选题页重生成后再次交接）。
   - 命中则记账、`batchMode = true`、`seedArticlesFromDrafts(found)`。
   - 预置目标：`handoffPlatformOptions`（可发布平台）全部勾选，并写默认账号；同步刷新工具条的已勾选集合。
   - 提示：全命中「已装载 {count} 条热门选题草稿」；部分命中「已装载 {loaded}/{total} 条草稿（其余草稿已被删除）」。
3. 触发点三处（覆盖 keep-alive 与非 keep-alive）：`onMounted`、`onActivated`、`watch(() => route.query.drafts)`。

### 5.4 批量装载（useBatchPublish.js）

- 新增 `createArticleItem()` 工厂作为**字段面唯一真源**，`addArticle` 与 `seedArticlesFromDrafts` 共用。
  - 理由：两处各写一份默认字段面，新增字段必然只改一处，缺字段要到 payload 构造期才暴露（历史缺陷 `cover_*` 有读点无写点、恒为空）。
- `seedArticlesFromDrafts(draftList)`：
  - 过滤条件：条目为对象且 `id` 为非空字符串；其余跳过。
  - 写入：`title` / `content`（非字符串一律落空串，不把 `undefined` 漏进 payload）；
    `tags` / `topics` 经 `normalizePublishStringList`（兼容数组、逗号/顿号分隔字符串、`{name}` 对象）；同步 `tagsText` / `topicsText`（界面上以文本呈现）。
  - 返回实际装载条数；就地替换 `articles`。
- `applyTargetsToAll({ platforms, accounts })`：
  - 平台 id 去重、过滤空串；平台为空或条目为空 → 返回 0。
  - 逐条目：`platforms` 覆盖为所选集合、`accounts` 重置后按平台写入 `normalizeAccountIds(accounts[platform])`。
  - **无账号映射的平台刻意不写空数组**，保持 `accounts[platform]` 键缺失，让校验文案如实指向该平台。

### 5.5 批量设置发布目标工具条

- 位置：批量模式内容区顶部（条目列表之上）。
- 组成：标题「批量设置发布目标」+ 说明「勾选平台后应用到全部条目，账号取各平台默认账号」+ 可发布平台复选框组 + 「应用到全部条目」按钮 + 说明「逐条仍可单独调整」。
- 平台选项来源：`handoffPlatformOptions`（平台目录 ∩ 有账号），无账号平台不出现。
- 按钮禁用条件：未勾选任何平台 或 条目数为 0。
- 点击行为：`applyTargetsToAll(buildDefaultTargets(选中平台))` → 成功提示「已应用到 {count} 个条目」。

---

## 6. 数据校验

| 校验项 | 规则 | 失败表现 |
|--------|------|---------|
| 草稿 id 形态 | 非空字符串；其余（数字/空/空白/`null`）一律跳过 | 该条目不装载 |
| id 集合去重 | `Set` 去重，避免同一草稿生成两条条目 | 静默去重 |
| id 数量上限 | `HANDOFF_DRAFT_LIMIT = 50` | 超出部分丢弃（防恶意/异常超长 query 拖垮渲染） |
| 命中判定 | `String(draft.id)` 精确相等（不做前缀/模糊匹配） | 未命中计入 missing |
| 全部未命中 | 不进入批量模式、不渲染条目、不记账 | 提示「所选草稿已不存在…」 |
| 部分未命中 | 装载命中项，提示 {loaded}/{total} | 不阻断 |
| 发布目标账号 | 每个所选平台必须有账号 id（`validatePublishTargets`） | 提交时报「请为<平台>选择至少一个账号」 |
| 平台无账号 | 不列入工具条可选平台 | 选项不出现 |
| 标题/正文内容 | 沿用既有 `validatePlatformContent`（各平台字数上限、无标题平台 caption 口径） | 既有校验文案 |

---

## 7. 交互逻辑与显示项

### 7.1 显示项

| 位置 | 显示项 | 说明 |
|------|--------|------|
| 热门选题·进度区 | `已完成/总数`、进度条、逐条题目 + 状态图标、失败条目「重试」、「取消」/「返回」、「去发布」 | 既有，本期只改「去发布」的参数 |
| 发布页·页头 | 标题「一键发布」、副标题切到「批量编辑多篇文章，各平台独立发布」 | 既有 |
| 发布页·批量区顶部 | 新增工具条（见 5.5） | 本期新增 |
| 发布页·条目卡 | `#序号`、定时标记、复制/删除、标题、正文、标签/话题/@好友、封面、发布目标（平台+账号）、定时、能力提示 | 既有 |
| 发布页·底部操作 | 「＋ 添加文章」+「批量发布 (N 个任务)」 | 既有（N 由条目 × 目标实时计算） |

### 7.2 按钮状态

| 按钮 | 禁用条件 |
|------|---------|
| 热门选题「一键发布」 | 未勾选任何选题 |
| 热门选题「去发布」 | 无成功草稿（`hasSuccessfulDrafts` 为假时不渲染） |
| 发布页「应用到全部条目」 | 未勾选平台 或 条目数 0 |
| 发布页「批量发布」 | 发布中 或 条目数 0 |

### 7.3 幂等与状态保持

- 装载幂等的粒度是**一批 id**，不是「是否装载过」：
  - 同一批 id：重复触发（keep-alive 激活、watch 同步触发）都不重装载，用户编辑不被覆盖。
  - 新一批 id：重新装载（新一轮热门选题交接）。
- 全部未命中时**不记账**：用户回选题页重新生成后（id 变化）仍可正常交接；即使 id 未变也会重新尝试一次，避免「一次失败永久失效」。

---

## 8. 提示文字清单（zh / en）

| key | 中文 | English |
|-----|------|---------|
| `publishPage.handoff.loaded` | 已装载 {count} 条热门选题草稿 | Loaded {count} hot-topic drafts |
| `publishPage.handoff.partial` | 已装载 {loaded}/{total} 条草稿（其余草稿已被删除） | Loaded {loaded}/{total} drafts (the rest were deleted) |
| `publishPage.handoff.none` | 所选草稿已不存在，请回到「热门选题」重新生成 | The selected drafts no longer exist. Generate again from Hot Topics. |
| `publishPage.batchTargets.title` | 批量设置发布目标 | Batch publish targets |
| `publishPage.batchTargets.hint` | 勾选平台后应用到全部条目，账号取各平台默认账号 | Tick platforms and apply to all entries; each platform uses its default account |
| `publishPage.batchTargets.applyAll` | 应用到全部条目 | Apply to all entries |
| `publishPage.batchTargets.applyAllHint` | 逐条仍可单独调整 | Each entry can still be adjusted individually |
| `publishPage.batchTargets.applied` | 已应用到 {count} 个条目 | Applied to {count} entries |

文案纪律：新增用户可见文案一律**成对**写入 `locales/zh.js` 与 `locales/en.js`（CI Gate 7 `check-locale-sync.js` 拦截单侧改动）；渲染端非 locales 文件不得出现中文字符串字面量。

---

## 9. 参考产品对照（参考产品 4.x 逆向分析）

资料来源（只读逆向产物；**该目录名含参考产品品牌词，按品牌残留红线不写入本 tracked 文档**，用品牌词无关的定位法可复现：`D:\Data\projects\` 下以「逆向工程」开头、版本号 4.x 的目录）：

- 该目录下 `README.md`（版本 4.13.19，Electron + React 19，主进程入口 `packages/main/dist/index.cjs` 8.4MB）
- 该目录下 `RPA分析报告.md`（架构图：账号管理 + 发布引擎 + 平台适配器层 + 通用基础设施层）
- 该目录下 `可复用代码分析.md`（§9 统一发布流程模板、§10 平台适配器示例）

关键结论与对照：

| 维度 | 参考产品 | 本产品（本期） |
|------|------------------|---------------|
| 发布实现 | **调平台创作者 API**（axios + Cookie 认证 + Referer/Origin/UA），非 DOM 注入 | 平台适配器混合（API 轨 + RPA 轨），本期不动 |
| 适配器形态 | 抽象基类 `PlatformPublisher`：`uploadVideo` / `uploadCover` / `buildPostData` / `publish` 必须由子类实现 | 本仓 `packages/api-publish-engine`、`packages/rpa-engine` 各自适配器 |
| 统一流程 | `execute()` 三段式：上传素材(10→60) → 上传封面(70→90) → 推送中 → 成功判定 `result.publishId` | 本仓批量发布链路（`batchCreate`/`batchExecute` + 进度事件） |
| 重试 | 上传最多 3 次、间隔 2000ms；重试条件基于响应 `isJson` 校验 | 本仓任务级重试（批次失败条目可重发） |
| 并发 | 任务并行执行器 `concurrency = 3` + 队列 | 本仓 `MP_QUEUE_MAX_CONCURRENT` 与通道化调度 |
| 取消 | `CancelToken`，取消返回 `code -999 / 任务已取消` | 本仓单篇/批量取消沿用 CancelToken 语义 |
| 进度 | `SetProgressEvent(百分比, 文案)` + `SetProgressNewEvent(状态枚举)` 双通道 | 本仓进度 store + `onBatchProgress` |
| 内容类型 | `video` / `dynamic`（图文） | 本仓 `activeMode` = video / article |
| 图文分发 | 任务队列 + 多账号 + 多平台一次提交 | **本期补齐**：热门选题 N 条草稿 → 批量条目 → 平台+账号一次应用 |

**借鉴点（本期落地）**：参考产品把「发布任务」当作一等对象（队列 + 并发上限 + 进度双通道 + 取消 + 重试），其价值在于**用户一次表达意图（发这些内容到这些账号），引擎负责编排**。本期的批量条目 + 「应用到全部条目」正是同一取向在渲染层的最小落地：把「N 条 × M 平台」的选择成本从 O(N×M) 降到 O(1) 次表达。

**未借鉴（明确不做）**：参考产品直接用平台 API 发布，本产品保留 RPA 轨（登录态复用与风控差异导致不能照搬），仅对齐**交互与编排语义**。

---

## 10. 验收标准

| 编号 | 验收项 | 判定方式 |
|------|--------|---------|
| AC-1 | 5 条选题批量改写完成后点「去发布」，发布页处于批量模式且恰好 5 条条目 | E2E + 单测 |
| AC-2 | 5 条条目的标题等于 5 条选题、正文等于改写结果 | E2E + 单测 |
| AC-3 | 条目预置「可发布平台」并写入各平台默认账号 | 单测（账号断言） |
| AC-4 | 单条选题仍走单篇编辑器（`?draft=`） | 单测 |
| AC-5 | 部分草稿删除 → 装载命中项并提示 {loaded}/{total} | 单测 |
| AC-6 | 全部草稿删除 → 不进批量模式、无空条目、有提示 | 单测 |
| AC-7 | 同一批 id 重复激活不覆盖用户编辑 | 单测（幂等） |
| AC-8 | 「应用到全部条目」把平台+默认账号写到全部条目 | 单测 |
| AC-9 | 无账号平台不写入空账号数组 | 单测 |
| AC-10 | 真实多平台发布成功（发文可查） | CDP E2E（见执行记录） |

---

## 11. 测试与回归保护

| 层级 | 文件 | 用例 |
|------|------|------|
| 组件（交接发送端） | `apps/desktop/src/views/HotTopics.test.js` | 「多条 → ?drafts= 全部 id」「单条 → ?draft=」 |
| 组件（交接接收端） | `apps/desktop/src/views/Publish.test.js` | 装载 3 条、部分命中、全失效、keep-alive 幂等、id 解析、工具条应用 |
| 组合式函数 | `apps/desktop/src/composables/useBatchPublish.test.js` | 装载字段面、非法条目过滤、空入参不动现有条目、字段面与 `addArticle` 键集一致、目标应用含账号、空输入返回 0、重复应用覆盖 |

反证（mutation）纪律：把三处修复点改回缺陷形态后，新增用例必须立刻变红（结果见 `openspec/records/hot-topics-publish-handoff.md`）。

---

## 12. 遗留与风险（不假装已闭合）

1. **交接上限 50**：超过部分静默丢弃（仅防异常），未给用户提示。若真实场景 N > 50，需要改成分页/分派提示。
2. **草稿真源是内存列表**：`applyDraftHandoff` 先 `loadDrafts()` 全量拉取再按 id 匹配；草稿量级增长后应考虑主进程按 id 批量取。
3. **平台账号解析依赖默认账号**：若用户希望「多条内容发到同一平台的不同账号」，需逐条改（工具条只写默认账号）。这是刻意的保守选择（避免误发）。
4. **预置全部可发布平台**：交接后默认勾选所有有账号的平台。用户若只想发部分平台，必须在提交前取消勾选。已通过「逐条可调整 + 仍须手动点提交」控制风险，但**存在误发到非预期平台的可能**，属产品取舍，需要用户在发布前确认。
5. **未做「草稿箱多选 → 批量装载」**：本期只在热门选题链路补齐，通用入口另立。

---

## 13. 小红书「仅存平台草稿箱」（硬约束，2026-10-09 追加）

### 13.1 需求原文与判定

> 小红书要特殊对待，不要真实发布。因为小红书风控比较严格。只需要实现发布内容放在小红书平台的草稿箱里就好，之后可以通过我用小红书 APP 扫二维码再真实发布。

判定：小红书**不得走真实发布**。内容只写进**小红书创作者中心草稿箱**（服务端持久化），由用户在手机 App 内确认后自行发布。

### 13.2 为什么必须做成「路由级硬约束」而不是「界面提示」

- 真实发布一旦发生就**不可撤回**（笔记已公开、已进平台审核），而自动化点击发布正是风控最敏感的行为；
- 仅靠界面提示无法防住其它入口（单篇发布、批量发布、自动化流水线、定时任务都会经过发布路由）；
- 因此约束落在**发布路由表**（`ROUTE_TABLE.xiaohongshu`）上：小红书从 `rpa_vm`（RPA 轨会点「发布」按钮）改为 `xhs_draft`（只调 API 且 `draft=true`）。任何缺件一律抛错，**绝不回落到 RPA 真实发布**。

### 13.3 实现

| 层 | 内容 |
|----|------|
| 路由 | `apps/desktop/electron/services/publisher-router.js`：`xiaohongshu: { mode: 'xhs_draft', timeout: 180000 }`；`createPublisher` 新增 `xhs_draft` 分支 |
| 发布器 | `apps/desktop/electron/services/xiaohongshu-draft-publisher.js`（新增）：凭证装载 → 图片收集 → 调链 → 结果判定 |
| 链 | `packages/api-publish-engine/src/publish/platforms/xiaohongshu-draft.js`（既有，本期接入正式链路）：GET permit → PUT ros-upload → POST note（`draft=true`） |
| 凭证 | Cookie（`a1` / `web_session` …）+ `Authorization: AT <access-token-creator.xiaohongshu.com>`；签名走进程内本地算法（不开窗、不触达活页） |
| 结果 | `{ success: true, platform: 'xiaohongshu', mode: 'xhs_draft', draft: true, postId: <draftId>, url: '' }` |

### 13.4 数据校验（fail-closed，全部为硬失败）

| 校验项 | 规则 | 失败表现 |
|--------|------|---------|
| Cookie | 账号凭证（加密文件或分区回退）里必须有 cookie | 抛「平台 Cookie 缺失（账号 … 未登录或凭证不可用）」 |
| `a1` | 必须存在 | 抛「缺发布链硬凭据 a1」 |
| `access-token-creator.xiaohongshu.com` | 必须存在（Authorization AT） | 抛「缺发布链硬凭据 access-token-creator.xiaohongshu.com」 |
| 标题 | 非空（平台标题上限 20 字，链内截断） | 抛「标题为空」 |
| 图片 | ≥1 张（图片 → 图片文件描述 → 封面，去重保序） | 抛「小红书草稿需要至少 1 张图片（小红书不支持纯文字笔记）…」 |
| 业务码 | 平台返回 `code !== 0` 即失败 | 抛「note 失败：code=…」（带业务码与消息，便于判断端点变更） |
| 草稿标识 | 平台必须返回 `draft_id` 或 `note_id` | 抛「平台未返回草稿标识，无法确认已存入草稿箱」 |

### 13.5 流程

```
发布任务（platform=xiaohongshu）
 → PublisherRouter.getRoute → mode=xhs_draft
 → XiaohongshuDraftPublisher.publish
    ① loadAuthForTask（accountId → 加密凭证 → 分区 cookie 回退）
    ② 校验 cookie / a1 / Authorization / 标题 / 图片（任一缺失即抛错）
    ③ 逐图：GET permit（scene=image）→ PUT ros-upload
    ④ POST /web_api/sns/v2/note（draft=true；带 x-s/x-t/x-s-common/traceid 签名头）
    ⑤ 判定：业务码 0 且拿到草稿标识 → 成功（draft: true）
 → 任务队列 task:success → 历史记录 success（result.draft=true）
 → **不建审核回查**（草稿不是已公开作品，平台内容列表里查不到）
 → tracked_content 记 untrackable（无公开锚点，不排回采）
```

### 13.6 交互逻辑与显示项

| 位置 | 显示项 | 触发条件 |
|------|--------|---------|
| 单篇发布页（发布目标下方） | 「小红书仅保存到平台草稿箱（不直接发布），请在手机 App 里确认后自行发布」 | 所选平台含小红书 |
| 批量发布页（每条条目的发布目标下方） | 同上（逐条显示，`data-testid=batch-xhs-draft-only-<idx>`） | 该条目所选平台含小红书 |

### 13.7 提示文字

| key | 中文 | English |
|-----|------|---------|
| `publishPage.xhsDraftOnlyHint` | 小红书仅保存到平台草稿箱（不直接发布），请在手机 App 里确认后自行发布 | Xiaohongshu saves to the platform draft box only (not published). Confirm in the mobile app to publish. |

### 13.8 验收标准

| 编号 | 验收项 | 判定 |
|------|--------|------|
| XHS-1 | `ROUTE_TABLE.xiaohongshu.mode === 'xhs_draft'`（非 `rpa_vm`） | 单测 |
| XHS-2 | `createPublisher('xiaohongshu')` 返回 `XiaohongshuDraftPublisher` | 单测 |
| XHS-3 | 成功路径 `draft` 恒为 `true`，返回 `mode: 'xhs_draft'`、`draft: true`，且**不触碰** rpaViewManager | 单测 |
| XHS-4 | 缺 a1 / 缺 Authorization / 无图片 / 无草稿标识 → 全部抛错且不发起平台请求 | 单测 |
| XHS-5 | `task:success` 且 `result.draft === true` → 不建审核回查、不登记可回采作品 | 单测 |
| XHS-6 | 真实链路：内容出现在小红书创作者中心草稿箱，且平台侧**未公开发布** | E2E（见执行记录） |

### 13.9 遗留与风险（不假装已闭合）

1. **必须有图**：小红书草稿要求 ≥1 张图片。本期由用户提供（发布页选择图片/封面）；未提供时 fail-closed 报错，不静默跳过。
2. **RPA 轨的 `_publish_xiaohongshu` 仍在代码里**（`rpa-view-platforms.js`）：本期只改路由（唯一入口）；该函数未被任何路由使用，但**未被删除**——删除属单独的清理动作，避免误伤其它调用点。
3. **视频笔记未接入**：草稿链只实现了图片笔记（链内注释已声明「不外验证视频」）；小红书视频任务目前会因缺图片而 fail-closed，而不是静默改走真实发布。
4. **草稿 ID 不等于公开作品 ID**：历史记录与 tracked_content 不把它当作品锚点（见 13.5）。

