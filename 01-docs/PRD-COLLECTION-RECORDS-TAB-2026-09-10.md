# PRD — 采集页「采集记录」标签页

- 文档编号：PRD-COLLECTION-RECORDS-TAB-2026-09-10
- 状态：已实现（待合并）
- 关联分支：`codex/collection-records-tab`
- 关联模块：`apps/desktop/src/views/Collection.vue`
- 创建日期：2026-09-10

## 1. 背景与目标

当前采集页（`/collection`）的采集结果只存在于内存数组 `collectedItems` 中：页面刷新或退出后即丢失，且采集结果与「草稿箱」混排在同一页面，用户无法聚焦查看「我采集过哪些内容」。

本需求在采集页顶部新增「采集记录」标签页（位于「内容采集」右侧），用于：

1. 以列表形式展示所有历史采集结果；
2. 采集结果持久化保存（应用重启后仍可查看）；
3. 每条采集记录可点击，点击后跳转到内容编辑页（`/publish?draft=xxx`）继续编辑；
4. 通过顶部标签在「内容采集」与「采集记录」之间切换。

## 2. 术语定义

| 术语 | 含义 |
|------|------|
| 内容采集 | 从 URL / RSS / Sitemap / 自定义 API / 批量等来源采集正文内容 |
| 采集记录 | 单次采集成功后持久化保存的一条内容条目 |
| 内容编辑页 | `/publish?draft=xxx` 草稿编辑页面（Publish.vue） |
| 草稿箱 | 以 `drafts` 为键存储的用户草稿列表（与采集记录相互独立） |

## 3. 功能范围

### 3.1 标签切换（P0）

- 顶部标题位置改为「标签组」，含两个标签：**内容采集**、**采集记录**。
- 默认选中「内容采集」标签。
- 点击标签切换视图；非法 tab 值忽略（仅 `collect` / `records` 合法）。
- 标签组具备 `role="tablist"` / `role="tab"` / `aria-selected` 无障碍语义。

### 3.2 采集记录列表（P0）

- 列表项展示字段：标题、来源（source）、字数（wordCount）、采集时间（createdAt/collectedAt/created_at）。
- 无记录时展示空状态：标题「暂无采集记录」+ 描述提示。
- 列表标题显示记录总数（如「采集记录（3 篇）」）。
- 每条记录卡片可点击（整卡可点 + 键盘 Enter 可触发），点击后进入内容编辑页。

### 3.3 记录操作（P0/P1）

| 操作 | 触发 | 行为 |
|------|------|------|
| 编辑 | 点击卡片 / 「编辑」按钮 | 基于记录生成草稿 → 跳转 `/publish?draft=<id>` |
| 创建草稿 | 「创建草稿」按钮 | 生成草稿并跳转发布页 |
| 视频创作 | 「视频创作」按钮 | 生成草稿并跳转 `/create?draft=<id>` |
| 发布 | 「发布」按钮 | 生成草稿并跳转 `/publish?draft=<id>` |
| 删除 | 「删除」按钮 | 确认后删除单条记录并持久化 |
| 清空 | 「清空」按钮 | 确认后清空全部记录并持久化 |

### 3.4 持久化（P0）

- 采集记录以 `collected_items` 为键存储于 electron-store（经 `storeSetSetting` / `storeGetSetting`）。
- 在以下采集成功路径均调用 `saveCollectedItems()` 持久化：
  1. 单 URL 采集（`collectUrl` 的 aggregationCollect 分支）；
  2. 单 URL 采集（`collectUrl` 的 urlCollectFetch 回退分支）；
  3. 一键采集+改写（`collectAndRewrite`）；
  4. 批量采集完成（`startBatchPolling` 的 completed 分支）。
- 页面挂载时 `loadCollectedItems()` 读取持久化数据。

## 4. 数据校验

| 字段 | 类型 | 校验规则 |
|------|------|---------|
| `id` | string | 必填；`Date.now().toString(36)` + 随机后缀；列表 key 与操作定位依据 |
| `title` | string | 可空；空值渲染为「无标题」占位 |
| `content` | string | 可空；用于生成草稿正文 |
| `description` | string | 可空；正文前 120 字符摘要 |
| `source` | string | `url` / `rss` / `sitemap` / `api` / `batch`；展示时映射为可读标签 |
| `sourceUrl` | string | 可空；原始采集链接 |
| `wordCount` | number | 可空；缺省回退 `content.length` |
| `createdAt` / `collectedAt` / `created_at` | string | 展示用时间，按此优先级取第一个非空 |

- 反序列化防御：`loadCollectedItems` 对 `JSON.parse` 失败或非数组结果 fail-closed 为 `[]`，不覆盖已加载列表为 `undefined`。
- 删除定位：按 `id` 精确过滤；若删除的正是当前选中结果（`collectedResult.id`），同步清空 `collectedResult` 与 `rewriteResult`。

## 5. 流程与功能逻辑

### 5.1 采集 → 记录持久化流程

```
用户输入 URL → collectUrl / collectAndRewrite / collectBatch
  → 采集成功返回 title/content
  → 构造 item（含 id/title/content/description/source/sourceUrl/wordCount）
  → collectedItems.value.unshift(item)   // 新记录置顶
  → saveCollectedItems()                  // 持久化到 electron-store
  → notifySuccess('collection.collectSuccess')
```

### 5.2 点击记录进入编辑页流程

```
openRecordForEdit(item)
  → 校验 item?.id 非空（否则静默 return）
  → getDraftFromItem(item) 生成草稿对象
  → drafts.value.unshift(draft) + saveDrafts()
  → notifySuccess('collection.recordsEditCreated')
  → router.push('/publish?draft=' + draft.id)
```

### 5.3 删除记录流程

```
deleteRecord(item)
  → notifyConfirm('collection.recordsDeleteConfirm')   // 取消则 return
  → collectedItems.value 按 id 过滤
  → 若与 collectedResult 同 id，清空 collectedResult / rewriteResult
  → saveCollectedItems()
  → notifySuccess('collection.recordsDeleted')
```

### 5.4 清空记录流程

```
clearAllRecords()
  → notifyConfirm('collection.recordsClearAllConfirm') // 取消则 return
  → collectedItems.value = []
  → collectedResult = null; rewriteResult = ''
  → saveCollectedItems()
  → notifySuccess('collection.recordsCleared')
```

## 6. 交互逻辑

- 标签按钮高亮态：当前 tab 使用 `.active` 样式（白底 + 主色文字 + 轻阴影）。
- 卡片 hover 有阴影反馈；`:focus-visible` 有主色 outline（键盘可达）。
- 卡片内按钮使用 `.stop` 修饰符，避免触发整卡点击冒泡。
- 删除按钮为危险样式（红色），hover 变浅红背景。

## 7. 显示项与提示文字（i18n）

新增 18 个 i18n key，`zh.js` / `en.js` 成对维护（CI Gate 7 已通过）：

| key | zh | en |
|-----|----|----|
| collection.tabCollect | 内容采集 | Collection |
| collection.tabRecords | 采集记录 | Collection Records |
| collection.recordsTitle | 采集记录 | Collection Records |
| collection.recordsEmptyTitle | 暂无采集记录 | No collection records yet |
| collection.recordsEmptyDesc | 在「内容采集」标签页采集内容后，会在这里生成记录列表 | Collected content will appear here after collecting from the Collection tab |
| collection.recordsUntitled | 无标题 | Untitled |
| collection.recordsEdit | 编辑 | Edit |
| collection.recordsCreateDraft | 创建草稿 | Create Draft |
| collection.recordsToVideo | 视频创作 | Video |
| collection.recordsPublish | 发布 | Publish |
| collection.recordsDelete | 删除 | Delete |
| collection.recordsWordCount | {count} 字 | {count} chars |
| collection.recordsDeleteConfirm | 确定删除这条采集记录吗？删除后无法恢复。 | Delete this collection record? This cannot be undone. |
| collection.recordsDeleted | 采集记录已删除 | Collection record deleted |
| collection.recordsClearAll | 清空 | Clear All |
| collection.recordsClearAllConfirm | 确定清空全部采集记录吗？清空后无法恢复。 | Clear all collection records? This cannot be undone. |
| collection.recordsCleared | 采集记录已清空 | Collection records cleared |
| collection.recordsEditCreated | 已进入内容编辑页 | Opened content editor |

## 8. 验收标准

- [x] 顶部出现「内容采集」「采集记录」两个标签，默认在「内容采集」。
- [x] 切换标签后视图正确切换，采集 tab 隐藏采集输入区，记录 tab 显示记录列表。
- [x] 采集成功后记录持久化，应用重启后仍能加载（`collected_items` 键）。
- [x] 点击记录卡片或「编辑」进入 `/publish?draft=<id>` 内容编辑页。
- [x] 单条删除 / 清空均有确认弹窗，取消不生效。
- [x] 空记录展示空状态。
- [x] 49 个单元测试通过，locale 三项检查（CJK / pair / keys）全绿。

## 9. 测试覆盖

`apps/desktop/src/views/Collection.test.js` 新增 11 个测试：

1. 渲染标签并切换到记录 tab；
2. `switchTab` 忽略非法值；
3. 挂载时读取持久化记录；
4. 持久化数据 JSON 解析失败回退空数组；
5. 点击记录创建草稿并跳转发布页；
6. 非法 item 不动作；
7. 删除记录（确认 + 移除）；
8. 删除记录取消不动作；
9. 清空记录（确认 + 清空 + 清空选中态）；
10. 采集成功后持久化 `collected_items`。

## 10. 非目标（Out of Scope）

- 不新增后端 IPC 通道（复用既有 `storeGetSetting` / `storeSetSetting`）。
- 不改变内容编辑页（Publish.vue）本身的编辑逻辑。
- 不迁移历史 `drafts` 数据到采集记录。
- 采集记录的搜索、筛选、排序、分页暂不在本需求范围。
