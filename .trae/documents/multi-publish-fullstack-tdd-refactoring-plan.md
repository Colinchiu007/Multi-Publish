# Multi-Publish 全栈 TDD 重构方案

> **范围**：Electron 主进程 + Vue 渲染进程 + Python 后端 + Monorepo 包结构
> **风格**：测试先行 TDD——先补/修测试建立回归网，再做架构改造；每阶段独立可验证、可回滚
> **基线**：当前 1367 tests ALL GREEN（Python 68 + Vue 56 + Electron 主进程 ~50 + JS 包 ~55），不得在任一阶段破坏该基线
> **依据**：基于 `01-docs/archive/` 11 份历史分析 + `01-docs/` 7 份审计文档 + 全栈测试现状深度调查（已通过 6 个 search agent 完成）

---

## 一、总览与核心原则

### 1.1 重构驱动力（按优先级）

| 优先级 | 问题 | 影响 |
|--------|------|------|
| P0 | `publishers/account-manager.js` 5 个 require 断裂（account-state-restorer / credential-store / video-uploader / content-aggregator-bridge / api-platform-adapter） | 启动期可能抛 MODULE_NOT_FOUND |
| P0 | `container.setup.js` 依赖不存在的 `dist-ts/` 目录 | 未先跑 `tsc` 则启动崩溃 |
| P0 | api-publish-engine 8 个测试文件用 Jest API 但 jest 未安装 + `node test/*.test.js` 只执行首个文件 | 该包测试实际 0 运行 |
| P1 | DI 容器已写好（25 服务注册）但 main.js 未消费 + main.js 91-97 行孤立代码 | 架构核心病灶，阻碍后续解耦 |
| P1 | 35 个根目录 shim + 19 个 ipc-handlers .ts 死代码 + error-codes 四处定义 | 维护混淆，80+ 文件被无意义打包 |
| P1 | Electron services 25+ 核心模块零测试（store/credential-store/webview-manager/callback-server/oauth-manager/batch-manager 等） | 发布/账户/支付核心路径裸奔 |
| P1 | `flutter-skill-electron.js` 1206 行 + 0 测试 + 整个 flutter-skill-bridge 包无前端引用 | 是否维护的根本疑问 |
| P2 | Python `video_compose.py` 2584 行 <8% 覆盖 + 25+ 视频 provider 零测试 + stock_sources 16 个零测试 | 视频创作核心无回归保护 |
| P2 | App.vue 437 行零测试 / Providers.vue 625 行 / Publish.vue 547 行 | 前端根组件回归风险高 |
| P2 | Python 巨型文件未拆（hyperframes 1204 / douyin 1202 / video_stitch 962 / character_animation 895） | 维护成本高 |
| P3 | 4 套测试框架并存（自定义 runner / Jest / Vitest / pytest） | 工具链不统一 |
| P3 | CI 质量门禁失效（quality-gate / Build & Release 预存失败，靠 bypass 绕过） | 门禁不是真门禁 |

### 1.2 核心原则

1. **TDD 红绿循环**：每个重构动作前先有失败测试（红）→ 重构使测试通过（绿）→ 清理（重构）
2. **不破坏绿基线**：每个 Phase 结束时 1367 测试仍 ALL GREEN；新增测试不计入基线但必须通过
3. **可回滚**：每个 Phase 独立 commit + git tag，失败可单独回滚
4. **复用优先**：现有测试资产先盘点（见 §二），可复用直接迁入，作废需有分析依据
5. **不引入新依赖**：除非必要，优先用项目已有的 vitest/jest/pytest 工具链
6. **遵循 AGENTS.md QM-1**：Electron 主进程代码改动后必须本地打包验证

---

## 二、现有测试资产盘点

### 2.1 复用清单（高质量，直接保留/迁入）

#### Electron 主进程（Vitest 阵营，co-located，质量优）

| 测试文件 | 覆盖范围 | 复用动作 |
|----------|----------|----------|
| `electron/ipc-handlers/store.test.js` | 16 handler 全注册 + 逐 channel + 错误码 | 保留 |
| `electron/ipc-handlers/publish.test.js` | 8 handler + queue/history/dashboard + 异常 | 保留 |
| `electron/ipc-handlers/scheduler.test.js` | 3 handler + 创建/列表/取消 + 异常 | 保留 |
| `electron/services/tasks-repo.test.js` | 真实 SQLite 临时库 + 6 状态常量 | 保留 |
| `electron/services/publish-history.test.js` | 真实 jsonl 落盘 + vi.resetModules 隔离 | 保留 |
| `electron/services/cookie-converter.test.js` | parse/normalize/serialize 边界完整 | 保留 |
| `electron/services/media-downloader.test.js` | Content-Type + Content-Disposition + ensureUniqueFilePath | 保留 |
| `electron/services/store-schema.test.js` | SCHEMA_SQL/TABLE_NAMES 一致性 | 保留 |
| `electron/services/abort-utils.test.js` | createAbort/checkAborted/wrapWithAbort/raceWithSignal | 保留 |
| `electron/services/content-intelligence-utils.test.js` | calculateStats + deduplicate + hourDistribution | 保留 |
| `electron/services/publisher-router.test.js` | ROUTE_TABLE + getRoute 异常 + PlatformConfig | 保留 |
| `electron/services/auth-view-cdp.test.js` | isLoginSuccess 多字段识别 | 保留 |
| `electron/services/rpa-helpers.test.js` | ProgressThrottle + FieldRetryState | 保留 |
| `electron/services/phase8-service-tests.test.js` | credential-store AES-256-GCM roundtrip | 保留 |
| `electron/services/payment-manager.test.js`（Vitest 版） | createOrder/getOrder/completePayment + 异常 | 保留 |
| `electron/services/store-interface.test.js` | store 接口契约 | 保留 |
| `electron/services/auth-view-session.test.js` | auth-view-session 子模块 | 保留 |
| `electron/services/publish-impact-tracker.test.js` | publish-impact-tracker | 保留 |
| `electron/services/content-intelligence.test.js`（Vitest 版） | content-intelligence 完整流 | 保留 |
| `electron/services/cloud-publisher.test.js`（Vitest 版） | cloud-publisher | 保留 |
| `electron/services/publish-poller.test.js`（Vitest 版） | publish-poller | 保留 |
| `electron/services/publish-alert.test.js`（Vitest 版） | publish-alert | 保留 |

#### Electron 主进程（Jest 阵营，迁 Vitest）

| 测试文件 | 覆盖范围 | 复用动作 |
|----------|----------|----------|
| `tests/redemption-codes.test.js` | generate/validate/generateBatch + 篡改检测 | 迁 Vitest，保留 |
| `tests/license-store.test.js` | PRO_FEATURES/FREE_FEATURES/TRIAL_DAYS 常量 | 迁 Vitest，保留 |
| `tests/ipc-handlers.test.js` | index.js 聚合注册 74+ handler | 迁 Vitest，保留 |
| `tests/smoke/startup.test.js` | ROUTE_TABLE 12 平台 + 模块解析防 dangling require | 迁 Vitest，保留 |
| `tests/api-publisher.test.js` | 源码文本正则校验 60+ 函数导出 | 迁 Vitest，保留 |
| `tests/i18n.test.js` | zh/en locale 文件存在性与内容 | 迁 Vitest，保留 |
| `tests/onboarding.test.js` | 4 步骤 + complete/reset | 迁 Vitest，保留 |
| `tests/license-manager.test.js` | license-manager | 迁 Vitest，保留 |
| `tests/template-manager.test.js` | template-manager | 迁 Vitest，保留 |
| `tests/usage-tracker.test.js` | usage-tracker | 迁 Vitest，保留 |
| `tests/offline-manager.test.js` | offline-manager（需核对 onNetworkChange 语义） | 迁 Vitest，核对后保留 |
| `tests/container.test.js` | container.js 装配 | 迁 Vitest，保留 |
| `tests/error-codes.test.js` | error-codes | 迁 Vitest，保留 |
| `tests/flutter-skill-bridge.test.js` | flutter-skill-bridge（仅顶层入口） | 迁 Vitest，保留 |
| `tests/payment-ipc.test.js` | payment IPC（需修 mock 路径） | 迁 Vitest，修 mock 后保留 |
| `tests/e2e/*.test.js`（3 个） | 端到端发布/账户/删除 | 加 `test:e2e` 脚本，保留 |

#### Vue 渲染进程（全部 Vitest）

| 类别 | 高质量保留 | 处置 |
|------|-----------|------|
| store（4/4） | accounts/license/platforms/templates | 全保留 |
| api（5/5） | publisher/providers/electron-bridge/cloud-publisher/offline | 全保留 |
| composable（1/4） | useProviderFilters（间接覆盖 useProviderForm） | 保留 |
| 组件 | UiButton/UiModal/UiInput/UiSelect/UiBadge/UiCard/PlatformIcon/CommandPalette/AiWriterPanel/ArticleEditor | 保留 |
| 视图 | Home/Providers/Accounts/Dashboard/Publish/Collection 等 | 保留（mock 策略需统一） |

#### JS 包

| 包 | 测试 | 复用动作 |
|----|------|----------|
| ai-writer | `tests/index.test.js`（jest.mock axios） | 保留 |
| ai-writer-api | `tests/server.test.js`（supertest + jest.mock） | 保留 |
| flutter-skill-bridge | `__tests__/flutter-bridge.test.js`（30+ 断言 4 模块） | 保留 |
| api-publish-engine | base-adapter / publish-plan / plugin-loader / integration-key-manager / publish-api-server（修复后） | 重写为 Vitest，保留逻辑 |

#### Python 后端

| 测试文件 | 价值 | 复用动作 |
|----------|------|----------|
| `test_image_providers.py` | 14 provider 全覆盖 + 共享 helper（**标杆**） | 保留并作为其他 provider 测试模板 |
| `test__shared.py` | respx mock httpx 范式 | 保留 |
| `test_infrastructure.py` | 一拖四（_errors/_rate_limit/_retries/_auth） | 保留 |
| `test_account_store.py` | tmp_path 持久化范式 | 保留 |
| `test_audio__utils.py` | subprocess mock + GCP OAuth | 保留 |
| `test_new_publishers.py` | xiaohongshu/bilibili/platform_registry | 保留 |
| `test_douyin_publisher.py` + `test_douyin_rpa_fields.py` | douyin 完整覆盖 | 保留 |
| `test_query_worker.py` | abc.ABC 抽象契约（WeiboWorker 子类） | 保留（注：原"5 处 NotImplementedError"前提已过时，已重构为 abc） |
| `test_video_compose.py` | 仅 6 helper（<8% 覆盖） | 保留但需大幅扩展 |
| 其余 ~50 个 test_*.py | 覆盖 core/publishers/multi_publish 根/video_creation 大部分 | 保留 |

### 2.2 作废清单（含分析依据）

> **作废原则**：仅删除「确认死代码」或「测试无效且无法修复」的文件；可修复的优先修复而非删除。所有作废动作集中在 Phase 1 执行，单个 commit 可回滚。

#### Electron 主进程作废（13 个文件）

| 文件 | 作废依据 | 处置 |
|------|----------|------|
| `electron/core/container.test.ts` | `@ts-nocheck` + `jest.fn`，`require('./container')` 解析到 `.js` 非 `.ts`，文件名误导；不被任何 runner 拾取（Vitest include 不含 core，Jest testMatch 不含 .ts）；`tests/container.test.js` 已覆盖 container.js | 删除 |
| `electron/core/error-codes.test.js` | 与 `tests/error-codes.test.js` 完全重复；孤儿不被拾取 | 删除 |
| `electron/license-manager.test.js`（顶层） | 孤儿 + 与 `tests/license-manager.test.js` 重复 | 删除 |
| `electron/offline-manager.test.js`（顶层） | 孤儿 + 与 `tests/` + `phase10` 重复 | 删除 |
| `electron/template-manager.test.js`（顶层） | 孤儿 + 与 `tests/template-manager.test.js` 重复 | 删除 |
| `electron/redemption-codes.test.js`（顶层） | 孤儿 + 与 `tests/` 重复 | 删除 |
| `electron/usage-tracker.test.js`（顶层） | 孤儿 + 与 `tests/` 重复 | 删除 |
| `electron/flutter-skill-bridge.test.js`（顶层） | 孤儿 + 与 `tests/` 重复 | 删除 |
| `electron/ai-writer.test.js`（顶层） | 孤儿 + `jest.mock` + 与 `tests/ai-writer.test.js` 重复 | 删除 |
| `electron/core/container.setup.test.js` | 孤儿（Vitest include 不含 core） | **不删，迁 Vitest include**（setup 逻辑有价值） |
| `tests/__mocks__/ws.js` | 无人使用（flutter-skill-bridge 自带 factory） | 删除 |

#### Electron 重复测试（5 组二选一）

| 模块 | 保留（Vitest co-located） | 删除（Jest tests/） |
|------|--------------------------|---------------------|
| publish-alert | `electron/services/publish-alert.test.js` | `tests/publish-alert.test.js` |
| cloud-publisher | `electron/services/cloud-publisher.test.js` | `tests/cloud-publisher.test.js` |
| content-intelligence | `electron/services/content-intelligence.test.js` | `tests/content-intelligence.test.js` |
| publish-poller | `electron/services/publish-poller.test.js` | `tests/publish-poller.test.js` |
| payment-manager | `electron/services/payment-manager.test.js` | `tests/payment-manager.test.js` |

> **依据**：Vitest 版断言更新、co-located 与源码同目录便于维护；Jest 版经 moduleNameMapper 重定向后实际测同一份代码，纯属重复。

#### Electron 自定义 runner（3 个 .skip.js）

| 文件 | 作废依据 | 处置 |
|------|----------|------|
| `tests/api-platform-adapter.skip.js` | 自定义 assert runner，不被任何 npm script 拾取；路径写法怪异 `../../apps/desktop/...`；非 Electron 环境 `process.exit(0)` | **不直接删，重写为 Vitest**（api-platform-adapter 是 AGENTS.md 列出的 P1 模块） |
| `tests/render-engine.skip.js` | 自定义 runner，不被拾取 | 重写为 Vitest（render 参数校验逻辑好） |
| `tests/ipc-render-handler.skip.js` | 自定义 runner，不被拾取 | 重写为 Vitest（render IPC 透传校验有独立价值） |

#### Vue 渲染进程作废（5 个用例级问题）

| 文件/用例 | 作废依据 | 处置 |
|-----------|----------|------|
| `src/components/leaf.test.js`（31 行） | 3 个用例与 `more-components.test.js` 完全重复且更浅；UiCard padding 断言无效（只测固定 class） | 删除整个文件 |
| `views-coverage.test.js` Collection 用例 | `w.vm.drafts.splice(0,1)` 测的是数组方法不是组件行为 | 删除该用例 |
| `views-coverage2.test.js` Intelligence "triggers search" | `w.vm.searching = true` 后断言自身，零价值 | 删除该用例 |
| `views-deep2.test.js` CreateView aiWrite | `setTimeout 1100ms` 硬编码 + 弱断言（`text.length > 0`，初始内容也通过） | 重写为 `vi.useFakeTimers()` + `advanceTimersByTimeAsync` |
| `more-tests.test.js` 中含 `if(btn.length>0)` 的用例（~8 个） | 按钮缺失时静默通过；含 `w.vm.$.setupState` hack 绕过真实 UI | 重写：去除 hack + 真实按钮触发 + `await flushPromises` |

#### api-publish-engine 作废（23 个文件）

| 文件 | 作废依据 | 处置 |
|------|----------|------|
| `test-anti-detect.js` 等 15 个孤立 `test-*.js` | 不匹配 `*.test.js` glob，`npm test` 永不执行；与同名 `.test.js` 重复且更简陋 | 删除 15 个 |
| `adapters-interface.test.js` | 用 Jest 全局 API 但 jest 未安装，`node` 下抛 `ReferenceError: describe is not defined` | 重写为 Vitest（核心：验证全部平台适配器构造） |
| `api-router.test.js` | 同上 | 重写为 Vitest（核心：API 路由决策） |
| `tiktok.test.js` / `twitter.test.js` / `youtube.test.js` | 同上 | 重写为 Vitest |
| `signer.test.js` / `oss-uploader.test.js` / `cos-uploader.test.js` | 同上 | 重写为 Vitest |
| `publish-api-server.test.js` 第 231-271 行 | 结构损坏（未闭合 `t()` + 错位 `console.log` + `await server.start(0)`） | 修复语法 + 重写为 Vitest |

#### Python 后端作废

> **结论：Python 侧无需作废任何测试文件**。整体维护较好，仅 `test_video_compose.py` 覆盖严重不足（<8%），属"形式覆盖"而非"作废"，需在 Phase 5 大幅扩展而非删除。

### 2.3 测试缺口清单（按 Phase 排序）

#### Electron 主进程缺口（25+ 模块零测试，按重要性）

| 模块 | 重要性 | 行数 | Phase |
|------|--------|------|-------|
| `main.js` 启动测试 | QM-3 必补 | 360+ | Phase 3 |
| `store.js`（统一 SQLite） | P2 核心 | 383 | Phase 2 |
| `credential-store.js`（AES-256-GCM） | 安全关键 | — | Phase 2 |
| `webview-manager.js`（分屏 P0） | P0 | 261 | Phase 2 |
| `callback-server.js`（HTTP 回调 + 59s 心跳） | P1 | — | Phase 2 |
| `oauth-manager.js`（OAuth 2.0） | P2 安全 | — | Phase 2 |
| `batch-manager.js`（批量发布） | P2 | — | Phase 2 |
| `video-uploader.js`（分片上传） | P1 | — | Phase 2 |
| `publish-monitor.js`（QueryStateTaskScheduler） | P1 | — | Phase 2 |
| `qrcode-login.js`（扫码登录 P2） | P2 | — | Phase 2 |
| `account-state-restorer.js`（JSONL） | 重要 | — | Phase 2 |
| `url-collector.js`（og:meta） | P2 | — | Phase 2 |
| `hotkeys.js`（全局快捷键） | P2 | — | Phase 2 |
| `system-tray.js` | — | — | Phase 2 |
| `task-queue.js` | 核心 | — | Phase 2 |
| `auth-view-manager.js`（仅子模块有测） | 核心 | — | Phase 2 |
| `auto-updater.js` | — | — | Phase 2 |
| `keyword-monitor.js` | — | — | Phase 2 |
| `playwright-manager.js` / `stealth-helper.js` | — | — | Phase 2 |
| `render-engine.js` | — | — | Phase 2（重写 skip） |
| `pipeline-engine.js` / `composition-manager.js` / `ai-generator.js` / `video-engine.js` | — | — | Phase 2（迁 electron/tests/） |
| `api-platform-adapter.js` | P1 | — | Phase 2（重写 skip） |
| `python-bridge.js` / `provider-manager.js` / `analytics-providers.js` / `first-run.js` / `p1-integration.js` / `sqlite-wrapper.js` | — | — | Phase 2 |
| 16 个 ipc-handlers（account/analytics/ai/keyword/license/misc/offline/platform/proxy/render/sensitive/sync/templates/update/upload/video） | — | — | Phase 2 |

#### Vue 渲染进程缺口

| 模块 | 行数 | Phase |
|------|------|-------|
| `src/App.vue`（6 类职责） | 437 | Phase 4（拆分前置测试） |
| `src/views/PipelineView.vue` | 205 | Phase 4 |
| `src/views/CreateHistory.vue` | 155 | Phase 4 |
| `composables/useKeyboard.js` | — | Phase 4 |
| `composables/useTheme.js` | — | Phase 4 |
| `composables/useProviderForm.js`（独立 test） | — | Phase 4 |
| vitest.config.js coverage 段 | — | Phase 0 |

#### Python 后端缺口

| 模块/范围 | 行数 | Phase |
|-----------|------|-------|
| `video_compose.py` execute() 编排管线 | 2584 | Phase 5 |
| 25+ 视频 provider（kling/runway/veo/hunyuan/minimax/seedance/wan/cogvideo/grok/higgsfield/ltx 等） | — | Phase 5 |
| `stock_sources/` 16 个素材源 | — | Phase 5 |
| `wechat_publisher/client.py`（含 NotImplementedError） | 640+ | Phase 5 |
| `publishers/wechat_mp.py` | — | Phase 5 |
| `screen_capture_selector.py` | — | Phase 5 |
| conftest.py 共享 mock 基础设施 | — | Phase 0 |
| requirements-runtime.txt 硬编码 Windows 路径 + 缺 dev 依赖 | — | Phase 0 |

#### 跨包缺口

| 缺口 | Phase |
|------|-------|
| 跨包集成测试（JS ↔ Python） | Phase 6 |
| 覆盖率统计统一 | Phase 0 |
| CI 统一测试入口 | Phase 7 |

---

## 三、重构阶段（TDD 顺序）

### Phase 0：测试基础设施修复（前置必做，0 风险）

> **目标**：修复测试运行机制本身，让现有测试能正确跑起来。这是后续所有 TDD 工作的前置条件。

#### 0.1 修复 vitest.config.js include 范围

**文件**：`/workspace/apps/desktop/vitest.config.js`

**改动**：在 `include` 数组中加入 `electron/core/**/*.test.{js,ts}`，使 `container.setup.test.js` 等孤儿测试纳入运行。

#### 0.2 添加 e2e 测试 npm script

**文件**：`/workspace/apps/desktop/package.json`

**改动**：新增 `"test:e2e": "E2E=1 vitest run tests/e2e/"`，让 3 个 e2e 测试可手动触发。

#### 0.3 添加 coverage 配置

**文件**：`/workspace/apps/desktop/vitest.config.js`

**改动**：新增 `coverage` 段，启用 `@vitest/coverage-v8`，阈值 `lines: 60, branches: 50, functions: 60, statements: 60`（先设低门槛，后续逐步抬高）。

#### 0.4 修复 api-publish-engine 测试运行机制

**文件**：`/workspace/packages/api-publish-engine/package.json`

**改动**：
- 安装 `vitest` 作为 devDependency
- 将 `test` 脚本从 `node test/*.test.js` 改为 `vitest run`
- 后续 Phase 1 将 8 个 Jest 风格文件重写为 Vitest

#### 0.5 修复 Python 测试基础设施

**文件**：
- `/workspace/packages/python-backend/pyproject.toml`：新增 `[tool.pytest.ini_options]`，配置 `asyncio_mode = "auto"`、`testpaths = ["tests"]`
- `/workspace/packages/python-backend/requirements-runtime.txt`：移除 `shared-models @ file:///D:/Data/projects/shared-models` 硬编码路径，改为相对路径或独立 requirements-dev.txt 声明 `pytest / pytest-asyncio / respx / pytest-cov`
- `/workspace/packages/python-backend/tests/conftest.py`：扩展共享 fixtures（httpx client mock / tmp 工作区 / platform registry 重置）

#### 0.6 验证

- `cd /workspace/apps/desktop && npm test` 全绿
- `cd /workspace/apps/desktop && npm run test:vue` 全绿
- `cd /workspace/packages/python-backend && pytest` 全绿（68 文件）
- `cd /workspace/packages/api-publish-engine && npm test` 至少能跑（重写前的临时状态）

---

### Phase 1：零风险清理（删死代码 + 修 require 断裂 + 统一 error-codes）

> **目标**：不改变任何运行时行为，只清理死代码、修复断裂 require、统一单源。每步独立 commit。

#### 1.1 修复 5 个断裂 require（P0 CRITICAL）

**文件**：`/workspace/apps/desktop/electron/publishers/account-manager.js`

**问题**：第 11-12 行 `require('../account-state-restorer')` 等 5 个 require 指向根目录，但根目录无对应文件也无 shim。

**改动**：将 5 个 require 路径改为 `../services/account-state-restorer` 等：

```js
const accountStateRestorer = require('../services/account-state-restorer')
const credentialStore = require('../services/credential-store')
const videoUploader = require('../services/video-uploader')
const contentAggregatorBridge = require('../services/content-aggregator-bridge')
const apiPlatformAdapter = require('../services/api-platform-adapter')
```

**TDD**：先写测试 `tests/publishers/account-manager.test.js`（Vitest），验证 require 不抛 MODULE_NOT_FOUND + 导出预期方法。测试红 → 改路径 → 测试绿。

**验证**：`node -e "require('./apps/desktop/electron/publishers/account-manager')"` 不抛错。

#### 1.2 修复 dist-ts 隐式构建依赖（P0 CRITICAL）

**文件**：
- `/workspace/apps/desktop/electron/core/container.setup.js`：第 9 行 `require("../../dist-ts/core/container")` 改为 `require("./container")`（直接用 `core/container.js`，因 `container.ts` 编译后内容等同）
- 删除 `/workspace/apps/desktop/electron/core/container.js`（旧构造函数风格，未被运行时使用）—— **不删**，改为将 `container.ts` 编译产物内容直接同步到 `container.js`，使 `container.js` 成为唯一运行时源
- `/workspace/apps/desktop/tsconfig.json`：移除 `exclude: ["**/container.setup.ts"]`，让 `container.setup.ts` 也参与编译，最终删除 `container.setup.js`（用编译后的 `dist-ts/core/container.setup.js` 替代）—— **风险高，改为**：保留 `container.setup.js` 作为运行时入口，内部 `require("./container")`（同目录 `.js`），`container.ts` 仅作类型参考源

**最终方案**（最低风险）：
1. `container.setup.js` 内 `require("../../dist-ts/core/container")` → `require("./container")`
2. 将 `container.ts` 的 ES class 实现内容同步到 `container.js`（手工对齐，注释标注"与 container.ts 保持同步"）
3. 删除 `tsconfig.json` 中 `outDir: "./dist-ts"` 配置（如无其他 .ts 依赖 dist-ts）
4. 验证 `main.js` 启动不依赖 dist-ts

**TDD**：先写 `tests/container.test.js`（已存在，迁 Vitest）验证 `createContainer().register/get/has/assertRequired` 全部行为。测试红（因 require dist-ts 失败）→ 改 require 路径 → 测试绿。

#### 1.3 删除 13 个孤儿测试 + 5 组重复测试 + tests/__mocks__/ws.js

**删除清单**（依据见 §2.2）：

```
electron/core/container.test.ts
electron/core/error-codes.test.js
electron/license-manager.test.js
electron/offline-manager.test.js
electron/template-manager.test.js
electron/redemption-codes.test.js
electron/usage-tracker.test.js
electron/flutter-skill-bridge.test.js
electron/ai-writer.test.js
tests/__mocks__/ws.js
tests/publish-alert.test.js
tests/cloud-publisher.test.js
tests/content-intelligence.test.js
tests/publish-poller.test.js
tests/payment-manager.test.js
```

**TDD**：删除前先确认 `npm test` + `npm run test:vue` 全绿；删除后再跑确认仍全绿（删的是死代码，不应影响）。

#### 1.4 删除 19 个 ipc-handlers .ts 死代码

**删除清单**：

```
electron/ipc-handlers/ai.ts
electron/ipc-handlers/analytics.ts
electron/ipc-handlers/keyword.ts
electron/ipc-handlers/license.ts
electron/ipc-handlers/misc.ts
electron/ipc-handlers/offline.ts
electron/ipc-handlers/payment.ts
electron/ipc-handlers/platform.ts
electron/ipc-handlers/proxy.ts
electron/ipc-handlers/publish.ts
electron/ipc-handlers/render.ts
electron/ipc-handlers/scheduler.ts
electron/ipc-handlers/sensitive.ts
electron/ipc-handlers/store.ts
electron/ipc-handlers/sync.ts
electron/ipc-handlers/templates.ts
electron/ipc-handlers/update.ts
electron/ipc-handlers/upload.ts
electron/ipc-handlers/index.ts
electron/ipc-handlers/types.ts
```

**依据**：.ts 与 .js 是完全不同的实现（如 ai.js 6 handler vs ai.ts 4 handler；store.js 16 handler vs store.ts 4 handler），不是迁移关系；runtime 用 .js，.ts 从未被加载。

**保留**：`electron/ipc-handlers/video.js`（仅 .js 无 .ts）、`account.js`、`pipeline.js`。

**TDD**：删除后 `npm run test:vue` 全绿（ipc-handlers 测试用的是 .js 版）。

#### 1.5 删除 core/ 下的 .ts 死代码

**删除清单**：

```
electron/core/container.setup.ts  （被 tsconfig exclude，从未编译）
```

**保留**：
- `electron/core/container.ts`（作为 container.js 的类型参考源，注释标注"与 container.js 保持同步"）
- `electron/core/error-codes.ts`（作为 error-codes.js 的类型参考源）
- `electron/core/types.ts`（类型定义）

#### 1.6 统一 error-codes 单源

**当前**：四处定义（core/error-codes.js + .ts + services/error-codes.js + root error-codes.js shim）

**目标**：单一源 `core/error-codes.js`，其余全部 re-export 或删除。

**改动**：
1. `core/error-codes.js` 保持为唯一实现源
2. `services/error-codes.js` 保持为 re-export（services 层统一入口）
3. 删除根目录 `error-codes.js` shim（如无外部 require）—— **检查**：`tests/error-codes.test.js` 是否 require 根目录？若是，改 require 路径
4. `core/error-codes.ts` 与 `.js` 内容对齐，注释标注"类型参考源，与 .js 同步"

**TDD**：`tests/error-codes.test.js`（已存在，迁 Vitest）验证 ERROR 常量 + getMessage 全部行为。

#### 1.7 删除 35 个根目录 shim（在所有 require 路径修正后）

**前置**：用 Grep 扫描全代码库，找出所有 `require('./xxx')`（根目录引用），逐个改为 `require('./services/xxx')`。

**删除清单**：35 个根目录 shim（依据见历史分析），包括：
`abort-utils.js`、`ai-writer.js`、`auth-view-manager.js`、`auto-updater.js`、`batch-manager.js`、`callback-server.js`、`cloud-publisher.js`、`content-intelligence.js`、`error-codes.js`、`first-run.js`、`flutter-skill-bridge.js`、`hotkeys.js`、`logger.js`、`oauth-manager.js`、`offline-manager.js`、`onboarding.js`、`payment-manager.js`、`playwright-manager.js`、`publish-alert.js`、`publish-history.js`、`publish-monitor.js`、`publish-poller.js`、`publisher-router.js`、`python-bridge.js`、`qrcode-login.js`、`redemption-codes.js`、`rpa-view-manager.js`、`scheduler.js`、`store.js`、`system-tray.js`、`template-manager.js`、`url-collector.js`、`usage-tracker.js`、`webview-manager.js` + `publishers/playwright-manager.js`。

**TDD**：每改一组 require 路径，跑 `npm test` + `npm run test:vue` 确认绿；最后删除 shim 后再跑一次。

#### 1.8 修复 package.json files 字段

**文件**：`/workspace/apps/desktop/package.json`

**改动**：`"electron/**/*"` 改为精确排除：

```json
"files": [
  "dist/**/*",
  "electron/**/*",
  "!electron/**/*.test.js",
  "!electron/**/*.test.ts",
  "!electron/tests/**",
  "!electron/core/**/*.ts",
  "!electron/ipc-handlers/**/*.ts",
  "config/**/*",
  "node_modules/**/*",
  "package.json"
]
```

预估减少 80+ 个无用文件入包。

#### 1.9 修复编码问题

**文件**：
- `/workspace/apps/desktop/package.json` description 字段 GBK 乱码 → 改为正确中文
- `/workspace/apps/desktop/electron/services/publisher-router.js` 整文件注释乱码 → 重写注释
- `/workspace/apps/desktop/electron/core/container.js` 注释乱码 → 重写
- `/workspace/apps/desktop/electron/main.js` / `preload.js` / `src/router/index.js` 开头 BOM → 移除
- `/workspace/apps/desktop/src/views/Providers.vue` 第 86 行 `"?????"` 编码损坏 → 修复为正确中文

#### 1.10 删除 api-publish-engine 15 个孤立 test-*.js

**删除清单**：`test-anti-detect.js`、`test-batch-c.js`、`test-comment-service.js`、`test-core-modules.js`、`test-cos.js`、`test-cover.js`、`test-error-handling.js`、`test-http-adapters.js`、`test-http-config.js`、`test-p2-modules.js`、`test-publish.js`、`test-signer.js`、`test-token-acquirer.js`、`test-upload.js`、`test-xml.js`。

#### 1.11 Phase 1 验证

- `cd /workspace/apps/desktop && npm test && npm run test:vue` 全绿
- `cd /workspace/apps/desktop && node -e "require('./electron/main.js')"` 不抛错（main.js 启动测试，QM-3）
- `cd /workspace/apps/desktop && node ../../node_modules/electron-builder/cli.js --win --x64`（QM-1 打包验证，exit 0）
- asar list 不再包含 .ts / .test.js / shim
- Python 测试不受影响，仍全绿

---

### Phase 2：关键模块测试补全（TDD 回归网建立）

> **目标**：为 25+ 个零测试的 Electron services + 16 个 ipc-handlers 补测试，建立回归网，为 Phase 3 架构改造铺路。
> **TDD 顺序**：每个模块先写测试（红）→ 必要时小修实现使测试通过（绿）→ 不做大重构。

#### 2.1 高优先级 services（安全 + P0 + P1）

按以下顺序补测试（每个模块独立 commit）：

1. **`store.js`**（383 行，统一 SQLite）—— 测试覆盖：init / CRUD / 事务 / 错误路径
2. **`credential-store.js`**（AES-256-GCM）—— 测试覆盖：save/load/delete + 错误 key 失败 + 大文本
3. **`webview-manager.js`**（P0 分屏）—— 测试覆盖：2/3/4/6 屏布局 + 添加/移除 view
4. **`callback-server.js`**（HTTP 回调 + 59s 心跳，端口 16521）—— 测试覆盖：start/stop + POST 回调 + 心跳
5. **`oauth-manager.js`**（OAuth 2.0）—— 测试覆盖：授权 URL 生成 + token 交换 + refresh
6. **`batch-manager.js`**（批量发布）—— 测试覆盖：add/remove/duplicate/schedule
7. **`video-uploader.js`**（分片上传）—— 测试覆盖：分片大小 + 进度回调 + 错误重试
8. **`publish-monitor.js`**（QueryStateTaskScheduler）—— 测试覆盖：调度 + 查询 + 状态更新
9. **`qrcode-login.js`**（扫码登录 P2）—— 测试覆盖：二维码检测 + 扫码回调
10. **`account-state-restorer.js`**（JSONL）—— 测试覆盖：save/load + 损坏文件恢复
11. **`url-collector.js`**（og:meta）—— 测试覆盖：HTTP + Playwright 双模式 + og:meta 提取
12. **`hotkeys.js`**（全局快捷键）—— 测试覆盖：6 组快捷键注册 + 触发
13. **`task-queue.js`** —— 测试覆盖：enqueue/dequeue/setExecutor + 事件
14. **`auth-view-manager.js`**（仅子模块有测）—— 测试覆盖：open/close + 登录状态检测

#### 2.2 重写 3 个 .skip.js 为 Vitest

1. `tests/api-platform-adapter.test.js`（新）—— 重写 `tests/api-platform-adapter.skip.js`
2. `tests/render-engine.test.js`（新）—— 重写 `tests/render-engine.skip.js`
3. `tests/ipc-render-handler.test.js`（新）—— 重写 `tests/ipc-render-handler.skip.js`

#### 2.3 迁移 electron/tests/ 5 个孤儿到 Vitest

1. `electron/services/pipeline-engine.test.js`（新）—— 迁自 `electron/tests/pipeline-engine.test.js`
2. `electron/services/composition-manager.test.js`（新）
3. `electron/services/ai-generator.test.js`（新）
4. `electron/services/video-engine.test.js`（新）
5. （第 5 个 `api-platform-adapter.test.js` 已在 2.2 处理）

#### 2.4 补 16 个 ipc-handlers 测试

每个 handler 至少 1 个测试文件，覆盖：注册存在性 + 至少 1 个 happy path + 1 个 error path。

按重要性顺序：`account.js` / `license.js` / `payment.js`（修 mock 路径）/ `platform.js` / `upload.js` / `video.js` / `ai.js` / `render.js` / `sensitive.js` / `sync.js` / `templates.js` / `update.js` / `proxy.js` / `offline.js` / `misc.js` / `analytics.js` / `keyword.js`。

#### 2.5 重写 8 个 api-publish-engine Jest 风格测试为 Vitest

1. `adapters-interface.test.js`
2. `api-router.test.js`
3. `tiktok.test.js` / `twitter.test.js` / `youtube.test.js`
4. `signer.test.js` / `oss-uploader.test.js` / `cos-uploader.test.js`
5. 修复 `publish-api-server.test.js` 第 231-271 行结构损坏

#### 2.6 重写 Vue 反模式测试

1. 删除 `src/components/leaf.test.js`
2. 重写 `src/components/more-tests.test.js`（UpgradeModal）：去除 `w.vm.$.setupState` hack + `if(btn.length>0)` 静默跳过
3. 删除 `views-coverage.test.js` Collection 用例
4. 删除 `views-coverage2.test.js` Intelligence "triggers search" 用例
5. 重写 `views-deep2.test.js` CreateView aiWrite 用 `vi.useFakeTimers()`

#### 2.7 补 Vue 缺口测试

1. `src/App.vue` 测试（拆分前置，先测当前 6 类职责）
2. `src/views/PipelineView.vue` 测试
3. `src/views/CreateHistory.vue` 测试
4. `src/composables/useKeyboard.js` 独立测试
5. `src/composables/useTheme.js` 独立测试
6. `src/composables/useProviderForm.js` 独立测试

#### 2.8 统一 Vue 测试 mock 策略

**规范**：所有视图测试一律 `vi.mock('@/api/publisher')` 或 `vi.mock('@/api/electron-bridge')`，不直接 `vi.stubGlobal('window', { electronAPI })`。

**改动**：扫描 `src/views/*.test.js` + `src/components/*.test.js`，逐个把 `window.electronAPI = vi.fn()` 改为 `vi.mock('@/api/publisher', () => ({...}))`。

#### 2.9 Phase 2 验证

- 新增测试数 ≥ 80（25 services + 16 ipc-handlers + 3 skip 重写 + 5 孤儿迁移 + 8 api-publish-engine + 6 Vue + 反模式重写）
- 全部测试通过
- 覆盖率：Electron services lines ≥ 60%，ipc-handlers lines ≥ 70%

---

### Phase 3：Electron 架构改造（接入 DI 容器 + 拆 main.js）

> **前置**：Phase 2 完成，关键模块有测试保护。
> **目标**：让 main.js 消费已有 DI 容器（25 服务注册），拆分 main.js 为 bootstrap/window/shutdown 三件套。

#### 3.1 修正 container.setup 注册完整性

**文件**：`/workspace/apps/desktop/electron/core/container.setup.js`

**改动**：
1. 检查 25 个服务注册是否覆盖 main.js 所有 `new ...()` 调用
2. 补齐缺失的服务注册（如 `offlineManager`、`systemTray`、`licenseManager` 等单例）
3. `assertRequired` 列表扩展到全部核心服务

**TDD**：扩展 `tests/container.test.js`，验证 `container.get('offlineManager')` 等全部返回实例。

#### 3.2 main.js 接入 DI 容器

**文件**：`/workspace/apps/desktop/electron/main.js`

**改动**：
1. 移除 `// @ts-nocheck`
2. 替换 25+ 处 `new XxxService(...)` 为 `container.get('xxxService')`
3. 替换 `LicenseManager.getInstance()` 为 `container.get('licenseManager')`（注册为单例工厂）
4. 替换 `require('./services/offline-manager')` 等直接 require 为 `container.get(...)`
5. 移除 91-97 行孤立代码块（确认无副作用后）
6. 移除 3 个写死在 main.js 的 `usage:*` IPC handler，迁移到 `ipc-handlers/usage.js`

**TDD**：
- 先写 `tests/main.bootstrap.test.js`：验证 `app.whenReady()` 后 container 中所有服务可 get
- 测试红 → 改造 main.js → 测试绿

#### 3.3 拆分 main.js 为三件套

**新文件**：
- `/workspace/apps/desktop/electron/bootstrap.js`：app whenReady 前的初始化（container 创建 + 服务注册 + Python 后端启动 + store 初始化）
- `/workspace/apps/desktop/electron/window.js`：BrowserWindow 创建 + preload 加载 + webContents 事件
- `/workspace/apps/desktop/electron/shutdown.js`：app quit 时的清理（Python 后端停止 + 队列持久化 + 托盘销毁）

**改动**：`main.js` 收缩为仅 `require('./bootstrap')` + `require('./window')` + `require('./shutdown')`，约 50 行。

**TDD**：
- `tests/bootstrap.test.js`：验证 bootstrap 完成后 container 状态
- `tests/window.test.js`：验证 BrowserWindow 创建参数 + preload 路径
- `tests/shutdown.test.js`：验证清理顺序 + 资源释放

#### 3.4 修复硬编码生产 IP

**文件**：`/workspace/apps/desktop/electron/main.js`（或拆分后的 bootstrap.js）

**改动**：`orchestratorUrl: process.env.ORCHESTRATOR_URL || 'http://39.105.42.85'` → 改为 HTTPS 或从配置文件读取，至少改为 `https://` + 加配置项说明。

#### 3.5 拆分 flutter-skill-electron.js（1206 行）

**前置**：先评估 `packages/flutter-skill-bridge/` 是否仍在使用（历史分析指出"无前端引用"）。

**决策点**：
- 若确认废弃 → 整包删除 + 移除 main.js 中的 require
- 若仍在维护 → 拆分为 4 子模块：
  - `flutter-bridge-config.js`（端口/版本/能力/键映射）
  - `flutter-bridge-dom.js`（resolveSelector/mapKey）
  - `flutter-bridge-inspect.js`（classifyElement）
  - `flutter-bridge-server.js`（WebSocket 通信）

**TDD**：先写 4 个子模块测试（已有 `__tests__/flutter-bridge.test.js` 30+ 断言可复用），再拆分。

#### 3.6 拆分 preload.js（350 行 150+ 方法）

**新文件**：
- `electron/preload/publish.js`（发布相关 expose）
- `electron/preload/account.js`（账号相关）
- `electron/preload/system.js`（更新/托盘/快捷键）
- `electron/preload/index.js`（聚合 + contextBridge.exposeInMainWorld）

**TDD**：先写 `tests/preload.test.js` 验证 `window.electronAPI` 暴露的全部方法签名（数据驱动，150+ 方法遍历）。

#### 3.7 Phase 3 验证

- QM-1：`cd /workspace/apps/desktop && node ../../node_modules/electron-builder/cli.js --win --x64` exit 0
- QM-3：`node -e "require('./apps/desktop/electron/main.js')"` 不抛错
- 全部测试通过
- 应用启动 8 秒不崩溃（QM-1 验证 3）

---

### Phase 4：Vue 巨型组件拆分（composables + 子组件）

> **前置**：Phase 2.7 App.vue 测试已写。
> **目标**：App.vue / Providers.vue / Publish.vue 拆分为 composables + 子组件，每个拆分动作有测试保护。

#### 4.1 App.vue 拆分（437 行 → ~80 行）

**新增 composables**：
- `src/composables/usePlatformAccounts.js`（loadAccounts/getDefaultAccount/getAccountText/getStatusClass/switchAccount/platformMeta/filteredPlatforms，~80 行）
- `src/composables/useAutoUpdate.js`（handleUpdateStatus/handleDownload/handleInstall/formatSpeed + 全部 update 响应式状态，~50 行）
- `src/composables/useAuthView.js`（authViewVisible + 3 个 auth 监听 + closeLogin，~30 行）
- `src/composables/useOfflineStatus.js`（isOffline/cachedTaskCount + 监听，~20 行）

**新增子组件**：
- `src/components/AppPlatformSidebar.vue`（侧栏模板 + platformSearch）
- `src/components/AppUpdateDialog.vue`（更新对话框）
- `src/components/AppOfflineBanner.vue`（离线横幅）

**TDD**：每个 composable 独立测试（纯函数测试范式，参考 `useProviderFilters.test.js`）；App.vue 收缩后重新跑 App.vue 测试。

#### 4.2 Providers.vue 拆分（625 行 → ~120 行）

**新增 composables**：
- `src/composables/useProviderCrud.js`（loadProviders/submitForm/doDelete/testProvider/testResults/testingName）

**新增子组件**：
- `src/components/ProviderCard.vue`（单卡片，props + emits）
- `src/components/ProviderFormDialog.vue`（表单对话框）
- `src/components/ProviderDeleteDialog.vue`（删除确认）
- `src/components/ProviderUserKeyDialog.vue`（用户 Key 表单）

**修复**：第 86 行 `"?????"` 编码损坏 → 正确中文。

**TDD**：`Providers.test.js` 已存在（22 用例），拆分后重新跑确认绿。

#### 4.3 Publish.vue 拆分（547 行 → ~80 行）

**新增 composables**：
- `src/composables/usePlatformSelection.js`（selectedPlatforms/selectedAccounts/togglePlatform/watch 同步）
- `src/composables/usePublishFlow.js`（handlePublish/addProgress/敏感词/离线/Markdown 检测）
- `src/composables/useBatchPublish.js`（articles/addArticle/removeArticle/duplicateArticle/handleBatchPublish/batchProgress）

**新增子组件**：
- `src/components/PublishArticleForm.vue`（单篇表单，批量与单篇复用）
- `src/components/PublishSingleMode.vue`
- `src/components/PublishBatchMode.vue`
- `src/components/PublishProgressTimeline.vue`

**TDD**：`Publish.test.js` 已存在，拆分后重新跑确认绿。

#### 4.4 Phase 4 验证

- `npm run test:vue` 全绿
- 覆盖率：views lines ≥ 70%，components lines ≥ 70%
- 手动验证：App/Providers/Publish 三视图功能正常

---

### Phase 5：Python 巨型文件拆分 + 测试覆盖

> **目标**：拆分 video_compose.py 等 6 个巨型文件，补 25+ 视频 provider + 16 stock source + wechat client 测试。

#### 5.1 扩展 video_compose.py 测试（2584 行，<8% → ≥60%）

**TDD 顺序**：
1. 先写测试覆盖 `execute()` 编排管线（mock remotion/hyperframes/ffmpeg 三运行时）
2. 写测试覆盖 `_render_via_atelier` 手作者模式
3. 写测试覆盖 asset_manifest 处理
4. 写测试覆盖字幕烧录主流程
5. 写测试覆盖 remotion/hyperframes/ffmpeg 三路由决策

**文件**：扩展 `/workspace/packages/python-backend/tests/test_video_compose.py`

#### 5.2 拆分 video_compose.py（2584 行 → 多模块）

**前置**：5.1 测试覆盖 ≥60%。

**新文件**（在 `src/multi_publish/video_creation/` 下）：
- `compose/executor.py`（execute 编排管线）
- `compose/remotion_runtime.py`（remotion 路由）
- `compose/hyperframes_runtime.py`（hyperframes 路由）
- `compose/ffmpeg_runtime.py`（ffmpeg 路由）
- `compose/atelier.py`（手作者模式）
- `compose/subtitle_burn.py`（字幕烧录）
- `compose/asset_manifest.py`（asset manifest 处理）

**TDD**：每拆一个子模块，原 video_compose.py 测试仍全绿（行为不变）。

#### 5.3 拆分其他巨型文件

按优先级：
1. `hyperframes_compose.py`（1204 行）→ 拆 3-4 子模块
2. `douyin.py`（1202/1034 行，API+RPA+认证混杂）→ 拆 `douyin_api.py` / `douyin_rpa.py` / `douyin_auth.py`
3. `video_stitch.py`（962 行）→ 拆 2-3 子模块
4. `character_animation.py`（895 行）→ 拆 2-3 子模块
5. `video_analyzer.py`（798 行）→ 拆 2 子模块

**TDD**：每个拆分前先扩展对应测试到 ≥50% 覆盖。

#### 5.4 补 25+ 视频 provider 测试

**模板**：参考 `test_image_providers.py`（14 provider 全覆盖 + 共享 helper）。

**新增**：`tests/test_video_providers.py`，覆盖 kling/runway/veo/hunyuan/minimax/seedance/wan/cogvideo/grok/higgsfield/ltx 等 25+ provider 的 metadata/get_info/status/dry_run/idempotency。

#### 5.5 补 16 个 stock_sources 测试

**新增**：`tests/test_stock_sources.py`，覆盖 archive_org/coverr/dareful/esa/jaxa/loc/mixkit/nara/nasa/noaa/pexels/pixabay_video/pond5_pd/unsplash/videvo/wikimedia 的 metadata + dry_run。

#### 5.6 补 wechat_publisher/client.py 测试（含 NotImplementedError）

**新增**：`tests/test_wechat_client.py`，覆盖 client.py 全部方法 + 验证第 640 行 NotImplementedError 在预期场景抛出。

#### 5.7 补 publishers/wechat_mp.py + screen_capture_selector.py 测试

**新增**：`tests/test_wechat_mp_publisher.py` + `tests/test_screen_capture_selector.py`。

#### 5.8 Phase 5 验证

- `cd /workspace/packages/python-backend && pytest` 全绿
- 覆盖率：video_creation lines ≥ 70%，publishers lines ≥ 70%
- video_compose.py 拆分后原测试仍全绿

---

### Phase 6：Monorepo 包结构整合

> **目标**：评估 api-publish-engine 与 python-backend 合并可能性，统一测试框架，补跨包集成测试。

#### 6.1 评估 api-publish-engine 与 python-backend 合并

**分析**：
- api-publish-engine（142 文件，JS）vs python-backend（54 文件，Python）功能重叠
- 评估维度：维护成本 / 性能 / 团队技能栈 / 用户部署复杂度
- 输出：`01-docs/integration-architecture.md` 更新决策记录

**决策点**（需用户确认）：
- 选项 A：合并到 python-backend，废弃 api-publish-engine
- 选项 B：保持双栈，明确分工（api-publish-engine 负责 JS 侧 API 调用，python-backend 负责视频创作）
- 选项 C：部分合并（共享 platform-configs / signer 等纯逻辑模块）

#### 6.2 统一测试框架（如选 B 或 C）

**目标**：JS 侧统一为 Vitest，废弃 Jest。

**改动**：
- `apps/desktop`：`npm test` 从 `tsc && jest` 改为 `vitest run`（Phase 1 已迁大部分）
- `packages/ai-writer` / `ai-writer-api`：Jest → Vitest
- 删除 `apps/desktop/jest.config.cjs` + `tests/__mocks__/electron.js`（迁 Vitest mock）

#### 6.3 补跨包集成测试

**新增**：
- `tests/integration/electron-python-bridge.test.js`：验证 Electron 主进程调用 python-backend FastAPI 的真实通信
- `tests/integration/ai-writer-flow.test.js`：验证 ai-writer 包 → ai-writer-api → Electron 的完整链路

#### 6.4 Phase 6 验证

- 跨包集成测试通过
- 测试框架统一为 Vitest + pytest
- 无 Jest 残留

---

### Phase 7：CI 质量门禁修复

> **目标**：修复失效的 CI，让门禁重新成为真门禁。

#### 7.1 修复 quality-gate CI

**文件**：`/workspace/.github/workflows/quality-gate.yml`

**问题**：npm ci lockfile + Jest ESM + Jest 30 不预装 jest-circus。

**改动**：
- 锁定 Jest 版本到 29.x（与 ai-writer 一致）或全面迁 Vitest（Phase 6.2 完成后）
- 修复 lockfile
- 预装 jest-circus 或改用 vitest

#### 7.2 修复 Build & Release CI

**文件**：`/workspace/.github/workflows/build.yml` + `electron-ci.yml`

**改动**：参照 `infrastructure-issues.md` INFRA-001 逐项修复。

#### 7.3 调整 doc-gate

**文件**：`/workspace/.github/workflows/doc-gate.yml`

**改动**：纯文档 PR 自动 bypass（基于 path filter），不再需要 `bypass-doc-gate` label。

#### 7.4 添加 coverage 门禁

**文件**：`/workspace/.github/workflows/quality-gate.yml`

**改动**：新增 coverage 检查步骤，阈值与 Phase 0.3 一致（lines 60 / branches 50 / functions 60 / statements 60）。

#### 7.5 Phase 7 验证

- CI 全绿（无预存失败）
- coverage 门禁生效
- 不再需要 bypass 绕过

---

## 四、Assumptions & Decisions

### 4.1 关键假设

1. **flutter-skill-bridge 是否废弃**：历史分析指出"无前端引用"，但 `packages/flutter-skill-bridge/__tests__/flutter-bridge.test.js` 有 30+ 断言维护良好。Phase 3.5 需用户确认是否废弃，否则按"拆分但保留"处理。
2. **api-publish-engine 与 python-backend 合并**：Phase 6.1 需用户确认合并方向（A/B/C）。
3. **TypeScript 迁移终点**：当前 JSDoc 渐进模式（Phase 1-3 已完成），本方案不强制全量 TS 化，保留 JS + JSDoc + 类型参考 .ts 的混合模式。
4. **测试框架统一终点**：JS 侧统一为 Vitest（Phase 6.2），Python 侧保持 pytest。

### 4.2 已决策事项

1. **DI 容器方向修正**：从"创建容器"改为"让 main.js 消费已有容器"（Phase 3.2）。
2. **不删 container.ts / error-codes.ts**：作为类型参考源保留，与 .js 同步。
3. **不删 container.setup.test.js**：迁入 Vitest include（Phase 0.1）。
4. **重写而非删除 3 个 .skip.js**：因覆盖有价值的 P1 模块。
5. **重写而非删除 8 个 api-publish-engine Jest 测试**：因覆盖核心适配器与路由。
6. **Python 侧无作废**：所有 test_*.py 保留，仅扩展。

### 4.3 风险与缓解

| 风险 | 缓解 |
|------|------|
| Phase 1 删 shim 后 require 路径漏改 | 每改一组跑全量测试 + QM-1 打包验证 |
| Phase 3 main.js 拆分破坏启动 | QM-1 打包验证 + 8 秒启动测试 |
| Phase 5 Python 拆分破坏视频合成 | 拆分前先扩测试到 ≥60% 覆盖 |
| Phase 6 测试框架迁移引入新问题 | 每 PR 嵌质量节拍（AGENTS.md 要求） |
| flutter-skill-bridge 误删 | Phase 3.5 前先确认使用情况 |

---

## 五、验证步骤（总览）

### 5.1 每 Phase 验证清单

- [ ] `cd /workspace/apps/desktop && npm test` 全绿
- [ ] `cd /workspace/apps/desktop && npm run test:vue` 全绿
- [ ] `cd /workspace/packages/python-backend && pytest` 全绿
- [ ] `cd /workspace/packages/api-publish-engine && npm test` 全绿（Phase 0.4 后）
- [ ] `cd /workspace/packages/ai-writer && npm test` 全绿
- [ ] `cd /workspace/packages/ai-writer-api && npm test` 全绿
- [ ] `cd /workspace/packages/flutter-skill-bridge && npm test` 全绿
- [ ] 总测试数 ≥ 1367（基线不破）+ 新增测试通过

### 5.2 Electron 主进程专项验证（QM-1 + QM-3）

每次修改 `apps/desktop/electron/` 后：
- [ ] `cd /workspace/apps/desktop && node ../../node_modules/electron-builder/cli.js --win --x64` exit 0
- [ ] `npx asar list dist-electron/win-unpacked/resources/app.asar | grep "logger"` 验证关键文件入包
- [ ] `npx asar list dist-electron/win-unpacked/resources/app.asar | grep -E "\.test\.js|\.ts$"` 应为空（无测试/TS 入包）
- [ ] `node -e "require('./apps/desktop/electron/main.js')"` 不抛错
- [ ] `dist-electron/win-unpacked/Multi-Publish.exe & sleep 8 && kill $!` 8 秒不崩溃

### 5.3 完成验收

- [ ] Phase 0-7 全部完成
- [ ] 35 个根目录 shim 删除
- [ ] 19 个 ipc-handlers .ts 删除
- [ ] 5 个断裂 require 修复
- [ ] dist-ts 隐式依赖消除
- [ ] error-codes 单源化
- [ ] main.js 拆分为 bootstrap/window/shutdown
- [ ] DI 容器被 main.js 消费
- [ ] App.vue / Providers.vue / Publish.vue 拆分完成
- [ ] video_compose.py 拆分完成
- [ ] 25+ 视频 provider 测试补全
- [ ] CI 全绿
- [ ] 覆盖率门禁生效
- [ ] 总测试数 ≥ 1500（1367 基线 + 130+ 新增）

---

## 六、参考文件索引

### 架构与历史分析
- `/workspace/AGENTS.md` — 开发流程规范
- `/workspace/01-docs/archive/architecture-analysis-2026-07-04.md`
- `/workspace/01-docs/archive/deep-refactoring-analysis-v3-2026-07-05.md`
- `/workspace/01-docs/archive/code-depth-analysis-2026-07-06.md`
- `/workspace/01-docs/archive/refactoring-analysis-2026-07-06.md`
- `/workspace/01-docs/refactoring-review-2026-07-08.md`
- `/workspace/01-docs/quality-summary-2026-07-07.md`

### 审计文档
- `/workspace/01-docs/security-audit-2026-07-08.md`
- `/workspace/01-docs/PRD-AUDIT-2026-07-08.md`
- `/workspace/01-docs/tech-debt.md`
- `/workspace/01-docs/infrastructure-issues.md`

### 关键代码文件
- `/workspace/apps/desktop/electron/main.js` — 主进程入口
- `/workspace/apps/desktop/electron/core/container.setup.js` — DI 容器注册
- `/workspace/apps/desktop/electron/ipc-handlers/index.js` — IPC 注册中心
- `/workspace/apps/desktop/electron/preload.js` — 预加载脚本
- `/workspace/apps/desktop/electron/publishers/account-manager.js` — 5 个断裂 require 所在
- `/workspace/apps/desktop/package.json` — files 字段 + 测试脚本
- `/workspace/apps/desktop/vitest.config.js` — 测试配置
- `/workspace/packages/api-publish-engine/package.json` — 测试运行机制损坏
- `/workspace/packages/python-backend/pyproject.toml` — pytest 配置缺失
- `/workspace/packages/python-backend/tests/conftest.py` — 共享 fixtures 待扩展
