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

### 9.1 小红书「草稿 / 发布」链路对照（2026-10-10 实测逆向，回答「它们怎么处理」）

逆向对象：该目录下 `packages/main/dist/index.cjs`（7.9MB 打包产物，符号名未混淆）。检索区间为小红书适配器所在段落。

**结论 1：参考产品没有「小红书只存草稿」这条路。** 小红书区段内 `draft` / `草稿` **零命中**；草稿语义只出现在**其它平台**（B站 `vupre/web/draft/add`、抖音 draft、视频号 `post_draft`、爱奇艺「推送草稿成功」、头条 `save=0` 等）。它的默认行为是**直接发布**——因此「小红书仅存草稿」是本产品的**更严格自我约束**，不是照搬。

**结论 2：它有两条小红书轨，与本仓同构。**

| 轨 | 参考产品实现 | 本仓现状 |
|----|-------------|---------|
| DOM/RPA | `xiaohongshuImageRun`（图文注入脚本，注册于 `TargetPlatformProcess[XiaoHongShu]`） | RPA 轨 `_publish_xiaohongshu`；**图文强制 draftOnly**（点发布被我们主动去掉） |
| API | 上传（permit + ros）→ `POST https://edith.xiaohongshu.com/web_api/sns/v2/note` | 同端点、同 permit 参数（逐字一致）；note 步真机 406（见 §13） |

**结论 3：它绕过 note 风控的关键是「签名外包」，这正是我们 406 的根因对照。**

- 签名调用形态：`POST {签名服务}/Sign/GetSign`，body `{ url:"", cookie: JSON.stringify([cookieHeader, encodeURIComponent(bodyJson)]), signType:"browser", signCommand:"newxiaohongshu" }`；多端口轮询 + 失败重试（间隔 1s）。
- 响应 `signature` 是**字符串化 JSON**（需把转义引号还原），内含 `X-s` / `X-t` / `X-S-Common` —— 参考产品**原样贴到请求头**，即 `x-s-common` 由**真实浏览器环境**算出，而不是本地模板。
- 响应**还可能在 `a1` 字段返回一个刷新后的 `a1`**，参考产品把它替换进 cookie（`a1=<旧>` → `a1old=<旧>; a1=<新>`）——签名与 cookie **是联动的**。
- 提交 note 的请求头：`cookie`、`referer`/`Origin: https://creator.xiaohongshu.com`、`Authorization: ''`（**空串，不传创作者 AT token**）、`Content-Type: application/json;charset=UTF-8`、桌面 Chrome/Edge UA。
- note payload 含 `bizType: 13`、`noteOrderBind`、`timelines`、`cover`、`chapters`、`chapter_sync_text`、`segments`、`entrance: 'web'` 等字段（话题/好友在正文里以 `#话题[话题]#` / `@昵称` 形式并另附 `topic`/`friend` 结构）。
- 上传步骤与我们一致：`GET creator…/api/media/v1/upload/web/permit?biz_name=spectrum&scene=video|image&file_count=1&version=1&source=web`（referer=`publish/publish`）→ `PUT https://{uploadAddr}/{fileIds[0]}`（`x-cos-security-token`、`Authorization:''`、`Content-Type:''`）→ 取响应头 `x-ros-preview-url`。

**对照本仓差异（可解释我们的 406）**：

| 维度 | 参考产品 | 本仓 |
|------|---------|------|
| 签名来源 | 自建**浏览器化签名服务**下发 `X-s`/`X-t`/`X-S-Common` | 进程内本地 XYW 算法（`signer-local.js`） |
| `x-s-common` | 由签名服务给出（含当前环境指纹） | **硬编码模板**（webBuild 等固定值） |
| `a1` | 接受签名服务下发的**刷新值**并回填 cookie | 只用账号里原值 |
| 签名输入 | 路径 + `encodeURIComponent(body)` | 路径（A/B 过绝对 URL，两者都 406） |
| `Authorization` | 空串 | `AT <access-token-creator…>` |

**可落地路径（若要打通 API 轨，代价与风险并存）**：① 复刻其浏览器内求签形态——用隐藏页在 `creator.xiaohongshu.com` 真实上下文里取 `x-s-common`/`a1` 再签名（本仓 `signer-assembly` 已有 browser 形态，XHS 当前被降级成 localAlgorithm，可切回）；② 让账号具备主站会话（`web_session`）后再试（但签名环境不匹配仍可能 406）。两者都属于**对平台风控的对抗**，与「小红书避开真实发布」的取向相悖；本仓**保持 RPA draftOnly 轨**（已真机验证只存草稿、无发布点击），API 轨仅作诊断通道。

**与仓内既有裁决的一致性（重要）**：`openspec/specs/api-publish-xiaohongshu-chain/spec.md` 早在 2026-09-26 就定案——小红书 API 链「整体止步、不实现」，理由是「`x-s`/`x-t` 生成依赖外包签名服务（**运行时禁止远程求签通道**），页面内可抽取性未经 spike」；未来重启须以「完整链逐字切片取证 + 签名页抽取 spike + 拦截法比对」三前置为条件。本次逆向恰好**独立复现了这条裁决的技术依据**（参考产品正是靠外包签名服务下发 `X-S-Common` 与刷新 `a1`）。因此本 PR 把 `xiaohongshu` 保持在 RPA 轨、不路由 API 草稿链，是与该 spec 一致的选择；**既有偏离需如实登记**：`packages/api-publish-engine/src/publish/platforms/xiaohongshu-draft.js`（2026-10-07 的 `xhs-draft-publish` 落地）与该「不实现」裁决并存，本 PR 不删该文件（保留为诊断通道），但已确认它**不在任何路由上**。

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

## 13. 小红书「仅存平台草稿箱」（硬约束，2026-10-09 提出 / 2026-10-10 落点修正）

### 13.1 需求原文与判定

> 小红书要特殊对待，不要真实发布。因为小红书风控比较严格。只需要实现发布内容放在小红书平台的草稿箱里就好，之后可以通过我用小红书 APP 扫二维码再真实发布。

判定：小红书**任何形态都不得真实发布**。内容只写进**小红书创作者中心草稿箱**（服务端持久化），由用户在手机 App 内确认后自行发布。

### 13.2 约束落在哪一层（一次被自己推翻的设计）

**第一版设计（错误，已废弃）**：把 `ROUTE_TABLE.xiaohongshu` 从 `rpa_vm` 改成新增的 `xhs_draft` 轨（只调 API + `draft=true`），理由是「RPA 轨会点发布按钮」。

**真机实测推翻了这条前提**：

1. **RPA 轨的小红书图文本来就是 draftOnly**（2026-09-29 落地，2026-10-07 修过假成功）：`_publish_xiaohongshu` 对图文强制 `draftOnly: true`，`_publish_generic` 在该分支下只填内容并等平台自动存草稿、**绝不点发布按钮**；且已有字段级 fail-closed（内容没写进去 ⇒ 拒绝报成功）。所以「RPA = 会真实发布」对图文并不成立。
2. **API 草稿轨在本机账号上不可用**：`xiaohongshu:probe-draft-chain` 实跑结果——
   - `creator.xiaohongshu.com/web_api/sns/v2/note` → **404**（该端点不在 creator 域）；
   - `edith.xiaohongshu.com/web_api/sns/v2/note` → **406**，响应体 `{code:-1}`；
   - 链路前两步（GET permit → PUT ros-upload）**均已通过**（它们不参与签名），只有需要 `x-s` 签名的 note 步失败；
   - 该账号只有创作者域会话（`customer-sso-sid` / `galaxy_creator_session_id` / `access-token-creator.xiaohongshu.com`），**没有主站 `web_session`**。

**结论（当前落点）**：`xiaohongshu` 保持 `mode: 'rpa_vm'`，硬约束在 **RPA 轨内部**落地：

| 形态 | 行为 | 说明 |
|------|------|------|
| 图文（`!article.video_path`） | `draftOnly: true` → 只填内容 + 等平台自动存草稿 | 既有实现；内容未写入时 fail-closed 拒绝报成功（`PUBLISH_DRAFT_CONTENT_NOT_FILLED`） |
| 视频（`article.video_path`） | **fail-closed 拒绝执行**（`XHS_VIDEO_DRAFT_UNSUPPORTED`） | 2026-10-10 新增：视频轨此前仍走「点发布」链路，与「不得真实发布」直接冲突。拒绝而非静默降级——静默改成草稿会把「其实没发出去」伪装成成功 |

### 13.3 关键代码位置

| 位置 | 作用 |
|------|------|
| `apps/desktop/electron/services/rpa-view-platforms.js` `_publish_xiaohongshu` | 图文强制 `draftOnly: true` + 切图文 tab；**视频 fail-closed** |
| 同文件 `_publish_generic` 的 `draftOnly` 分支 | 填内容 → 判定「内容真的写进去了吗」→ 等落库信号（`/编辑于\s*\S{1,12}|已保存|保存成功|自动保存/`，不接受孤立的「草稿」二字）→ 返回 `{success:true, draft:true}` |
| `apps/desktop/electron/bootstrap/phase4-events.js` | 结果为草稿语义（`draft === true`）时**不建审核回查**、不登记为可回采作品（草稿在平台内容列表里查不到，建回查只会得到恒定的「查无此作品」） |
| `apps/desktop/electron/ipc-handlers/xiaohongshu-draft-probe.js` | 调试通道 `xiaohongshu:probe-draft-chain`：主进程内实跑 API 草稿链，回传失败端点/HTTP 状态/平台业务码（用于判断端点是否变更） |
| `packages/api-publish-engine/src/publish/platforms/xiaohongshu-draft.js` | API 草稿链实现（当前**未路由**；保留为诊断与后续接入基础）。支持 `noteOrigin` 做端点 A/B |

### 13.4 数据校验（fail-closed）

| 校验项 | 规则 | 失败表现 |
|--------|------|---------|
| 标题/正文/视频 | 三者皆空 ⇒ 直接失败 | 「小红书发布至少需要标题、正文或视频」 |
| 视频形态 | 一律拒绝 | `XHS_VIDEO_DRAFT_UNSUPPORTED` + 明示「仅允许保存到平台草稿箱」 |
| 标题写入 | 文章带了标题 ⇒ 必须写入成功 | `PUBLISH_DRAFT_CONTENT_NOT_FILLED`（不报成功） |
| 正文写入 | 文章带了正文 ⇒ 必须写入成功 | 同上 |
| 标签写入 | 增强项：失败只 warn，不阻断 | 日志 warn，仍可成功 |
| 草稿落库信号 | 必须出现带时间量词的保存信号 | 未出现 ⇒ 失败（不接受侧边栏常驻「草稿箱」文案） |
| API 草稿轨（未路由） | 缺 Cookie / `a1` / Authorization / 图片 / 标题、业务码非 0、无草稿标识 | 一律抛错，绝不静默回退到真实发布 |

### 13.5 流程

```
发布任务（platform=xiaohongshu） → ROUTE_TABLE.xiaohongshu.mode = rpa_vm
 → RpaVmPublisher（复用登录态分区，不开新登录流程）
 → _publish_xiaohongshu(win, article)
     ├─ article.video_path 存在 → 直接返回 fail-closed（XHS_VIDEO_DRAFT_UNSUPPORTED），不导航、不点任何按钮
     └─ 图文 → 打开 publish/publish → 切「上传图文」tab → 上传图片
              → 填标题/正文/标签（字段级回执 fillReport）
              → 内容未写入 ⇒ 立即失败；已写入 ⇒ 等平台自动草稿落库
              → 返回 { success:true, draft:true }
 → task:success（result.draft=true）→ 历史记 success；**不建审核回查**、不登记可回采作品
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

（视频被拒时的文案由主进程返回，直接进发布失败原因：`小红书仅允许保存到平台草稿箱（用户硬约束：不得真实发布）；视频草稿链尚未实现，已拒绝真实发布。请改用图文，或在手机 App 内手动发布视频。`）

### 13.8 验收标准

| 编号 | 验收项 | 判定 |
|------|--------|------|
| XHS-1 | `ROUTE_TABLE.xiaohongshu.mode === 'rpa_vm'`（不在路由层搞特殊轨） | smoke 测试 |
| XHS-2 | 图文形态：交给 generic 的 config **必带** `draftOnly: true`（且 `preFill=switchImageTab`） | 单测（摘掉 draftOnly 即红） |
| XHS-3 | 视频形态：fail-closed，`_publish_generic` **一次都不被调用**（不存在点发布的路径） | 单测 |
| XHS-4 | 草稿结果（`draft === true`）不建审核回查、不登记可回采作品 | 单测（phase4-events） |
| XHS-5 | 内容未写入页面时拒绝报成功（`PUBLISH_DRAFT_CONTENT_NOT_FILLED`） | 单测（既有 7 例） |
| XHS-6 | 真机：图文内容出现在小红书创作者中心草稿箱，且平台侧**未公开发布** | E2E（见执行记录；历史成功例：`【验证稿·可直接删除】DOM轨草稿箱活体验收 …` 小红书 成功 2026-10-08/09） |

### 13.9 遗留与风险（不假装已闭合）

1. **API 草稿轨被 406 挡住，且仓内 spec 已裁决不实现**：链路已实现且 permit/upload 通，note 步需要主站会话（`web_session`）与匹配的签名环境。`openspec/specs/api-publish-xiaohongshu-chain/spec.md`（2026-09-26 定案）明确：小红书 API 链整体止步、运行时**禁止远程求签通道**，重启须以「全链逐字切片 + 签名页抽取 spike + 拦截法比对」为前置。本次逆向独立复现了该裁决的技术依据（参考产品靠外包签名服务下发 `X-S-Common` 与刷新 `a1`）。因此**不路由该轨**，避免引入「新失败面」；链与探针保留为诊断通道。
2. **视频草稿未实现**：小红书视频任务现在会明确失败（fail-closed），这是「不得真实发布」的必然代价。若需要视频草稿，属新功能立项（视频草稿链 + 落库判据 + 真机验收）。
3. **RPA 轨选择器随平台改版失效**：2026-10-07 曾实测标题/正文选择器全部失配（现已被 fail-closed 拦住，不再假成功）。**草稿能否落库依赖小红书创作者页当前 DOM**，改版后需重新校准选择器；判据宁可失败也不假成功。
4. **草稿 ID 不等于公开作品 ID**：草稿无公开锚点，历史与 tracked_content 不把它当作品（见 13.5）。
