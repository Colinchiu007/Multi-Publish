# Changelog

## v1.0.4 (2026-06-10)

### 修复
- **自动更新下载无反应** — `package.json` 添加 `publish` 配置（`provider: github`），`electron-updater` 才能解析下载 URL
- **下载按钮无视觉反馈** — `handleDownload()` 立即设置 `downloading=true` + 错误捕获

## v1.0.3 (2026-06-10)

### 新增
- **今日头条发布器** — Playwright RPA，支持图文 + 视频发布
- **YouTube 发布器** — Playwright RPA，视频发布（标题+描述+上传）
- **TikTok 发布器** — Playwright RPA，视频发布（标题+标签+上传）
- **账号/发布页更新** — 10 平台完整列表

## v1.0.2 (2026-06-10)

### 新增
- **视频号发布器** — Playwright RPA，支持视频上传 + 图文发布
- **快手发布器** — Playwright RPA，支持视频上传 + 图文发布
- **视频文件上传** — 发布页面支持拖拽上传 mp4/mov/avi（视频号/快手/抖音可用）
- **账号管理 UI 增强** — 新增「新增账号」对话框，支持 7 平台选择

### 修复
- 首次运行引导 `first-run.js` — 修正 playwright 浏览器安装路径
- 自动更新 `auto-updater.js` — 404 错误显示"当前已是最新版本"而非崩溃
- CI `build.yml` — `--publish=never` 防止 Release 创建 403 错误
- CI `release job` — 生成 `latest.yml` 供 electron-updater 使用
- 打包 `package.json` — `playwright` 从 devDependencies → dependencies，`node_modules` 加入打包列表

## v1.0.1 (2026-06-10)

### 修复
- 自动更新 `latest.yml` 生成 — CI release job 计算 SHA256 + 版本号
- 自动更新 404 友好提示

## v1.0.0 (2026-06-10)

🎉 **首个正式 Release！** 多平台内容一键发布桌面工具。

### 新增功能

**平台发布器（5 个平台）**
- **微信公众号** ✅ — Playwright RPA 自动化，草稿编辑 → 群发
- **知乎** ✅ — 文章发布 + 话题标签
- **微博** ✅ — 图文发布
- **抖音** ✅ — 图文发布
- **小红书** ✅ — 笔记发布（标题+正文+标签）

**核心功能**
- 富文本编辑器（Quill）— 支持格式、图片、排版
- 多账号管理 — Cookie 加密持久化（AES-256），重启后自动加载
- 单篇/批量发布 — 选择多平台一键发布
- 任务队列 — 顺序执行 + 自动重试（可配置次数）
- 定时发布 — 设定时间自动发布，支持 App 关闭后重启恢复
- 发布历史 — JSONL 持久化，按平台/时间可追溯
- 统计看板 — 总发布数、各平台分布、成功率、趋势图

**系统功能**
- 首次运行引导 — 自动检测并安装 Python 依赖 + Playwright 浏览器
- 自动更新 — electron-updater，从 GitHub Release 拉取
- 跨平台 — Windows + Linux 双平台支持
- GitHub Actions CI — 自动构建

**PROJECT-001 集成**
- Aggregator Bridge — 接收内容聚合器文章推送，自动加入发布队列

### 技术架构
- Electron Shell + Vue 3 + Vite 前端
- Playwright RPA 引擎（Python FastAPI 后端子进程）
- AES-256 Cookie 加密 + JSON 持久化
- Electron-Updater 自动更新
