# CHANGELOG

All notable changes to this project will be documented in this file.

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
