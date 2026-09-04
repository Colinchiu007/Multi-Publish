# PRD — 视频创作·历史记录：下载视频、排序与重复标题提示

- **状态**：开发完成（待 CI 合并）
- **分支**：`codex/video-history-download-sort-duplicate`
- **关联页面**：视频创作 → 历史记录（`CreateView.vue` history 视图 → `CreateViewHistory.vue`）
- **创建日期**：2026-09-04

---

## 1. 背景

视频创作的历史记录列表（`apps/desktop/src/views/CreateViewHistory.vue`）当前已有状态筛选、单条删除与批量删除能力。用户在实际使用中发现三类痛点：

1. **已完成成片只能预览/发布，无法直接从历史卡片下载到本地**。
2. **列表只有「更新时间倒序」一种隐式排序**，无法按更新时间正序、创建时间正序/倒序或视频时长正序/倒序查看任务。
3. **标题重复的任务无法直观识别**——批量创作时多条任务可能使用同一标题，用户难以区分对应关系。

本需求补齐这三项能力，不改动现有数据持久化结构。

## 2. 目标

- 在「已完成」状态任务卡片上增加【下载视频】按钮，点击后通过系统「另存为」对话框下载成片视频文件。
- 在历史记录工具栏增加排序方式下拉框，默认「更新时间倒序」，共 6 种排序方式。
- 在历史记录列表中对完全相同的标题进行检测，并在所有相关卡片的标题右侧显示「有重复标题」标签。

## 3. 用户需求

| 编号 | 需求 | 优先级 |
|------|------|--------|
| U1 | 已完成且存在 `videoPath` 的任务卡片显示【下载视频】按钮 | P0 |
| U2 | 点击【下载视频】打开系统另存为对话框；用户取消时不报错、不提示成功 | P0 |
| U3 | 排序下拉提供 6 种排序方式，默认「更新时间倒序」 | P0 |
| U4 | 排序切换后，列表顺序在状态筛选结果内即时重排 | P0 |
| U5 | 历史记录中标题完全一致的多条任务，相关卡片显示「有重复标题」标签 | P0 |
| U6 | 未显式命名（回退到原文案/流水线名）的任务不参与重名判断 | P0 |

## 4. 功能规格

### 4.1 下载视频

- **显示条件**：卡片状态为 `completed` 且 `item.videoPath` 为 `string` 且 trim 后非空。
- **按钮位置**：卡片 footer 操作区，在【发布】按钮之后、【删除】按钮之前。
- **交互流程**：
  1. 点击【下载视频】 → 组件 `$emit('download-history', item)`。
  2. 父组件 `CreateView.downloadHistoryVideo(item)` 校验 `videoPath` 非空。
  3. 调用既有 IPC `story2videoSaveAs(filePath, suggestedName)`（通道 `story2video:save-as`，与结果页【下载视频】完全一致）。
  4. `result.code !== 0` → 抛出错误 → `showStory2VideoOperationFailure()`。
  5. `result.data.cancelled === true` → 用户取消另存为对话框，静默返回，不提示成功。
  6. 成功 → 展示既有 Toast `story2video.save_completed`。
- **建议文件名**：取 `videoPath` 路径最后一段作为建议名（`split(/[\\/]/).pop()`）；无法提取时回退 `video_${Date.now()}.mp4`。
- **数据校验**：
  - 仅在组件层 `downloadable(item)` 与父层 `downloadHistoryVideo(item)` 双重校验。
  - 不校验文件是否存在（IPC 层已有失败反馈）；不修改 `videoPath` 持久化数据。

### 4.2 排序方式

- **位置**：工具栏右侧（与「N 条记录」计数同一行）。
- **排序模式**（`history-utils.js` `SORT_MODES`）：

| 模式值 | 中文标签 | 英文标签 | 主排序键 |
|--------|---------|---------|---------|
| `updatedDesc` | 更新时间倒序（默认） | Updated (newest first) | `historyEffectiveTime` |
| `updatedAsc` | 更新时间正序 | Updated (oldest first) | `historyEffectiveTime` |
| `createdDesc` | 创建时间倒序 | Created (newest first) | `createdAt`/`created_at` |
| `createdAsc` | 创建时间正序 | Created (oldest first) | `createdAt`/`created_at` |
| `videoDurationDesc` | 视频时长倒序 | Video duration (longest first) | `historyVideoDuration` |
| `videoDurationAsc` | 视频时长正序 | Video duration (shortest first) | `historyVideoDuration` |

- **时间键优先级**（`historyEffectiveTime`）：`updatedAt` → `updated_at` → `completedAt` → `completed_at` → `endedAt` → `ended_at` → `createdAt` → `created_at`。
- **视频时长键候选**（`historyVideoDuration`，与 `CreateViewHistory.videoDuration` 一致）：`videoDuration` → `video_duration` → `video.duration` → `composeDuration` → `durationSeconds`。**明确排除** `activeMs`/`duration`（那是流水线执行耗时，不是成片时长）。
- **排序稳定性**：主键相等时按「有效时间倒序 → 创建时间倒序 → 身份字典序 → 原始索引」稳定排列；主键缺失（无法解析时间/时长）的记录固定排在最后（无论正序/倒序）。
- **作用域**：先按状态 tab 过滤，再按所选模式排序（`filterHistoryByStatus(history, status, sortMode)`）。排序不修改原数组。
- **状态保持**：切换状态 tab 后保持用户已选的排序方式。

### 4.3 重复标题检测

- **判断环节**：**前端渲染层（renderer 内纯函数）**，在 `history` 完整列表加载并合并项目/运行记录后，由 `CreateViewHistory` 计算一次。选择理由：
  - 列表数据已全部在前端 `history` 中，重名判断是纯派生展示逻辑，不涉及 IPC 往返。
  - 主进程/存储层无「标题唯一性」约束语义（历史任务本应允许重名），不应在持久化环节拦截。
  - 计算只依赖展示所需字段，便于单元测试与复用。
- **检测规则**：
  - 从每条记录提取**显式标题**：`item.title`，或 `item.params.title` / `item.params.publishTitle`（与 `CreateViewHistory.historyTitle` 一致）。
  - 标题先 trim，**完全相等（区分大小写）**才算重复。
  - 无显式标题的记录不参与判断（回退到文案预览/流水线名的卡片不会因此被标记）。
  - 参与范围：完整 `history` 数组（不分状态 tab），保证切 tab 时标签稳定。
  - 命中分组 ≥ 2 条时，该分组内**所有**卡片都显示标签。
- **展示位置**：卡片标题右侧、流水线名称左侧（`history-heading-copy` 内）。
- **样式**：黄色警告胶囊标签（`--warning-bg`/`--warning-text`），`data-testid="history-duplicate-title-tag"`。

## 5. 交互与提示文字

| 场景 | 中文文案 | 英文文案 | 说明 |
|------|---------|---------|------|
| 下载按钮 | 下载视频 | Download video | `create.history.downloadVideo` |
| 排序标签 | 排序方式 | Sort by | `create.history.sortBy` |
| 排序选项 | 更新时间倒序/正序、创建时间倒序/正序、视频时长倒序/正序 | Updated/Created/Video duration (newest/oldest first, longest/shortest first) | `create.history.sortOptions.*` |
| 重复标题标签 | 有重复标题 | Duplicate title | `create.history.duplicateTitle` |
| 下载成功 | 文件已保存 | File saved | 既有 `story2video.save_completed` |
| 下载失败 | 操作失败 | Operation failed | 既有 `story2video.operation_failed` |
| 用户取消另存为 | 不提示 | 不提示 | 静默返回 |

## 6. 数据流

```
CreateView.loadHistory()
  → story2videoListProjects() + pipelineHistory()
  → 合并/去重/状态校正 → this.history（数组）
        │
        ▼
CreateViewHistory（props.history）
  ├─ filterHistoryByStatus(history, activeFilter, sortMode) → 卡片列表
  ├─ collectDuplicateTitleIdentities(history) → Set(身份) → hasDuplicateTitle
  └─ footer 按钮
        ├─ [下载视频] → $emit('download-history', item)
        │     └─ CreateView.downloadHistoryVideo
        │           └─ story2videoSaveAs(videoPath, suggestedName)
        └─ [发布] → $emit('publish-history', item)
```

## 7. 文件变更

- `apps/desktop/src/views/history-utils.js` — 新增 `SORT_MODES`/`SORT_OPTIONS`/`historyVideoDuration`/`historyExplicitTitle`/`collectDuplicateTitleIdentities`/`sortHistory`；`filterHistoryByStatus` 增加可选 `sortMode`。
- `apps/desktop/src/views/CreateViewHistory.vue` — 排序下拉、下载按钮、重复标题标签。
- `apps/desktop/src/views/CreateView.vue` — 新增 `@download-history` 接线与 `downloadHistoryVideo` 方法。
- `apps/desktop/src/locales/zh.js` / `en.js` — 新增 i18n key（成对）。
- `apps/desktop/src/styles/history-panel.css` — 排序控件与重复标签样式。
- `apps/desktop/src/views/history-utils.test.js` / `CreateViewHistory.test.js` — 回归测试。

## 8. 验收标准

| AC | 描述 | 验证 |
|----|------|------|
| AC-1 | 已完成+有 `videoPath` 显示下载按钮；缺 `videoPath` 或非 completed 不显示 | `CreateViewHistory.test.js` |
| AC-2 | 点击下载按钮发出 `download-history` 事件 | `CreateViewHistory.test.js` |
| AC-3 | 6 个排序选项完整渲染，默认 `updatedDesc` | `CreateViewHistory.test.js` |
| AC-4 | 切换 `updatedAsc` 后卡片顺序反转；缺失时间排最后 | `history-utils.test.js` |
| AC-5 | 创建/时长排序正确，`activeMs`/`duration` 不参与视频时长排序 | `history-utils.test.js` |
| AC-6 | 相同显式标题 → 所有相关卡片显示标签；不同标题/无标题 → 不显示 | `CreateViewHistory.test.js` + `history-utils.test.js` |
| AC-7 | zh/en locale 成对，CJK 基线不新增硬编码中文字面量 | `check-locale-sync` |
| AC-8 | 既有 59 项历史相关测试全部通过 | `vitest run history-utils CreateViewHistory` |

## 9. 非目标（Out of Scope）

- 不新增「去重/重命名」操作，仅做提示。
- 不持久化排序方式偏好（刷新页面恢复默认更新时间倒序）。
- 不改变 `videoPath` 的生成/保存逻辑。
- 不新增 IPC 通道（下载复用 `story2video:save-as`）。