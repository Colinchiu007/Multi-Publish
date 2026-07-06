# PROJECT-003：多平台一键发布 — PRD

> **立项日期**: 2026-06-03
> **最后更新**: 2026-07-05
> **当前版本**: v2.1.1 (2026-07-06) | **上一版本**: v2.0.0 (2026-07-02)
> **产品定位**: 为内容生产者提供"采集 → 改写 → 发布"全流程闭环的一键发布桌面工具
> **目标用户**: 自媒体运营者、MCN 机构、企业内容团队
> **技术架构**: Electron 33 + Vue 3 + Python FastAPI + RpaViewManager RPA（Monorepo）

---

## 一、产品概述

### 1.1 核心价值

内容生产者每天需要在多个平台发布相同或相似的内容。手动操作耗时、易出错、格式不统一。PROJECT-003 提供：

1. **统一入口**：一个桌面应用管理所有平台的发布
2. **自动适配**：通过 RPA 自动化填表发布，适配各平台 UI
3. **异步队列**：后台批量发布，实时追踪状态
4. **Cookie 管理**：安全存储各平台登录凭证
5. **定时发布**：设定时间自动发布
6. **平台分类**：短视频/图文/混合三类，发布策略自动适配
7. **单 RPA 引擎**：RpaViewManager（Electron 原生 executeJavaScript）统一引擎

### 1.2 产品边界

| 范围 | 说明 |
|------|------|
||| ✅ 微信公众号 | RPA 发布，支持草稿编辑 → 群发 |
||| ✅ 知乎 | RPA 文章发布 + 话题标签 |
||| ✅ 微博 | RPA 图文发布 |
||| ✅ 抖音 | RPA 图文/视频发布 |
||| ✅ 小红书 | RPA 标题+正文+标签 |
||| ✅ 视频号 | RPA 视频/图文发布 |
||| ✅ 快手 | RPA 视频/图文发布 |
||| ✅ 今日头条 | RPA 图文/视频发布 |
||| ✅ YouTube | RPA 视频发布 |
||| ✅ TikTok | RPA 视频发布 |
||| ✅ Twitter/X | RPA 图文发布 |
||| ✅ B站 | API+RPA 双模式，专栏/视频发布 |
||| ✅ Instagram | RPA 图片/视频/Reels 发布 |
||| ✅ Facebook | RPA 图文/视频/链接发布 |
||| ✅ 包含 | AI 视频/图像/音频创作（OpenMontage 集成）、Pipeline 管线编排、Remotion 渲染 |
||| ✅ 不包含 | 掘金、CSDN（由 PROJECT-002 负责）、内容聚合改写（由 PROJECT-001 负责） |
---

## 二、平台策略

### 2.1 平台支持矩阵

| 平台 | 优先级 | 技术路线 | 状态 |
|------|--------|----------|------|
| **微信公众号** | P0 | RPA | ✅ v1.0.0 |
| **抖音** | P0 | API + RPA 双模式（API 优先，RPA 降级） | ✅ v1.2.0 |
| **知乎** | P1 | RPA | ✅ v1.0.0 |
| **微博** | P2 | RPA | ✅ v1.0.0 |
| **B站** | P1 | RPA + API | ✅ v2.0.0 |
| **小红书** | P1 | RPA | ✅ v2.0.0 |
| **抖音** | P2 | RPA | ✅ v1.0.0 |
| **小红书** | P4 | RPA | ✅ v1.0.0 |
| **视频号** | P1 | RPA | ✅ v1.0.2 |
| **快手** | P1 | RPA | ✅ v1.0.2 |
| **今日头条** | P1 | RPA | ✅ v1.0.3 |
| **YouTube** | P1 | RPA | ✅ v1.0.3 |
| **TikTok** | P1 | RPA | ✅ v1.0.3 |
| **Twitter/X** | P2 | RPA | ✅ v1.3.0 |
| **B站** | P1 | API+RPA 双模式 | ✅ v1.0.13 |
| **Instagram** | P2 | RPA | ✅ v1.3.0 |
| **Facebook** | P2 | RPA | ✅ v1.3.0 |
| **百家号** | P1 | RPA | ✅ v1.1.0 |

### 2.2 技术路线

所有平台支持 **RpaViewManager**（Electron 原生 executeJavaScript）模拟浏览器操作，通过 Cookie 保持登录状态。
所有平台统一使用 **RpaViewManager**（隐藏 BrowserWindow + executeJavaScript），无需独立浏览器进程。
Electron 主进程直接管理 RPA 引擎和任务队列，Python 后端仅供 API 模式使用。

**统一发布路由：**
1. **RpaViewManager executeJavaScript RPA** — 所有平台（隐藏 BrowserWindow + CDP 文件上传）
2. **Python 后端 API** — 预留，B 站 API 模式

**三种认证模式：**
1. **内嵌 WebContentsView 登录** — 弹出式内嵌浏览器（AuthViewManager）
2. **隐藏 BrowserWindow 静默验证** — 后台恢复 Cookie 检测登录态（loginSilent）
3. **扫码登录** — 二维码自动检测（QrCodeLogin）

---

## 三、功能需求

### 3.1 核心功能

#### F1：平台账号管理

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 添加平台 | 选择平台类型，打开浏览器窗口完成登录 | ✅ |
| Cookie 加密 | 所有 Cookie AES-256-GCM 加密存储 | ✅ |
| 登录状态检测 | 定期检测 Cookie 是否过期，支持一键重新登录 | ✅ |
| 多账号支持 | **同平台管理多个账号**，侧栏下拉切换，发布时选账号 | ✅ |
| 默认账号 | 每个平台可设默认账号，发布时自动使用 | ✅ |
| 扫码登录 | 微信生态平台二维码自动检测+扫码登录（img/canvas 策略） | ✅ |
| OAuth 2.0 认证 | YouTube/TikTok/微博/抖音 API Token 授权 | ✅ |
| 内嵌浏览器登录 | WebContentsView 内嵌登录，无需弹出独立窗口 | ✅ |

#### F2：内容发布

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 单篇发布 | 手动输入标题 + 内容 → 选择平台 + 账号 → 发布 | ✅ |
| 批量发布 | 选择多平台 → 一次点击全部发布 | ✅ |
| **多账号同时发** | **同平台选多个账号，一次发到所有账号** | ✅ |
| 定时发布 | 设置发布时间 → 后台定时任务执行（持久化，重启恢复） | ✅ |
| 富文本编辑器 | Quill 编辑器，支持格式、图片、排版 | ✅ |
| 批量编辑模式 | 多篇文章同时编辑，每篇独立选平台+定时 | ✅ |
| 批量复制 | 复制已有文章作为模板 | ✅ |

#### F3：发布任务管理

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 任务队列 | 并发3任务执行 + 自动重试（可配置） | ✅ |
| 任务中断恢复 | 进程崩溃后恢复未完成队列（JSON 持久化） | ✅ |
| 任务取消 | 取消等待中或执行中的任务 | ✅ |
| 实时进度 | IPC 推送发布进度（当前阶段/结果/错误） | ✅ |
| 结果通知 | 成功/失败通知 + 托盘闪烁告警 | ✅ |
| 重试机制 | 失败自动重试，通知重试进度 | ✅ |

#### F4：分屏监控

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 多分屏布局 | 2/3/4/6 分屏实时监控多平台 | ✅ |
| 独立 Session | 每个 tab 独立 Cookie/Session 隔离 | ✅ |
| 实时回调 | HTTP POST 回调服务器（:16521），59s 心跳 | ✅ |
| 评论/数据监控 | 回调记录自动写入 SQLite，前端实时展示 | ✅ |

#### F5：内容采集

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 剪贴板导入 | 从剪贴板粘贴内容，自动提取标题+正文 | ✅ |
| URL 内容采集 | 输入链接自动提取 og:title/description/image | ✅ |
| 浏览器渲染采集 | HTTP 采集（P2-E 已移除 Playwright 降级） | ✅ |
| 草稿箱 | 保存/编辑/删除草稿，一键跳转到发布页 | ✅ |

#### F6：发布历史与统计

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 历史记录 | SQLite 持久化发布历史 | ✅ |
| 统计看板 | 总发布数、各平台分布、成功率、趋势图 | ✅ |
| 历史筛选 | 按平台/时间/状态筛选 | ✅ |
| 发布后监控 | 发布完成后自动轮询平台审核状态 | ✅ |

#### F6：视频创作（v2.0.0 — OpenMontage 集成）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| AI 视频生成 | 15+ 提供商：Hunyuan/Kling/Runway/VEO/WAN/CogVideo/MiniMax/Grok/HeyGen 等 | ✅ Phase 1-3 |
| AI 图像生成 | 14 提供商：Flux/DALL-E/Grok/Imagen/Recraft/Pixabay/Pexels/本地扩散 | ✅ Phase 1-3 |
| 语音合成 TTS | 7 提供商：ElevenLabs/OpenAI/豆包/Google/Piper | ✅ Phase 1-3 |
| 音乐生成 | 5 种：Suno/Pixabay/Freesound/音乐库/生成器 | ✅ Phase 1-3 |
| 视频分析 | 场景检测/人脸跟踪/帧采样/转写/视频理解 | ✅ Phase 4 |
| 绿幕合成/增强 | 绿幕处理/字幕生成/屏幕录制/人脸修复 | ✅ Phase 5 |
| Pipeline 编排 | 13 种视频制作管线（解释/电影/口播/数字人等） | ✅ Phase 6+7 |
| Remotion 渲染 | 13 种 Composition，Electron 后端渲染 | ✅ v1.0.0 |

#### F7：数据存储（SQLite）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 账号存储 | accounts 表（含多账号、默认标记） | ✅ |
| 发布历史 | publish_history 表 | ✅ |
| 定时任务 | scheduled_tasks 表 | ✅ |
| 回调日志 | callback_logs 表 | ✅ |
| 批量任务 | batch_jobs 表 | ✅ |
| 设置存储 | settings 键值表（含队列状态持久化） | ✅ |

#### F11：内容智能（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 热点趋势 | 实时热点话题追踪与推荐 | ✅ |
| 标题助手 | AI 生成/优化标题 | ✅ |
| 标签推荐 | 智能标签生成 | ✅ |
| 爆款分析 | 分析平台爆款内容特征 | ✅ |
| AI Writer | AI 辅助写作面板 | ✅ |
| 关键词监控 | 监控关键词在各平台的表现 | ✅ |

#### F12：多平台实时监控（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 多分屏布局 | 2/3/4/6 分屏实时监控 | ✅ |
| 独立 Session | 每个 tab 独立 Cookie/Session | ✅ |
| 实时回调 | HTTP POST 回调，59s 心跳 | ✅ |

#### F13：评论管理（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 评论聚合 | 多平台评论统一管理 | ✅ |
| 评论回复 | 在应用内直接回复 | ✅ |

#### F14：云端发布（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 远程发布 API | HTTP API 触发发布 | ✅ |
| 任务队列 | 异步发布队列 | ✅ |

#### F15：Pro 版本（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 许可证管理 | 离线验证 + 限时试用 | ✅ |
| 功能门禁 | Pro 功能按 license 解锁 | ✅ |
| 支付集成 | 支付宝/微信支付 | ✅ |

#### F16：插件系统（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 插件 manifest | 声明式配置 | ✅ |
| 动态加载 | 运行时热加载 | ✅ |
| 生命周期钩子 | beforePublish/afterPublish | ✅ |

#### F17：日历与计划（v2.0.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 发布日历 | 日历视图展示计划 | ✅ |
| 内容收藏 | 草稿/模板管理 | ✅ |
| 定时调度 | cron + 持久化队列 | ✅ |

#### F8：系统功能

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 系统托盘 | 最小化到托盘，后台运行，托盘菜单 | ✅ |
| 全局快捷键 | 6组快捷键：发布/监控/看板/采集/首页/退出 | ✅ |
| 自动更新 | 启动检测 GitHub Release，后台下载静默安装 | ✅ |
| 首次运行引导 | 自动检测 Python 依赖 | ✅ |
| 数据迁移 | JSONL → SQLite 迁移 | ✅ |
| 静默登录验证 | 隐藏 BrowserWindow 后台验证 Cookie 有效性（loginSilent） | ✅ |

#### F9：平台分类（v1.2.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 平台分类枚举 | `PlatformCategory`：VIDEO / IMAGE_TEXT / MIXED | ✅ |
| 分类映射 | 14 平台自动归类到三类（抖音/快手/视频号/B站/YouTube/TikTok=video） | ✅ |
| API 透传 | `/api/platforms` 返回 category 字段 | ✅ |
| 前端显示 | 平台列表按分类分组展示 | ✅ |

#### F10：Electron 原生 RPA 引擎（v1.2.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| RpaViewManager | 隐藏 BrowserWindow + executeJavaScript RPA 引擎（P2-E 统一引擎） | ✅ |
| CDP 文件上传 | `DOM.setFileInputFiles` 绕过浏览器安全限制上传文件 | ✅ |
| DOM 操作工具集 | `_waitForElement` / `_fillInput` / `_click` / `_waitForCondition` | ✅ |
| 网络响应监控 | webRequest.onCompleted 网络响应监听 | ✅ |
| Playwright → RpaViewManager 全量迁移 | 15 平台从 Playwright 统一迁移到 RpaViewManager | ✅ |
| 每账号 Session 隔离 | `session.fromPartition()` 独立 Cookie 分区 | ✅ |
| 进度事件上报 | IPC rpa:progress → 前端实时展示 | ✅ |
| CDP/JS 双文件上传 | 大文件走 CDP，小文件走 JS File API | ✅ |

### 3.2 非功能需求

|| 需求 | 指标 | 状态 |
||------|------|------|
| 并发发布 | 3 任务并发执行（maxConcurrent=3） | ✅ |
| 离线运行 | 安装包自带 Chromium，无需联网；自动更新网络失败静默 | ✅ |
| 任务持久化 | SQLite 持久化队列状态，崩溃自动恢复 | ✅ |
|| 数据加密 | Cookie AES-256-GCM 加密存储 | ✅ |
|| 存储引擎 | SQLite（better-sqlite3） | ✅ |
|| 跨平台 | Windows + Linux（macOS 待支持） | ✅ |
|| 代码规范 | ESLint v9 flat config + Prettier，0 errors / 0 warnings | ✅ Phase C3 |
|| 自动构建 | GitHub Actions 双平台 CI + 自动 Release | ✅ |
|| 自动更新 | electron-updater，从 GitHub Release 拉取 | ✅ |

---

## 四、技术架构

### 4.1 架构图

```
┌──────────────────────────────────────────────────┐
│              apps/desktop/electron/               │
│              Electron Shell + Vue 3 UI            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐
│  │ 发布界面   │  │ 账号管理  │  │ 统计看板  │  │ 采集/监控  │
│  └─────┬────┘  └────┬─────┘  └─────┬────┘  └──────┬────┘
│        │            │              │              │
│  ┌─────┴────────────┴──────────────┴─────┐
│  │        IPC Bridge (preload.js)        │
│  └────────────────┬──────────────────────┘
│                   │
│  ┌────────────────┼──────────────────────┐
│  │    Task Queue  │   Scheduler          │
│  │  (并发3,持久化)  │  (定时/恢复)          │
│  │  @shared-utils                        │
│  └────────────────┴──────────────────────┘
│                   │
│  ┌────────────────┴──────────────────────┐
│  │     Publisher Registry                 │
│  │   13 platforms (+B站)                  │
│  │   + API+RPA 双模式                     │
│  │   + OAuth 2.0 (YT/TT)                 │
│  └────────────────┴──────────────────────┘
│                   │
│  ┌────────────────┴──────────────────────┐
│  │     RPA Engine（统一引擎）               │
│  │                                       │
│  │  ┌─────────────────────────────┐      │
│  │  │  RpaViewManager (Electron)  │      │
│  │  │  15 platforms + B站         │      │
│  │  │  隐藏 BrowserWindow         │      │
│  │  │  + executeJavaScript        │      │
│  │  │  + CDP 文件上传              │      │
│  │  └─────────────────────────────┘      │
│  │                                       │
│  │  + WebviewManager（分屏）             │
│  │  + QrCodeLogin（扫码登录）            │
│  │  + CallbackServer（回调 :16521）      │
│  └───────────────────────────────────────┘
│
│  ┌──────────────────────────────────────┐
│  │  SQLite (better-sqlite3)             │
│  │  ├─ accounts（含多账号）               │
│  │  ├─ publish_history                  │
│  │  ├─ scheduled_tasks                  │
│  │  ├─ batch_jobs                       │
│  │  ├─ callback_logs                    │
│  │  └─ settings（队列持久化）              │
│  └──────────────────────────────────────┘
│
│  ┌──────────────────────────────────────┐
│  │  System / UX                         │
│  │  ├─ SystemTray（托盘）                │
│  │  ├─ HotKeys（6组快捷键）               │
│  │  ├─ AutoUpdater                      │
│  │  └─ UrlCollector（URL采集）            │
│  └──────────────────────────────────────┘
└──────────────────────────────────────────────────┘
```

### 4.2 Monorepo 目录结构

```
multi-publish/
├── apps/desktop/                # Electron 桌面应用
│   ├── electron/                # Electron 主进程 + IPC
│   │   ├── main.js              # 入口：窗口管理、IPC 注册
│   │   ├── preload.js           # 预加载脚本（contextBridge）
│   │   ├── store.js             # SQLite 统一存储（better-sqlite3）
│   │   ├── webview-manager.js   # 分屏监控（P0）
│   │   ├── auth-view-manager.js # 内嵌浏览器登录（WebContentsView）
│   │   ├── rpa-view-manager.js  # executeJavaScript RPA 引擎（v1.2.0）
│   │   ├── callback-server.js   # 实时回调（P1）
│   │   ├── qrcode-login.js      # 扫码登录（P2）
│   │   ├── oauth-manager.js     # OAuth 2.0 认证
│   │   ├── batch-manager.js     # 批量发布管理器
│   │   ├── url-collector.js     # URL 内容采集
│   │   ├── hotkeys.js           # 全局快捷键
│   │   ├── system-tray.js       # 系统托盘
│   │   ├── python-bridge.js     # Python 后端子进程管理
│   │   ├── task-queue.js → packages/shared-utils
│   │   ├── scheduler.js         # 定时发布
│   │   ├── publish-history.js   # 发布记录
│   │   ├── publish-monitor.js   # 发布后状态监控
│   │   ├── account-state-restorer.js  # 账号状态恢复
│   │   ├── credential-store.js  # 凭证加密存储
│   │   ├── video-uploader.js    # 视频分片上传
│   │   ├── content-aggregator-bridge.js  # 001 集成
│   │   ├── api-platform-adapter.js  # API 模式适配器
│   │   ├── auto-updater.js      # electron-updater
│   │   └── first-run.js         # 首次运行引导
│   ├── src/                     # Vue 3 前端
│   │   ├── views/               # 页面：Home/Dashboard/Publish/Accounts/Collection/Monitor/FirstRun
│   │   ├── components/          # 组件：ArticleEditor
│   │   ├── api/                 # API 封装（publisher.js）
│   │   ├── router/              # Vue Router
│   │   ├── styles/              # Cohere 风格 CSS
│   │   └── App.vue
├── packages/
│   ├── rpa-engine/              # RPA 引擎（独立 npm 包）
│   │   ├── src/playwright-manager.js  # （已移除，P2-E）
│   │   ├── src/cookie-store.js        # Cookie 存储
│   │   ├── src/publishers/            # 平台注册（P2-E 简化）
│   │   │   └── registry.js            # 平台注册 stub（已迁移到 RpaViewManager）
│   │   └── package.json
│   ├── shared-utils/          # 共享工具库
│   │   ├── src/task-queue.js    # 任务队列（并发3+持久化）
│   │   ├── src/aggregator-bridge.js  # 001 集成
│   │   ├── src/format-adapter.js     # 格式适配器
│   │   ├── src/cover-processor.js    # 封面处理
│   │   └── package.json
│   │   ├── src/aggregator-bridge.js  # PROJECT-001 集成
│   │   └── package.json
│   └── python-backend/        # Python 后端（FastAPI）
│       ├── src/server.py        # FastAPI 入口
│       ├── src/multi_publish/   # 核心模块
│       │   ├── core/            # PublisherManager / QueryWorker / TaskScheduler
│       │   └── publishers/      # Python 发布器（插件化）
│       │       ├── platform_registry.py  # 动态注册表（JSON 驱动发现）
│       │       ├── platforms.json        # 外部配置，新增平台只需加一行
│       │       ├── base.py              # BasePublisher + async_retry
│       │       ├── douyin.py            # 抖音（API+RPA 双模式）
│       │       └── wechat_mp.py         # 微信公众号（RPA）
│       └── pyproject.toml
├── package.json               # 根 workspaces 配置
└── .github/workflows/build.yml # CI/CD
```

### 4.3 发布器接口规范

```javascript
class BaseRpaPublisher {
  constructor() { /* 加载 Cookie, 初始化浏览器 Context */ }
  async publishArticle({ title, content, coverUrl }) {
    /* 登录态检查 → 导航到创作页 → 填写内容 → 发布 → 返回结果 */
  }
  async checkLoginStatus() { /* 打开平台检查 Cookie 是否有效 */ }
  async cleanup() { /* 关闭浏览器 Context */ }
  onProgress(callback) { /* 注册进度回调 */ }
}
// 所有平台发布器继承 BaseRpaPublisher，差异化部分覆盖
```

---

## 五、首次使用流程

首次启动时，系统自动执行以下步骤：

### 5.1 环境检测
- [自动] 检测 Python 3.12+ → 安装 pip 依赖
- [自动] 检测 Remotion 渲染引擎 → 安装缺失的 node_modules 依赖

### 5.2 平台账号登录
通过内嵌浏览器（WebContentsView）登录各发布平台，支持扫码登录（微信生态），Cookie 自动 AES-256-GCM 加密保存。

### 5.3 AI Provider 配置（可选）
在「Provider 配置」页添加 LLM/视频/图片 API Provider 的 API Key。

### 5.4 开始使用
完成引导后进入首页，即可使用发布、视频创作、内容智能等全部功能。

> 详细流程见：**第 7-11 节**（视频创作 / 内容采集 / 内容智能 / 发布日历 / 云端发布）

## 六、发布流程

### 6.1 单平台发布

1. 在富文本编辑器撰写文章（标题 + 正文 + 封面图）
2. 选择目标平台
3. 点击发布 → 任务加入队列 → RpaViewManager 自动化执行 → 结果通知

### 6.2 多平台批量发布

1. 撰写一篇文章
2. 勾选多个平台（如微信+知乎+微博）
3. 点击发布 → 每个平台依次执行 → 实时进度推送

### 6.3 定时发布

1. 撰写文章 + 选择平台
2. 勾选「定时发布」→ 设置时间
3. 到点时自动执行，支持 App 关闭后重启恢复
4. 任务持久化在 `tasks/scheduled-tasks.jsonl`

### 6.4 多平台批量发布（v1.1.0）

1. 撰写一篇文章
2. 勾选 2-10 个平台
3. 点击发布 → 每个平台依次执行（队列顺序） → 失败自动重试 2 次 → 全部完成
4. 发布失败平台不影响其他平台继续执行

---
## 七、视频创作流程

### 7.1 文本生成视频

```
进入「视频创作」→ 选择「文本生成」模式
    │
    ├─ 输入视频脚本（每行一个场景）
    │   └─ 可选：点击「AI 写稿」自动生成脚本
    ├─ 选择输出平台（YouTube 横屏/Shorts/TikTok/B站/微信视频号/小红书）
    ├─ 选择视频主题（专业清晰/动感深色等）
    ├─ 点击「生成视频」
    │   ├─ Remotion 渲染引擎开始工作
    │   ├─ 实时进度推送（百分比 + 当前阶段）
    │   └─ 渲染完成 → 预览/保存
    └─ 失败时显示错误信息，可重试
```

### 7.2 图片轮播生成视频

```
进入「视频创作」→ 选择「图片轮播」模式
    │
    ├─ 拖拽或点击上传多张图片（每张约 5 秒）
    ├─ 选择输出平台 + 主题
    ├─ 点击「生成视频」
    └─ 同文本模式渲染流程
```

### 7.3 AI 写稿

在文本模式下点击「AI 写稿」，调用已配置的 LLM Provider 自动生成视频脚本，节省创作时间。

### 7.4 Provider 配置（AI 提供商管理）

```
进入「Provider 配置」页面
    │
    ├─ 查看已配置的 Provider 列表
    │   ├─ 按类型过滤：LLM / 视频 / 图片
    │   ├─ 查看每个 Provider 的 Base URL、模型列表、启用状态
    │   └─ 支持测试连接、编辑、删除
    │
    ├─ 添加新的 Provider
    │   ├─ 选择 Provider 类型
    │   ├─ 填写名称、Base URL、API Key、模型列表
    │   └─ 保存后自动启用
    │
    └─ Provider 用于：
        ├─ LLM → AI 写稿、标题生成、内容智能
        ├─ 视频 → AI 视频生成（Hunyuan/Kling/Runway 等）
        └─ 图片 → AI 图片生成（Flux/DALL-E/Stable Diffusion 等）
```

---

## 八、内容采集与收藏流程

### 8.1 URL 内容采集

```
进入「内容采集」页面
    │
    ├─ 输入文章链接 → 点击「采集」
    │   └─ 自动提取标题、正文、封面图（og:title/description/image）
    ├─ 预览采集结果
    │   └─ 点击「创建草稿」→ 存入草稿箱
    └─ 失败时提示错误
```

### 8.2 剪贴板导入

```
点击「从剪贴板导入」
    └─ 自动提取剪贴板内容的标题 + 正文 → 创建草稿
```

### 8.3 平台内容采集

支持从微博、知乎、今日头条等平台采集内容，一键创建草稿后进行二次编辑和发布。

### 8.4 草稿箱管理

```
草稿箱（内容采集页面内）
    ├─ 查看所有草稿（标题预览、采集来源）
    ├─ 编辑草稿 → 跳转到发布页
    ├─ 删除草稿
    └─ 新建空白草稿
```

---

## 九、内容智能工作流

### 9.1 热点趋势

```
进入「内容情报」页面
    │
    ├─ 查看热门趋势面板（数据源：Reddit / Hacker News / GitHub）
    ├─ 搜索特定主题 → 跨平台高互动内容结果
    │   ├─ 按来源筛选（Reddit/HN/GitHub）
    │   ├─ 按真实互动评分排序（非 SEO）
    │   └─ 查看搜索结果详情
    └─ 热点数据为创作选题提供参考
```

### 9.2 标题助手与标签推荐

在发布页编辑文章时：
```
├─ AI 生成标题（基于正文内容）
├─ AI 优化标题（提升点击率）
└─ 智能标签推荐（匹配平台热门标签）
```

### 9.3 爆款分析

```
进入「爆款分析」页面
    ├─ 分析各平台爆款内容特征
    ├─ 查看互动数据、发布时间、内容类型分布
    └─ 为创作策略提供数据支撑
```

### 9.4 关键词监控

```
进入「关键词监控」页面
    ├─ 设置监控关键词
    ├─ 追踪关键词在各平台的表现趋势
    └─ 实时查看相关内容的互动数据
```

---

## 十、发布日历流程

```
进入「发布日历」页面
    │
    ├─ 日历视图（月视图）
    │   ├─ 左右切换月份
    │   ├─ 「今天」快速定位
    │   └─ 有发布计划的日期显示事件标记
    │
    ├─ 选择日期 → 查看当天发布计划
    │   ├─ 已发布的文章（带状态）
    │   └─ 定时任务（待发布）
    │
    └─ 日历数据来源：
        ├─ 已发布的 publish_history（SQLite）
        └─ 待执行的 scheduled_tasks
```

---

## 十一、云端发布流程

```
进入「云端发布」页面
    │
    ├─ 填写发布表单
    │   ├─ 视频 URL（存储链接）
    │   ├─ 目标平台
    │   ├─ 标题（最多 80 字）
    │   ├─ 描述
    │   ├─ 标签（逗号分隔，点击删除单个标签）
    │   └─ 封面图 URL（可选）
    │
    ├─ 提交云端发布任务
    │   ├─ 任务发送到 ECS 服务器 orchestrator
    │   ├─ 不依赖本地环境（可在任意设备提交）
    │   └─ 查看 orchestrator 在线状态
    │
    └─ 发布结果在任务完成后推送
```

---

## 十二、与 PROJECT-001 的集成

```
PROJECT-001（内容聚合改写）
    │
    │ WebSocket 推送改写后的内容
    ▼
Aggregator Bridge (aggregator-bridge.js)
    │
    │ 调用 taskQueue.addBatch() 添加多平台任务
    ▼
Task Queue → 各平台发布器 → 发布完成
```

**集成点：**
1. **WebSocket 通信**：PROJECT-001 通过 WebSocket 将改写后的文章推送到 Multi-Publish
2. **自动批量发布**：接收到文章后自动加入任务队列，按平台顺序执行
3. **状态反馈**：发布进度实时回传

---

## 十三、CI/CD

| 环节 | 说明 | 状态 |
|------|------|------|
| GitHub Actions | 推送 main/develop 触发构建 | ✅ |
| 构建产物 | Windows (.exe) + Linux (.AppImage) | ✅ |
| ESLint 检查 | GitHub Actions quality-gate PR 门禁，ESLint 0 errors | ✅ Phase C3 |
| 自动更新 | electron-updater + GitHub Release | ✅（待首次 Release） |

---

## 十四、风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| RPA 被平台封禁 | 高 | 行为模拟 + 随机延迟 + Cookie 轮换 |
| 平台 UI 变更 | 中 | 模块化设计，单个发布器变更不影响整体 |
| Cookie 过期 | 低 | 自动检测 + 一键重新登录 |
| RPA 浏览器兼容性 | 低 | Electron 内嵌 Chromium，版本锁定 |

---

## 十五、验收标准

### v1.2.0 验收（Electron 原生 RPA + 平台分类）

- [x] **平台分类**：12 平台分 VIDEO / IMAGE_TEXT / MIXED 三类，API 透传
- [x] **RpaViewManager**：隐藏 BrowserWindow + executeJavaScript RPA 引擎
- [x] **CDP 文件上传**：`DOM.setFileInputFiles` CDP 文件上传
- [x] **Playwright → RpaViewManager 全量迁移（P2-E）**：15 平台从 Playwright 统一迁移到 RpaViewManager
- [x] **隐藏 BrowserView**：静默登录验证（loginSilent）
- [x] **每账号 Session 隔离**：`session.fromPartition()` 独立分区
- [x] **25 回归测试通过**：Python 后端全量通过
- [x] **11 RpaViewManager 测试通过**：模块加载 + API 签名验证
- [ ] 抖音发布选择器需实际页面验证（依赖真实抖音创作者后台）

- [x] **15 个平台**：微信/知乎/微博/抖音/小红书/视频号/快手/头条/YouTube/TikTok/**Twitter/X**/B站/**百家号**/Instagram/Facebook
- [x] **格式适配器**：14 平台格式转换（HTML 白名单/截断/标签格式化）
- [x] **封面图自动处理**：sharp 中心裁剪 + 质量压缩 + 格式转换
- [x] **平台 URL 配置化**：config/platforms.yaml 统一管理
- [x] **敏感词预检**：DFA 算法 + 内置词库，发布前弹窗
- [x] **数据同步系统**：5 平台框架 + SQLite 缓存 + Dashboard
- [x] **评论统一管理**：WebContentsView 内嵌各平台评论页
- [x] **端到端测试** — 全部测试套件通过
- [x] **CI 自动 Release** — GitHub Actions auto-tag + release

- [ ] Pending: 端到端测试（需真实账号凭证）

### v1.1.0 目标（Roadmap）

详见 `docs/roadmap-v1.1.0.md` — 产品稳定 → 运营启动 → 付费闭环 → 迭代增长

---

## 十六、Roadmap

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0-P3 | 基础发布 + 任务队列 + 定时 + 统计 | ✅ |
| **蚁小二集成** | 分屏/回调/扫码/OAuth/SQLite/批量/B站/URL采集/托盘/快捷键/多账号 | ✅ |
| **Phase C（代码质量）** | ESLint v9 flat config + Prettier，201 个问题修复 | ✅ Phase C3 |
| **V1.0 发布** | 首版 Release、运营启动 | ⏳ 待进行 |
| V1.1 格式适配 | Markdown → 各平台格式转换、封面


