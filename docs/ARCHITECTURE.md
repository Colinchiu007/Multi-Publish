---
name: multipublish-architecture
description: Multi-Publish ARCHITECTURE.md — 多平台发布桌面工具架构
---

# Multi-Publish — 架构文档

> **版本**: v1.6.3 | **更新**: 2026-07-01
> **定位**: 多平台视频/图文发布桌面工具 (Electron + Vue 3)

## 一、系统架构

```
┌──────────────────────────────────────────────────────┐
│                  Electron Main Process                │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────┐ │
│  │  IPC Server  │ │  RPA Engine  │ │ Cloud Publish │ │
│  │  (ipcMain)   │ │  BrowserWin  │ │  HTTP Client  │ │
│  └──────┬───────┘ └──────┬───────┘ └───────┬───────┘ │
└─────────┼────────────────┼─────────────────┼─────────┘
          │                │                 │
┌─────────▼────────────────▼─────────────────▼─────────┐
│                 Vue 3 Renderer Process                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │ Dashboard│ │Publish   │ │ Settings │ │ Cloud    ││
│  │          │ │ Builder  │ │          │ │ Publish  ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘│
└──────────────────────────────────────────────────────┘
```

## 二、12 平台发布矩阵

| 平台 | 发布方式 | 认证 | 状态 |
|------|---------|------|------|
| B站 | RPA (Electron) + Cloud (orchestrator) | Cookie | ✅ |
| 抖音 | RPA (Electron) + Cloud (API) | Cookie + X-Bogus | ✅ |
| 小红书 | Cloud (orchestrator) | Cookie + X-s/X-t | ✅ |
| 视频号 | Cloud (orchestrator) | 第三方 API | ✅ |
| YouTube | Cloud (API) | OAuth 2.0 | 🚧 |
| Twitter/X | Cloud (API) | Bearer Token | 🚧 |
| TikTok | RPA (Electron) | Session Cookie | 🚧 |
| 知乎 | RPA (Electron) | Cookie | 🚧 |
| 微博 | Cloud (API) | Access Token | 🚧 |
| B站(图文) | RPA (Electron) | Cookie | 🚧 |
| 快手 | RPA (Electron) | Cookie | 🚧 |
| 微信公众号 | Cloud (API) | 第三方 API | 🚧 |

## 三、发布流程

```
Vue Frontend → Service Layer
   │
   ├── RPA Path (platforms.yaml rpa: true)
   │   └── BrowserManager.open() → Platform-Selectors → Upload → Publish
   │
   └── Cloud Path (platforms.yaml rpa: false)
       └── CloudPublisher → orchestrator API → ECS publisher
```

## 四、目录结构

```
apps/desktop/
├── electron/
│   ├── main.js              # 主进程入口
│   ├── rpa-view-manager.js   # RPA 窗口管理
│   ├── cloud-publisher.js    # 云端发布
│   ├── task-queue.js         # 任务队列
│   ├── stealth-helper.js     # 反检测注入
│   └── platform-selectors/   # 各平台 DOM 选择器
├── src/
│   ├── views/                # Vue 页面
│   ├── services/             # 业务服务
│   └── components/           # 共享组件
└── docs/                     # 文档
```
