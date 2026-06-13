# CHANGELOG

All notable changes to this project will be documented in this file.

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
