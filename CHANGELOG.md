# CHANGELOG

All notable changes to this project will be documented in this file.

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
- main.j