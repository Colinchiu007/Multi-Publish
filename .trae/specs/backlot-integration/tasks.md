# Tasks（深度版）

## Task 1: 创建 ProjectService 项目库服务

### 1.1 创建 `electron/services/project-service.js`

- [ ] 实现 `constructor(store)` — 接收 SQLite store 实例，初始化 UUID 生成器
- [ ] 实现 `scanProjects()` — 扫描 `projects/` 目录
  - [ ] 读取目录下每个子目录中的 `project.json`
  - [ ] 解析元数据，构造 `Project[]`
  - [ ] 磁盘上无 `project.json` 的目录自动忽略
  - [ ] 返回按 `updatedAt` 降序排列的列表
- [ ] 实现 `getProject(id)` — 读取 `projects/<id>/project.json`，返回 `Project` 对象
- [ ] 实现 `createProject(meta)` — 创建新项目
  - [ ] 生成 UUID v4 作为 `id` 和目录名
  - [ ] 创建 `projects/<id>/` 目录
  - [ ] 写入 `projects/<id>/project.json`
  - [ ] 同时写入 SQLite store 的 `projects` 表（备查）
  - [ ] 返回完整 `Project` 对象
- [ ] 实现 `updateProject(id, updates)` — 更新项目元数据
  - [ ] 读取现有 `project.json`，合并更新
  - [ ] 写入 `updatedAt = new Date().toISOString()`
  - [ ] 更新 SQLite 记录
- [ ] 实现 `deleteProject(id)` — 删除项目
  - [ ] 递归删除 `projects/<id>/` 目录
  - [ ] 删除 SQLite 中的记录
  - [ ] 返回 `{ deleted: true }`
- [ ] 实现 `_ensureProjectsDir()` — 确保 `projects/` 目录存在，不存在则创建
- [ ] 错误处理：所有文件操作包裹 try-catch，IO 异常返回空列表或抛 ProjectNotFound 错误

### 1.2 创建 `electron/ipc-handlers/project.js`

- [ ] 注册 `project:list` — 调用 projectService.scanProjects()
- [ ] 注册 `project:get` — 参数 `{ projectId }`，调用 projectService.getProject()
- [ ] 注册 `project:delete` — 参数 `{ projectId }`，调用 projectService.deleteProject()
- [ ] 使用 `wrapIpcHandler` 统一错误处理（参考 ipc-handlers 的现有模式）
- [ ] 导出 `registerProjectHandlers(ipcMain, container)` 函数

### 1.3 创建 `electron/preload/project.js`

- [ ] 实现 projectAPI 对象：`{ list, get, del }`
- [ ] 每个方法使用 `ipcRenderer.invoke()` 调用对应通道
- [ ] 导出 projectAPI

### 1.4 修改现有文件

- [ ] 在 `container.setup.js` 注册 `projectService`
  - [ ] `c.register('projectService', () => new ProjectService(c.get('store')))`
- [ ] 在 `ipc-handlers/index.js` 添加 `require('./project')` 和注册调用
- [ ] 在 `preload/index.js` 合并 projectAPI 到 `window.electronAPI`

### 1.5 单元测试

- [ ] 创建 `electron/tests/project-service.test.js`
  - [ ] 测试 `scanProjects()` 在空目录返回 `[]`
  - [ ] 测试 `createProject()` 创建正确的目录结构和 `project.json`
  - [ ] 测试 `getProject()` 返回正确的元数据
  - [ ] 测试 `updateProject()` 正确合并字段
  - [ ] 测试 `deleteProject()` 删除目录和数据库记录
  - [ ] 测试 `getProject()` 不存在的项目抛异常
  - [ ] 测试 IPC handler 的 invoke 路径

---

## Task 2: 创建项目库 UI

### 2.1 创建 `src/components/ProjectCard.vue`

- [ ] Props: `project: Project`
- [ ] 展示：缩略图（或占位符）+ 名称 + 状态徽标 + 流水线类型 + 更新时间 + 成本
- [ ] 状态颜色映射：draft=灰色, running=蓝色, paused=黄色, completed=绿色, failed=红色, cancelled=灰色
- [ ] 点击卡片导航到 `/board/:projectId`
- [ ] 删除按钮（`@click.stop` 阻止导航）+ Element Plus 确认弹窗
- [ ] Emit: `delete(projectId)`

### 2.2 创建 `src/views/ProjectLibrary.vue`

- [ ] 页面标题 "项目库"
- [ ] 网格布局（响应式：2/3/4 列）
- [ ] 使用 `onMounted` 调用 `projectAPI.list()`
- [ ] 加载状态：Element Plus `el-skeleton` 骨架屏
- [ ] 空状态：插画 + "暂无项目，开始第一次视频生产吧" + 引导按钮
- [ ] 错误状态：错误信息 + 重试按钮
- [ ] 项目卡片列表 + 删除确认
- [ ] 注册 board:update 监听（如当前有运行中的项目，显示进度标记）

### 2.3 修改现有文件

- [ ] `router/index.js` 添加路由 `{ path: '/library', name: 'ProjectLibrary', component: () => import('../views/ProjectLibrary.vue') }`
- [ ] 导航菜单（App.vue 或 Sidebar）添加"项目库"入口，icon 使用 `el-icon-folder-opened`

### 2.4 单元测试

- [ ] `src/components/ProjectCard.test.js`
  - [ ] 渲染正确数据
  - [ ] 点击触发导航
  - [ ] 删除按钮弹出确认
- [ ] `src/views/ProjectLibrary.test.js`
  - [ ] 正常加载显示项目列表
  - [ ] 空状态显示
  - [ ] 加载状态显示
  - [ ] 错误状态 + 重试

---

## Task 3: 创建 BoardService 实时看板服务

### 3.1 创建 `electron/services/board-service.js`

- [ ] 实现 `constructor(pipelineEngine)` — 订阅 PipelineEngine 事件
  - [ ] `pipelineEngine.on('pipeline:start', this._onPipelineStart)`
  - [ ] `pipelineEngine.on('pipeline:complete', this._onPipelineComplete)`
  - [ ] `pipelineEngine.on('pipeline:fail', this._onPipelineFail)`
  - [ ] `pipelineEngine.on('stage:start', this._onStageStart)`
  - [ ] `pipelineEngine.on('stage:complete', this._onStageComplete)`
  - [ ] `pipelineEngine.on('stage:fail', this._onStageFail)`
  - [ ] `pipelineEngine.on('scene:queued', this._onSceneQueued)`
  - [ ] `pipelineEngine.on('scene:generating', this._onSceneGenerating)`
  - [ ] `pipelineEngine.on('scene:complete', this._onSceneComplete)`
  - [ ] `pipelineEngine.on('scene:fail', this._onSceneFail)`
  - [ ] `pipelineEngine.on('checkpoint:pause', this._onCheckpointPause)`
- [ ] 实现 `_subscribers: Map<string, Set<WebContents>>` — 按 projectId 管理的订阅者列表
- [ ] 实现 `subscribe(projectId, webContents)` — 添加订阅者
  - [ ] 调用 `buildBoardSnapshot(projectId)` 返回初始状态
  - [ ] 返回 `{ subscribed: true, initial: BoardState }`
- [ ] 实现 `unsubscribe(webContents)` — 移除订阅者（在所有 project 中查找）
- [ ] 实现 `getBoard(projectId)` — 返回当前看板快照
- [ ] 实现 `buildBoardSnapshot(projectId)` — 构造 `BoardState`
  - [ ] 读取 ProjectService 获取项目元数据
  - [ ] 读取内部状态（stages, scenes, costs）
- [ ] 实现 `_pushToSubscribers(projectId)` — 向该项目的所有订阅者推送
  - [ ] 使用 `safeSend(webContents, 'board:update', { board })`
  - [ ] 节流：两次推送间隔 <200ms 时跳过
- [ ] 实现 `_getMainWindow()` — 获取主窗口的 WebContents
- [ ] 内部状态维护：
  - [ ] `_boards: Map<string, BoardState>` — 各项目的当前看板状态
  - [ ] `_lastPushTime: Map<string, number>` — 上次推送时间（用于节流）
- [ ] 清理：`destroy()` — 取消所有 PipelineEngine 订阅

### 3.2 创建 `electron/ipc-handlers/board.js`

- [ ] 注册 `board:subscribe` — 参数 `{ projectId }`，调用 boardService.subscribe()
- [ ] 注册 `board:unsubscribe` — 调用 boardService.unsubscribe(event.sender)
- [ ] 注册 `board:get` — 参数 `{ projectId }`，调用 boardService.getBoard()
- [ ] 导出 `registerBoardHandlers(ipcMain, container)`

### 3.3 创建 `electron/preload/board.js`

- [ ] 实现 `boardAPI.subscribe(projectId)` — invoke board:subscribe
- [ ] 实现 `boardAPI.unsubscribe()` — invoke board:unsubscribe
- [ ] 实现 `boardAPI.get(projectId)` — invoke board:get
- [ ] 实现 `boardAPI.onUpdate(callback)` — 注册 board:update 的 IPC 监听
  - [ ] 使用 `ipcRenderer.on('board:update', ...)` 监听
  - [ ] 返回取消函数 `() => ipcRenderer.removeListener('board:update', handler)`

### 3.4 修改 `electron/services/pipeline-engine.js`

- [ ] constructor 中初始化 `this._eventListeners = new Map()`
- [ ] 实现 `on(event, callback)` — 注册监听器，返回取消函数
- [ ] 实现 `off(event, callback)` — 移除监听器
- [ ] 实现 `_emit(event, data)` — 发射事件
- [ ] 在以下方法中插入 `_emit` 调用：
  - `startPipeline()` → `_emit('pipeline:start', ...)`
  - `executeStage()` 开头 → `_emit('stage:start', ...)`
  - `executeStage()` 完成 → `_emit('stage:complete', ...)`
  - `executeStage()` catch → `_emit('stage:fail', ...)`
  - checkpoint 触发处 → `_emit('checkpoint:pause', ...)`
  - 场景生成各阶段 → `_emit('scene:queued'/'scene:generating'/'scene:complete'/'scene:fail')`

### 3.5 修改现有文件

- [ ] `container.setup.js` — 注册 `boardService`

### 3.6 单元测试

- [ ] `electron/tests/board-service.test.js`
  - [ ] 测试 subscribe 返回初始状态
  - [ ] 测试 unsubscribe 移除订阅者
  - [ ] 测试 PipelineEngine 事件触发推送（mock engine）
  - [ ] 测试节流机制（200ms 内多次事件只推送一次）
  - [ ] 测试 safeSend 窗口已关闭不报错

---

## Task 4: 创建实时看板 UI

### 4.1 创建 `src/components/BoardStageIndicator.vue`

- [ ] Props: `stages: StageInfo[]`, `currentIndex: number`
- [ ] 水平步骤条布局
- [ ] 各步骤状态样式：completed=绿色✓, running=蓝色脉冲动画, pending=灰色○, failed=红色✕
- [ ] 步骤间连接线，已完成变绿色
- [ ] 当前步骤名称加粗 + 下箭头指示
- [ ] 步骤名映射友好中文标签（script→脚本, storyboard→分镜, assets→素材, edit→剪辑, render→渲染）

### 4.2 创建 `src/components/SceneCard.vue`

- [ ] Props: `scene: Scene`
- [ ] 卡片布局：
  - 头部：场景序号 + 状态徽标
  - 中部：场景名称 + 生成 prompt（截断）
  - 中部：take 缩略图预览（最多 3 张，用 `v-for` + `:src`）
  - 底部：供应商名 + 成本 + 质量评分
- [ ] 状态颜色映射同 ProjectCard
- [ ] 点击触发 `$emit('select', scene.id)`
- [ ] 场景状态徽标文字：QUEUED→队列中, GENERATING→生成中, AWAITING→待审批, APPROVED→已批准, REJECTED→已驳回, COMPLETED→已完成, FAILED→失败

### 4.3 创建 `src/views/ProductionBoard.vue`

- [ ] Route params: `projectId`
- [ ] 页面布局：
  - 顶部：项目名称 + 总成本 + 已耗时 + "返回项目库" 链接
  - 第二行：BoardStageIndicator
  - 中间：SceneCard 网格（2列或3列）
  - 右侧（桌面宽屏）：信息面板 — 当前操作描述、最新事件日志
  - 底部（如已完成）："查看回放" 按钮
- [ ] `onMounted`：
  - 调用 `boardAPI.subscribe(projectId)` 获取初始状态
  - 调用 `boardAPI.onUpdate(callback)` 注册实时更新
  - 注册 `approval:request` 监听
- [ ] `onBeforeUnmount`：
  - 调用 `boardAPI.unsubscribe()`
  - 取消所有监听器
- [ ] 实时更新时，可用 `vue-transition` 或 Element Plus 动画让卡片状态切换有过渡效果
- [ ] 场景卡片点击 → 导航到 `/board/:projectId/contact-sheet`

### 4.4 修改现有文件

- [ ] `router/index.js` 添加路由 `{ path: '/board/:projectId', name: 'ProductionBoard', component: () => import('../views/ProductionBoard.vue') }`
- [ ] `src/stores/backlot.js` — 创建 Pinia store（如果还没创建）

### 4.5 单元测试

- [ ] `BoardStageIndicator.test.js`
  - [ ] 正确渲染步骤数
  - [ ] 当前步骤高亮
  - [ ] 完成/失败步骤样式正确
- [ ] `SceneCard.test.js`
  - [ ] 渲染场景数据
  - [ ] 所有状态徽标
  - [ ] 缩略图预览
- [ ] `ProductionBoard.test.js`
  - [ ] 渲染看板布局
  - [ ] 订阅/取消订阅生命周期
  - [ ] 模拟 board:update 正确更新 UI

---

## Task 5: 创建 ContactSheet 审批服务

### 5.1 创建 `electron/services/contact-sheet-service.js`

- [ ] 实现 `constructor(boardService, pipelineEngine)`
- [ ] 实现 `getContactSheet(projectId)` — 获取项目的所有场景审批数据
  - [ ] 返回 `Scene[]`（包含 takes）
- [ ] 实现 `approveScene(sceneId, selectedTakeId)` — 批准场景
  - [ ] 更新场景状态为 APPROVED
  - [ ] 记录 selectedTakeId
  - [ ] 通知 boardService 推送更新
  - [ ] 如果所有场景都已审批/完成，通知 pipelineEngine 继续下一阶段
  - [ ] 返回 `{ approved: true, scene }`
- [ ] 实现 `rejectScene(sceneId, feedback)` — 驳回场景
  - [ ] 更新场景状态为 REJECTED
  - [ ] 记录 feedback
  - [ ] 通知 pipelineEngine 重新生成该场景（调用 scene retry 逻辑）
  - [ ] 场景重新 QUEUED
  - [ ] 返回 `{ rejected: true, requeued: true }`
- [ ] 实现 `_onSceneComplete(eventData)` — 监听 PipelineEngine 的 scene:complete
  - [ ] 提取 takes 数据
  - [ ] 设置场景状态为 AWAITING
  - [ ]  通过 `safeSend` 推送 `approval:request` 到渲染进程
  - [ ] 更新 boardService 中的场景状态

### 5.2 创建 `electron/ipc-handlers/contact-sheet.js`

- [ ] 注册 `contact-sheet:list` — 参数 `{ projectId }`
- [ ] 注册 `contact-sheet:approve` — 参数 `{ sceneId, selectedTakeId }`
- [ ] 注册 `contact-sheet:reject` — 参数 `{ sceneId, feedback }`
- [ ] 导出 `registerContactSheetHandlers(ipcMain, container)`

### 5.3 修改现有文件

- [ ] `container.setup.js` — 注册 `contactSheetService`

### 5.4 单元测试

- [ ] `electron/tests/contact-sheet-service.test.js`
  - [ ] 测试 approveScene 更新状态
  - [ ] 测试 rejectScene 触发重新生成
  - [ ] 测试 _onSceneComplete 设置 AWAITING
  - [ ] 测试所有场景已审批时通知 pipelineEngine

---

## Task 6: 创建 Contact Sheet 审批 UI

### 6.1 创建 `src/views/ContactSheetView.vue`

- [ ] Route params: `projectId`
- [ ] 页面布局：
  - 顶部：项目名 + "场景审批" 标题 + 总进度（"3/5 已审批"）
  - 场景列表：每个场景一张大卡片
- [ ] 场景卡片内容：
  - 场景编号 + 名称 + 状态
  - 多张 take 缩略图（横向排列，可点击放大）
  - 每个 take 下方标注：prompt、成本、质量评分
  - 当前选中的 take 有蓝色边框标记
  - "批准此 take" 按钮
  - "驳回" 按钮 + 文本输入框
- [ ] 接收 `approval:request` IPC push（type === 'contact_sheet'）
- [ ] 自动滚动到最新待审批的场景
- [ ] 状态实时更新（board:update 同步刷新）

### 6.2 修改现有文件

- [ ] `router/index.js` 添加路由

### 6.3 单元测试

- [ ] `ContactSheetView.test.js`
  - [ ] 渲染场景列表
  - [ ] 批准流程
  - [ ] 驳回 + 反馈流程
  - [ ] IPC push 接收

---

## Task 7: 创建 ApprovalGate 审批门服务

### 7.1 创建 `electron/services/approval-gate-service.js`

- [ ] 实现 `constructor(boardService, pipelineEngine)`
- [ ] 实现 `getCurrentGate(projectId)` — 返回当前待处理的审批门
  - [ ] 读取内部 `_gates` 状态
  - [ ] 无待处理门时返回 `null`
- [ ] 实现 `approveGate(gateId, decision, modification)` — 处理审批决策
  - [ ] decision='approve'：设置 gate.status='approved'，调用 pipelineEngine.resume()
  - [ ] decision='modify'：设置 gate.status='modified' + modification，调用 pipelineEngine.resume({ modification })
  - [ ] 记录 resolvedAt
  - [ ] 通知 boardService 推送更新
- [ ] 实现 `_onCheckpointPause(eventData)` — 监听 PipelineEngine 的 checkpoint:pause
  - [ ] 根据 checkpointType 创建 ApprovalGate（script/storyboard/scene_assets）
  - [ ] 从 pipeline context 提取审批内容
  - [ ] 推送 `approval:request`（type='approval_gate'）到渲染进程
  - [ ] 更新 boardService 状态

### 7.2 创建 `electron/ipc-handlers/approval-gate.js`

- [ ] 注册 `approval-gate:get` — 参数 `{ projectId }`
- [ ] 注册 `approval-gate:approve` — 参数 `{ gateId, decision, modification? }`
- [ ] 导出 `registerApprovalGateHandlers`

### 7.3 修改现有文件

- [ ] `container.setup.js` — 注册 `approvalGateService`

### 7.4 单元测试

- [ ] `electron/tests/approval-gate-service.test.js`
  - [ ] 测试 approve（通过模式）
  - [ ] 测试 approveWithModify（修改模式）
  - [ ] 测试 _onCheckpointPause 创建 gate
  - [ ] 测试 gate 排队

---

## Task 8: 创建审批门 UI

### 8.1 创建 `src/components/ApprovalGateModal.vue`

- [ ] Props: `gate: ApprovalGate | null`
- [ ] 使用 `<Teleport to="body">` 渲染为全局模态框
- [ ] 模态框内容：
  - 标题（如"脚本审批"）+ 类型标签
  - "稍后处理" 按钮（最小化，不关闭，可重新打开）
  - 审批内容只读展示（`<pre>` 标签）
  - 上下文信息（供应商建议、成本预估等）
  - "通过" 按钮
  - "修改后继续" 区域（仅在 requiredDecision === 'approve_or_modify' 时显示）
    - `<textarea>` 输入修改意见
    - "修改后继续" 按钮（禁用直到输入内容）
- [ ] Emit: `approve(gateId)`, `approveWithModify(gateId, modification)`, `minimize()`
- [ ] 从 Pinia store 的 `pendingApprovals` 获取审批门数据
- [ ] 支持多审批门排队（右上角显示"还有 N 个待审批"）

### 8.2 创建 `src/stores/backlot.js`（Pinia Store）

- [ ] State: `{ projects, currentBoard, pendingApprovals, loading, error }`
- [ ] Actions:
  - `fetchProjects()` — `projectAPI.list()`
  - `openBoard(projectId)` — `boardAPI.subscribe()` + register board:update listener
  - `closeBoard()` — `boardAPI.unsubscribe()` + remove listeners
  - `approveScene(sceneId, takeId)` — invoke contact-sheet:approve
  - `rejectScene(sceneId, feedback)` — invoke contact-sheet:reject
  - `approveGate(gateId, decision, modification?)` — invoke approval-gate:approve
  - `fetchReplay(projectId)` — invoke replay:get
- [ ] IPC push listeners（store 初始化时注册，支持 singleton）：
  - `board:update` → 更新 `currentBoard`
  - `approval:request` → 追加到 `pendingApprovals`

### 8.3 单元测试

- [ ] `ApprovalGateModal.test.js`
  - [ ] 渲染审批内容
  - [ ] 通过按钮
  - [ ] 修改后继续 + 输入
  - [ ] 最小化
- [ ] `stores/backlot.test.js`
  - [ ] IPC 调用路径
  - [ ] push 监听器

---

## Task 9: 创建 ExecutionRecorder 生产回放服务

### 9.1 创建 `electron/services/execution-recorder.js`

- [ ] 实现 `constructor(projectService)`
- [ ] 实现 `startRecording(projectId)` — 创建录制会话
  - [ ] 创建 `projects/<id>/replay/` 目录
  - [ ] 打开 JSONL 文件流 `execution.jsonl`
  - [ ] 记录第一个 PIPELINE_START 事件
- [ ] 实现 `recordEvent(projectId, type, stageName, data)` — 记录事件
  - [ ] 构造 `ExecutionEvent`（含当前时间戳 + 看板快照）
  - [ ] 写入 JSONL（每行一个 JSON 对象）
  - [ ] 缓存最近 100 个事件在内存中
- [ ] 实现 `stopRecording(projectId)` — 关闭文件流
- [ ] 实现 `getReplay(projectId)` — 读取回放数据
  - [ ] 读取 `projects/<id>/replay/execution.jsonl`
  - [ ] 解析所有行
  - [ ] 返回 `{ project, events, totalDuration }`
- [ ] 自动订阅 PipelineEngine 所有事件 → 调用 `recordEvent()`

### 9.2 创建 `electron/ipc-handlers/replay.js`

- [ ] 注册 `replay:get` — 参数 `{ projectId }`
- [ ] 导出 `registerReplayHandlers`

### 9.3 创建 `electron/preload/replay.js`

- [ ] 实现 `replayAPI.get(projectId)` — invoke replay:get

### 9.4 修改现有文件

- [ ] `pipeline-engine.js` — 在事件 emit 处同时调用 recorder.recordEvent()
- [ ] `container.setup.js` — 注册 executionRecorder
- [ ] `preload/index.js` — 合并 replayAPI

### 9.5 单元测试

- [ ] `electron/tests/execution-recorder.test.js`
  - [ ] 测试录制事件写入 JSONL
  - [ ] 测试 getReplay 读取正确
  - [ ] 测试多事件录制后回放顺序
  - [ ] 测试无录制数据时返回空数组

---

## Task 10: 创建生产回放 UI

### 10.1 创建 `src/views/ReplayTimeline.vue`

- [ ] Route params: `projectId`
- [ ] 页面布局：
  - 顶部：项目名称 + "生产回放" 标题 + 总耗时
  - 时间轴：水平可拖动的滑块
    - 时间轴上标注各阶段切换点（竖线 + 阶段名标签）
    - 背景色区分不同阶段
    - 滑块当前位置显示时间戳
  - 速度控制：1x / 2x / 4x 按钮
  - 播放/暂停 按钮
  - 快照面板（随滑块位置更新）：
    - 当时 BoardStageIndicator 的快照
    - 当时 SceneCard 列表的快照
    - 当时的成本数据
- [ ] 实现回放引擎（纯前端逻辑）：
  - 从 replay:get 获取 `events[]`
  - 根据当前时间索引展示对应的 event.snapshot
  - 播放模式：`setInterval` 按速度推进索引
  - 拖动模式：直接设置索引
- [ ] `onMounted` 加载回放数据
- [ ] 空状态：没有录制数据时显示"该生产无录制数据"

### 10.2 修改现有文件

- [ ] `router/index.js` 添加路由

### 10.3 单元测试

- [ ] `ReplayTimeline.test.js`
  - [ ] 加载回放数据
  - [ ] 时间线滑块拖动更新快照
  - [ ] 播放/暂停
  - [ ] 速度切换
  - [ ] 空状态

---

## Task 11: 创建 Pinia Store + Composable

### 11.1 创建 `src/stores/backlot.js`

- [ ] 使用 `defineStore('backlot', ...)` 定义
- [ ] State: `{ projects, currentBoard, pendingApprovals, loading, error, lastApprovalDismissed }`
- [ ] Getters: `{ runningProject, hasPendingApprovals, currentProject }`
- [ ] Actions（同任务 8.2 描述）
- [ ] IPC push 监听器在 store 的 `$onAction` 或外部 setup 中注册
  - 注意：Pinia store 在 SSR/测试中要处理好 IPC 监听的生命周期

### 11.2 创建 `src/composables/useBacklot.js`

- [ ] 封装常用逻辑：
  - `useProjectList()` — 加载项目列表 + 刷新
  - `useLiveBoard(projectId)` — 订阅看板 + 自动取消订阅
  - `useApprovalFlow()` — 审批流程通用逻辑（批准/驳回 + UI 状态）

---

## Task 12: E2E 集成测试

### 12.1 创建 `electron/tests/e2e-backlot-integration.test.js`

- [ ] 测试完整链路：
  - [ ] 创建项目 → project:list 返回新项目
  - [ ] 订阅看板 → board:update 覆盖到
  - [ ] 模拟 PipelineEngine 事件 → 看板更新推送
  - [ ] 场景进入 AWAITING → approval:request 推送
  - [ ] 批准场景 → 状态更新
  - [ ] ApprovalGate 触发 → 弹窗 → 批准
  - [ ] ExecutionRecorder 录制 → replay:get 返回完整数据

### 12.2 安全验证

- [ ] preload API 在 sandbox 模式下可用（mock sandbox 环境测试）
- [ ] IPC push 在多个窗口正常工作（mock 两个 webContents）
- [ ] 审批门停住时取消流水线能正确清理
- [ ] 回放数据不包含 API key 或其他敏感信息

---

# Task Dependencies

```
Task 1 (ProjectService) ────────────────────┐
                                            ├── Task 2 (ProjectLibrary UI)
Task 3 (BoardService + pipeline events) ────┤
    │                                        ├── Task 4 (ProductionBoard UI)
    ├── Task 5 (ContactSheet service) ───────┤
    │                                        ├── Task 6 (ContactSheet UI)
    ├── Task 7 (ApprovalGate service) ───────┤
    │                                        ├── Task 8 (ApprovalGate UI + Store)
    └── Task 9 (ExecutionRecorder) ──────────┤
                                             ├── Task 10 (Replay UI)
                                             │
Task 11 (Pinia Store + Composable) ──────────┤ 可并行于 Task 2/4/6/8/10
                                             │
Task 12 (E2E) ───────────────────────────────┘ 依赖所有前置
```

## 并行执行组

| 执行轮次 | 任务 | 说明 |
|----------|------|------|
| 第 1 轮 | Task 1, Task 3, Task 11 | 三个无依赖的服务层 + Store |
| 第 2 轮 | Task 2, Task 4, Task 5, Task 7, Task 9 | 两个 UI + 三个服务，相互独立 |
| 第 3 轮 | Task 6, Task 8, Task 10 | 三个 UI 依赖对应服务 |
| 第 4 轮 | Task 12 | 所有任务完成后执行 |