# PROJECT-003 Multi-Publish — 自动化模块 + 统一内容类别 PRD

> **立项日期**：2026-10-03
> **当前版本**：v1.0.0
> **交付分支**：`automation-content-category`
> **Worktree**：`D:\Data\projects\mp-worktrees\mp-automation-content-category`

---

## 一、需求概述

### 1.1 背景

本仓已有多处「分类」概念各自独立演进，彼此不通：

| 位置 | 现状 | 问题 |
|------|------|------|
| 热门选题 | `electron/services/hot-topics/classifier.js` 硬编码 10 类 `CATEGORY_KEYS`；`HotTopics.vue:328` 再抄一份 | 运营改不了，加一类要改代码 |
| 采集库 | `Collection.vue` 收集条目**没有**类别字段（仅有从上游透传、从未渲染的 `tags`） | 采集内容无法归类检索 |
| 账号分组 | P2-8a 已落地自定义分组（`features/accounts/account-groups-store.js`，PR #2756 已合并） | 只有平台筛选，缺「内容类别」维度 |
| 自动化 | `full-auto-pipeline.js` + `AutoPipelineView.vue` 是**暗路由** `/auto-pipeline`；`scheduler.js` 只支持一次性定时发布 | 无定时、无启动触发、无独立入口 |

三处分类各自一套 ⇒ 同一个「科技」在三个界面可能叫三个名字、数量不一致。

### 1.2 目标

1. **统一内容类别真源**：运营中心新增「内容类别管理」，可增 / 改名 / 删 / 排序；真源下发给桌面端。
2. **三处消费同一真源**：热门选题分类、采集库类别标签、账号预设标签。
3. **自动化模块**：左侧菜单新增「自动化」入口；支持自定义**定时任务**与**应用启动触发**（可多任务同时生效）；后台运行、失败可配策略（跳过继续 / 中断）。

### 1.3 不做清单（明确边界）

- 不做类别的**多级树**（一期只做单层扁平列表）。
- 不做自动化任务的**云端下发**（一期全部本地持久化，按登录用户隔离）。
- 不引入 cron 第三方库（自实现轻量周期调度器，避免新增依赖与打包体积）。
- 不做账号分组的团队共享（`group.shared` 字段已在读取侧防御性引用，但本期不写入）。

---

## 二、统一内容类别（Content Category）

### 2.1 数据模型

运营中心新建表 `content_categories`（`ops-center/backend/models.py` 追加 `ContentCategory(Base)`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `category_key` | TEXT PK | 稳定标识，一旦发布**不得改名**（改名 = 旧配置失效）。规则 `^[a-z][a-z0-9_]{1,31}$` |
| `name` | TEXT NOT NULL | 显示名，1–20 字符，同层不得重复 |
| `sort_order` | INTEGER | 排序，非负整数，全列表归一化 `0..n-1` |
| `enabled` | INTEGER | 1=启用（默认），0=禁用。禁用后桌面端不再作为可选项 |
| `is_preset` | INTEGER | 1=内置预设类（不可删除），0=自定义类（可删） |
| `description` | TEXT | 运营备注，≤200 字符，界面仅 tooltip 展示 |
| `updated_at` / `updated_by` | TEXT | 留痕（与 app_menu / content_templates 同口径，**不新造审计表**） |

### 2.2 内置目录 CATALOG（与桌面端 classifier.js 严格对齐）

```
general(综合) society(社会) finance(财经) tech(科技) entertainment(娱乐)
sports(体育) emotion(情感) education(教育) health(健康) international(国际)
```

- 与 `apps/desktop/electron/services/hot-topics/classifier.js:23` 的 `CATEGORY_KEYS` **顺序与键名必须完全一致**。
- 内置类**可改名、可禁用、可排序，不可删除**；删除按钮灰显 + tooltip「内置类别不可删除，可改为禁用」。
- 目录供给采用 `_provision_from_catalog` 模式（抄 `app_menu_service.py:104-143`）：每次读 / 写 / 下发前按 CATALOG 补齐缺失行，`ON CONFLICT DO NOTHING` 防并发双插，只补欠账不覆盖运营已改字段。**不用「表空才播种」**（`feature_flag_service.py:26-28` 已记录该陷阱：存量部署永远不触发）。

### 2.3 数据校验规则

| 场景 | 校验 | 失败提示 |
|------|------|----------|
| 新增 key | 必填；`^[a-z][a-z0-9_]{1,31}$`;不得与现有 key 重复（含已禁用） | 「类别标识只能由小写字母、数字、下划线组成，且以字母开头，长度 2-32」/「类别标识已存在」 |
| 新增 name | 必填；trim 后 1–20 字符；不得与现有 name 重复 | 「名称不能为空」/「名称不能超过 20 个字符」/「名称已存在」 |
| 改名 | 同上（排除自身） | 同上 |
| 排序 | `sort_order` 必须非负整数；拒绝 bool | 「排序值必须是非负整数」 |
| 删除 | `is_preset=1` → 拒绝 | 「内置类别不可删除，可改为禁用」 |
| 删除自定义类 | 允许；采用**软删引用保护**：若该类被采集条目 / 账号分组引用，删除时保留引用但该类不再出现在可选列表（不级联清数据） | 确认弹窗提示「有 N 处内容正在使用该类别，删除后这些内容的该标签将不再显示，但内容本身不会被删除」 |
| 上限 | 类别总数 ≤ 50（防超大 payload） | 「类别数量已达上限 50」 |

### 2.4 API

`ops-center/backend/routers/content_categories.py`，prefix `/api/v1/content-categories`：

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `` | `get_current_user` | 列出全部（含禁用）。返回 `{ items, count, max_items }` |
| POST | `` | `require_admin` | 新建 |
| PUT | `/{key}` | `require_admin` | 改名 / 改备注 / 改启用 |
| DELETE | `/{key}` | `require_admin` | 删除（内置类 400） |
| POST | `/{key}/reorder` | `require_admin` | `action ∈ top/up/down/bottom`，全列表归一化 0..n-1，边界幂等返回 `noop` 不写库 |
| POST | `/reset` | `require_admin` | 恢复目录默认（只恢复内置 10 类的名称 / 排序 / 启用，自定义类保留） |

错误口径沿用仓内惯例：`except ValueError → HTTPException(400)`；未找到 → 404；非 admin → 403。

### 2.5 下发到桌面端

`runtime_service.py::get_runtime_bootstrap` 增加字段：

```python
"contentCategories": await _get_content_categories(db),   # 只下发 enabled=1
```

返回 `{ items: [{ category_key, name, sort_order }], synced_at }`。

- 该 payload 整体经 Ed25519 签名（`canonical_json` / `sign_runtime_payload`），新增字段自动进入签名覆盖范围，**不得绕过签名步骤**。
- 桌面端 `ops-center-sync.js::applyRuntime` 增加 `contentCategories: normalizeContentCategories(payload.contentCategories)`（**必须**在验签之后，与 `appMenu` 同点位）。
- 桌面端读不到 / 下发为空 → **回退内置 10 类**（fail-open，保证离线可用），不得让界面变成空分类。

### 2.6 运营中心页面「内容类别管理」

- 路由 `/content-categories`，`meta: { requiresAuth: true, adminOnly: true }`
- 菜单 `config/menuItems.js`：`{ path: '/content-categories', label: '内容类别管理', icon: Collection, adminOnly: true }`
- 页面参考 `ContentTemplates.vue`（表格+弹窗）+ `ModelPresets.vue`（⤒↑↓⤓ 排序列）

**显示项**：排序手柄 / 序号 / 类别标识(key) / 名称 / 状态标签（启用|禁用|内置）/ 备注 / 操作列（编辑、禁用/启用、删除）

**交互与提示文字**：

| 操作 | 交互 | 提示 |
|------|------|------|
| 新建 | 弹窗：标识 + 名称 + 备注 | 成功「类别已创建」；失败按 2.3 逐条 |
| 改名 | 弹窗复用，标识只读 | 「名称已更新」 |
| 禁用 | 开关即时生效 | 「已禁用该类别，桌面端将不再显示」 |
| 删除 | `ElMessageBox.confirm` 二次确认（含引用数提示） | 「类别已删除」 |
| 排序 | ⤒↑↓⤓ 即时持久化（与 ModelPresets 同口径） | 「排序已更新」 |
| 恢复默认 | 二次确认 | 「已恢复默认类别」 |
| 空态 | — | 「暂无自定义类别，内置类别已自动就绪」 |

页面顶部说明文案（与 AppMenu.vue 同风格）：说明该列表是热门选题 / 采集库 / 账号标签的**统一真源**，改名会影响三处显示；生效时机为桌面端下次启动同步。

---

## 三、热门选题分类的相应调整

现状：`HotTopics.vue:328` 硬编码 `CATEGORY_KEYS`，`zh.js:3410` 硬编码中文名。

改造：

1. 新增 `apps/desktop/src/features/content/content-categories.js`（渲染层单一实现）：
   - `DEFAULT_CONTENT_CATEGORIES`（内置 10 类，key + 默认中文名，作为下发缺失时的回退）
   - `normalizeContentCategories(raw)` → `{ items, dropped, invalidShape }`，校验 key 正则、name 长度、去重、总数上限 50
   - `resolveCategoryLabel(key, items)` → 用于渲染（找不到回退内置名，再回退 key 本身）
2. `HotTopics.vue` 的 `CATEGORY_KEYS` 改为 computed：来自运营下发（经 store），读不到回退内置。
3. 分类 chip 的 label 改为 `resolveCategoryLabel`，不再写死 `t('hotTopics.categories.' + k)`。
4. 主进程 `classifier.js` 的 `CATEGORY_KEYS` **保持不变**（抓取侧分类仍以内置 10 类为基准，避免运营自定义类没有关键词规则导致分类退化）；但**过滤与展示**以运营下发为准 —— 即：运营新增的类只会作为「可打标签」出现，不会自动出现在抓取分类结果里；运营**禁用**内置类时，该类条目在 UI 上不再作为筛选项（保留条目本身）。
5. 抓取侧补一条：运营新增类别若需要在抓取中生效，需同时配置关键词；一期不提供（记入后续）。

> 关键取舍写进 PRD：**分类抓取能力不随运营配置动态扩展**，只有「展示名 / 排序 / 启停」动态化。原因：关键词规则是代码内资产，动态化等于允许运营构造出无命中规则的分类，反而制造空分类。

---

## 四、账号分组 + 预设类别标签

### 4.1 现状

P2-8a（PR #2756 已合并）已落地：

- 真源 `settings` key `account_groups`（owner 命名空间隔离）
- 分组形状 `{ id, name, platformFilter, accountIds }`（`account-groups-store.js:113`）
- 归一化 `normalizeAccountGroups` 带 `dropped`/`unresolved`/`healed` 逐条出声

### 4.2 本期扩展

分组形状增加 `categoryTags: string[]`（内容类别 key 数组）：

- 与 `account-groups-store.js:113` **和** `stores/accounts.js` 的 `createGroup()` 必须同时改，否则两条归一路径漂移（该文件头注释 9-11 行已警告过此失败模式）。
- `normalizeAccountGroups` 增加校验：
  - 非数组 → 视为 `[]`（heal）
  - 元素非字符串 / 不匹配 key 正则 → 丢弃并记 `dropped[reason='categoryTag']`
  - 去重、上限 `MAX_GROUP_CATEGORY_TAGS = 10`
  - **未知类别 key 保留**（与成员 id 同策略：用户后续新增该类别后引用自动恢复），但记入 `unresolvedCategoryTags`
- 语义：`platformFilter` 是**硬筛选**（非该平台的账号不在组内），`categoryTags` 是**软标签**（不影响成员资格，只作为该组的内容定位标记，供自动化任务挑选目标分组）。

### 4.3 交互

`AccountGroupsPanel.vue`：

- 分组行新增「类别标签」区域，渲染已选标签 chips；点击「编辑标签」打开多选弹窗（选项来自统一内容类别真源，禁用项不显示）
- 新建分组表单增加同一多选控件
- 左侧筛选栏（`Accounts.vue:186-220`）新增「按类别筛选分组」（与现有名称搜索并列）

**提示文字**：

| 场景 | 文案 |
|------|------|
| 创建分组成功 | 「分组已创建」 |
| 标签保存成功 | 「分组类别已更新」 |
| 标签保存失败 | 「分组类别保存失败，请重试」 |
| 真源不可读 | 复用既有 `groupsUnreadable` |
| 无可选类别 | 「暂无可选类别，请先在运营中心配置内容类别」 |

---

## 五、采集库类别标签

### 5.1 现状与风险

`Collection.vue` 有 **9 处**独立 `collectedItems.value.unshift(...)` 构造条目（`:737, :1249, :1277, :1311, :1332, :1416, :1461, :1527, :1949`），外加 `stealthResultToItem()`（`:1165`）。没有统一归一化函数 ⇒ 加字段最容易漏。

### 5.2 改造

1. 新增 `apps/desktop/src/features/collection/collected-item.js`：`normalizeCollectedItem(raw)` 单一实现，**9 处 unshift 全部改走它**，字段缺失统一补 `[]`。
2. 复用现有 `tags` 字段作为类别标签的**唯一存储字段**（不新增 `category`，否则 `:1671` 的爆款库导出会与新字段漂移）。
3. `LIBRARY_FILTERS`（`:1798-1803`）扩展：在来源筛选之外新增**类别筛选**（选项来自统一真源；「未分类」为内置筛选项）。
4. 卡片渲染：条目卡片显示类别 chips + 「编辑标签」入口（多选弹窗，同账号分组口径）。
5. `useCopyLibrarySources.js:62-74` 的 UNIFIED_ITEM 映射补 `metadata.tags`，使 `/copy-library` 也能看到标签（当前是 `metadata: {}`，会丢）。
6. 批量采集轮询 `:1949` 那条最不完整的构造同样改走归一化。

### 5.3 校验

- `tags` 非数组 → `[]`
- 元素非字符串 → 丢弃
- 不匹配类别 key 正则 → 丢弃
- 去重，上限 `MAX_ITEM_CATEGORY_TAGS = 5`
- 未知类别 key **保留**（同账号分组策略），渲染时若类别已删除则显示为灰色「已删除类别」chip 且不参与筛选

---

## 六、自动化模块

### 6.1 左侧菜单入口

新增一级导航「自动化」，`key: 'automation'`，路由 `/automation`，`labelI18nKey: 'sidebar.nav.automation'`，图标 `SetUp`。

需同步改 **6 处**（`MpSidebar.vue` 无需改，它是数据驱动的）：

1. `apps/desktop/src/router/index.js` — 单行追加路由（**必须单行**，`.github/scripts/check-route-registry.js:169-195` 的解析器要求）
2. `apps/desktop/src/config/route-registry.js` — `ROUTE_REGISTRY` 追加 entry（`navEntry` + `internal:false` + `entryFrom:null`）
3. 同文件 `SIDEBAR_MENU_KEY_ORDER` — 追加 `'automation'`
4. `apps/desktop/src/config/sidebar-menu.test.js` — `EXPECTED_DERIVED_MENU` 冻结基线追加（含 group/labelI18nKey/to）
5. `apps/desktop/src/locales/zh.js` + `en.js` — `sidebar.nav.automation` 成对
6. `ops-center/backend/services/app_menu_service.py` — `CATALOG` 追加 `("automation", "自动化", MENU_GROUP_PRIMARY, ...)`；**同时 `ops-center/backend/tests/test_app_menu_api.py:30` 的 `CATALOG_SIZE` 20 → 21**

> 注意：不把 `automation` 加进 `FORCED_VISIBLE_KEYS`（不强制显示，运营可关）。

### 6.2 视图策略

**复用现有 `AutoPipelineView.vue` 作为自动化任务的执行内核**，新建 `AutomationView.vue` 作为模块主页：

- 顶部：任务列表（表格）
- 中部：新建 / 编辑任务抽屉
- 底部：运行记录（最近 N 次）

`/auto-pipeline` 暗路由保留（`internal: true`），作为自动化任务的执行目标页。

### 6.3 任务数据模型

持久化：settings key `automation_tasks`（与账号分组同机制，owner 命名空间隔离，无需新增 IPC）。

```js
{
  id,                    // 稳定 id
  name,                  // 1-40 字符，必填，不得重复
  enabled: true,         // 停用后不再触发
  triggers: [            // 多个同时有效（数组，去重，上限 5）
    { type: 'onAppStart' },                                  // 应用启动触发
    { type: 'daily', time: 'HH:mm' },                        // 每天
    { type: 'weekly', weekdays: [1..7], time: 'HH:mm' },     // 每周
    { type: 'interval', minutes: 30 }                        // 间隔
  ],
  action: {
    type: 'fullAutoPipeline',   // 一期唯一：全自动流水线
    config: { ... }             // 透传给 full-auto-pipeline
  },
  failurePolicy: 'skip' | 'abort',   // 失败后跳过继续 / 中断
  maxRetries: 0..3,                  // 单步重试次数
  concurrency: 'background',         // 一期固定后台运行
  lastRunAt, lastStatus, lastError
}
```

**校验规则**：

| 字段 | 规则 | 提示 |
|------|------|------|
| name | trim 后 1–40，不重复 | 「任务名称不能为空」/「不能超过 40 个字符」/「任务名称已存在」 |
| triggers | 非空，≤5，类型去重（同类型只保留一个） | 「请至少选择一种触发方式」/「同一触发方式只能配置一次」 |
| daily/weekly time | `^([01]\d|2[0-3]):[0-5]\d$` | 「时间格式应为 HH:mm」 |
| weekly weekdays | 1–7 整数，去重，非空 | 「请至少选择一个星期」 |
| interval minutes | 5–1440 整数 | 「间隔需在 5 到 1440 分钟之间」 |
| 任务总数 | ≤ 20 | 「自动化任务数量已达上限 20」 |

### 6.4 触发器与后台运行

- 新增 `apps/desktop/electron/services/automation-scheduler.js`：
  - **不引入 cron 依赖**，用 `setTimeout` 自校正下一次触发（算「距下一次触发点的毫秒数」），`.unref()` 避免阻塞退出
  - `onAppStart` 触发在 `phase3-services.js` 与 `scheduler.restore` 同点位注册（**必须**在 `batchManager.restoreScheduledBatches` 之后，遵守 `phase3-services.test.js:182-189` 的顺序契约）
  - 多任务独立定时器，互不影响；单个任务触发失败不影响其他任务定时器
- **后台运行**：任务在主进程执行，**不占用渲染进程、不弹模态框、不阻塞当前页面**。界面只通过 toast + 任务列表状态更新反映。
- **对当前操作的影响**：明确写进界面 —— 自动化任务会占用模型调用额度与浏览器资源，若用户正在手动发布，可能触发平台限流；任务列表顶部给出提示「自动化任务在后台执行，可能与手动操作竞争平台资源」。

### 6.5 失败处理（用户明确要求回答的两个问题）

**① 通知形式与内容**

- 单步失败：主进程 `logger.warn` + 渲染层 `ElMessage.warning` toast（非模态，3s）
  - 文案：`任务「{name}」第 {i}/{n} 步「{stepLabel}」失败：{error}`
- 任务终态失败：`ElNotification` 通知（停留 6s，可点击跳转任务详情）
  - 标题：`自动化任务失败：{name}`
  - 内容：`{成功步数}/{总步数} 步完成。首个失败：{stepLabel} — {error}`
- 任务成功：仅在「上次失败、本次成功」时通知（避免噪音），文案：`任务「{name}」已恢复正常`
- 全部失败原因汇总进任务详情的「最近错误」字段，界面可见

**② 跳过继续 vs 中断**

- 每任务可配 `failurePolicy`：
  - `skip`（**默认**）：记录失败步，继续下一步；终态 `completed_with_errors`
  - `abort`：立即停止后续步骤；终态 `failed`
- 另设 `maxRetries`（默认 0）：单步失败先重试 N 次，**重试耗尽后才按 failurePolicy 处理**
- 界面在任务编辑里明确两种策略的含义：
  - 跳过继续：「适合批量采集发布，个别失败不影响整体产出」
  - 中断：「适合有强依赖的流水线，失败后继续可能产生半成品」

### 6.6 显示项（任务列表表格）

| 列 | 内容 |
|----|------|
| 名称 | 任务名 + 启用开关 |
| 触发方式 | chips：`启动触发` / `每天 09:00` / `每周一,三 09:00` / `每 30 分钟` |
| 动作 | 「全自动流水线」 |
| 失败策略 | 「跳过继续」/「中断」 |
| 上次运行 | 时间 + 状态标签（成功/部分失败/失败/进行中） |
| 操作 | 编辑 / 立即运行 / 停用 / 删除 |

**空态**：「还没有自动化任务。点击「新建任务」，让采集到发布自动跑起来。」

---

## 七、测试计划

| 层 | 文件 | 覆盖 |
|----|------|------|
| 后端单测 | `ops-center/backend/tests/test_content_categories_api.py` | 目录供给 / 增删改 / 内置不可删 / 排序幂等 / 权限 403 / 下发只含启用项 |
| 前端单测 | `ops-center/frontend/tests/content-categories.test.js`（如已有 vitest 约定则遵循） | 页面渲染 / 错误提示 |
| 桌面单测 | `apps/desktop/src/features/content/content-categories.test.js` | normalize / 回退 / 上限 / 去重 |
| 桌面单测 | `apps/desktop/src/features/accounts/account-groups-store.test.js`（扩展） | categoryTags 归一 / 丢弃 / 上限 / 未知保留 |
| 桌面单测 | `apps/desktop/src/features/collection/collected-item.test.js` | 归一化 / tags 校验 |
| 桌面单测 | `apps/desktop/electron/services/automation-scheduler.test.js` | 触发点计算 / 多任务并发 / 失败策略 / 重试 / 单任务异常不影响其他 |
| 回归 | `sidebar-menu.test.js`、`test_app_menu_api.py`、`phase3-services.test.js` | 菜单基线 21 项 / 启动顺序契约 |

门禁：`apps/desktop` vitest；`ops-center/backend` `pytest -v`；`ops-center/frontend` `npm test` + `npm run build`。

---

## 八、分期落地

| 期 | 内容 |
|----|------|
| P1 | 运营中心「内容类别管理」后端 + 前端 + 下发 |
| P2 | 桌面端统一类别 store + 热门选题动态分类 |
| P3 | 账号分组类别标签 |
| P4 | 采集库类别标签 |
| P5 | 自动化模块（入口 + 调度器 + 失败策略 + 通知） |
| P6 | 全量测试、质量节拍、PR |

---

## 九、风险与回滚

| 风险 | 缓解 |
|------|------|
| 运营下发类别为空导致桌面端分类全空 | 桌面端 fail-open 回退内置 10 类 |
| 采集条目 9 处构造点漏改 | 强制走 `normalizeCollectedItem()`；补「字段完整性」单测 |
| 自动化任务与手动操作竞争资源 | 界面明示；一期任务串行执行（同任务不并发） |
| 菜单基线测试红 | 6 处同步改，先跑 `sidebar-menu.test.js` + `test_app_menu_api.py` |
| 类别 key 改名导致历史引用失效 | key 一旦发布不得改名（UI 置灰 + 说明）；只允许改 name |
