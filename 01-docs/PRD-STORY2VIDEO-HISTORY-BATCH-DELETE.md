# PRD — 视频创作·历史记录批量删除

- **状态**：开发完成（待 CI 合并）
- **分支**：`mp-video-history-batch-delete`
- **关联需求**：视频创作 - 历史记录任务列表增加多选 + 批量删除
- **负责人**：开发（AI 协作）
- **创建日期**：2026-08-26

---

## 1. 背景

视频创作的历史记录列表（`apps/desktop/src/views/CreateViewHistory.vue`，挂载于 `CreateView` 的 `history` 视图）原本只支持**单条删除**：

- 有 `projectId` 的项目记录 → `story2videoDeleteProject(projectId)`
- 无 `projectId` 的流水线运行记录（run）→ `pipelineDeleteRun(id || runId)`

当用户需要清理多条历史记录（例如一次批量创作产生的多个项目/多次运行）时，只能逐条点开确认删除，操作繁琐、易误触。本需求补齐**多选 + 批量删除**能力。

## 2. 目标

- 在历史记录列表提供多选（全选 / 取消全选）与「批量删除」入口。
- 复用既有单条删除 API，前端循环按记录类型分流调用，**不新增 IPC 通道**。
- 提供二次确认、进行中锁定、与成功/部分成功/全失败三类结果反馈。

## 3. 用户需求（P0）

| 编号 | 需求 | 优先级 |
|------|------|--------|
| U1 | 列表支持勾选多条记录，提供「全选 / 取消全选」 | P0 |
| U2 | 实时显示「已选 N 项」 | P0 |
| U3 | 「批量删除」按钮在有选中项且非进行中时可点击 | P0 |
| U4 | 点击批量删除弹出二次确认，提示「将删除选中的 N 条记录，不可恢复」 | P0 |
| U5 | 确认后按 `projectId` / `runId` 自动分流调用既有删除 API | P0 |
| U6 | 删除进行中（`deleting`）禁用选择复选框与批量删除按钮，防止重复提交 | P0 |
| U7 | 结果反馈：全成功→Toast 成功数；部分成功→Toast 成功/失败计数；全失败→错误弹窗 | P0 |

> P1/P2：跨页全选、按状态批量筛选后删除、撤销——本版不做，留待后续迭代。

## 4. 适用边界

- 仅作用于 `CreateView` 的 `history` 视图内的历史记录。
- 运行中的流水线记录（`story2videoResuming`）不允许勾选/批量删除，避免中断进行中的任务。
- 批量删除复用单条删除的权限与错误处理链路（IPC 权限拒绝→登录/权益提示，不视为崩溃）。
- 用户可见文案一律走 `locales/zh.js` + `en.js` 成对（CI Gate 7 `check-locale-sync` 拦截），不在渲染端硬编码中文。

## 5. 验收标准（Acceptance Criteria）

| AC | 描述 | 验证方式 |
|----|------|----------|
| AC-1 | 批量删除进行中（`deleting=true`）禁用批量删除按钮与选择复选框 | `CreateViewHistory.test.js` + `CreateView.test.js` |
| AC-2 | 「全选」可切换全选 / 取消全选，且只在有记录时渲染 | `CreateViewHistory` 交互 |
| AC-3 | 「已选 N 项」数量与勾选项实时一致 | 单元测试 |
| AC-4 | 点击批量删除打开确认弹窗并保留选中项；确认后按类型分流 | `CreateView.test.js` |
| AC-5 | 混合 3 项（2 project + 1 run）确认后：`story2videoDeleteProject`×2、`pipelineDeleteRun`×1，历史清空，Toast 含「3」 | `CreateView.test.js`（分流测试） |
| AC-6 | 部分成功：仅移除成功项，Toast 含成功/失败计数 | `CreateView.test.js`（部分成功测试） |
| AC-7 | 全部失败：保留历史项，弹出错误对话框（`story2video.batch_delete_failed`） | `CreateView.test.js`（全失败测试） |
| AC-8 | 进行中再次触发 `confirmBatchDeletion` 提前返回，不调用任何删除接口 | `CreateView.test.js`（守卫测试） |

## 6. 设计选型

**方案 A（采用）：前端循环批量**
- 复用 `CreateViewHistory` 现有单条删除 UI 模式，新增多选状态 `selectedIdentities`。
- `CreateViewHistory` 负责「选择 UI + 发射 `delete-history-batch` 事件（携带选中项副本）」。
- `CreateView` 负责「确认弹窗 + `confirmBatchDeletion` 编排」：循环遍历选中项，按 `item.projectId` 是否存在分流到 `story2videoDeleteProject` / `pipelineDeleteRun`，用成功 ID 集合过滤 `history`，并给出三类结果反馈。
- **不新增 IPC / API 通道**，复用既有删除接口与权限链路。

**否决方案 B：后端批量删除接口**
- 需新增 IPC 契约与后端批量端点，改动面大、需额外测试与回滚保障；当前单条接口已满足语义，前端循环即可，遵循「能不用第三方/新服务就不用」的架构原则。

**否决方案 C：在 `CreateViewHistory` 内直接调用 API**
- 破坏既有「`CreateViewHistory` 只发事件、`CreateView` 统一编排删除与反馈」的分层；结果与单条删除的 Toast/错误弹窗不一致。

## 7. 关键实现点

- i18n key（`locales/zh.js` / `en.js`）：
  - `create.history`: `selectAll` / `deselectAll` / `selectedCount` / `batchDelete`
  - `story2video`: `batch_delete_confirm` / `batch_delete_success` / `batch_delete_partial` / `batch_delete_failed`
- 通知插值（`story2video-notifications.js`）：`BATCH_DELETE_CONFIRM` / `BATCH_DELETE_SUCCESS` / `BATCH_DELETE_PARTIAL` / `BATCH_DELETE_FAILED` 统一走 `{count}/{success}/{failed}` 插值分支（修复：`BATCH_DELETE_SUCCESS` 原本漏加，导致成功 Toast 的 `{count}` 为空）。
- 选择器约定：`CreateViewHistory` 内批量按钮用 `data-testid="history-batch-delete-button"`，单条删除按钮用 `data-testid="history-delete-button"`，避免共享 `s2v-btn-danger` 类导致测试误命中。

## 8. 关联文档

- 源码：`apps/desktop/src/views/CreateView.vue`、`apps/desktop/src/views/CreateViewHistory.vue`
- 通知：`apps/desktop/src/story2video/story2video-notifications.js`
- 国际化：`apps/desktop/src/locales/zh.js`、`apps/desktop/src/locales/en.js`
- 测试：`apps/desktop/src/views/CreateView.test.js`、`apps/desktop/src/views/CreateViewHistory.test.js`
- 流水线规范：`AGENTS.md`（会话隔离、质量节拍、i18n-content-sync）
