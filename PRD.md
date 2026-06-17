# PROJECT-003：多平台一键发布 — PRD

> **立项日期**: 2026-06-03
> **最后更新**: 2026-06-13
> **当前版本**: v1.1.0（首版正式 Release）
> **产品定位**: 为内容生产者提供"采集 → 改写 → 发布"全流程闭环的一键发布桌面工具
> **目标用户**: 自媒体运营者、MCN 机构、企业内容团队
> **技术架构**: Electron 33 + Vue 3 + Playwright RPA + SQLite（Monorepo）

---

## 一、产品概述

### 1.1 核心价值

内容生产者每天需要在多个平台发布相同或相似的内容。手动操作耗时、易出错、格式不统一。PROJECT-003 提供：

1. **统一入口**：一个桌面应用管理所有平台的发布
2. **自动适配**：通过 RPA 自动化填表发布，适配各平台 UI
3. **异步队列**：后台批量发布，实时追踪状态
4. **Cookie 管理**：安全存储各平台登录凭证
5. **定时发布**：设定时间自动发布

### 1.2 产品边界

| 范围 | 说明 |
|------|------|
||| ✅ 微信公众号 | 使用 Playwright RPA，支持草稿编辑 → 群发 |
||| ✅ 知乎 | Playwright RPA，文章发布 + 话题标签 |
||| ✅ 微博 | Playwright RPA，图文发布 |
||| ✅ 抖音 | Playwright RPA，图文/视频发布 |
||| ✅ 小红书 | Playwright RPA，标题+正文+标签 |
||| ✅ 视频号 | Playwright RPA，视频/图文发布 |
||| ✅ 快手 | Playwright RPA，视频/图文发布 |
||| ✅ 今日头条 | Playwright RPA，图文/视频发布 |
||| ✅ YouTube | Playwright RPA，视频发布 |
||| ✅ TikTok | Playwright RPA，视频发布 |
||| ✅ B站 | API+RPA 双模式，专栏/视频发布 |
||| ✅ 不包含 | 掘金、CSDN（由 PROJECT-002 负责）、内容创作（由 PROJECT-001 负责） |

---

## 二、平台策略

### 2.1 平台支持矩阵

| 平台 | 优先级 | 技术路线 | 状态 |
|------|--------|----------|------|
| **微信公众号** | P0 | Playwright RPA | ✅ v1.0.0 |
| **知乎** | P1 | Playwright RPA | ✅ v1.0.0 |
| **微博** | P2 | Playwright RPA | ✅ v1.0.0 |
| **抖音** | P2 | Playwright RPA | ✅ v1.0.0 |
| **小红书** | P4 | Playwright RPA | ✅ v1.0.0 |
| **视频号** | P1 | Playwright RPA | ✅ v1.0.2 |
| **快手** | P1 | Playwright RPA | ✅ v1.0.2 |
| **今日头条** | P1 | Playwright RPA | ✅ v1.0.3 |
| **YouTube** | P1 | Playwright RPA | ✅ v1.0.3 |
| **TikTok** | P1 | Playwright RPA | ✅ v1.0.3 |
| **B站** | P1 | API+RPA 双模式 | ✅ v1.0.13 |
| **百家号** | P1 | Playwright RPA | ✅ v1.1.0 |

### 2.2 技术路线

所有平台均使用 **Playwright RPA** 模拟浏览器操作，通过 Cookie 保持登录状态。Python 后端作为 RPA 适配器执行浏览器自动化操作，Electron 主进程管理任务队列和平台调度。

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
| 浏览器渲染采集 | HTTP 失败自动降级为 Playwright 渲染 | ✅ |
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
| 首次运行引导 | 自动检测 Python/Playwright 依赖 | ✅ |
| 数据迁移 | JSONL → SQLite 迁移 | ✅ |

### 3.2 非功能需求

|| 需求 | 指标 | 状态 |
||------|------|------|
| 并发发布 | 3 任务并发执行（maxConcurrent=3） | ✅ |
| 离线运行 | 安装包自带 Chromium，无需联网；自动更新网络失败静默 | ✅ |
| 任务持久化 | SQLite 持久化队列状态，崩溃自动恢复 | ✅ |
|| 数据加密 | Cookie AES-256-GCM 加密存储 | ✅ |
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
│  │   11 platforms (+B站)                  │
│  │   + API+RPA 双模式                     │
│  │   + OAuth 2.0 (YT/TT)                 │
│  └────────────────┴──────────────────────┘
│                   │
│  ┌────────────────┴──────────────────────┐
│  │   Playwright RPA Engine               │
│  │   + WebviewManager（分屏）             │
│  │   + QrCodeLogin（扫码登录）            │
│  │   + CallbackServer（回调 :16521）      │
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
│   │   ├── src/playwright-manager.js  # 浏览器管理
│   │   ├── src/cookie-store.js        # Cookie 存储
│   │   ├── src/publishers/            # 11 个平台发布器
│   │   │   ├── base-rpa-publisher.js  # 基类
│   │   │   ├── registry.js            # 平台注册
│   │   │   └── {wechat-mp|zhihu|...|bilibili}.js
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
│       │   ├── core/            # QueryWorker/TaskScheduler 等
│       │   └── publishers/      # Python RPA 发布器
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

```
下载安装包 → 安装 → 首次运行
    │
    ├─ [自动] 检测 Python 3.12+ → 安装 pip 依赖
    ├─ [自动] 检测 Playwright Chromium → 提示安装
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
3. 点击发布 → 任务加入队列 → Playwright 自动化执行 → 结果通知

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
| RPA 被平台封禁 | 高 | 行为模拟 + 随机延迟 + Cookie 轮换 |
| 平台 UI 变更 | 中 | 模块化设计，单个发布器变更不影响整体 |
| Cookie 过期 | 低 | 自动检测 + 一键重新登录 |
| Playwright 兼容性 | 中 | 锁定 Chromium 版本 |

---

## 十、验收标准

### v1.1.0 验收（正式版）

- [x] **12 个平台**：微信/知乎/微博/抖音/小红书/视频号/快手/头条/YouTube/TikTok/B站/**百家号**
- [x] **格式适配器**：11 平台格式转换（HTML 白名单/截断/标签格式化）
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

## 十一、Roadmap

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0-P3 | 基础发布 + 任务队列 + 定时 + 统计 | ✅ |
| **蚁小二集成** | 分屏/回调/扫码/OAuth/SQLite/批量/B站/URL采集/托盘/快捷键/多账号 | ✅ |
| **V1.0 发布** | 首版 Release、运营启动 | ⏳ 待进行 |
| V1.1 格式适配 | Markdown → 各平台格式转换、封面图自动处理 | 📅 Phase 2 |
| V2.0 商业版 | 定价策略、高级功能分离 | 📅 规划中 |
