# PROJECT-003：多平台一键发布 — PRD

> **立项日期**: 2026-06-03
> **最后更新**: 2026-06-29
> **当前版本**: v1.5.0（云端发布模块）
> **产品定位**: 为内容生产者提供"策题 → 采集 → 优化 → 发布 → 追踪"全流程闭环的一键发布桌面工具
> **目标用户**: 自媒体运营者、MCN 机构、企业内容团队
> **技术架构**: Electron 33 + Vue 3 + Python FastAPI + RpaViewManager RPA（Monorepo）

---

## 一、产品概述

### 1.1 核心价值

内容生产者每天需要在多个平台发布相同或相似的内容。手动操作耗时、易出错、格式不统一。PROJECT-003 提供：

1. **统一入口**：一个桌面应用管理所有平台的发布
2. **内容情报**：发布前策题/标题/标签优化，发布后影响力追踪
3. **自动适配**：通过 RPA 自动化填表发布，适配各平台 UI
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
||| ✅ 不包含 | 掘金、CSDN（由 PROJECT-002 负责）、内容创作（由 PROJECT-001 负责） |

---

## 二、平台策略

### 2.1 平台支持矩阵

| 平台 | 优先级 | 技术路线 | 状态 |
|------|--------|----------|------|
| **微信公众号** | P0 | RPA | ✅ v1.0.0 |
| **抖音** | P0 | API + RPA 双模式（API 优先，RPA 降级） | ✅ v1.2.0 |
| **知乎** | P1 | RPA | ✅ v1.0.0 |
| **微博** | P2 | RPA | ✅ v1.0.0 |
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
1. **本地 RPA** — 默认路径，所有平台走 RpaViewManager（隐藏 BrowserWindow + executeJavaScript + CDP 文件上传）
2. **ECS 云端发布** — 通过 PublishPoller 轮询 orchestrator，下载视频后委托发布（vNext）
3. **显式云端发布** — 通过 CloudPublish.vue 页面显式提交任务到 orchestrator，用于不依赖本地环境的发布（v1.5.0 F13 🆕）
4. **Python 后端 API** — 预留，B 站 API 模式

**选路策略（vNext）：**
- `platforms.yaml` 中 `rpa: true` → 走本地 RPA 路径（当前默认值，向后兼容）
- `rpa: false` 或缺失 → 走 ECS 云端发布（orchestrator 侧 API 模式）
- 平台级覆盖：单个平台可独立设置 `rpa: true/false`

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

#### F7：数据存储（SQLite）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 账号存储 | accounts 表（含多账号、默认标记） | ✅ |
| 发布历史 | publish_history 表 | ✅ |
| 定时任务 | scheduled_tasks 表 | ✅ |
| 回调日志 | callback_logs 表 | ✅ |
| 批量任务 | batch_jobs 表 | ✅ |
| 设置存储 | settings 键值表（含队列状态持久化） | ✅ |

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

#### F11：内容情报引擎（v1.4.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 跨源搜索 | 通过 Reddit/HN/GitHub 免费 API 搜索主题讨论，log10 互动评分 | ✅ |
| 标题优化 | 搜索同类标题互动数据，提取高频模式，生成优化建议 | ✅ |
| 发布后影响力追踪 | 发布后 T+1min/1h/24h/72h 定时捕捉社交提及，Dashboard 展示 | ✅ |
| 发布时机优化 | 聚合搜索结果的时间分布，推荐各平台最佳发布时间 | ✅ |
| 外部引用推荐 | 选中关键词，自动搜索权威来源/数据/讨论，一键插入正文 | ✅ |
| 智能标签建议 | 基于内容关键词 + 平台标签体系，自动生成各平台标签建议 | ✅ |
| 内容表现基准比较 | 同类内容互动数据聚合，对比自身表现给出差距分析 | ✅ |
| 热榜趋势发现 | 实时聚合 Reddit/HN/GitHub 热门内容，主动发现创作主题 | ✅ |
| 关键词背景监测 | 持续监测指定关键词的讨论热度变化，异常飙升时桌面通知 | ✅ |

#### F12：ECS 云端发布集成（vNext）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| PublishPoller | 定时轮询 orchestrator GET /api/jobs/publish/pending | ✅ |
| 视频下载 | 从 Supabase Storage 下载视频到本地临时目录 | ✅ |
| 状态同步 | PUT /api/jobs/publish/{id}/status 同步下载/发布/成功/失败状态 | ✅ |
| 选路决策 | `platforms.yaml` 中 `rpa: true/false` 控制本地 RPA vs 云端 | ✅ |
| B站云端 API | orchestrator services/bilibili_publisher.py API 模式发布 | ✅ |
| 抖音云端 API | orchestrator services/douyin_publisher.py API 模式发布 | ✅ |

#### F13：云端发布模块（v1.5.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| CloudPublisher 类 | Electron 主进程 HTTP 通信层，连接 orchestrator 提交/查询任务 | ✅ |
| 前端 CloudPublish.vue | 云端发布专属页面：提交表单 + 任务列表 + 进度轮询 | ✅ |
| mode 选路 | `POST /api/jobs/publish-video` 支持 `mode: "rpa"|"cloud"` 字段 | ✅ |
| PublishPoller 跳过 | `input_data.mode === "cloud"` 时 PublishPoller 跳过不处理 | ✅ |
| IPC handlers | `cloud-publisher:submit/list-tasks/get-task/platforms` 4个 IPC 通道 | ✅ |
|
| orchestrator stub 后端 | `POST /publish-video` 支持 cloud 模式，stub 模拟 10s 延迟返回成功 | ✅ |

#### F14：共享工具库新模块（v1.6.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| ChunkedUploader (shared-utils) | 通用分片上传器，支持 init→upload chunks→complete 三步协议，进度回调/事件/取消 | ✅ |
| ProxyPool (shared-utils) | 代理池轮换 + 健康检查，round-robin 分发，自动移除失效代理 | ✅ |
| AnalyticsService (shared-utils) | 平台数据分析服务，provider 模式，支持多平台并行数据获取、指标归一化 | ✅ |

#### F15：发布频率控制（v1.6.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 同账号发布间隔 | 同一平台同一账号的两次发布操作（手动/自动/定时）之间至少间隔 5 分钟 | ✅ v1.6.0 |
| 队列预检 | 任务加入队列时检查该账号上次发布时间，不足 5 分钟则排队等待 | ✅ v1.6.0 |
| 定时任务对齐 | 定时发布任务若与前一次发布时间 < 5min，自动推迟到满足间隔后执行 | ✅ v1.6.0 |
| 批量发布间隔 | 多平台批量发布时，每个平台完成后等待 5 分钟再执行下一个 | ✅ v1.6.0 |
| 前端提示 | 用户点击发布时若距上次不足 5 分钟，显示提示"发布过于频繁，请稍后再试"并显示剩余等待时间 | ✅ v1.6.0 |
| 跨会话持久化 | 上次发布时间记录写入 SQLite，重启 App 后仍能正确计算间隔 | ✅ v1.6.0 |
| 目的 | 规避平台反机器人检测，模拟真人发布节奏 | - |

#### F16：内容质量门禁（v1.6.0）

| 子功能 | 描述 | 状态 |
|--------|------|------|
| ContentQualityGate 类 | 13 条通过标准（权重 4-20）+ 11 条失败信号（高/中/低三级），支持 failFast | ✅ |
| PC-1 ~ PC-13 通过标准 | 标题结构(15)/内容完整性(20)/标题-内容对齐(10)/平台格式合规(10)/内容丰富度(10)/可读性与分享性(8)/原创性与去重(8)/媒体资产(5)/敏感性(5)/发布间隔(5)/标签合规(4)/跨平台一致性(5)/观众匹配(5) | ✅ |
| FS-1 ~ FS-11 失败信号 | 标题异常/AI 腔调(27 模式词)/话题模糊/标签违规/标题-内容不匹配/内容浅薄/关键词堆砌/格式乱码(8 模式)/信息过载/风格不一致/低分享性 | ✅ |
| 平台格式校验 | Twitter 280 字符 / B 站 50 字符 / WeChat 200 字符 / Instagram 需图片附件 | ✅ |
| 跨平台一致性检查 | Jaccard 相似度检测不同平台内容差异 < 0.8 | ✅ |
| 集成方式 | 已注册到 shared-utils/index.js 导出 | ✅ |


### 3.2 非功能需求
|| 需求 | 指标 | 状态 |
||------|------|------|
| 并发发布 | 3 任务并发执行（maxConcurrent=3） | ✅ |
| 离线运行 | 安装包自带 Chromium，无需联网；自动更新网络失败静默 | ✅ |
| 任务持久化 | SQLite 持久化队列状态，崩溃自动恢复 | ✅ |
|| 数据加密 | Cookie AES-256-GCM 加密存储 | ✅ |
│
│  │  └─ services/douyin_publisher.py     │
│  └──────────────────────────────────────┘
│
|| 存储引擎 | SQLite（better-sqlite3） | ✅ |
|| 跨平台 | Windows + Linux（macOS 待支持） | ✅ |
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
│  │  PublishPoller（vNext）               │
│  │  ├─ 定时轮询 orchestrator             │
│  │  │  GET /api/jobs/publish/pending    │
│  │  ├─ 下载视频 → delegate RPA          │
│  │  ├─ PUT 状态同步                     │
│  │  └─ 选路: platforms.yaml rpa:       │
│  │     true=本地RPA / false=云端        │
│  └──────────────┬───────────────────────┘
│                 │
│  ┌──────────────┴───────────────────────┐
│  │  ECS Orchestrator (:8000)            │
│  │  ├─ GET /api/jobs/publish/pending    │
│  │  │  (FIFO video_publish 队列)        │
│  │  ├─ PUT /api/jobs/publish/{id}/status│
│  │  ├─ services/bilibili_publisher.py   │
│  │  │  (bilibili-api-python + curl_cffi)│
│  │  └─ services/douyin_publisher.py     │
│  └──────────────────────────────────────┘
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
│   │   ├── publish-poller.js    # ECS 轮询发布（vNext）
│   │   ├── cloud-publisher.js   # 云端发布通信层（F13 🆕）
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
│   │   ├── content-intelligence.js  # 跨源情报引擎（Reddit/HN/GitHub）🆕
│   │   ├── keyword-monitor.js       # 关键词背景监测 🆕
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

### 4.6 重构记录

#### 2026-07-01: IPC handler 拆分 + 平台元数据统一

**IPC handler 拆分（PR #68）**

背景: main.js 从最初的 ~500 行增长到 922 行，74 个 ipcMain.handle 内联混杂。

方案: 将全部 handler 按领域拆分为 14 个独立模块，通过 registerHandlers(ipcMain, deps) 模式注册。

效果: main.js 922 行 → 358 行。新增模块均可独立测试。

**平台元数据统一（PR #68 包含）**

背景: 平台登录 URL、显示名称、选择器等元数据在 6+ 个文件中重复定义，覆盖范围不一致。

方案: 新增 packages/shared-utils/src/platform-definitions.js 作为单一数据源，覆盖全部 15 个平台。去重：4 个 Electron 模块改为引用共享定义，5 个 Vue 组件替换为 usePlatformStore()。


---

## 五、首次使用流程

```
下载安装包 → 安装 → 首次运行
    │
    ├─ [自动] 检测 Python 3.12+ → 安装 pip 依赖
    ├─ # 已移除 Playwright 依赖检测（P2-E）
    │
    └─ 登录各平台账号
         ├─ 微信 → 弹出浏览器 → 扫码登录 → Cookie 保存
         ├─ 知乎 → 弹出浏览器 → 扫码/密码登录 → Cookie 保存
         ├─ 微博 → 同上
         ├─ 抖音 → 同上
         └─ 小红书 → 同上
    │
    └─ 开始使用
```

---

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

> **发布间隔保护**：所有发布操作（手动/批量/定时）执行后，同一平台同一账号需等待至少 5 分钟才能再次发布。若距上次发布时间不足 5 分钟，任务将被排队等待，前端会提示剩余等待时间。此举旨在规避平台反机器人检测机制。

---

## 七、与 PROJECT-001 的集成

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

## 八、CI/CD

| 环节 | 说明 | 状态 |
|------|------|------|
| GitHub Actions | 推送 main/develop 触发构建 | ✅ |
| 构建产物 | Windows (.exe) + Linux (.AppImage) | ✅ |
| 自动更新 | electron-updater + GitHub Release | ✅（待首次 Release） |

---

## 九、风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| RPA 被平台封禁 | 高 | 行为模拟 + 随机延迟 + Cookie 轮换 + **5 分钟发布间隔** |
| 平台 UI 变更 | 中 | 模块化设计，单个发布器变更不影响整体 |
| Cookie 过期 | 低 | 自动检测 + 一键重新登录 |
| RPA 浏览器兼容性 | 低 | Electron 内嵌 Chromium，版本锁定 |

---

## 十、验收标准

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

### v1.4.0 验收（Last30Days 内容情报深度集成） ✅

- [x] **热榜趋势发现**：情报面板新增趋势页面，聚合 Reddit hot + HN frontpage + GitHub trending
- [x] **智能标签建议**：编辑器中根据内容自动生成各平台标签建议
- [x] **关键词背景监测**：支持添加关键词监测，6h 轮询，异常飙升通知
- [x] **外部引用推荐**：选中关键词可搜索权威来源/讨论，一键插入正文
- [x] **内容基准比较**：Dashboard 展示同类内容互动基准对比
- [x] **发布时间优化**：编辑器中根据搜索数据推荐最佳发布时间
- [x] **全部 6 个 IPC handler 注册通过**：`intelligence:*` 系列
- [x] **content-intelligence.js 单元测试通过**：缓存/评分/6 新方法

### v1.1.0 目标（Roadmap）

详见 `docs/roadmap-v1.1.0.md` — 产品稳定 → 运营启动 → 付费闭环 → 迭代增长

---

## 十一、Roadmap

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0-P3 | 基础发布 + 任务队列 + 定时 + 统计 | ✅ |
| **蚁小二集成** | 分屏/回调/扫码/OAuth/SQLite/批量/B站/URL采集/托盘/快捷键/多账号 | ✅ |
| **V1.0 发布** | 首版 Release、运营启动 | ⏳ 待进行 |
| V1.1 格式适配 | Markdown → 各平台格式转换、封面
- [ ] 抖音发布选择器需实际页面验证（依赖真实抖音创作者后
