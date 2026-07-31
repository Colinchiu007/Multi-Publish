---
mapped_date: 2026-07-31
last_mapped_commit: 8001685ead710cab7f34ab9def5d0d98e929b3f3
working_tree_has_changes: true
scope: full-repo
---

# 测试体系

## 测试框架

- 桌面、RPA、共享工具和视频包主要使用 Vitest 4。
- API 发布引擎使用 Node.js test runner 与包内 `scripts/run-tests.js`。
- 自主测试包使用 `node --test tests/*.test.js`。
- Python 后端使用 pytest，Ruff 负责 Python lint。
- 浏览器 E2E 和视觉测试使用 Playwright；像素层使用 pixelmatch/pngjs，文字层使用 Tesseract。

## 规模与位置

- 当前 Git 跟踪文件中约有 499 个 `test/spec` 文件。
- Electron 主进程测试主要与实现同目录，集中在 `apps/desktop/electron/services/`、`ipc-handlers/` 和 `bootstrap/`。
- Renderer 测试位于 `apps/desktop/src/**/*.test.{js,ts}`，覆盖 view、component、composable、store 和 API。
- API 引擎有 100+ 测试文件，集中在 `packages/api-publish-engine/test/`。
- Python 后端约 90 个测试文件，集中在 `packages/python-backend/tests/`。
- E2E 位于 `apps/desktop/tests/e2e/`，视觉框架位于 `apps/desktop/tests/visual-testing/`。

## Vitest 配置

- 主配置为 `apps/desktop/vitest.config.js`，默认 `jsdom`、单 worker、禁用文件并行。
- `apps/desktop/vitest.smoke.config.js` 使用 Node 环境执行启动 smoke。
- `apps/desktop/vitest.stryker.config.js` 为变异测试排除视觉、E2E 和不兼容测试。
- Coverage provider 为 V8，当前阈值：statements 55%、branches 40%、functions 60%、lines 55%。
- 覆盖范围重点包括 Electron service/IPC/core/bootstrap 与 Renderer store/composable。

## 测试层级

- 单元测试：领域函数、adapter、store、composable、service 与安全校验。
- 集成测试：真实 bridge、HTTP server、临时 PostgreSQL/文件集、IPC 注册与服务编排。
- 启动测试：`npm run test:startup -w @multi-publish/desktop`。
- Browser E2E：`npm run test:e2e -w @multi-publish/desktop`。
- 视觉回归：`npm run test:visual:pixel -w @multi-publish/desktop`。
- 故障与随机测试：`test:fault`、`test:monkey`；变异测试为 `test:mutation`。
- Windows 打包与真实 GUI 启动是 Electron 主进程变更的独立门禁，不能由单测替代。

## CI 门禁

- `.github/workflows/quality-gate.yml` 执行 TypeScript、JS 语法、密钥扫描、工作区测试、coverage、IPC、视觉、E2E 和自主覆盖审计。
- `.github/workflows/electron-ci.yml` 与 `build.yml` 覆盖 Electron 构建和产物。
- `.github/workflows/gui-test.yml`、`visual-test.yml` 承担 GUI/视觉专项。
- `.github/scripts/check-hardcoded-secrets.js` 和 `check-ipc-bridge.js` 是静态合同检查。

## 测试编写模式

- Bug 回归测试与实现同目录命名为 `{module}.test.js`，优先使用真实依赖和临时资源。
- 文件系统、Key、数据库和 server 测试必须使用唯一临时目录，避免并行会话污染。
- 安全合同测试同时覆盖正常路径、边界值、恶意输入和依赖不可用。
- Composable 测试包含模板所需导出的完整性断言。
- Bridge 测试除断言模块名外，还要真实启动目标模块并完成 health check。

## 已知测试边界

- Vitest 主配置显式排除 E2E、视觉和部分 bridge 集成测试，不能把 `npm test` 等同于全门禁。
- 外部身份、ECS、真实平台账号和签名密钥仍需要环境验收，不能完全在本地自动化。
- 当前工作树含未提交改动，本地图没有运行全量测试；测试状态应以最新 CI/门禁记录为准。
