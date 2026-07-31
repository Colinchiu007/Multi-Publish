---
mapped_date: 2026-07-31
last_mapped_commit: 8001685ead710cab7f34ab9def5d0d98e929b3f3
working_tree_has_changes: true
scope: full-repo
---

# 目录结构

## 顶层目录

- `apps/desktop/`：唯一桌面应用，包含 Electron、Vue、打包脚本和多层测试。
- `packages/`：可复用业务包、服务、RPA、视频与测试工具。
- `config/`：平台、公共身份与应用 YAML/JSON 配置。
- `migrations/`：身份与 Webhook 的 SQLite/PostgreSQL Schema 迁移。
- `deploy/logto/`：Logto、PostgreSQL、Nginx、监控、备份与发布检查。
- `01-docs/`：PRD、架构、测试计划、运行手册、复盘与验收证据。
- `.github/workflows/`：Windows/Linux CI、GUI、视觉、文档和自主审查门禁。
- `.ccg/`：CCG 任务状态、计划、审查和归档。
- `.quality-rhythm/`：项目内置质量节拍技能与安装材料。

## 桌面应用

- `apps/desktop/electron/main.js`：主进程入口，只做启动编排。
- `apps/desktop/electron/startup-compat.js`：扫描时未提交的启动前 GPU 与可写数据目录兼容层。
- `apps/desktop/electron/bootstrap/`：分阶段启动和事件/IPC 接线。
- `apps/desktop/electron/core/`：DI 容器与核心基础设施。
- `apps/desktop/electron/services/`：最大业务目录，含大量同目录测试。
- `apps/desktop/electron/ipc-handlers/`：IPC 命令边界与权限验证。
- `apps/desktop/electron/preload/`：Renderer bridge 模块与 bundle。
- `apps/desktop/src/views/`：路由级 Vue 页面。
- `apps/desktop/src/components/`：可复用组件。
- `apps/desktop/src/composables/`：跨组件业务流程和状态组合。
- `apps/desktop/src/stores/`：Pinia store。
- `apps/desktop/src/api/`：Renderer 对 preload API 的调用封装。
- `apps/desktop/tests/e2e/`：真实浏览器路由与工作流测试。
- `apps/desktop/tests/visual-testing/`：像素、OCR、截图和 Agent 报告。
- `apps/desktop/scripts/dev.js`：扫描时未提交的 Vite 与 Electron 开发启动协调器。

## 包目录

- `packages/api-publish-engine/src/`：API server、平台 adapter、上传、排期、审计与身份。
- `packages/api-publish-engine/test/`：Node 合同与集成测试，测试密度高。
- `packages/python-backend/src/multi_publish/`：Python 领域代码。
- `packages/python-backend/tests/`：pytest 单元与集成测试。
- `packages/story2video-engine/src/`：TypeScript 视频领域模块。
- `packages/remotion-composer/src/`：Remotion composition 与组件。
- `packages/rpa-engine/src/`：RPA 引擎公共入口和平台选择器。
- `packages/shared-utils/src/`：跨包工具，部分测试与源码同目录。
- `packages/ai-autonomous-tester/src/`：视觉、OCR、需求解析和自主循环。

## 命名与放置规则

- JavaScript 测试通常与实现同目录，命名为 `{module}.test.js`。
- Python 测试集中在 `packages/python-backend/tests/test_*.py`。
- Vue 页面使用 PascalCase，如 `CreateView.vue`；composable 使用 `useXxx.js`。
- IPC handler 以领域命名，如 `identity.js`、`license.js`，并由 `ipc-handlers/index.js` 聚合。
- 生产脚本位于包内 `scripts/`，GitHub 专用检查位于 `.github/scripts/`。
- 部署文件按系统归档到 `deploy/<system>/`，不要散落到应用源码目录。

## 边界注意事项

- `apps/desktop/electron/services/` 规模很大，新增能力应优先放入现有领域子目录。
- Renderer 不能直接 `require` Electron/Node；必须经 preload 和 IPC。
- workspace 生产入口依赖必须在所属包 `dependencies` 中直接声明。
- 打包资源必须同时满足 `apps/desktop/package.json` 的 `files`/`extraResources` 合同。
- 当前映射基于含未提交变更的工作树，不等同于单一 Git 提交的纯快照。
