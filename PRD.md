# PROJECT-003：多平台一键发布 — PRD

> **立项日期**: 2026-06-03
> **最后更新**: 2026-06-11
> **当前版本**: v1.0.7（Monorepo 重构）
> **产品定位**: 为内容生产者提供"采集 → 改写 → 发布"全流程闭环的一键发布桌面工具
> **目标用户**: 自媒体运营者、企业内容团队、SEO 运营
> **技术架构**: Electron + Vue 3 + Playwright RPA + Python FastAPI 后端（Monorepo）

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
|| ✅ 微信公众号 | 使用 Playwright RPA，支持草稿编辑 → 群发 |
|| ✅ 知乎 | Playwright RPA，文章发布 + 话题标签 |
|| ✅ 微博 | Playwright RPA，图文发布 |
|| ✅ 抖音 | Playwright RPA，图文/视频发布 |
|| ✅ 小红书 | Playwright RPA，标题+正文+标签 |
|| ✅ 视频号 | Playwright RPA，视频/图文发布 |
|| ✅ 快手 | Playwright RPA，视频/图文发布 |
|| ❌ 不包含 | 掘金、CSDN（由 PROJECT-002 负责）、内容创作（由 PROJECT-001 负责） |

---

## 二、平台策略

### 2.1 平台支持矩阵

| 平台 | 优先级 | 技术路线 | 状态 |
|------|--------|----------|------|
| **微信公众号** | P0 | Playwright RPA | ✅ v1.0.0 已实现 |
| **知乎** | P1 | Playwright RPA | ✅ v1.0.0 已实现 |
| **微博** | P2 | Playwright RPA | ✅ v1.0.0 已实现 |
| **抖音** | P2 | Playwright RPA | ✅ v1.0.0 已实现（图文+视频） |
| **小红书** | P4 | Playwright RPA | ✅ v1.0.0 已实现 |
| **视频号** | P1 | Playwright RPA | ✅ v1.0.2 已实现（视频+图文） |
| **快手** | P1 | Playwright RPA | ✅ v1.0.2 已实现（视频+图文） |
| **今日头条** | P1 | Playwright RPA | ✅ v1.0.3 已实现（图文+视频） |
| **YouTube** | P1 | Playwright RPA | ✅ v1.0.3 已实现（视频） |
| **TikTok** | P1 | Playwright RPA | ✅ v1.0.3 已实现（视频） |

### 2.2 技术路线

所有平台均使用 **Playwright RPA** 模拟浏览器操作，通过 Cookie 保持登录状态。Python 后端作为 RPA 适配器执行浏览器自动化操作，Electron 主进程管理任务队列和平台调度。

---

## 三、功能需求

### 3.1 核心功能

#### F1：平台账号管理

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 添加平台 | 选择平台类型，打开浏览器窗口完成登录 | ✅ |
| Cookie 加密 | 所有 Cookie 文件加密存储（AES-256） | ✅ |
| 登录状态检测 | 定期检测 Cookie 是否过期，支持一键重新登录 | ✅ |
| 多账号支持 | 同一平台管理多个账号 | ✅ |

#### F2：内容发布

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 单篇发布 | 手动输入标题 + 内容 → 选择平台 → 发布 | ✅ |
| 批量发布 | 选择多平台 → 一次点击全部发布 | ✅ |
| 定时发布 | 设置发布时间 → 后台定时任务执行（持久化，重启恢复） | ✅ |
| 富文本编辑器 | Quill 编辑器，支持格式、图片、排版 | ✅ |

#### F3：发布任务管理

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 任务队列 | 顺序执行 + 自动重试（可配置次数 2 次） | ✅ |
| 实时进度 | IPC 推送发布进度（当前阶段/结果/错误） | ✅ |
| 结果通知 | 成功/失败通知，失败原因记录 | ✅ |
| 重试机制 | 失败自动重试，通知重试进度 | ✅ |

#### F4：发布历史与统计

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 历史记录 | JSONL 文件持久化，记录每次发布详情 | ✅ |
| 统计看板 | 总发布数、各平台分布、成功率、趋势图 | ✅ |
| 历史筛选 | 按平台/时间/状态筛选历史记录 | ✅ |
| 详情查看 | 查看单次发布的完整信息 | ✅ |

#### F5：自动更新

| 子功能 | 描述 | 状态 |
|--------|------|------|
| 更新检测 | 启动时自动检查 GitHub Release 新版本 | ✅ |
| 后台下载 | 发现新版本自动下载安装包 | ✅ |
| 静默安装 | 下载完毕后提示重启安装 | ✅ |

#### F6：首次运行引导

| 子功能 | 描述 | 状态 |
|--------|------|------|
| Python 依赖自动安装 | 检测 pip + requirements-runtime.txt 并安装 | ✅ |
| Playwright 浏览器检测 | 自动检测是否已安装 Chromium | ✅ |
| 安装进度 UI | 显示依赖安装进度条 | ✅ |

#### F7：PROJECT-001 集成

| 子功能 | 描述 | 状态 |
|--------|------|------|
| Aggregator Bridge | 接收 PROJECT-001 内容聚合器的文章推送 | ✅ |
| 自动发布 | 收到文章后自动加入任务队列批量发布 | ✅ |

### 3.2 非功能需求

| 需求 | 指标 | 状态 |
|------|------|------|
| 并发发布 | 支持同时发布到 5 个平台（顺序执行） | ✅ |
| 数据加密 | Cookie 文件 AES-256 加密存储 | ✅ |
| 发布历史 | JSONL 持久化，按平台/时间可追溯 | ✅ |
| 跨平台 | Windows + Linux | ✅ |
| 自动构建 | GitHub Actions 双平台 CI | ✅ |
| 自动更新 | electron-updater，从 GitHub Release 拉取 | ✅ |

---

## 四、技术架构

### 4.1 架构图

```
┌──────────────────────────────────────────────────┐
│              apps/desktop/electron/               │
│              Electron Shell + Vue 3 UI            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ 发布界面   │  │ 账号管理  │  │ 统计看板  │       │
│  └─────┬────┘  └────┬─────┘  └─────┬────┘       │
│        │            │              │              │
│  ┌─────┴────────────┴──────────────┴─────┐       │
│  │        IPC Bridge (preload.js)        │       │
│  └────────────────┬──────────────────────┘       │
│                   │                              │
│  ┌────────────────┼──────────────────────┐       │
│  │    Task Queue  │    Scheduler         │       │
│  │  @multi-publish/shared-utils          │       │
│  └────────────────┴──────────────────────┘       │
│                   │                              │
│  ┌────────────────┴──────────────────────┐       │
│  │     Publisher Registry                  │       │
│  │   10 platforms (WeChat|Zhihu|Weibo...)  │       │
│  └────────────────┴──────────────────────┘       │
│                   │                              │
│  ┌────────────────┴──────────────────────┐       │
│  │   @multi-publish/rpa-engine            │       │
│  │   Playwright RPA Engine                │       │
│  │   + Python Backend (:8299)             │       │
│  └───────────────────────────────────────┘       │
│                                                   │
│  ┌──────────────────────────────────────┐        │
│  │  Publish History (JSONL)             │        │
│  │  Aggregator Bridge (001 集成)         │        │
│  │  Auto Updater (electron-updater)     │        │
│  └──────────────────────────────────────┘        │
└──────────────────────────────────────────────────┘
```

### 4.2 Monorepo 目录结构

```
multi-publish/
├── apps/desktop/                # Electron 桌面应用
│   ├── electron/                # Electron 主进程 + IPC
│   │   ├── main.js              # 入口：窗口管理、IPC 注册
│   │   ├── preload.js           # 预加载脚本（contextBridge）
│   │   ├── python-bridge.js     # Python 后端子进程管理
│   │   ├── playwright-manager.js → packages/rpa-engine
│   │   ├── task-queue.js → packages/shared-utils
│   │   ├── scheduler.js         # 定时发布（路径注入）
│   │   ├── publish-history.js   # 发布记录（路径注入）
│   │   ├── cookie-store.js → packages/rpa-engine
│   │   ├── aggregator-bridge.js → packages/shared-utils
│   │   ├── auto-updater.js      # electron-updater
│   │   ├── first-run.js         # 首次运行引导
│   │   └── publishers/          # 账号管理 + 发布器注册
│   │       └── account-manager.js
│   ├── src/                     # Vue 3 前端
│   │   ├── views/               # 页面：Home/Dashboard/Publish/Accounts/FirstRun
│   │   ├── components/          # 组件：ArticleEditor
│   │   ├── router/              # Vue Router
│   │   ├── styles/              # Cohere 风格 CSS
│   │   └── App.vue
│   ├── vite.config.js           # Vite 构建
│   └── package.json
├── packages/
│   ├── rpa-engine/              # RPA 引擎（独立 npm 包）
│   │   ├── src/playwright-manager.js  # 浏览器管理（去 Electron 化）
│   │   ├── src/cookie-store.js        # Cookie 加密存储
│   │   ├── src/publishers/            # 10 个平台发布器
│   │   │   ├── base-rpa-publisher.js  # 基类
│   │   │   ├── registry.js            # 平台注册
│   │   │   └── {wechat_mp|zhihu|...}.js
│   │   └── package.json
│   ├── shared-utils/          # 共享工具库（独立 npm 包）
│   │   ├── src/task-queue.js    # 任务队列（顺序+重试）
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

### v1.0.7 验收（当前）

- [x] 10 个平台账号管理（添加/删除/登录状态检测）
- [x] 单篇/批量发布到多平台
- [x] 定时发布（持久化 + 重启恢复）
- [x] 发布历史可查看、可筛选
- [x] 统计看板数据正确
- [x] 首次运行自动安装 Python 依赖 + Playwright
- [x] 自动更新（electron-updater + GitHub Release）
- [x] Cookie AES-256 加密存储
- [x] PROJECT-001 集成（Aggregator Bridge）
- [x] Monorepo 结构（apps/desktop + packages/rpa-engine + packages/shared-utils + packages/python-backend）
- [ ] Pending: 端到端测试（需真实账号凭证）
- [ ] Pending: 首个正式版 Release（v1.1.0）

### v1.1.0 目标（Roadmap）

详见 `docs/roadmap-v1.1.0.md` — 产品稳定 → 运营启动 → 付费闭环 → 迭代增长

---

## 十一、Roadmap

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0：Electron 骨架 + 微信发布 | 桌面应用框架、微信 RPA | ✅ |
| P1：知乎 + 任务队列 + 多账号 | 知乎 RPA、富文本编辑器 | ✅ |
| P2：微博 + 抖音 + 001 集成 + 打包 | 微博/抖音 RPA、Aggregator Bridge、Electron 打包 | ✅ |
| P3：定时发布 + 群发 + 历史 | 定时调度、发布历史、统计看板 | ✅ |
| P4：小红书 + 自动更新 | 小红书 RPA、electron-updater | ✅ |
| **V1.0 发布** | 首版 Release、运营启动 | ⏳ 待进行 |
| V1.1 格式适配 | Markdown → 各平台格式转换、封面图自动处理 | 📅 Phase 2 |
| V2.0 商业版 | 定价策略、高级功能分离 | 📅 规划中 |
