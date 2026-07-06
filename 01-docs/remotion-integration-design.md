# Remotion 合成能力接入 Multi-Publish — 技术设计方案

## 1. 背景与目标

**现状：** 视频合成走 ECS 服务端（orchestrator pipeline），串行排队，4G 内存吃紧。
**目标：** 把 Remotion 视频合成能力搬到 Multi-Publish 桌面客户端（Electron），利用用户本地算力，零 ECS 开销，不排队。

## 2. 架构概览

```
┌──────────────────────────────────────────────────────┐
│                  Multi-Publish (Electron)              │
│                                                       │
│  ┌──────────────────────────────────────────┐         │
│  │         Vue 3 渲染进程                     │         │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────┐  │         │
│  │  │ Publish  │ │ 创作页面  │ │ 结果页   │  │         │
│  │  │ (已有)   │ │ 🆕新增   │ │ 🆕新增  │  │         │
│  │  └──────────┘ └──────────┘ └─────────┘  │         │
│  └──────────────┬───────────────────────────┘         │
│                 │ IPC (preload.js)                     │
│  ┌──────────────▼───────────────────────────┐         │
│  │         Electron 主进程                    │         │
│  │                                           │         │
│  │  ┌──────────────────┐  ┌──────────────┐  │         │
│  │  │ RenderEngine     │  │ TaskQueue    │  │         │
│  │  │ 🆕 新增          │  │ (已有)       │  │         │
│  │  │  ├─ 接收创作数据  │  │  ├─ 排队渲染  │  │         │
│  │  │  ├─ 生成 props   │  │  ├─ 并发控制  │  │         │
│  │  │  ├─ spawn 子进程  │  │  └─ 进度推送  │  │         │
│  │  │  └─ 返回视频路径  │  │              │  │         │
│  │  └──────────────────┘  └──────────────┘  │         │
│  └───────────────────────────────────────────┘         │
│                          │                             │
│                          ▼                             │
│  ┌──────────────────────────────────────────┐         │
│  │  remotion-composer/ (Node.js 项目)        │         │
│  │  🆕 复制自 OpenMontage                     │         │
│  │                                           │         │
│  │  npx remotion render src/index.tsx        │         │
│  │    Explainer output.mp4 --props=data.json │         │
│  │                                           │         │
│  │  ├── Explainer.tsx     (主合成)           │         │
│  │  ├── TextCard.tsx      (文字卡)           │         │
│  │  ├── TerminalScene.tsx (终端动画)         │         │
│  │  ├── AnimeScene.tsx    (动漫场景)         │         │
│  │  ├── CaptionOverlay.tsx(字幕)            │         │
│  │  ├── charts/           (4 种图表)         │         │
│  │  └── ...               (共 15+ 组件)      │         │
│  └──────────────────────────────────────────┘         │
│                          │                             │
│                          ▼                             │
│                   ┌──────────────┐                     │
│                   │  output.mp4  │                     │
│                   └──────────────┘                     │
│                          │                             │
│                          ▼                             │
│              发布到平台 / 本地保存                        │
└──────────────────────────────────────────────────────┘
```

## 3. 新增/改造模块

### 3.1 RenderEngine — 核心渲染引擎（新建）

**位置：** `apps/desktop/electron/render-engine.js`

```
RenderEngine
  ├── render(props)         → 主入口
  │   ├── 校验输入参数
  │   ├── 生成 .remotion_props.json
  │   ├── spawn('npx', ['remotion', 'render', ...])
  │   ├── 定时读取 stdout 解析进度
  │   ├── 通过 IPC 推送进度到渲染进程
  │   └── 返回 { success, outputPath, durationS }
  │
  ├── createScenePlan(input)  → 从用户输入生成场景计划
  │   ├── text → { cuts: [{ type: 'text-card', text, duration }] }
  │   ├── gallery → { cuts: [{ type: 'anime-scene', images, effect }] }
  │   └── batch → { cuts: [...segments] }
  │
  ├── getStatus()             → 检查 Node.js / npx / 模块就绪
  ├── installDeps()           → 首次运行 npm install
  └── cancel()                → 终止当前渲染进程
```

**与 TaskQueue 集成：** 渲染任务通过 `TaskQueue.add()` 提交，利用现有的并发控制（maxConcurrent=3）机制。

**IPC 通道：**

| 方向 | 通道 | 用途 |
|------|------|------|
| 渲染进程→主进程 | `render:start` | 提交创作任务 |
| 渲染进程→主进程 | `render:cancel` | 取消渲染 |
| 主进程→渲染进程 | `render:progress` | 进度推送（百分比+当前阶段） |
| 主进程→渲染进程 | `render:complete` | 渲染完成（返回视频路径） |
| 主进程→渲染进程 | `render:error` | 渲染失败（返回错误信息） |

### 3.2 preload.js — IPC 桥接（改造）

新增暴露：

```javascript
renderStart: (data) => ipcRenderer.invoke('render:start', data),
renderCancel: () => ipcRenderer.invoke('render:cancel'),
onRenderProgress: (callback) => {
  const handler = (e, data) => callback(data);
  ipcRenderer.on('render:progress', handler);
  return () => ipcRenderer.removeListener('render:progress', handler);
},
onRenderComplete: (callback) => ipcRenderer.on('render:complete', callback),
onRenderError: (callback) => ipcRenderer.on('render:error', callback),
```

### 3.3 remotion-composer/ — 复制自 OpenMontage（新建）

**位置：** `packages/remotion-composer/`

直接从 OpenMontage 复制 `remotion-composer/` 目录，保留所有组件。后续按需裁剪。

**初始化脚本：** 安装依赖 `cd packages/remotion-composer && npm install`

### 3.4 创作页面 — Vue 前端（新建）

**路由：** `/create`

**页面结构：**

```
CreatePage.vue
  ├── ModeSelector          (创作模式选择：文字→视频 / 图片轮播 / 分段视频)
  ├── TextInput.vue         (文案输入区 + AI 写稿按钮)
  ├── ImageGallery.vue      (图片管理+排序+重生成)
  ├── AudioUpload.vue       (背景音乐/配音)
  ├── TemplatePicker.vue    (主题/模板选择)
  ├── PreviewDialog.vue     (提交前预览)
  └── ProgressTracker.vue   (渲染进度追踪)
```

**数据流：**

```
用户操作 → Vue 组件收集参数
  → IPC render:start { mode, text, images, audio, theme }
  → RenderEngine.createScenePlan() → Remotion props JSON
  → npx remotion render ... → output.mp4
  → IPC render:progress (每 5% 推一次)
  → IPC render:complete → 打开结果页
```

### 3.5 结果页面 — Vue 前端（新建）

**路由：** `/result/:taskId`

```
ResultPage.vue
  ├── VideoPlayer.vue       (视频预览播放)
  ├── VideoInfo.vue         (分辨率/时长/格式)
  ├── DownloadButton.vue    (下载到本地)
  └── PublishButton.vue     (直接发布到平台—调用现有发布流程)
```

## 4. 与现有系统的集成

### 4.1 复用 TaskQueue

现有的 `TaskQueue`（`packages/shared-utils/src/task-queue.js`）直接可用：

```javascript
const taskQueue = new TaskQueue({ maxConcurrent: 1 });

// 渲染任务入队
taskQueue.add({
  type: 'remotion_render',
  executor: async (task) => {
    return await renderEngine.render(task.data);
  },
  data: { mode, text, images, audio, theme },
  timeout: 600000, // 10 分钟超时
});
```

### 4.2 复用发布流程

渲染完成后，视频文件可直接接入现有发布流程：

```javascript
// 结果页 → 发布
const videoPath = 'C:/.../output.mp4';
electronAPI.publishWechat({
  title: '我的视频',
  filePath: videoPath,
  // ... 其他发布参数
});
```

### 4.3 复用 Electron 子进程管理

参考 `python-bridge.js` 的模式管理 Remotion 进程：

```javascript
const child = spawn('npx', ['remotion', 'render', ...], {
  cwd: remotionComposerDir,
  shell: true,
  windowsHide: true,
});

child.stdout.on('data', (data) => {
  // 解析 Remotion 输出中的进度信息
  // "Rendered frame 45/900" → 5%
  parseProgress(data.toString());
});

child.on('close', (code) => {
  if (code === 0) handleSuccess();
  else handleError(`Exit code: ${code}`);
});
```

## 5. 实施步骤（TDD 顺序）

### Step 1: 复制 remotion-composer + 安装验证

```
1. cp -r OpenMontage/remotion-composer packages/remotion-composer
2. cd packages/remotion-composer && npm install
3. npx remotion render src/index.tsx Explainer out/test.mp4 --props=test-props.json
   → 验证能渲染出视频
```

**测试：** `test/remotion-basic.test.js` — 验证 CLI 可用、能渲染出 MP4

### Step 2: RenderEngine 主进程模块

```
1. 创建 electron/render-engine.js
2. 实现 render(props) → spawn npx remotion render
3. 实现进度解析（解析 stdout 帧计数）
4. 实现 IPC 通信
```

**测试：** `test/render-engine.test.js` — mock spawn，验证 IPC 消息格式、进度解析、错误处理

### Step 3: preload.js 桥接 + IPC handler

```
1. preload.js 添加 renderStart / renderCancel / onRenderProgress
2. main.js 添加 ipcMain.handle('render:start')
3. 接入 TaskQueue
```

### Step 4: 创作页面（Vue 前端）

```
1. CreatePage.vue — 模式选择 + 文案输入
2. ImageGallery.vue — 图片管理（复用 Story2Video GalleryPage 思路）
3. TemplatePicker.vue — 主题选择
4. ProgressTracker.vue — 进度条
```

**测试：** 组件测试（vitest），验证各状态渲染

### Step 5: 结果页面（Vue 前端）

```
1. ResultPage.vue — 视频预览 + 下载 + 发布入口
```

### Step 6: 路由注册 + 导航

```
1. router/index.js 添加 /create 和 /result/:taskId
2. 侧边栏添加"创作"入口
```

### Step 7: 端到端验证

```
1. 启动桌面客户端
2. 输入文案 → 选择主题 → 开始渲染
3. 看到进度 → 渲染完成 → 预览视频 → 发布到平台
```

## 6. 边界情况

| 场景 | 处理方式 |
|------|---------|
| Node.js 未安装 | RenderEngine.getStatus() 返回不可用，引导用户安装 |
| 首次运行 npm install | 自动执行，显示进度 |
| 渲染超时 | TaskQueue timeout=600s，超时后自动取消 |
| 渲染失败 | 通过 IPC render:error 推送错误详情 |
| 用户关闭窗口 | 主进程监听 `before-quit`，终止子进程 |
| 并发渲染 | TaskQueue maxConcurrent=1，串行渲染 |
| 大视频（>10min） | 太长的视频切成多段分别渲染，最后拼接 |

## 7. 排除项

- ❌ 不改造现有发布流程
- ❌ 不迁移 Story2Video 前端页面到统一前端（留到以后）
- ❌ 不修改 OpenMontage 组件源码（直接复制使用）
- ❌ 不引入 TypeScript（Multi-Publish 用纯 JS）

## 8. 验收标准

1. 用户可在桌面客户端完成"输入文案 → 渲染视频 → 预览 → 发布"全流程
2. 渲染进度实时显示（每 5% 更新一次）
3. 渲染完成后视频可本地播放
4. 渲染过程中可取消
5. Node.js 未安装时有明确引导
6. 所有组件覆盖 loading/error/empty 三态
7. 测试通过（单元测试 + 集成测试）
