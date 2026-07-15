# Checklist（深度版）

## Task 1: ProjectService 项目库服务

### 代码实现
- [ ] `project-service.js` 完整实现，包含所有 7 个方法（scan, get, create, update, delete, _ensureProjectsDir）
- [ ] `project-service.js` 所有文件操作包裹 try-catch
- [ ] `project-service.js` 使用 `path-utils.js` 处理路径（遵循项目规范）
- [ ] `ipc-handlers/project.js` 注册 3 个通道（list, get, delete）
- [ ] `ipc-handlers/project.js` 使用 `wrapIpcHandler` 统一错误处理
- [ ] `preload/project.js` 暴露 `projectAPI`（list, get, del）
- [ ] `container.setup.js` 注册 `projectService`
- [ ] `ipc-handlers/index.js` 注册 project handler
- [ ] `preload/index.js` 合并 projectAPI

### 功能验证
- [ ] `scanProjects()` 空 `projects/` 目录返回 `[]`
- [ ] `createProject()` 创建正确的目录结构 + `project.json` 内容完整
- [ ] `getProject()` 读取已有项目返回正确元数据
- [ ] `updateProject()` 合并字段正确，`updatedAt` 更新
- [ ] `deleteProject()` 递归删除目录 + SQLite 记录
- [ ] `getProject()` 不存在的项目抛 `ProjectNotFound` 错误
- [ ] IPC `project:list` 返回 `{ code: 0, data: Project[] }`
- [ ] IPC `project:delete` 不存在的项目返回 `{ code: EC.NOT_FOUND }`

---

## Task 2: 项目库 UI

### 代码实现
- [ ] `ProjectCard.vue` 使用 `<script setup>` + TypeScript Props 类型声明
- [ ] `ProjectCard.vue` 6 种状态颜色映射正确
- [ ] `ProjectCard.vue` 删除按钮使用 `@click.stop` + Element Plus `ElMessageBox.confirm`
- [ ] `ProjectLibrary.vue` 使用 `onMounted` + `projectAPI.list()`
- [ ] `ProjectLibrary.vue` 响应式网格布局（2/3/4 列）
- [ ] `ProjectLibrary.vue` 骨架屏/空状态/错误状态 三种状态覆盖
- [ ] 路由 `/library` 已注册
- [ ] 导航菜单添加"项目库"入口

### 功能验证
- [ ] 有项目时显示卡片网格
- [ ] 无项目时显示空状态引导页面
- [ ] 加载中显示骨架屏
- [ ] API 失败时显示错误信息 + 重试按钮
- [ ] 点击卡片导航到 `/board/:projectId`
- [ ] 删除弹出确认，确认后项目消失
- [ ] 响应式：不同屏幕宽度列数正确变化

---

## Task 3: BoardService 实时看板服务

### PipelineEngine 事件系统
- [ ] `pipeline-engine.js` 新增 `_eventListeners` 初始化
- [ ] `pipeline-engine.js` 新增 `on()` / `off()` / `_emit()` 三个方法
- [ ] `pipeline-engine.js` 在 `startPipeline()` 末尾调用 `_emit('pipeline:start', ...)`
- [ ] `pipeline-engine.js` 在 `executeStage()` 开头/末尾调用 `_emit('stage:start'/'stage:complete')`
- [ ] `pipeline-engine.js` 在 `executeStage()` catch 中调用 `_emit('stage:fail', ...)`
- [ ] `pipeline-engine.js` 在 checkpoint 触发处调用 `_emit('checkpoint:pause', ...)`
- [ ] `pipeline-engine.js` 在场景生成各阶段调用 scene 相关事件
- [ ] `_emit()` 使用 try-catch 包裹每个 listener，单个 listener 失败不影响其他

### BoardService 代码实现
- [ ] `board-service.js` constructor 订阅 11 种 PipelineEngine 事件
- [ ] `board-service.js` `subscribe()` 返回初始 BoardState
- [ ] `board-service.js` `unsubscribe()` 正确移除订阅
- [ ] `board-service.js` 节流：200ms 内多次事件只推送一次
- [ ] `board-service.js` `_pushToSubscribers()` 使用 `safeSend`
- [ ] `board-service.js` `destroy()` 取消所有订阅
- [ ] `ipc-handlers/board.js` 注册 3 个通道
- [ ] `preload/board.js` 暴露 `boardAPI`（subscribe, unsubscribe, get, onUpdate）
- [ ] `preload/board.js` onUpdate 返回取消订阅函数
- [ ] `container.setup.js` 注册 `boardService`

### 功能验证
- [ ] subscribe 返回包含 stages/scenes/costs 的完整 BoardState
- [ ] PipelineEngine stage:start 事件 → board:update 推送
- [ ] PipelineEngine scene:complete 事件 → board:update 推送
- [ ] 200ms 内 5 次事件 → 只推送 1 次（节流生效）
- [ ] 窗口关闭后 IPC push 不报错（safeSend 生效）
- [ ] unsubscribe 后不再收到更新

---

## Task 4: 实时看板 UI

### 代码实现
- [ ] `BoardStageIndicator.vue` 水平步骤条，5 种状态样式正确
- [ ] `BoardStageIndicator.vue` 当前步骤脉冲动画（CSS `@keyframes`)
- [ ] `BoardStageIndicator.vue` 步骤名映射中文标签
- [ ] `SceneCard.vue` 4 个区域完整（序号、状态、prompt、缩略图、供应商/成本/质量）
- [ ] `SceneCard.vue` 7 种场景状态徽标文字正确
- [ ] `ProductionBoard.vue` 订阅/取消订阅生命周期正确
- [ ] `ProductionBoard.vue` 注册 `approval:request` 监听
- [ ] 路由 `/board/:projectId` 已注册

### 功能验证
- [ ] 看板显示项目的 stages + scenes + costs + elapsed
- [ ] BoardStageIndicator 的 running 步骤有蓝色脉冲动画
- [ ] BoardStageIndicator 的 completed 步骤有绿色 ✓
- [ ] SceneCard 显示场景名/状态/缩略图/供应商/成本
- [ ] 进入页面时自动订阅看板更新
- [ ] 离开页面时自动取消订阅（`onBeforeUnmount`）
- [ ] board:update 推送时 UI 自动刷新
- [ ] 场景卡片点击导航到 contact-sheet 页
- [ ] 已完成项目显示"查看回放"按钮

---

## Task 5: ContactSheet 审批服务

### 代码实现
- [ ] `contact-sheet-service.js` 实现了 4 个方法（get, approve, reject, _onSceneComplete）
- [ ] `contact-sheet-service.js` approveScene 更新状态 + 通知 pipelineEngine
- [ ] `contact-sheet-service.js` rejectScene 更新状态 + 触发重新生成
- [ ] `contact-sheet-service.js` _onSceneComplete 设置 AWAITING + 推送 approval:request
- [ ] `ipc-handlers/contact-sheet.js` 注册 3 个通道
- [ ] `container.setup.js` 注册 `contactSheetService`

### 功能验证
- [ ] approveScene 后场景状态变为 APPROVED
- [ ] approveScene 所有场景批准后 pipelineEngine 继续下一阶段
- [ ] rejectScene 后场景状态变为 REJECTED → 重新 QUEUED
- [ ] scene:complete 时场景自动进入 AWAITING
- [ ] 进入 AWAITING 时推送 approval:request 到渲染进程
- [ ] 多个场景独立审批，互不影响

---

## Task 6: Contact Sheet 审批 UI

### 代码实现
- [ ] `ContactSheetView.vue` 顶部显示总进度（"3/5 已审批"）
- [ ] `ContactSheetView.vue` 每个场景卡片展示多张 take + prompt + 成本 + 质量
- [ ] `ContactSheetView.vue` take 选中状态（蓝色边框）
- [ ] `ContactSheetView.vue` "批准此 take" + "驳回" 按钮
- [ ] `ContactSheetView.vue` 驳回文本框
- [ ] 路由已注册

### 功能验证
- [ ] 显示所有场景列表
- [ ] 每场景多张 take 缩略图
- [ ] 选中某个 take 后点击"批准" → 场景状态更新
- [ ] 输入反馈后点击"驳回" → 场景状态更新
- [ ] IPC push 接收时自动更新
- [ ] 新待审批场景自动滚动到可视区域

---

## Task 7: ApprovalGate 审批门服务

### 代码实现
- [ ] `approval-gate-service.js` 实现了 3 个方法（getCurrentGate, approveGate, _onCheckpointPause）
- [ ] `approval-gate-service.js` approveGate 支持 approve 和 modify 两种模式
- [ ] `approval-gate-service.js` modify 模式正确注入修改意见到 pipeline context
- [ ] `approval-gate-service.js` _onCheckpointPause 创建 ApprovalGate + 推送审批
- [ ] `ipc-handlers/approval-gate.js` 注册 2 个通道
- [ ] `container.setup.js` 注册 `approvalGateService`

### 功能验证
- [ ] getCurrentGate 返回当前待处理审批门（或 null）
- [ ] approve (通过模式) → gate.status='approved' → pipelineEngine.resume()
- [ ] approveWithModify (修改模式) → gate.status='modified' → pipelineEngine.resume({ modification })
- [ ] 多个 checkpoint 排队 (FIFO 顺序)
- [ ] checkpoint:pause 事件正确触发 approval:request 推送
- [ ] 审批门包含正确的 title/content/context/requiredDecision

---

## Task 8: 审批门 UI

### ApprovalGateModal
- [ ] `ApprovalGateModal.vue` 使用 `<Teleport to="body">` 全局弹窗
- [ ] `ApprovalGateModal.vue` 展示审批内容（只读 `<pre>`）
- [ ] `ApprovalGateModal.vue` 展示上下文信息
- [ ] `ApprovalGateModal.vue` "通过" + "修改后继续" + "稍后处理" 三个按钮
- [ ] `ApprovalGateModal.vue` "修改后继续" 在 `approve_only` 模式下隐藏
- [ ] `ApprovalGateModal.vue` "修改后继续" 按钮在没有输入时 disabled
- [ ] `ApprovalGateModal.vue` 最小化后不关闭，可从其他地方恢复

### Pinia Store
- [ ] `stores/backlot.js` State 包含 projects/currentBoard/pendingApprovals/loading/error
- [ ] `stores/backlot.js` Actions 覆盖 project/board/approve/reject/gate/replay 全链路
- [ ] `stores/backlot.js` IPC push 监听器正确注册
- [ ] `stores/backlot.js` IPC push 监听器在 store teardown 时正确清理

### 功能验证
- [ ] 审批门触发时 ApprovalGateModal 自动弹出
- [ ] "通过" 按钮 → IPC 调用 + 弹窗关闭
- [ ] "修改后继续" + 输入 → IPC 调用 + 弹窗关闭
- [ ] "稍后处理" → 弹窗最小化，可重新打开
- [ ] 多审批门时右上角显示"还有 N 个待审批"
- [ ] Store 中的 board:update 正确更新 currentBoard
- [ ] Store 中的 approval:request 正确追加到 pendingApprovals

---

## Task 9: ExecutionRecorder 生产回放服务

### 代码实现
- [ ] `execution-recorder.js` 实现了 5 个方法（start, recordEvent, stop, getReplay）
- [ ] `execution-recorder.js` 录制使用 JSONL 格式
- [ ] `execution-recorder.js` 每个事件包含全量 BoardState 快照
- [ ] `ipc-handlers/replay.js` 注册 `replay:get`
- [ ] `preload/replay.js` 暴露 `replayAPI.get`
- [ ] `container.setup.js` 注册 `executionRecorder`

### 功能验证
- [ ] startRecording 创建 `replay/` 目录和 `execution.jsonl`
- [ ] recordEvent 写入 JSON 行，每行有效 JSON
- [ ] getReplay 读取正确的 events[] 顺序
- [ ] getReplay 返回的 totalDuration 正确
- [ ] 每次事件包含完整 BoardState 快照
- [ ] 无录制数据时 getReplay 返回空 events[]
- [ ] 录制过程中 IO 错误不阻断流水线执行

---

## Task 10: 生产回放 UI

### 代码实现
- [ ] `ReplayTimeline.vue` 时间轴滑块可拖动
- [ ] `ReplayTimeline.vue` 时间轴标注阶段切换点
- [ ] `ReplayTimeline.vue` 播放/暂停 + 1x/2x/4x 速度控制
- [ ] `ReplayTimeline.vue` 快照面板显示当时的 BoardStageIndicator + SceneCard + 成本
- [ ] `ReplayTimeline.vue` 回放引擎使用 `setInterval` 推进索引
- [ ] `ReplayTimeline.vue` 空状态处理
- [ ] 路由已注册

### 功能验证
- [ ] 加载回放数据后正确显示时间轴
- [ ] 拖动滑块 → 快照面板更新到对应时间点
- [ ] 播放 → 自动按时间推进
- [ ] 暂停 → 停在当前时间点
- [ ] 1x → 正常速度；2x → 双倍速度；4x → 四倍速度
- [ ] 快照面板显示内容与当时阶段匹配
- [ ] 无数据时显示空状态提示

---

## Task 11: Pinia Store + Composable

### 代码实现
- [ ] `stores/backlot.js` 完整实现 State/Actions/Getters
- [ ] `stores/backlot.js` IPC push 监听器正确注册和清理
- [ ] `composables/useBacklot.js` 封装 `useProjectList` / `useLiveBoard` / `useApprovalFlow`
- [ ] `useLiveBoard` 在组件 unmount 时自动取消订阅

### 功能验证
- [ ] fetchProjects 正确调用 project:list
- [ ] openBoard 正确调用 board:subscribe + 注册 IPC 监听
- [ ] closeBoard 正确调用 board:unsubscribe + 移除监听
- [ ] approveScene/rejectScene/approveGate 正确调用对应 IPC
- [ ] useLiveBoard 组件挂载时订阅，卸载时取消
- [ ] useApprovalFlow 正确处理批准/驳回 UI 状态

---

## Task 12: E2E 集成测试

### E2E 链路
- [ ] 创建项目 → project:list 返回新项目
- [ ] 订阅看板 → board:update 被触发
- [ ] 模拟 PipelineEngine 事件（mock）→ 看板更新推送
- [ ] 场景进入 AWAITING → approval:request 推送
- [ ] 批准场景 → 状态更新为 APPROVED
- [ ] ApprovalGate 触发 → 弹窗 → 批准
- [ ] ExecutionRecorder 录制 → replay:get 返回完整数据

### 安全验证
- [ ] preload API 在 sandbox 模式下可用
- [ ] IPC push 在多个窗口正常工作
- [ ] 审批门停住时取消流水线能正确清理（无僵尸进程/定时器）
- [ ] 回放数据不包含 API key 或其他敏感信息（检查 JSONL 内容）

### 边界条件
- [ ] 无 `projects/` 目录时 ProjectLibrary 显示空状态
- [ ] project.json 损坏时跳过（不崩溃）
- [ ] 回放数据文件损坏时友好提示
- [ ] 多个审批门同时触发，FIFO 排队
- [ ] BoardService 订阅者在进程退出时正确清理
- [ ] 流水线在审批门暂停期间用户可以安全退出应用