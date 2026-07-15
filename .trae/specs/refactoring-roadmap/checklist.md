# Checklist

## Phase 1：安全加固

- [x] CSP 策略已添加到 `src/index.html`，script-src 限制为 'self'
- [x] CSP 允许 Fontshare (`https://api.fontshare.com`) 和 Google Fonts (`https://fonts.googleapis.com` / `https://fonts.gstatic.com`) 字体加载
- [x] CSP 允许 Vite HMR (`ws:` 和 `http://localhost:*`)
- [x] 生产代码 10 处空 catch 全部添加 log.warn 或 log.error（精确范围，非 15 处）
  - [x] `scheduled-publish.js:38` ✅
  - [x] `publish-plan.js:27` ✅
  - [x] `audit-log.js:31` ✅
  - [x] `publish-api-client.js:63` ✅
  - [x] `plugin-loader.js` 4 处（51/246/272/331）✅
  - [x] `zhihu.js:21` ✅
- [x] **未误改**合理 fallback：md-converter.js / browser-data.js / http-provider.js（这些是合理的 try-catch fallback，不应修改）
- [x] `withSenderCheck` 高阶函数已创建
- [x] 9 个敏感 IPC handler 已加 sender 验证（auth:save-credentials / store:delete-account / payment:activate / batch:* / scheduler:*）
- [x] 只读 IPC handler 未过度验证（查询类不加）
- [x] `wrapIpcHandler` 高阶函数已创建
- [x] 有 try-catch 重复的 IPC handler 已迁移到 wrapIpcHandler
- [x] 全量回归测试通过（基线 3643 passed / 0 failed / 10 skipped）
- [x] 视觉测试通过（npm run test:visual:pixel，基线 19/19）

## Phase 2：代码清理

- [x] **前置**：`.github/scripts/check-ipc-bridge.js` 第 9/48 行已重构，改用 `preload/index.js` 提取 ipcRenderer.invoke
- [x] CI 脚本重构后仍能正确检测 IPC 桥接完整性（验证 missing 列表为空或已知 GAPS）
- [x] 搜索确认 `electron/preload.js` 无生产代码引用（仅 preload.test.js 注释提及）
- [x] `electron/preload.js`（423 行）已删除
- [x] preload.test.js 旧版引用已清理
- [x] `packages/ai-writer/src/index.js` 无 var 声明
- [x] `packages/ai-writer/src/cli.js` 无 var 声明
- [x] 主进程长期 setTimeout/setInterval 已加 .unref()（聚焦 scheduler/publish-monitor/publish-poller/login-status-monitor/python-bridge/auth-view-manager）
- [x] 短期定时器在 shutdown 中有清理逻辑（如 keywordPersistTimer 已在 shutdown.js 清理）
- [x] `electron/config/app-config.js` 已创建，统一 host/port 配置
- [x] 搜索 `127.0.0.1` 确认硬编码已替换为配置引用
- [x] 全量回归测试通过
- [x] 视觉测试通过

## Phase 3：架构重构

- [x] Store 现有 API 快照测试已编写（锁定 35 方法行为）
- [x] `store/` 目录结构已创建（base-store + 8 子 store）
- [x] 8 个功能域全部迁移到独立子 store（账号/历史/定时/设置/回调/批量/频率/模型日志）
- [x] `store/index.js` 统一导出，`require('./store')` 向后兼容
- [x] 数据迁移测试通过（SQLite schema 无数据丢失）
- [x] App.vue 行数 < 100 行（仅布局组合）
- [x] UpdateNotification/OfflineIndicator/NotificationBar 组件已提取
- [x] layouts/ 目录已创建（AppLayout/AppSidebar/AppNavbar/AppStatusBar）
- [x] `adapters/_base/` 子目录已创建
- [x] 6 个基础设施文件已移入 `_base/`（base.js / registry.js / router.js / provider-error.js / openai-compatible.js / music-library.js）
- [x] **未移动** 46 个 adapter 文件（命名后缀已自带分组语义）
- [x] model-provider-manager.js require 路径已更新
- [x] createAppContext 返回值按 infra/services/windows/pipelines 分组（52 字段）
- [x] 过渡期兼容层已实现（Proxy 代理 context.store → context.infra.store）
- [x] 全量回归测试通过
- [x] 视觉测试通过

## Phase 4：测试补全

- [ ] props-validator.ts 单元测试已编写
- [ ] scene-builder.ts 单元测试已编写
- [ ] media-profiles.ts 单元测试已编写
- [ ] 6 个手动测试脚本已迁移到 Vitest
- [ ] 原 manual-test-*.js 已删除
- [ ] `packages/rpa-engine/src/publishers/registry.js` 空壳死代码已删除
- [ ] rpa-engine 合并评估已完成（合并或保留决策有记录）
- [ ] 如合并：rpa-engine 已合并入 apps/desktop/electron/services/legacy/，workspace package.json 已移除 rpa-engine
- [ ] 全量回归测试通过（测试数 ≥ 3643 + 新增测试）
- [ ] 视觉测试通过

## 跨 Phase 检查

- [x] Phase 1 结束后 git commit + push
- [x] 每个 Phase 结束后跑全量回归 + 视觉测试
- [x] 测试基线不降低（≥ 3643 passed / 0 failed）
- [x] 视觉测试基线不降低（≥ 19/19 passed）
- [x] 无 CRITICAL 安全问题引入
- [x] CHANGELOG.md 每个 Phase 追加变更记录
- [x] tech-debt.md 记录已修复项
- [x] **未误改合理 fallback**（md-converter/browser-data/http-provider 的空 catch 是合理的，不应修改）
- [x] **未强制 adapter 子目录分组**（命名后缀已自带分组语义，仅提取 6 个基础设施文件到 _base/）
- [x] **未尝试启用 sandbox:true**（sandbox:false 是有意决策，commit 9aa1680 确认，安全性由 contextIsolation:true + nodeIntegration:false + CSP 保障）
