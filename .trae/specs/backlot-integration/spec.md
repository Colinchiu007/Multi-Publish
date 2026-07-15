# Backlot 实时生产看板集成 Spec（v2 深度版）

## Why

项目已整合 OpenMontage 的视频合成能力（remotion-composer + story2video-engine），拥有完整的 PipelineEngine 流水线编排引擎（状态机、checkpoint 断点、stage 执行），并通过 12 个 YAML 流水线定义预置了 `human_approval_default: true` / `checkpoint_required: true` 审批标记。

但 **缺少 OpenMontage 最核心的产品层能力——Backlot 实时生产看板**。当前流水线完全在后台静默运行，用户无法看到：
- 生产进度和阶段状态
- 每个场景的素材生成状态
- 成本和供应商选择
- 审批卡点

这导致视频生产流程对用户像"黑箱"，无法在生产过程中进行人工干预和质量控制。

---

## 1. 新增功能总览（5 大模块）

| 模块 | 优先级 | 估算 | 说明 |
|------|--------|------|------|
| **项目库** | P0 | 1 天 | 浏览本地所有生产项目，CRUD 操作 |
| **实时生产看板** | P1 | 2 天 | 流水线运行时自动更新的直播看板 |
| **Contact Sheet 审批** | P2 | 2-3 天 | 逐场景素材审批（take/prompt/成本/质量） |
| **脚本审批门** | P3 | 1-2 天 | creative gate 等待人工回复 |
| **生产回放** | P4 | 2-3 天 | 基于时间戳回放整次生产 |

---

## 2. 数据模型设计

### 2.1 Project（项目）

```typescript
interface Project {
  id: string                    // UUID v4，作为目录名
  name: string                  // 用户可读名称
  pipelineType: string          // 流水线类型标识，如 'animated-explainer'
  status: ProjectStatus         // 当前状态
  createdAt: string             // ISO 8601
  updatedAt: string             // ISO 8601
  lastRunAt: string | null      // 最后一次运行时间
  thumbnailPath: string | null  // 缩略图路径（相对于 project dir）
  summary: string               // 项目简介
  totalCost: number             // 累计成本（美元）
  stages: StageInfo[]           // 流水线阶段信息
  metadata: Record<string, any> // 扩展字段
}

enum ProjectStatus {
  DRAFT       = 'draft',        // 刚创建，未运行
  RUNNING     = 'running',      // 正在生产
  PAUSED      = 'paused',       // 因审批卡点暂停
  COMPLETED   = 'completed',    // 生产完成
  FAILED      = 'failed',       // 生产失败
  CANCELLED   = 'cancelled',    // 用户取消
}

interface StageInfo {
  name: string                  // 阶段名，如 'script', 'storyboard', 'assets', 'edit', 'render'
  status: StageStatus           // 阶段状态
  startedAt: string | null      // 开始时间
  completedAt: string | null    // 完成时间
  duration: number              // 耗时（秒）
  cost: number                  // 该阶段成本
  error: string | null          // 错误信息
}

enum StageStatus {
  PENDING   = 'pending',        // 等待中
  RUNNING   = 'running',        // 执行中
  COMPLETED = 'completed',      // 已完成
  FAILED    = 'failed',         // 失败
  SKIPPED   = 'skipped',        // 跳过
}
```

### 2.2 Scene（场景）

```typescript
interface Scene {
  id: string                    // UUID
  projectId: string             // 所属项目
  index: number                 // 场景序号
  name: string                  // 场景名称
  description: string           // 场景描述
  status: SceneStatus           // 当前状态
  prompt: string                // 生成 prompt
  provider: string              // 供应商，如 'flux', 'veo', 'kling'
  estimatedCost: number         // 预估成本
  actualCost: number            // 实际成本
  qualityScore: number          // 质量评分（0-100）
  takes: Take[]                 // 生成的候选素材
  selectedTakeId: string | null // 用户选择的 take
  feedback: string | null       // 用户驳回反馈
  assetPath: string | null      // 最终素材路径
  createdAt: string
  updatedAt: string
}

enum SceneStatus {
  QUEUED      = 'queued',       // 排队中
  GENERATING  = 'generating',   // 生成中
  AWAITING    = 'awaiting',     // 等待审批
  APPROVED    = 'approved',     // 已批准
  REJECTED    = 'rejected',     // 已驳回（将重新生成）
  COMPLETED   = 'completed',    // 已完成
  FAILED      = 'failed',       // 失败
}

interface Take {
  id: string                    // UUID
  sceneId: string
  index: number                 // take 序号
  thumbnailPath: string         // 缩略图路径
  fullPath: string              // 完整素材路径
  prompt: string                // 该 take 使用的 prompt
  cost: number                  // 该 take 的成本
  qualityScore: number          // 质量评分
  width: number                 // 宽度（px）
  height: number                // 高度（px）
  duration: number              // 时长（秒，仅视频）
  provider: string              // 供应商
  model: string                 // 模型名
  createdAt: string
}
```

### 2.3 BoardState（看板状态）

```typescript
interface BoardState {
  projectId: string
  projectName: string
  status: ProjectStatus
  currentStageIndex: number
  stages: StageInfo[]
  scenes: Scene[]               // 仅当前 run 的场景快照
  totalEstimatedCost: number
  totalActualCost: number
  currentOperation: string      // 当前正在执行的操作描述
  startedAt: string
  elapsed: number               // 已耗时（秒）
  updatedAt: string
}
```

### 2.4 ApprovalGate（审批门）

```typescript
interface ApprovalGate {
  id: string
  projectId: string
  type: 'script' | 'storyboard' | 'scene_assets'
  status: 'pending' | 'approved' | 'modified'
  title: string                 // 审批门标题
  content: string               // 待审批内容（脚本全文 / 分镜描述 / 场景清单）
  context: Record<string, any>  // 上下文数据（供应商建议、成本预估等）
  requiredDecision: 'approve_only' | 'approve_or_modify'
  modification: string | null   // 用户修改意见
  createdAt: string
  resolvedAt: string | null
}
```

### 2.5 ExecutionEvent（回放事件）

```typescript
interface ExecutionEvent {
  id: string
  projectId: string
  timestamp: string             // ISO 8601
  type: ExecutionEventType      // 事件类型
  stageName: string             // 所属阶段
  data: Record<string, any>     // 事件载荷（当时的状态快照）
  snapshot: BoardState          // 事件发生时的看板全量快照
}

enum ExecutionEventType {
  PIPELINE_START     = 'pipeline:start',
  PIPELINE_COMPLETE  = 'pipeline:complete',
  PIPELINE_FAIL      = 'pipeline:fail',
  STAGE_START        = 'stage:start',
  STAGE_COMPLETE     = 'stage:complete',
  STAGE_FAIL         = 'stage:fail',
  SCENE_QUEUED       = 'scene:queued',
  SCENE_GENERATING   = 'scene:generating',
  SCENE_COMPLETE     = 'scene:complete',
  SCENE_FAIL         = 'scene:fail',
  SCENE_APPROVED     = 'scene:approved',
  SCENE_REJECTED     = 'scene:rejected',
  GATE_TRIGGERED     = 'gate:triggered',
  GATE_RESOLVED      = 'gate:resolved',
  COST_UPDATED       = 'cost:updated',
}
```

---

## 3. 状态机设计

### 3.1 PipelineEngine 事件发射合约

PipelineEngine 需在以下关键节点发射事件（新增代码量约 15 行）：

```
pipeline:start    → { projectId, pipelineType, stages[] }
stage:start       → { projectId, stageName, stageIndex }
stage:complete    → { projectId, stageName, result }
stage:fail        → { projectId, stageName, error }
scene:queued      → { projectId, sceneId, sceneIndex, prompt }
scene:generating  → { projectId, sceneId, provider, model, cost }
scene:complete    → { projectId, sceneId, takes[] }
scene:fail        → { projectId, sceneId, error }
pipeline:complete → { projectId, outputPath, totalCost, totalDuration }
pipeline:fail     → { projectId, error }
checkpoint:pause  → { projectId, stageName, checkpointType }
```

**实现方式**：在 pipeline-engine.js 中现有各方法末尾或关键位置调用

```javascript
// pipeline-engine.js 中新增
constructor() {
  this._eventListeners = new Map()
}

on(event, callback) {
  if (!this._eventListeners.has(event)) {
    this._eventListeners.set(event, [])
  }
  this._eventListeners.get(event).push(callback)
  return () => this.off(event, callback)  // 返回取消订阅函数
}

off(event, callback) {
  const listeners = this._eventListeners.get(event)
  if (listeners) {
    const idx = listeners.indexOf(callback)
    if (idx !== -1) listeners.splice(idx, 1)
  }
}

_emit(event, data) {
  const listeners = this._eventListeners.get(event)
  if (listeners) {
    for (const cb of listeners) {
      try { cb(data) } catch (e) { /* 单个 listener 失败不影响其他 */ }
    }
  }
}
```

### 3.2 BoardService 流式推送状态机

```
BoardService (main process)
  │
  ├── listen → PipelineEngine events
  │     │
  │     ▼
  ├── buildBoardSnapshot(projectId) → BoardState
  │     │
  │     ▼
  ├── pushToSubscribers(boardState)
  │     │
  │     ▼
  └── IPC: mainWindow.webContents.send('board:update', boardState)
```

### 3.3 ContactSheet 审批状态机

```
SceneStatus.QUEUED
  │  (scene:generating)
  ▼
SceneStatus.GENERATING
  │  (scene:complete → 收集 takes)
  ▼
SceneStatus.AWAITING
  │  IPC push approval:request → ContactSheetView 显示
  │
  ├── 用户点"批准" → contact-sheet:approve
  │     ▼
  │   SceneStatus.APPROVED → PipelineEngine.resume()
  │
  └── 用户点"驳回" + 反馈 → contact-sheet:reject
        ▼
      SceneStatus.REJECTED → 重新 QUEUED（重新生成）
```

### 3.4 ApprovalGate 审批门状态机

```
流水线执行 → checkpoint_required: true 的 stage
  │
  ▼
ApprovalGateService 拦截
  │  创建 ApprovalGate { status: 'pending' }
  │  IPC push approval:request → 渲染进程
  ▼
ApprovalGate 等待中
  │
  ├── 用户点"通过" → approval-gate:approve { decision: 'approve' }
  │     ▼
  │   ApprovalGate.status = 'approved'
  │   PipelineEngine.resume()
  │
  └── 用户点"修改后继续" + 反馈 → approval-gate:approve { decision: 'modify', modification: '...' }
        ▼
      ApprovalGate.status = 'modified'
      PipelineEngine.resume({ modification })
```

---

## 4. IPC 协议规范

### 4.1 invoke（渲染进程 → 主进程）

所有请求统一返回格式：`{ code: number, data: any, message?: string }`
- `code: 0` = 成功
- `code: >0` = 错误码（复用现有 EC 错误码系统）

#### project:list

```typescript
// Request: 无参数
// Response:
{
  code: 0,
  data: Project[]
}
```

#### project:get

```typescript
// Request: { projectId: string }
// Response:
{
  code: 0,
  data: Project
}
// Error:
{ code: EC.NOT_FOUND, message: 'Project not found' }
```

#### project:delete

```typescript
// Request: { projectId: string }
// Response:
{ code: 0, data: { deleted: true } }
```

#### board:subscribe

```typescript
// Request: { projectId: string }
// Response:
{ code: 0, data: { subscribed: true, initial: BoardState } }
```

#### board:unsubscribe

```typescript
// Request: {}  // 当前 webContents 取消订阅
// Response:
{ code: 0, data: { unsubscribed: true } }
```

#### board:get

```typescript
// Request: { projectId: string }
// Response:
{ code: 0, data: BoardState }
```

#### contact-sheet:list

```typescript
// Request: { projectId: string }
// Response:
{ code: 0, data: Scene[] }  // 所有待审批 + 已审批的场景
```

#### contact-sheet:approve

```typescript
// Request: { sceneId: string, selectedTakeId: string }
// Response:
{ code: 0, data: { approved: true, scene: Scene } }
```

#### contact-sheet:reject

```typescript
// Request: { sceneId: string, feedback: string }
// Response:
{ code: 0, data: { rejected: true, requeued: true } }
```

#### approval-gate:get

```typescript
// Request: { projectId: string }
// Response:
{ code: 0, data: ApprovalGate | null }  // null = 无待处理审批门
```

#### approval-gate:approve

```typescript
// Request:
{
  gateId: string,
  decision: 'approve' | 'modify',
  modification?: string    // modify 模式必填
}
// Response:
{ code: 0, data: { resolved: true, nextStage: string } }
```

#### replay:get

```typescript
// Request: { projectId: string }
// Response:
{
  code: 0,
  data: {
    project: Project,
    events: ExecutionEvent[],
    totalDuration: number    // 总耗时（秒）
  }
}
```

### 4.2 push（主进程 → 渲染进程）

#### board:update

```typescript
// 推送时机：任何 PipelineEngine 事件发生时
// 通道名: 'board:update'
// Payload:
{
  board: BoardState
}
```

#### approval:request

```typescript
// 推送时机：
//   1. ContactSheet 场景进入 AWAITING 状态
//   2. ApprovalGate 被触发
// 通道名: 'approval:request'
// Payload:
{
  type: 'contact_sheet' | 'approval_gate',
  projectId: string,
  data: ContactSheetRequest | ApprovalGateRequest
}

interface ContactSheetRequest {
  scenes: Scene[]               // 待审批的场景
}

interface ApprovalGateRequest {
  gate: ApprovalGate
}
```

---

## 5. Preload API 规范

### 5.1 projectAPI

```typescript
// electron/preload/project.js
// 暴露到 window.electronAPI.project

interface ProjectAPI {
  list(): Promise<Project[]>
  get(projectId: string): Promise<Project>
  del(projectId: string): Promise<{ deleted: boolean }>
}

// 实现
contextBridge.exposeInMainWorld('electronAPI', {
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    get: (id) => ipcRenderer.invoke('project:get', { projectId: id }),
    del: (id) => ipcRenderer.invoke('project:delete', { projectId: id }),
  },
  // ...
})
```

### 5.2 boardAPI

```typescript
// electron/preload/board.js

interface BoardAPI {
  subscribe(projectId: string): Promise<BoardState>
  unsubscribe(): Promise<void>
  get(projectId: string): Promise<BoardState>
  onUpdate(callback: (board: BoardState) => void): () => void  // 返回取消函数
}

// 实现
const updateListeners = new Set<Function>()
ipcRenderer.on('board:update', (_event, { board }) => {
  for (const cb of updateListeners) cb(board)
})

return {
  subscribe: (id) => ipcRenderer.invoke('board:subscribe', { projectId: id }),
  unsubscribe: () => ipcRenderer.invoke('board:unsubscribe'),
  get: (id) => ipcRenderer.invoke('board:get', { projectId: id }),
  onUpdate: (cb) => {
    updateListeners.add(cb)
    return () => updateListeners.delete(cb)
  },
}
```

### 5.3 replayAPI

```typescript
// electron/preload/replay.js

interface ReplayAPI {
  get(projectId: string): Promise<ReplayData>
}

// 同上模式
```

---

## 6. Vue 组件 API 规范

### 6.1 ProjectCard.vue

```vue
<template>
  <div class="project-card" @click="$router.push(`/board/${project.id}`)">
    <img v-if="project.thumbnailPath" :src="thumbnailSrc" />
    <div class="placeholder" v-else />
    <div class="info">
      <h3>{{ project.name }}</h3>
      <span class="status-badge" :class="project.status">{{ statusLabel }}</span>
      <p class="pipeline-type">{{ pipelineTypeLabel }}</p>
      <p class="time">{{ formatTime(project.updatedAt) }}</p>
      <p class="cost">${{ project.totalCost.toFixed(2) }}</p>
    </div>
    <button class="delete-btn" @click.stop="handleDelete" />
  </div>
</template>

<script setup>
// Props
interface Props {
  project: Project
}
const props = defineProps<Props>()

// Events
const emit = defineEmits<{
  delete: [projectId: string]
}>()
</script>
```

### 6.2 BoardStageIndicator.vue

```vue
<template>
  <div class="board-stage-indicator">
    <div v-for="(stage, i) in stages" :key="stage.name"
         class="stage-step"
         :class="{
           'completed': stage.status === 'completed',
           'running': stage.status === 'running',
           'pending': stage.status === 'pending',
           'failed': stage.status === 'failed',
         }">
      <div class="step-dot" />
      <div class="step-label">{{ stageLabel(stage.name) }}</div>
      <div class="step-duration" v-if="stage.duration">{{ stage.duration }}s</div>
    </div>
  </div>
</template>

<script setup>
interface Props {
  stages: StageInfo[]
  currentIndex: number
}
const props = defineProps<Props>()
</script>
```

### 6.3 SceneCard.vue

```vue
<template>
  <div class="scene-card" :class="`status-${scene.status}`"
       @click="$emit('select', scene.id)">
    <div class="scene-header">
      <span class="scene-index">#{{ scene.index }}</span>
      <span class="status-badge">{{ statusLabel }}</span>
    </div>
    <div class="scene-body">
      <p class="scene-name">{{ scene.name }}</p>
      <div class="takes-preview" v-if="scene.takes.length">
        <img v-for="take in scene.takes.slice(0, 3)" :key="take.id"
             :src="take.thumbnailPath" class="take-thumb" />
      </div>
    </div>
    <div class="scene-footer">
      <span class="provider">{{ scene.provider }}</span>
      <span class="cost">${{ scene.actualCost.toFixed(2) }}</span>
      <span class="quality" v-if="scene.qualityScore">{{ scene.qualityScore }}/100</span>
    </div>
  </div>
</template>

<script setup>
interface Props {
  scene: Scene
}
const props = defineProps<Props>()
const emit = defineEmits<{
  select: [sceneId: string]
}>()
</script>
```

### 6.4 ApprovalGateModal.vue

```vue
<template>
  <Teleport to="body">
    <div class="modal-overlay" v-if="visible" @click.self="minimize">
      <div class="modal-content">
        <div class="modal-header">
          <h2>{{ gate.title }}</h2>
          <span class="gate-type">{{ gate.typeLabel }}</span>
          <button class="minimize-btn" @click="minimize">稍后处理</button>
        </div>
        <div class="modal-body">
          <pre class="gate-content">{{ gate.content }}</pre>
          <div class="gate-context" v-if="gate.context">
            <h3>上下文信息</h3>
            <!-- 供应商建议、成本预估等 -->
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-approve" @click="approve">通过</button>
          <div class="modify-section" v-if="gate.requiredDecision === 'approve_or_modify'">
            <textarea v-model="modification" placeholder="输入修改意见..." />
            <button class="btn-modify" @click="approveWithModify" :disabled="!modification">
              修改后继续
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
interface Props {
  gate: ApprovalGate | null
}
const props = defineProps<Props>()

interface Emits {
  approve: [gateId: string]
  approveWithModify: [gateId: string, modification: string]
  minimize: []
}
const emit = defineEmits<Emits>()
</script>
```

---

## 7. 详细目录结构

```
apps/desktop/electron/
├── services/
│   ├── project-service.js          # 新增 — 项目 CRUD + 磁盘扫描
│   ├── board-service.js            # 新增 — 看板状态跟踪 + IPC 流推送
│   ├── contact-sheet-service.js    # 新增 — 逐场景审批流程
│   ├── approval-gate-service.js    # 新增 — checkpoint 审批编排
│   └── execution-recorder.js       # 新增 — 生产时间线录制
│
├── ipc-handlers/
│   ├── project.js                  # 新增 — 3 个通道
│   ├── board.js                    # 新增 — 3 + 1 push 通道
│   ├── contact-sheet.js            # 新增 — 3 + 1 push 通道
│   ├── approval-gate.js            # 新增 — 2 + 1 push 通道
│   └── replay.js                   # 新增 — 1 个通道
│
├── preload/
│   ├── project.js                  # 新增 — projectAPI
│   ├── board.js                    # 新增 — boardAPI
│   └── replay.js                   # 新增 — replayAPI
│
└── tests/
    ├── project-service.test.js     # 新增
    ├── board-service.test.js       # 新增
    ├── contact-sheet-service.test.js  # 新增
    ├── approval-gate-service.test.js  # 新增
    ├── execution-recorder.test.js     # 新增
    └── e2e-backlot-integration.test.js  # 新增

apps/desktop/src/
├── views/
│   ├── ProjectLibrary.vue          # 新增 — 项目库页面
│   ├── ProductionBoard.vue         # 新增 — 实时看板页面
│   ├── ContactSheetView.vue        # 新增 — 场景审批页面
│   └── ReplayTimeline.vue          # 新增 — 回放页面
│
├── components/
│   ├── ProjectCard.vue             # 新增 — 项目卡片
│   ├── SceneCard.vue               # 新增 — 场景卡片
│   ├── BoardStageIndicator.vue     # 新增 — 阶段指示器
│   └── ApprovalGateModal.vue       # 新增 — 审批门弹窗
│
├── stores/
│   └── backlot.js                  # 新增 — Pinia store（看板状态实时同步）
│
├── router/
│   └── index.js                    # 修改 — +4 条路由
│
└── composables/
    └── useBacklot.js               # 新增 — composition API 封装
```

---

## 8. Pinia Store 设计

```typescript
// src/stores/backlot.js

interface BacklotState {
  projects: Project[]               // 项目列表
  currentBoard: BoardState | null   // 当前看板
  pendingApprovals: (ContactSheetRequest | ApprovalGateRequest)[]  // 待处理审批
  loading: boolean
  error: string | null
}

// Actions
- fetchProjects(): Promise<void>           // 调用 project:list
- openBoard(projectId: string): Promise<void>  // 调用 board:subscribe, 注册 board:update listener
- closeBoard(): void                          // 调用 board:unsubscribe, 移除 listener
- approveScene(sceneId: string, takeId: string): Promise<void>
- rejectScene(sceneId: string, feedback: string): Promise<void>
- approveGate(gateId: string, decision, modification?): Promise<void>
- fetchReplay(projectId: string): Promise<ReplayData>
- deleteProject(projectId: string): Promise<void>

// IPC push listeners（在 store 初始化时注册）
- board:update → currentBoard 更新
- approval:request → pendingApprovals 追加，弹窗触发
```

---

## 9. 集成接入点（需修改的现有文件）

### 9.1 pipeline-engine.js（~15 行新增）

关键修改位置：

```
// 1. constructor 中初始化 _eventListeners
// 2. startPipeline() 末尾 _emit('pipeline:start', ...)
// 3. executeStage() 开头/末尾 _emit('stage:start'/'stage:complete')
// 4. executeStage() 的 catch 中 _emit('stage:fail', ...)
// 5. checkpoint 触发时 _emit('checkpoint:pause', ...)
// 6. 场景生成相关处 _emit('scene:queued'/'scene:generating'/'scene:complete'/'scene:fail')
// 7. pipeline 完成/失败处 _emit('pipeline:complete'/'pipeline:fail')
```

### 9.2 ipc-handlers/index.js（~5 行新增）

```javascript
// 新增 require
const registerProjectHandlers = require('./project')
const registerBoardHandlers = require('./board')
const registerContactSheetHandlers = require('./contact-sheet')
const registerApprovalGateHandlers = require('./approval-gate')
const registerReplayHandlers = require('./replay')

// 在 registerAllHandlers 中调用
registerProjectHandlers(ipcMain, container)
registerBoardHandlers(ipcMain, container)
registerContactSheetHandlers(ipcMain, container)
registerApprovalGateHandlers(ipcMain, container)
registerReplayHandlers(ipcMain, container)
```

### 9.3 preload/index.js（~5 行新增）

```javascript
// 新增
const projectAPI = require('./project')
const boardAPI = require('./board')
const replayAPI = require('./replay')

// 在 contextBridge 中合并
contextBridge.exposeInMainWorld('electronAPI', {
  ...existingAPI,
  ...projectAPI,
  ...boardAPI,
  ...replayAPI,
})
```

### 9.4 container.setup.js（~5 行新增）

```javascript
// 在 setupContainer 中注册
c.register('projectService', () => new ProjectService(c.get('store')))
c.register('boardService', () => new BoardService(c.get('pipelineEngine')))
c.register('contactSheetService', () => new ContactSheetService(c.get('boardService'), c.get('pipelineEngine')))
c.register('approvalGateService', () => new ApprovalGateService(c.get('boardService'), c.get('pipelineEngine')))
c.register('executionRecorder', () => new ExecutionRecorder(c.get('projectService')))
```

### 9.5 router/index.js（~4 条路由）

```javascript
{
  path: '/library',
  name: 'ProjectLibrary',
  component: () => import('../views/ProjectLibrary.vue')
},
{
  path: '/board/:projectId',
  name: 'ProductionBoard',
  component: () => import('../views/ProductionBoard.vue')
},
{
  path: '/board/:projectId/contact-sheet',
  name: 'ContactSheetView',
  component: () => import('../views/ContactSheetView.vue')
},
{
  path: '/replay/:projectId',
  name: 'ReplayTimeline',
  component: () => import('../views/ReplayTimeline.vue')
}
```

---

## 10. 错误处理策略

| 场景 | 主进程处理 | 渲染进程处理 |
|------|-----------|-------------|
| ProjectService 扫描目录失败 | 返回空列表，记录 warn 日志 | 显示空状态 + 重试按钮 |
| BoardService 订阅时项目不存在 | 返回 EC.NOT_FOUND | 显示"项目不存在" + 返回项目库 |
| IPC push 时窗口已关闭 | 静默移除订阅（safeSend 封装） | - |
| ContactSheet 审批时流水线已结束 | 返回 EC.PIPELINE_NOT_RUNNING | 显示"流水线已结束" |
| ApprovalGate 超时无响应 | 保持 pending，不自动通过 | - |
| ExecutionRecorder 写入失败 | 记录 error 日志，不阻断流水线 | 回放时显示"无录制数据" |
| ContactSheetView 驳回后重新生成失败 | 场景标记 FAILED，继续下一场景 | 显示失败状态 + 重试 |

**safeSend 封装**：

```javascript
// 主进程向渲染进程 push 的统一封装，防止窗口已关闭时报错
function safeSend(webContents, channel, data) {
  if (webContents && !webContents.isDestroyed()) {
    try {
      webContents.send(channel, data)
    } catch (e) {
      log.warn(`[BoardService] Failed to send ${channel}:`, e.message)
    }
  }
}
```

---

## 11. 性能考虑

| 关注点 | 方案 |
|--------|------|
| 看板更新频率 | PipelineEngine 事件驱动，不轮询。事件间隔 <100ms 时自动节流到 200ms 一次推送 |
| 回放数据大小 | 单次生产预计 200-500 个事件。JSONL 存储，每事件 ~2KB，总计 <1MB |
| 项目库扫描 | 初始化时扫描一次，后续增量更新。扫描 >50 项目时异步进行 |
| IPC push 内存 | 订阅者在 Vue 组件 beforeUnmount 时自动取消，防止泄漏 |
| ContactSheet 缩略图 | 缩略图路径使用相对路径，不加载原图。显示时延迟加载（lazy load） |
| ApprovalGateModal 优先级 | 使用 Teleport 渲染，不阻塞页面导航。多门排队按 FIFO 顺序显示 |

---

## 12. Non-Goals

- 不涉及 OpenMontage 的 Python backlot 模块移植（直接在 Electron 中实现）
- 不涉及流水线定义本身的修改（复用现有 YAML 定义中的 `human_approval_default` / `checkpoint_required`）
- 不涉及 AI 模型适配器修改
- 不涉及跨包依赖修改（所有变更在 apps/desktop 内）
- 不涉及 WebSocket 或更复杂的实时通信协议（复用现有 IPC push 机制）
- 不涉及多用户协作或后端服务（纯本地应用）