# Tasks

## Phase 1：安全加固（🟢 低风险）

- [x] Task 1: 添加 CSP 策略到 `src/index.html` ✅
  - [x] SubTask 1.1: 在 `<head>` 添加 Content-Security-Policy meta 标签（default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com; img-src 'self' data: blob: https:; connect-src 'self' ws: http://localhost:*; font-src 'self' data: https://api.fontshare.com https://fonts.gstatic.com; media-src 'self' blob:）
  - [x] SubTask 1.2: 验证字体加载（Fontshare/Google Fonts）不被 CSP 阻断
  - [x] SubTask 1.3: 跑视觉测试确认 UI 无回归（19/19 基线）

- [x] Task 2: 修复生产代码 10 处空 catch（精确范围，非 15 处） ✅
  - [x] SubTask 2.1: `packages/api-publish-engine/src/scheduled-publish.js:38` 加 log.warn
  - [x] SubTask 2.2: `packages/api-publish-engine/src/publish-plan.js:27` 加 log.warn
  - [x] SubTask 2.3: `packages/api-publish-engine/src/audit-log.js:31` 加 log.warn
  - [x] SubTask 2.4: `packages/api-publish-engine/src/publish-api-client.js:63` 加 log.warn（JSON.parse fallback）
  - [x] SubTask 2.5: `packages/api-publish-engine/src/plugin-loader.js` 4 处（51/246/272/331）加 log.warn
  - [x] SubTask 2.6: `packages/api-publish-engine/src/adapters/zhihu.js:21` 加 log.warn（topics 提交失败）
  - [x] SubTask 2.7: **不改** md-converter.js / browser-data.js / http-provider.js（合理 fallback）

- [x] Task 3: IPC sender 验证扩展（聚焦 9 个敏感 handler，非全量） ✅
  - [x] SubTask 3.1: 提取 `withSenderCheck(handler)` 高阶函数到 `ipc-handlers/helpers.js`
  - [x] SubTask 3.2: 识别敏感 handler：auth:save-credentials / store:delete-account / payment:activate / batch:* / scheduler:*
  - [x] SubTask 3.3: 用 withSenderCheck 包装这 9 个敏感 handler
  - [x] SubTask 3.4: 保留只读 handler（查询类）不加验证，避免过度验证

- [x] Task 4: 提取 IPC handler 包装器 ✅
  - [x] SubTask 4.1: 创建 `wrapIpcHandler(fn)` 高阶函数（统一 try-catch + 参数校验 + 错误日志）
  - [x] SubTask 4.2: 逐个 IPC handler 文件迁移到 wrapIpcHandler（聚焦有 try-catch 重复的 handler，非全部 225 处）
  - [x] SubTask 4.3: 全量回归测试（基线 3643 passed）+ 视觉测试

## Phase 2：代码清理（🟢 低风险）

- [x] Task 5: **前置** — 重构 CI 脚本 + 删除旧版 preload.js ✅
  - [ ] SubTask 5.1: 重构 `.github/scripts/check-ipc-bridge.js` 第 9/48 行，改用 `apps/desktop/electron/preload/index.js` 提取 ipcRenderer.invoke
  - [ ] SubTask 5.2: 验证 CI 脚本重构后仍能正确检测 IPC 桥接完整性
  - [ ] SubTask 5.3: 搜索全库确认 `electron/preload.js` 无其他生产引用（仅 preload.test.js 注释提及）
  - [ ] SubTask 5.4: 删除 `electron/preload.js`（423 行）
  - [ ] SubTask 5.5: 更新 preload.test.js 移除旧版引用
  - [ ] SubTask 5.6: 全量回归测试

- [x] Task 6: ai-writer 包 var → const/let ✅
  - [ ] SubTask 6.1: `packages/ai-writer/src/index.js` — ~20 处 var 替换
  - [ ] SubTask 6.2: `packages/ai-writer/src/cli.js` — ~20 处 var 替换
  - [ ] SubTask 6.3: 跑 ai-writer 测试确认无回归

- [x] Task 7: 补全主进程 setTimeout/setInterval 的 unref 覆盖 ✅
  - [ ] SubTask 7.1: 扫描 `electron/services/` 下所有 setTimeout/setInterval（实测 104 处 / 28 文件）
  - [ ] SubTask 7.2: 识别长期定时器（scheduler/publish-monitor/publish-poller/login-status-monitor/python-bridge/auth-view-manager）中未 unref 的
  - [ ] SubTask 7.3: 长期定时器加 `.unref()`，短期定时器在 shutdown 中清理（已有 33 处 unref，聚焦补全剩余长期定时器）
  - [ ] SubTask 7.4: shutdown.js 已有 keywordPersistTimer 清理，确认其他长期定时器也有清理逻辑

- [x] Task 8: 硬编码 127.0.0.1/端口抽取配置 ✅
  - [ ] SubTask 8.1: 创建 `electron/config/app-config.js` 统一配置（devServer/callbackServer/oauthServer/pythonBridge）
  - [ ] SubTask 8.2: 替换 ~10 处硬编码引用
  - [ ] SubTask 8.3: 测试配置可覆盖性（环境变量优先）

## Phase 3：架构重构（🟡 中-高风险）

- [ ] Task 9: Store 类按功能域拆分（🔴 高风险 — 涉及 SQLite）
  - [ ] SubTask 9.1: 先写 Store 现有 API 的快照测试（锁定行为，35 方法）
  - [ ] SubTask 9.2: 创建 `store/` 目录结构（base-store.js + 8 个子 store）
  - [ ] SubTask 9.3: 逐个迁移功能域（账号→历史→定时→设置→回调→批量→频率→模型日志）
  - [ ] SubTask 9.4: `store/index.js` 统一导出，保持 `require('./store')` 向后兼容
  - [ ] SubTask 9.5: 全量回归 + 数据迁移测试（SQLite schema 无数据丢失）

- [ ] Task 10: App.vue 拆分
  - [ ] SubTask 10.1: 提取 UpdateNotification.vue / OfflineIndicator.vue / NotificationBar.vue 组件
  - [ ] SubTask 10.2: 创建 layouts/AppLayout.vue / AppSidebar.vue / AppNavbar.vue / AppStatusBar.vue
  - [ ] SubTask 10.3: App.vue 瘦身到 <100 行（仅布局组合）
  - [ ] SubTask 10.4: 视觉测试确认 UI 无回归（19/19 基线）

- [ ] Task 11: Adapter 目录优化（仅提取基础设施，不分子目录）
  - [ ] SubTask 11.1: 创建 `adapters/_base/` 子目录
  - [ ] SubTask 11.2: 移动 6 个基础设施文件到 `_base/`（base.js / registry.js / router.js / provider-error.js / openai-compatible.js / music-library.js）
  - [ ] SubTask 11.3: 更新 model-provider-manager.js 的 require 路径
  - [ ] SubTask 11.4: **不移动** 46 个 adapter 文件（命名后缀已自带分组语义）
  - [ ] SubTask 11.5: 全量回归测试

- [ ] Task 12: createAppContext 上帝对象分组（52 字段，🔴 CRITICAL）
  - [ ] SubTask 12.1: 将 52 个字段按 infra/services/windows/pipelines 分组
  - [ ] SubTask 12.2: 更新所有 context 消费者（bootstrap/shutdown/IPC handlers）
  - [ ] SubTask 12.3: 保持过渡期兼容（Proxy 代理 context.store → context.infra.store）

## Phase 4：测试补全（🟢 低风险）

- [ ] Task 13: remotion-composer 添加单元测试（🔴 CRITICAL — 36 文件 0 测试）
  - [ ] SubTask 13.1: props-validator.ts 验证逻辑测试
  - [ ] SubTask 13.2: scene-builder.ts 场景构建测试
  - [ ] SubTask 13.3: media-profiles.ts profile 选择测试

- [ ] Task 14: shared-utils 手动测试迁移 Vitest
  - [ ] SubTask 14.1: manual-test-publish-history.js → publish-history.test.js
  - [ ] SubTask 14.2: manual-test-scheduler.js → scheduler.test.js
  - [ ] SubTask 14.3: manual-test-platform-config.js → platform-config.test.js
  - [ ] SubTask 14.4: manual-test-proxy-pool.js → proxy-pool.test.js
  - [ ] SubTask 14.5: manual-test-sensitive-filter.js → sensitive-filter.test.js
  - [ ] SubTask 14.6: manual-test-md-converter.js → md-converter.test.js

- [ ] Task 15: 清理 rpa-engine 空壳死代码 + 评估合并
  - [ ] SubTask 15.1: 删除 `packages/rpa-engine/src/publishers/registry.js`（空壳 `registry = {}`）
  - [ ] SubTask 15.2: 评估 rpa-engine 剩余 3 文件是否合并入 apps/desktop/electron/services/legacy/
  - [ ] SubTask 15.3: 如合并，更新 workspace package.json 移除 rpa-engine
  - [ ] SubTask 15.4: 全量回归测试

# Task Dependencies

- [Task 3] 依赖 [Task 4]（withSenderCheck 可复用 wrapIpcHandler 模式）
- [Task 5] 内部依赖（SubTask 5.1 CI 重构 → 5.4 删除 preload.js）
- [Task 9] 依赖 [Phase 1-2 完成]（Store 拆分前需稳定基础）
- [Task 10] 依赖 [Task 9]（App.vue 可能引用 store）
- [Task 11] 依赖 [Task 4]（adapter 路径变更需 IPC wrapper 先稳定）
- [Task 12] 依赖 [Task 9-11]（context 分组在架构稳定后进行）
- [Task 15] 依赖 [Task 11]（rpa-engine 合并需 adapter 目录已整理）

# 并行化机会

- Phase 1 的 Task 1/2/3 可并行（独立文件）
- Phase 2 的 Task 6/7/8 可并行（独立模块），Task 5 需先完成
- Phase 4 的 Task 13/14 可并行（独立包）
