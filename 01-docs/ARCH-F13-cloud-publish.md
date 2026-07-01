# F13：云端发布模块 — 技术架构

> **版本**: v1
> **日期**: 2026-06-29
> **状态**: 设计完成

## 1. 背景

Multi-Publish 当前只有本地 RPA 发布路径（RpaViewManager + executeJavaScript），依赖桌面端 Chromium 和平台 Cookie。部分场景需要不依赖本地环境的发布方案。

**目标**: 在 Multi-Publish 内新增云端发布模块，用户可显式提交任务到 ECS orchestrator，由服务端执行发布。

## 2. 设计原则

1. **不侵扰现有流程** — 本地 RPA 发布页、PublishPoller 不动，云端是独立入口
2. **后端职责分离** — CloudPublisher 只负责通信层（HTTP ↔ orchestrator），不涉及 RPA
3. **状态轮询** — 任务提交后前端 polling 获取进度，复用 orchestrator 已有状态端点
4. **默认本地** — 不加 mode 字段的请求走 PublishPoller（向后兼容），cloud 模式由用户显式选择

## 3. 架构图

```
CloudPublish.vue (新页面)
  │
  ├── IPC: cloud-publisher:submit
  │   └── electron/cloud-publisher.js
  │       └── POST /api/jobs/publish-video { ..., mode: "cloud" }
  │           └── orchestrator  insert pending job + start background task
  │
  ├── IPC: cloud-publisher:list-tasks
  │   └── electron/cloud-publisher.js
  │       └── GET /api/jobs/publish?user_id=xxx
  │
  └── IPC: cloud-publisher:get-task
      └── electron/cloud-publisher.js
          └── GET /api/jobs/publish/{task_id}
```

## 4. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `electron/cloud-publisher.js` | 新增 | CloudPublisher 类，HTTP ↔ orchestrator |
| `electron/main.js` | 修改 | 注册 CloudPublisher 实例 + IPC handlers |
| `src/api/cloud-publisher.js` | 新增 | 前端 IPC 调用封装 |
| `src/views/CloudPublish.vue` | 新增 | 云端发布页面（表单 + 任务列表） |
| `src/router/index.js` | 修改 | 加 `/cloud-publish` 路由、侧栏入口 |
| `tests/cloud-publisher.test.js` | 新增 | 单元测试 |

**orchestrator 侧：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `routers/publish.py` | 修改 | VideoPublishRequest 加 mode 字段；mode="rpa" 时不启动 background task |

## 5. CloudPublisher API

```javascript
class CloudPublisher {
  constructor(orchestratorUrl, store)

  // 提交云端发布任务
  // → POST /api/jobs/publish-video
  // → body: { video_url, platform, title, desc, tags, cover_url, mode: "cloud" }
  async submitTask({ videoUrl, platform, title, desc, tags, coverUrl })

  // 获取当前用户的所有发布任务
  // → GET /api/jobs/publish
  async listTasks()

  // 获取单个任务状态
  // → GET /api/jobs/publish/{taskId}
  async getTask(taskId)

  // 从 platforms.yaml 中筛选 isPublishable 的平台
  getSupportedPlatforms()

  // 注册 IPC handlers:
  //   cloud-publisher:submit
  //   cloud-publisher:list-tasks
  //   cloud-publisher:get-task
  //   cloud-publisher:platforms
  registerIpcHandlers()
}
```

## 6. 数据流

```
CloudPublish.vue                          electron/cloud-publisher.js
  │                                                 │
  │  IPC: cloud-publisher:submit                    │
  ├─────────────────────────────────────────────────┤
  │                                                 ├── axios.post(
  │                                                 │     /api/jobs/publish-video,
  │                                                 │     { ..., mode: "cloud" }
  │                                                 │   )
  │  ← { task_id, status, platform }               │
  │                                                 │
  │  IPC: cloud-publisher:list-tasks                │
  ├─────────────────────────────────────────────────┤
  │                                                 ├── axios.get(
  │                                                 │     /api/jobs/publish
  │                                                 │   )
  │  ← { items: [{ id, status, platform, ... }] }   │
  │                                                 │
  │  活跃任务 3s polling                             │
  │  └─ 直到 status = success / failed               │
```

## 7. 选路决策（orchestrator）

`POST /api/jobs/publish-video` 加 `mode` 字段：

```python
class VideoPublishRequest(BaseModel):
    ...
    mode: str = "rpa"  # "rpa" | "cloud"
```

| mode | orchestrator | PublishPoller |
|------|-------------|---------------|
| `"rpa"`（默认） | 只 insert pending，不启动 background task | 照常轮询处理 |
| `"cloud"` | insert pending + 启动 background task | 跳过（不处理） |
| 不传（旧请求） | 同 `"rpa"` | 照常处理（向后兼容） |

## 8. 前端布局

```
┌─────────────────────────────────────────────────────┐
│  ☁️ 云端发布                    orchestrator: 在线 ✅ │
├─────────────────────────────────────────────────────┤
│  ┌─ 提交新任务 ────────────────────────────────────┐ │
│  │  视频 URL:  [________________________________]  │ │
│  │  平台:      [B站 ▼]                              │ │
│  │  标题:      [________________________________]  │ │
│  │  描述:      [________________________________]  │ │
│  │  标签:      [_________, _________, _________]    │ │
│  │  封面 URL:  [________________________________]  │ │
│  │  [提交云端发布]                                   │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─ 发布记录 ───────────────────────────────────────┐ │
│  │  状态 │ 平台 │ 标题    │ 进度  │ 时间     │ 操作  │ │
│  │  ├─────┼──────┼─────────┼───────┼─────────┼──────┤ │
│  │  │ ✅  │ B站  │ AI教程  │ 完成  │ 2分钟前  │ 查看 │ │
│  │  │ 🔄  │ 抖音 │ 产品展示 │ 发布中│ 30秒前   │ —    │ │
│  │  │ ❌  │ B站  │ 测试视频 │ 失败  │ 1小时前  │ 重试 │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## 9. 风险与应对

| 风险 | 应对 |
|------|------|
| orchestrator 不可达 | 前端显示连接状态，提交时友好报错 |
| background task 耗时过长 | 前端 polling 超时兜底，显示「处理中」|
| 多个 mode 竞态 | PublishPoller 和 background task 互斥处理 {rpa, cloud} |
