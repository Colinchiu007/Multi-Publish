# Changelog

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
