---
mapped_date: 2026-07-31
last_mapped_commit: 8001685ead710cab7f34ab9def5d0d98e929b3f3
working_tree_has_changes: true
scope: full-repo
---

# 技术栈

## 运行时与语言

- 主工作区是 npm workspaces monorepo，入口清单为 `package.json`，工作区范围是 `apps/*` 与 `packages/*`。
- CI 使用 Node.js 22，业务包最低约束见 `packages/api-publish-engine/package.json` 的 Node.js 18+。
- 桌面应用使用 Electron 43.1.1，主进程为 CommonJS JavaScript，入口是 `apps/desktop/electron/main.js`。
- Renderer 使用 Vue 3.5、Pinia 2、Vue Router 4、Element Plus 2 与 Vite 6，入口是 `apps/desktop/src/main.js`。
- 视频核心包含 TypeScript 包 `packages/story2video-engine/`，并由 TypeScript 6 做桌面类型检查。
- Python 后端要求 Python 3.10+，配置在 `packages/python-backend/pyproject.toml`，服务入口为 `packages/python-backend/src/server.py`。

## 核心框架

- Electron 主进程通过 DI 容器、分阶段 bootstrap 和 IPC handler 组织，主要位于 `apps/desktop/electron/core/`、`bootstrap/`、`ipc-handlers/`。
- Python 服务使用 FastAPI、Uvicorn、Pydantic、HTTPX、Cryptography、Loguru 与 Playwright。
- API 发布服务使用 Node.js 原生 `http`，实现位于 `packages/api-publish-engine/src/publish-api-server.js`，未引入 Express/Koa。
- RPA 发布能力依赖 Electron WebContents 与 Playwright，主要位于 `packages/rpa-engine/` 和 `apps/desktop/electron/services/`。
- 视频渲染由 `packages/story2video-engine/`、`packages/remotion-composer/` 与 Python video creation 模块共同承担。

## 数据与持久化

- 桌面本地结构化存储使用 `sql.js`，封装位于 `apps/desktop/electron/services/sqlite-wrapper.js` 与 `store.js`。
- 业务身份和 entitlement 使用 PostgreSQL，Node 驱动为 `pg`，迁移在 `migrations/postgresql/`。
- Python 后端仍保留 JSON 文件与进程内任务状态，入口实现见 `packages/python-backend/src/server.py`。
- API Key 文件采用 `proper-lockfile` 做单 writer 协调，实现在 `packages/api-publish-engine/src/api-key-manager.js`。

## 构建与质量工具

- Electron/Vue 构建由 Vite、esbuild、electron-builder 完成，打包配置在 `apps/desktop/package.json`。
- JavaScript/TypeScript 测试以 Vitest 4 为主，部分包使用 Node.js 内置 test runner。
- Python 测试使用 pytest；静态规则使用 Ruff，配置在 `packages/python-backend/pyproject.toml`。
- 浏览器、E2E 和视觉回归使用 Playwright、pixelmatch/pngjs 与 Tesseract OCR。
- 变异测试使用 Stryker，覆盖率由 Vitest V8 provider 收集。
- JavaScript 规范工具包括 ESLint 9 与 Prettier 3；循环依赖检查使用 Madge。

## 主要工作区

- `apps/desktop/`：Electron 桌面产品、Vue UI、IPC、打包和 GUI 测试。
- `packages/api-publish-engine/`：HTTP 发布 API、身份认证、Webhook、PostgreSQL 与平台适配器。
- `packages/python-backend/`：FastAPI、RPA publisher 与视频生成后端。
- `packages/story2video-engine/`：纯 TypeScript 视频编排逻辑。
- `packages/remotion-composer/`：Remotion 合成组件与媒体资产。
- `packages/ai-autonomous-tester/`：PRD/DOM/OCR/视觉自主测试工具。
- `packages/shared-utils/`：跨包共享工具与路径合同。

## 配置来源

- 环境变量模板位于 `.env.example`，部署模板位于 `deploy/logto/*.example`。
- 平台与应用配置位于 `config/config.yaml`、`config/platforms.yaml` 和 `config/identity-public.json`。
- GitHub Actions 门禁位于 `.github/workflows/`，本地强制门禁位于 `.quality-gates.md` 与 `AGENTS.md`。
