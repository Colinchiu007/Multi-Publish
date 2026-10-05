# Proposal: publish-progress-ux（发布进度全局反馈面板 + 后台运行）

## Why

用户点击「发布」后不知道当前到了什么环节、进展如何。侦察实证（全部带路径:行号，见 `01-docs/PRD-PUBLISH-PROGRESS-UX-2026-09-28.md` §1）：

1. **反馈链路断裂（bug 级）**：单篇发布的 `publish:progress` 监听器在 `usePublishFlow.js:438-441` 的 `finally` 中无条件注销，而 `publish:batch` IPC 同步入队后毫秒级返回（`ipc-handlers/publish.js:282-293`）——任务实际执行期间发出的全部阶段/成败事件**无人接收**，`:411-413` 的「全部完成才注销」条件成为死代码。用户点击发布后的最终反馈只有「✓ 已添加 N 个任务」，**永远不知道发布是否成功**。批量模式同病（`useBatchPublish.js` 阶段级监听同样短命）。
2. **切走页面即失明**：进度状态全部活在组件局部 ref，批量监听随组件卸载清除（`useBatchPublish.js:121-123`），无全局 store、无全局面板；`queue:status`/`queue:history` IPC 存在但渲染层零消费。
3. **percent 全链路丢弃**：RPA 引擎产出 percent，`rpa:progress` 含 percent 但渲染层零消费；`bootstrap.js:100` 转发时只解构 `{ stage }`。ApiPublisher 直连轨（bilibili/baijiahao）**完全不发进度事件**。
4. **并发跨归属**：`rpaViewManager.onProgress` 是单槽回调，maxConcurrent=3 并发任务互相覆盖，进度错误归属到最后注册的任务。
5. **阶段文案英文硬编码**直出中文用户；两引擎阶段模型不一致（RPA 按平台 10+ 阶段 vs API 固定 4 阶段）。
6. **发布失败不落历史**：`phase4-events.js` task:failed 只发事件，不调 `history.addRecord`——失败结果在任何页面都查不到。
7. **窗口关闭不保护发布任务**：`window.js:136-154` 托盘隐藏判据只查流水线任务；发布中关窗直接走退出链，任务被标记 cancelled。

## What Changes

### ADDED Capabilities

- `publish-progress-feedback`：发布进度的全局反馈契约——富化进度事件、全局进度面板（可最小化后台运行）、失败落历史、发布运行中关窗转托盘。

### 变更明细

**主进程（加法为主，不动编排语义）**
- 新增 `electron/services/publish-progress-events.js`：`publish:progress` payload 富化（新增 `phase`/`stageKey`/`percent`/`batchId`/`timestamp`/`retriesLeft` 结构化字段，既有字段原样保留，向后兼容）；stage 规范枚举映射表（两引擎英文阶段串 → 9 个稳定 stageKey）；`createTaskProgressRouter`（platform→taskId 路由，修并发跨归属）。
- `bootstrap.js` executor：任务开始发 `phase:'start'` 边界事件；`rpaViewManager.onProgress` 改为**全局注册一次**（不再每任务覆盖）；删除 executor 内冗余的 `emitProgress('✓ 发布成功')`（终态以 phase4-events 为单一来源）。
- `publisher-router.js` ApiPublisher：接受 `options.onProgress` 并透传给 `publishViaApi`（直连 API 轨补发进度）。
- `phase4-events.js`：四个事件改走富化 emitter（success/failed/blocked/retry 带 phase 与结构化字段）；**task:failed 补 `history.addRecord`（status:'failed'）**。
- `window-close-policy.js` / `window.js`：`shouldHideToTrayOnClose` 新增 `hasRunningPublish` 判据（running+queue > 0）；`system-tray.js` 新增 Windows-only `showBalloon`，发布运行中隐藏到托盘时气泡提示「发布仍在后台进行，请勿退出程序」。

**渲染层（全局承载面）**
- 新增 `src/stores/publishProgress.js`（pinia）：全局会话注册表（多批次任务列表）、App 级一次性事件订阅（监听器不再随组件卸载死亡）、`queue:status` 快照领养孤儿任务（渲染层重载恢复）、会话终态驱动页面结果卡。
- 新增 `src/components/PublishProgressPanel.vue`：App.vue 全局挂载（与 UpdateNotification/PipelineBackgroundToast 同级）；右下浮动卡（会话×任务×步骤状态矩阵）+ 最小化常驻胶囊（微型进度 + 「请勿关闭应用」常驻提示）；**非模态**——按浮层互斥合同 §6 口径显式不接入 `useEmbeddedViewSuspension`。
- 首次隐藏时 toast 强提示一次（localStorage 记忆），之后常驻小字提示。
- `usePublishFlow.js` / `useBatchPublish.js`：删除毫秒级死亡的本地监听器；IPC 返回后 `registerSession`；页面结果卡/时间线由 store 会话终态驱动。
- i18n：`publishPage` 组 zh/en 成对新增全部文案（阶段标签/状态/提示文字）。

## Impact

- **运行时代码**：`apps/desktop/electron/`（bootstrap.js、bootstrap/phase4-events.js、services/publish-progress-events.js 新增、services/publisher-router.js、services/window-close-policy.js、services/window.js、services/system-tray.js）、`apps/desktop/src/`（stores/publishProgress.js 新增、components/PublishProgressPanel.vue 新增、App.vue、composables/usePublishFlow.js、composables/useBatchPublish.js、locales/zh.js + en.js）。
- **不改**：TaskQueue 编排语义（并发/重试/超时）、ROUTE_TABLE、发布引擎内部阶段序列、定时/云端发布流程、`publish:progress` 既有字段。
- **测试**：新增 publish-stage-map / publish-progress-events / publishProgress store / PublishProgressPanel 测试；扩展 phase4-events / window-close-policy / usePublishFlow / useBatchPublish 测试；QM-5 Bug 反思循环 5 步产出物（监听器死亡 bug）。
- **文档**：新建 `01-docs/PRD-PUBLISH-PROGRESS-UX-2026-09-28.md`（专题 PRD，含数据校验/流程/功能逻辑/交互逻辑/显示项/提示文字全表）；`01-docs/PRD.md` §六新增小节 + 文件头索引 + §19.2 子 PRD；`01-docs/PRD-OVERLAY-VIEW-SUSPENSION-2026-09-23.md` §5 通查清单补登（非模态不接入）；AGENTS.md QM-2 新增发布进度事件契约条目；CHANGELOG、learnings。
- **风险**：中——新增 IPC payload 字段（向后兼容加法）+ 渲染层状态承载迁移；与开放 PR #2562（`Publish.vue`）文件交集小（本变更对 Publish.vue 无模板改动），合并前需 rebase；QM-1 打包验证 + 视觉回归门禁适用。

## Out of Scope

- 发布引擎编排重构（队列并发数、重试策略、超时预算、ROUTE_TABLE 调整）。
- 跨重启断点续跑（队列 `deserialize` 恢复已存在，本变更只如实呈现其语义，不新增恢复能力）。
- 阶段级实时日志尾部流（失败详情以错误消息呈现）。
- 发布任务排队调度器（并发发布维持现状语义：共享 3 并发队列、允许追加）。
- 定时发布（scheduler）与云端发布（/cloud-publish）流程的进度改造。
