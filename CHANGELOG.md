## [v1.6.2] - 2026-06-30

### Fixed — CI 跨平台构建修复

- **macOS 构建**: `macos-latest` runner 为 ARM 架构，移除 `--x64` 标志改为 `--universal` 统一二进制构建（#57）
- **Linux 构建**: `ubuntu-latest`（Ubuntu 24.04+）缺少 `libfuse2`，AppImage 打包依赖 FUSE2（#57）
- **cloud-publisher.js**: 修复因 FUSE 截断导致文件未提交 git 的问题（#56）
- **macOS sed 兼容性**: 替换 BSD sed 为 `node -e` JSON 编辑，跨平台一致（#56）

### CI/CD

- 三平台 matrix: `windows-latest`, `ubuntu-latest`, `macos-latest`
- 构建产物: Windows (.exe), Linux (.AppImage), macOS (.dmg/.zip)

## [v1.6.0] - 2026-06-29

### Added — 蚁小二逆向工程复用（3 个共享工具模块）

- **ChunkedUploader** (`packages/shared-utils/src/chunked-uploader.js`): 通用分片上传器
  - 文件自动分片（可配置片大小，默认 5MB）
  - 串行逐块上传（可配置并发数）
  - 进度回调 + EventEmitter 事件（chunk:uploaded / upload:complete / upload:error）
  - 支持取消（cancel()）
  - 17 测试用例全部通过

- **ProxyPool** (`packages/shared-utils/src/proxy-pool.js`): 代理池轮换 + 健康检查
  - 添加/移除/批量添加代理
  - Round-robin 轮换获取下一个可用代理
  - 健康检查（真实 HTTP 连接测试 + 延迟记录）
  - 自动移除失效代理（removeDead）
  - EventEmitter 事件通知（proxy:added / proxy:removed / proxy:tested）
  - 26 测试用例全部通过

- **AnalyticsService** (`packages/shared-utils/src/analytics-service.js`): 平台数据分析服务
  - Provider 模式注册各平台数据获取函数
  - 单平台数据获取 + 多平台并行概览（fetchOverview）
  - 指标归一化（normalizeMetrics / normalizeTrend）
  - 错误隔离（一个平台失败不影响其他平台）
  - EventEmitter 事件通知（data:fetched / data:error / provider:registered）
- **AnalyticsService** (`packages/shared-utils/src/analytics-service.js`): 平台数据分析服务
  - Provider 模式注册各平台数据获取函数
  - 单平台数据获取 + 多平台并行概览（fetchOverview）
  - 指标归一化（normalizeMetrics / normalizeTrend）
  - 错误隔离（一个平台失败不影响其他平台）
  - EventEmitter 事件通知（data:fetched / data:error / provider:registered）
  - 20 测试用例全部通过

### Added — F15 发布频率控制

- **PublishIntervalGuard** (`packages/shared-utils/src/publish-interval-guard.js`): 同账号发布间隔限制
  - `canPublish(platform, accountId)`: 检查是否达到 5 分钟间隔
  - `recordPublish(platform, accountId, timestamp?)`: 记录发布时间
  - `getRemainingWait(platform, accountId)`: 返回剩余等待时间
  - 可插拔存储：默认 InMemoryStore，通过 `{ get, set }` 接口可替换为 SQLite/Redis
  - 跨账号/跨平台隔离：同一账号不同平台互不影响，不同账号同平台互不影响
  - 12 测试用例全部通过（包含边界、自定义间隔、外部存储）
- **TaskQueue 集成**: 构造函数接收 `publishIntervalGuard` 选项
  - 执行任务前检查间隔限制，被拦截时触发 `publish:blocked` 事件并自动延迟重试
  - 发布成功后自动记录到 guard（`task.article.accountId` 作为账号标识）
  - 无 guard 或无 accountId 时行为不变（向后兼容）
  - 6 集成测试用例全部通过
- **Store 持久化** (`apps/desktop/electron/store.js`): 新增 `publish_timeline` 表
  - `getPublishTimeline(key)`: 查询最后发布时间
  - `setPublishTimeline(key, timestamp)`: 记录发布时间
  - 通过 Store 适配器注入 guard，重启 App 后间隔状态不丢失
- **Main.js 集成**: 创建 Store 适配器 → PublishIntervalGuard → TaskQueue 串联
  - `publish:blocked` 事件处理器向前端发送等待提示

### Changed

- packages/shared-utils/src/index.js: 新增 ChunkedUploader / ProxyPool / AnalyticsService 导出
- 01-docs/PRD.md: 新增 F14 共享工具库新模块章节

### Added — 全平台 Release 支持

- **macOS 构建**: 首次支持 macOS DMG/ZIP 构建（GitHub Actions + electron-builder）
  - CI matrix 新增 macos-latest runner
  - 自动产出的 DMG 安装包和 ZIP 便携版
  - 无代码签名（需用户右键→打开以绕过 Gatekeeper）
- **Linux AppImage**: 修复 Linux 构建，从 `--dir` 升级为完整 AppImage
- **Release 工作流**: 三平台 artifacts 扁平化收集发布
- **PRD 更新**: v1.x 发布状态标记为 ✅


---

# CHANGELOG

All notable changes to this project will be documented in this file.


## [v1.5.0] - 2026-06-28

### Added — 云端发布模块（F13）

- **CloudPublisher 类** (`cloud-publisher.js`): Electron 主进程 HTTP 通信层，连接 orchestrator 提交/查询任务
- **前端 CloudPublish.vue**: 云端发布专属页面：提交表单 + 任务列表 + 进度轮询
- **mode 选路**: `POST /api/jobs/publish-video` 支持 `mode: "rpa"|"cloud"` 字段
- **PublishPoller 跳过**: `input_data.mode === "cloud"` 时 PublishPoller 跳过不处理
- **IPC handlers**: `cloud-publisher:submit/list-tasks/get-task/platforms` 4 个 IPC 通道
- **orchestrator stub**: `POST /publish-video` 支持 cloud 模式，stub 模拟 10s 延迟返回成功

### Added — ECS 云端 API（F12 · 🆕）

- **B站云端 API** (`orchestrator/services/bilibili_publisher.py`): Cookie-based 直连发布，444 行
- **抖音云端 API** (`orchestrator/services/douyin_publisher.py`): Cookie-based 直连发布，388 行


## [v1.4.0] - 2026-06-28

### Added — 内容情报引擎（F11）

- **跨源搜索** (`content-intelligence.js`): Reddit/HN/GitHub 免费 API 搜索主题讨论，log10 互动评分排序
- **标题优化**: 搜索同类标题互动数据，提取高频模式，生成优化建议
- **发布后影响力追踪**: 发布后 T+1min/1h/24h/72h 定时捕捉社交提及，Dashboard 展示
- **发布时机优化**: 聚合搜索结果的时间分布，推荐各平台最佳发布时间
- **外部引用推荐**: 选中关键词，自动搜索权威来源/数据/讨论，一键插入正文
- **智能标签建议**: 基于内容关键词 + 平台标签体系，自动生成各平台标签建议
- **内容表现基准比较**: 同类内容互动数据聚合，对比自身表现给出差距分析
- **热榜趋势发现**: 实时聚合 Reddit/HN/GitHub 热门内容，主动发现创作主题
- **关键词背景监测** (`keyword-monitor.js`): 持续监测指定关键词的讨论热度变化，异常飙升时桌面通知

### Added — 情报引擎前端

- `ContentIntelligence.vue` — 策题/标题优化/标签建议/引用推荐/趋势发现/监测配置 6 个 Tab
- `PublishImpactTracker.vue` — 发布后影响力追踪仪表盘
- Sidebar 入口 + 路由注册

## [v1.3.0] - 2026-06-27

### Added

## [v1.3.0] - 2026-06-27

### Added

- **Instagram RPA Publisher** (instagram-rpa.js): Image carousel (up to 10), single image, Reels video
  - 2200-char caption limit, 2FA detection with clear error message
  - aria-label based selectors for stable DOM targeting
- **Facebook RPA Publisher** (facebook-rpa.js): Text+image, text+video, link sharing
  - Security challenge page handling
  - Text content and aria-label selectors
- **Twitter/X RPA Publisher** (twitter-rpa.js): Login detection, text/image publishing
  - 280-char (free) / 4000-char (Premium) limit handling
  - data-testid selector strategy for dynamic class names
  - Cookie persistence across sessions
- **Platform Registration**: Instagram (id=103), Facebook (id=104) in registry, config, selectors

### Changed

- platforms.yaml: Updated with Instagram and Facebook platform configs
- 01-docs/PRD.md: Platform count updated to 15

### Removed

- Playwright 15 个独立平台发布器 (wechat_mp/zhihu/weibo/douyin/xiaohongshu/tencent_video/
  kuaishou/toutiao/bilibili/baijiahao/youtube/tiktok/twitter/instagram/facebook): 全部迁移到 RpaViewManager（P2-E）
- playwright-manager.js: 浏览器管理模块已废弃
- base-rpa-publisher.js: Playwright 发布器基类已废弃
- manual-base-publisher.js: 手动发布器基类已废弃
- playwright npm 依赖: 从 apps/desktop/package.json 和 packages/rpa-engine/package.json 移除
- url-collector.js _collectViaBrowser(): Playwright 浏览器渲染采集方式移除
- publisher-router.js: Playwright 发布路由全量切换到 rpa_vm 模式（15 平台 + B 站）
- main.js: 移除 Playwright 浏览器初始化/关闭逻辑
- registry.js: getPublisherClass 降级为 stub（所有平台通过 RpaViewManager 执行）

### Changed

- rpa-view-manager.js: 修复 orphaned `try {` bug（P2-D），新增平台适配器 (douyin/wechat_mp/youtube)
- main.js: 清理所有 Playwright 引用和导入

## [v1.2.0] - 2026-06-26

### Added — Electron 原生 RPA 引擎 + 平台分类

**P0 核心功能（蚁小二逆向工程落地）：**

- **RpaViewManager** — 隐藏 BrowserWindow + executeJavaScript RPA 引擎，替代 Playwright 执行发布
  - CDP 文件上传：`DOM.setFileInputFiles` 绕过安全限制
  - DOM 工具集：`_waitForElement` / `_fillInput` / `_click` / `_waitForCondition`
  - 网络响应监控：webRequest.onCompleted 替代 Playwright response 监听
  - 双文件上传策略：大文件 CDP，小文件 JS DataTransfer
  - 每账号 Session 隔离：`session.fromPartition()` 独立 Cookie 分区
  - 进度事件 IPC 上报（rpa:progress）
- **平台分类** — `PlatformCategory` 枚举（VIDEO / IMAGE_TEXT / MIXED）
  - 12 平台自动归类，API `/api/platforms` 透传 category 字段
  - Python 后端 `PlatformCategory` enum + PLATFORM_META 映射
- **隐藏 BrowserView** — `authViewManager.loginSilent()` 静默登录验证
  - BrowserWindow({ show: false }) 后台恢复 Cookie 检测登录态
  - 无需弹出窗口即可验证账号有效性

### Changed

- **main.js** — 新增 `RpaViewManager` 实例 + RPA_VM_PLATFORMS 路由分支
- **publisher_manager.py** — API `list_platforms` 返回 category
- **Route 重构**：三条发布路径（Python / Electron RPA / Node.js Playwright）
  - BACKEND_PLATFORMS = []（预留）
  - RPA_VM_PLATFORMS = ['douyin']
  - 其余平台走 Playwright

### Removed

- `packages/python-backend/src/publishers/rpa_douyin.py` — 抖音发布已迁移至 Electron RPA
- `packages/python-backend/src/publishers/rpa_*.py` — 5 个废弃的 Python RPA 发布器（已在 v1.1.6 前后被 Playwright 替代）

## [v1.1.7] - 2026-06-17

### Added — Playwright 浏览器打包到安装包

- Chromium 捆绑到安装包内 `resources/playwright-browsers/`
- 首次运行零等待：浏览器路径 `app.isPackaged` 判断自动切换
- CI 打包脚本：postinstall 安装 → `npx playwright install chromium` → electron-builder extraResources 打包

### Fixed — Cannot find module 'axios' 打包失败

`electron/main.js` → `api-platform-adapter.js` → `require('axios')` 链条在 asar 打包后失灵。

根因：`api-platform-adapter.js` 依赖 `axios`，但 desktop 的 `package.json` 依赖链中从未显式声明 axios（只存在于 workspace 根 node_modules/，打包时 files 配置的 hoist 路径在 asar 解析时不一致）。

修复：
- `apps/desktop/package.json` 显式声明 `axios: ^1.9.0` 和 `form-data: ^4.0.0`
- 重新 `npm install` + 打包，三层验证（L1 asar 清单 / L2 require 链 / L3 Electron 启动）全部通过

## [v1.1.5] - 2026-06-14

### Fixed — Asar 打包后 require 路径全面修复

跨包相对路径（`../../../../apps/desktop/electron/xxx`）在 electron-builder 打包后的
app.asar 内无法解析。全面修复如下：

- **logger 模块** — `bilibili-rpa.js` 改用 `@multi-publish/shared-utils/src/logger`
- **api-platform-adapter** — 复制到 `packages/rpa-engine/src/`，本地化引用
- **python-bridge** — 复制到 `packages/rpa-engine/src/`，本地化引用
- **api-mode-publisher** — 重构为无循环依赖版本（移除 registry 导入）
- **registry** — API 平台改用 ApiModePublisher 子类工厂，避免循环依赖
- **task-queue** — desktop 跨包引用改为 `@multi-publish/shared-utils/src/task-queue`
- **CI 修复** — `Sync package version with tag` 步骤强制 `shell: bash`（PowerShell 不兼容）
- **安装包文件名** — 跟随 tag 版本号（`Multi-Publish.Setup.1.1.5.exe`）

### Changed

- `apps/desktop/package.json` 补上 `author` 字段
- CI workflow 更新：版本号同步、shell 策略

### Removed

- 旧的跨包相对路径引用全部消除
- `.github/workflows/build.yml.part` 清理

## [v1.1.0] - 2026-06-13

### Added — 正式版 Release

- **格式适配器** (F1) — 11 平台格式转换（HTML 白名单/长度截断/#标签）
- **封面图自动处理** (F2) — sharp 库中心裁剪+格式转换+质量自适应
- **百家号 RPA 发布器** (F3.1) — 第 12 个平台
- **平台 URL 配置化** (融媒宝 F1) — `config/platforms.yaml` 统一管理，PlatformConfig 加载器
- **敏感词预检** (融媒宝 F2) — DFA 算法 + 内置开源词库，发布前自动弹窗
- **数据同步系统** (融媒宝 F3) — 5 平台数据同步框架 + Dashboard 数据卡片
- **评论统一管理** (融媒宝 F4) — WebContentsView 内嵌各平台评论页
- **端到端测试** — 全部测试套件通过
- **CI 自动 Release** — GitHub Actions auto-tag + auto-release
- **Playwright 浏览器捆绑** — electron-builder extraResources 将 Chromium 捆入安装包，离线可用
- **自动更新 GFW 静默** — 网络错误（超时/DNS 失败/断网）静默处理，不弹错误提示

### Fixed

- **CI 修复**（5 轮迭代）— electron-builder 25.1.8 内置 rebuilder 失败问题
  - 显式声明 `app-builder-bin` 为根依赖（避免 devDep hoisting 被跳过）
  - 单独执行 `npx @electron/rebuild -f -w better-sqlite3` + `npmRebuild: false`
  - Windows runner Playwright 步骤强制 `shell: bash`（PowerShell 不认 ENV=val cmd）
- **Release body 提取** — 改用 awk 显式块匹配，支持中文标题，自动附 CHANGELOG 链接

### Changed

- PRD v1.1：12 平台矩阵、新增融媒宝四阶段功能
- platforms.yaml 统一管理平台配置，替代多处硬编码
- rules.js/presets.js 改为从 PlatformConfig 加载

## [v1.0.13] - 2026-06-13

### Added — 蚁小二逆向工程集成（全部 17 个模块）

- **分屏监控** (WebviewManager) — 2/3/4/6 分屏实时监控，独立 Session/Cookie
- **实时回调服务器** (CallbackServer) — HTTP POST 回调 + 59s 心跳，端口 16521
- **扫码登录** (QrCodeLogin) — 3 策略自动检测微信生态平台二维码（img/canvas/轮询）
- **OAuth 2.0 认证** (OAuthManager) — YouTube/TikTok/微博/抖音 API Token 授权
- **SQLite 统一存储** (Store) — better-sqlite3，替代零散 JSONL，6 表
- **批量发布管理器** (BatchManager) — 批量编辑/排期/复制
- **URL 内容采集** (UrlCollector) — HTTP(Cheerio)+浏览器(Playwright)双模式，og:meta 提取
- **系统托盘** (SystemTray) — 最小化到托盘，托盘菜单，闪烁告警
- **全局快捷键** (HotKeys) — 6 组 Ctrl+Alt+P/M/D/C/H/Q
- **B站发布器** (BiliBiliPublisher) — API+RPA 双模式，专栏/视频发布
- **发布后状态监控** (PublishMonitor) — 自动轮询平台审核状态
- **并发 3 任务 + 崩溃恢复** — maxConcurrent=3，serialize()/deserialize() 持久化
- **任务取消** — cancel() 支持等待中/执行中任务
- **多账号同平台切换** — Store + App.vue 侧栏下拉 + Publish.vue 发布时选账号
- **多账号同时发布** — 同平台选不同账号，一次发到多个账号
- **Accounts.vue 重写** — 按平台分组、默认标记、可编辑账号名、状态指示灯

### Fixed

- system-tray.js 重复 fs require 导致打包失败
- main.js 重复 minimize handler 冲突
- bilibili-rpa.js CSRF Token 提取按规范取后 16 位
- url-collector.js playwright-manager require 路径错误
- batch-manager.js async/await 未处理异常
- test_wechat_publisher.py MockResponse URL 匹配优先级 bug
- 各模块 require 路径验证通过

### Changed

- PRD 全面更新：11 平台矩阵、新版功能架构、新版验收标准
- AGENTS.md 同步新增模块清单
- CI auto-tag：构建成功后自动 bump patch + tag + release
- task-queue executor 自动加载账号 Cookie
- publish:batch IPC 支持 tasks[{platform,accountId}] 新格式

## [v1.0.7] - 2026-06-11

### Refactored

- **Monorepo 结构重构** — 拆分为 `apps/desktop/` + `packages/rpa-engine/` + `packages/shared-utils/` + `packages/python-backend/`
- RPA 引擎去 Electron 依赖，路径通过构造注入
- CI 工作流适配 Monorepo 路径
- 旧目录 `src-frontend/`、根目录 `vite.config.js` 已清理

### Changed

- PRD 更新：架构、路径、版本号同步到 v1.0.7
- README 更新：构建命令、目录结构
- `.gitignore` 新增 `package-lock.json`

---

## [v1.0.4] - 2026-06-10

### Added

- 今日头条、YouTube、TikTok 三个平台发布器（共 10 平台）
- PRD/CHANGELOG 同步更新

### Fixed

- auto-updater 下载按钮无反应 — 添加 `publish` 配置
- `artifactName` 含空格导致构建失败

---

## [v1.0.2] - 2026-06-05

### Added

- 视频号（Tencent Video）RPA 发布器
- 快手（Kuaishou）RPA 发布器
- 视频上传组件（Publish 页面）

### Updated

- PRD 同步更新 v1.0.2

---

## [v1.0.0] - 2026-06-03

### Added

- 微信公众号、知乎、微博、抖音、小红书 5 个平台 RPA 发布器
- 富文本编辑器（Quill）
- 账号管理 + Cookie 加密存储
- 任务队列 + 定时发布
- 发布历史 + 统计看板
- 首次运行引导（自动安装依赖）
- 自动更新（electron-updater）
- PROJECT-001 集成（Aggregator Bridge）
- GitHub Actions CI/CD
