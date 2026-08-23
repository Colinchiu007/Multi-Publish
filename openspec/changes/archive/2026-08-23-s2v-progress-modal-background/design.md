## Context

现有 CreateView 在流水线详情正文直接渲染 StageProgress，底部 action-bar 负责暂停/取消等操作。编排流水线已经有 run-scoped 状态查询、3 秒轮询、实时事件和 resetPipelineUiState；但此前自动后台改造删除了手动脱离入口。UiModal 默认允许遮罩关闭，且其它业务弹窗依赖该默认行为，因此不能全局改成不可关闭。

普通非编排流水线当前通过流水线名称读取状态，启动返回值未在 renderer 保存稳定 runId，本 change 不伪造其单任务恢复或取消能力。

## Goals / Non-Goals

**Goals:**

- 提供可复用的进度弹窗壳，并把现有阶段进度内容完整迁入。
- 编排运行态支持右上关闭/【后台运行】两条等价的前端脱离路径。
- 保证遮罩、ESC、动画、底部操作条和 checkpoint 交互可测试且不破坏既有弹窗。
- 保证异步响应在脱离、切换、卸载后不会污染新建态或触发旧结果跳转。

**Non-Goals:**

- 不新增 detach IPC、数据库字段、并发算法或第三方依赖。
- 不让普通流水线获得未经后端支持的 run-scoped 恢复/取消。
- 不把内容政策失败或 scene_asset_selection 伪装成可后台化的普通 running。
- 不把快速渲染 loading、发布 timeline、自动更新和静态阶段指示器强行改造成此弹窗。

## Decisions

### 1. 进度内容与弹窗壳分离

保留 StageProgress 作为纯进度内容组件，在 CreateView 中通过 UiModal 包裹并传入所有原有 props；警告、BGM 提示和素材选择区域作为 modal body 的相邻内容。这样阶段内容既能在独立测试中验证，又不把运行状态塞进通用弹窗组件。

备选：新建一个只包含 Story2Video 的大型页面组件。否决原因：会复制 StageProgress 的本地化和数据降级逻辑，无法让其他视频流水线共享表现。

### 2. UiModal 增加可选关闭策略，默认兼容

新增 closeOnOverlay 与 closeOnEsc 可选属性，默认值保持现有弹窗行为；进度弹窗传 false/false。关闭按钮增加 type、可访问名称和稳定 testid。ESC 监听只在配置启用且 visible 时注册，并在卸载/隐藏时移除。

备选：全局禁用遮罩和 ESC。否决原因：会破坏账号、确认和媒体预览等已有弹窗合同。

### 3. 显式脱离方法共享清理逻辑

新增 detachPipelineToBackground，入口重校验合法 orchestrationRunId、非人工 checkpoint 和组件存活状态；递增启动代际、停止轮询、调用既有前端 reset、关闭进度 modal、显示 locale toast，并异步刷新历史。该方法绝不调用 pipelineCancel。右上关闭事件直接调用同一方法，避免两个入口漂移。

备选：关闭弹窗但继续保留页面运行态。否决原因：用户要求关闭后恢复新建态，且保留旧状态会使旧轮询响应污染新任务。

### 4. 底部操作条保留在弹窗之上

进度弹窗的 overlay 使用进度专属 class，弹窗 body 内滚动；底部固定操作条保持较高 stacking order 并继续接收点击。遮罩不使用全局 pointer-events:none，避免弹窗本身和关闭按钮失效。

备选：让弹窗覆盖整屏并把 action bar 复制到弹窗 footer。否决原因：会产生两套控制条，且用户明确要求底部按钮条保持不变。

### 5. 终态和检查点保持原状态机

完成/失败/取消仍由 updateOrchestrationStatus/applyOrchestrationOutcome 处理；终态关闭 modal，完成仍进入结果页。scene_asset_selection 继续在 modal 中呈现 banner、候选选择和确认动作；内容政策 checkpoint 继续只显示取消和修订提示，后台入口方法级阻断。

## Risks / Trade-offs

- [Risk] 弹窗高度不足导致阶段信息不可见 → [Mitigation] 进度窗采用宽屏上限、视口高度上限和 body 内滚动。
- [Risk] overlay 覆盖固定操作条 → [Mitigation] action bar 使用高于进度 overlay 的 stacking order，并增加集成测试验证按钮 handler 仍可触发。
- [Risk] 异步状态返回污染 idle → [Mitigation] 继续使用 runId、requestId、启动代际和存活快照守卫，关闭/后台路径先使代际失效。
- [Risk] 普通流水线任务串读 → [Mitigation] 只统一视觉壳，不声明 run-scoped 恢复/取消；记录后续 IPC 契约工作。
- [Risk] 新弹窗 props 影响既有弹窗 → [Mitigation] 默认值保持兼容，UiModal 单测保留遮罩关闭正向断言并新增禁用策略用例。

## Migration Plan

1. 先更新 UiModal 关闭策略测试，再实现可选 props。
2. 更新 CreateView 测试，锁定弹窗、后台按钮、关闭策略、checkpoint、竞态和 action bar 行为。
3. 迁移 StageProgress、提示与素材选择到进度弹窗，移除正文和底部重复进度展示。
4. 运行定向 Vitest、locale/CJK、build:vue、依赖解析和 diff 检查。
5. 失败回滚只需恢复 CreateView 接线与 UiModal 新 props；既有主进程运行和历史快照不变。

## UI/UE contract

- **Shell**: the progress view uses `UiModal` with `variant=progress`, `size=xl`, and a `960px` max width. The desktop overlay reserves the fixed action bar space (`88px` plus `24px` breathing room); narrow viewports reserve the mobile action bar space (`136px` plus `12px`).
- **Height and scrolling**: the modal keeps a stable width and uses `max-height: calc(100dvh - action-bar-space - 48px)` on desktop and the equivalent mobile calculation. The header and footer remain fixed while `.ui-modal-body` scrolls vertically, so all stages can be inspected without resizing the page.
- **Layering**: the progress overlay is `z-index: 100`; the existing fixed action bar remains `z-index: 110`. The overlay backdrop is visually present but does not intercept action-bar pointer events. The modal surface remains interactive at `z-index` within the overlay.
- **Close policy**: overlay click and Escape are disabled for progress variants. Only the top-right button emits `close`; it has a stable `data-testid`, an accessible label, and a disabled state for manual checkpoints. The leave transition combines opacity with `scale(0.96) translateY(4px)` so explicit detachment visibly shrinks away.
- **Visible content**: total percent, elapsed time, terminal summary, every normalized stage, stage status/detail/time, stage-level progress, Story2Video compose time guidance, provider warning, BGM skip notice, status-unavailable/loading fallback, and scene asset selection controls are rendered from the same snapshot. Missing or invalid optional fields are omitted safely.
- **Validation**: stage arrays must be arrays; stage objects must be non-null objects; progress values accept finite numeric strings/numbers and are clamped to `0..100`; non-finite, non-numeric, and wrong-type fields use the existing fallback or remain hidden. IPC payloads use plain JSON clones.
- **Lifecycle**: start/resume/push/poll responses are bound to `runId`, request generation, action request generation, and component liveness. Explicit backgrounding increments the relevant generations before stopping polling and clearing renderer state. It never calls `pipelineCancel`, so the main-process run and concurrency slot remain active.
- **Checkpoint exception**: scene asset selection, content policy, `waiting_approval`, `needs_user_input`, and `needsCheckpoint` are manual checkpoints. Their close button is disabled and no background action is rendered; the user must complete the checkpoint or cancel.
- **Ordinary pipelines**: non-orchestrated pipelines reuse the visual shell and renderer cleanup, but when the backend exposes only name-based status without a stable run identity the UI does not claim run-scoped resume/cancel semantics.
