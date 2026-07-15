# 技术债务记录

记录日期 | 债务 | 优先级 | 说明
---|---|---|---
2026-07-04 | 全局 UTF-8 BOM 残留 | 🟡 中 | ~60+ 文件（含测试/脚本/文档）带 BOM，影响 Vitest/PostCSS 解析。已在 apps/desktop/package.json 修复，其余待清理

2026-07-06 | UTF-8 BOM 残留 | 🟡 中 | ✅ 已修复 | apps/desktop 74个 + packages 29个 + 01-docs 19个，共 122 个 BOM 文件已批量移除

2026-07-15 | FLUX listModels 浅拷贝突变污染 | 🟠 高 | ✅ 已修复 | `flux.js` listModels() 用 `slice()` 仅浅拷贝数组，对象引用共享，调用方修改返回值污染内部 FLUX_MODELS 静态列表。修复为 `map(m => ({ ...m }))`。由质量节拍补跑步骤② TDD 场景脑暴发现

2026-07-15 | Hunyuan Video Adapter 待实现 | 🟡 中 | ✅ 已修复 | 已在 commit 4736094 中实现全部 39 个 Adapter（含 Hunyuan），覆盖 6 大类别 43 个供应商。IVideoAdapter mixin 的 12 个 Video Adapter 全部就绪

2026-07-15 | model_provider_logs 表未启用 | 🟡 中 | ✅ 已修复 | store-schema.js 已添加 model_provider_logs 表 + 2 个索引，store.js 新增 addProviderLog/getProviderLogs/cleanProviderLogs 三方法，router.js 通过 logHandler 注入模式写入日志（不直接依赖 db，保持可独立测试）

2026-07-15 | ProviderRouter 未在 bootstrap 中接线 | 🟠 高 | ✅ 已修复 | phase1-context.js 创建 ProviderRouter 实例并注入 logHandler（转调 store.addProviderLog），调用 aiGenerator.setRouter() 完成接线。router._logCall 扩展第 4 参数 context（含 category/action/latency_ms），executeWithFailover 用 Date.now() 计算延迟。ai-generator.js _generateWithFailover 在 options 中传入 action: method。至此故障转移 + 调用日志全链路闭环

2026-07-15 | callAdapter 内部无日志记录 + IPC 无 logs 接口 | 🟠 高 | ✅ 已修复 | model-provider-manager.callAdapter 内部新增 _writeLog 统一记录日志（所有路径覆盖，不依赖 router logHandler），phase1-context.js 移除 router logHandler 避免双写。IPC 层新增 model-provider:logs（查询）和 model-provider:clean-logs（清理）两个接口。store 无 addProviderLog 方法时向后兼容不抛错，addProviderLog 抛错时 try-catch 包裹不影响主流程

2026-07-15 | Anthropic streamChat 无集成测试 | 🟢 低 | 部分覆盖 | 质量节拍补跑已补充 9 个单元测试覆盖 SSE 解析逻辑，但缺真实 Anthropic API 端到端集成测试（需 API Key，CI 环境无法执行）

2026-07-15 | preload/system.js 缺 model-provider 12 个方法 + IPC handler 无测试 | 🔴 严重 | ✅ 已修复 | 第 4 轮将 modelProviderLogs/cleanLogs 加到了已弃用的单文件 preload.js（window.js 实际加载 preload/index.js → preload/system.js），导致渲染进程无法调用全部 12 个 model-provider:* IPC 接口。修复：preload/system.js 补齐 12 个方法（121→133 方法），preload.test.js 同步更新 SYSTEM_METHODS（117→133）+ 断言 + INVOKE_CASES，新建 ipc-handlers/model-provider.test.js 覆盖 12 个 handler（34 测试，含 logs/clean-logs store 缺失兜底）。同时补录 4 个遗漏的 ai* 方法（aiIsConfigured/aiGenerateTitles/aiEnhanceContent/aiGenerateSummary）到 SYSTEM_METHODS 常量

2026-07-15 | SettingsDialog 占位 Tab 待实现 | 🟢 低 | 待实现 | 设置弹窗目前仅【模型设置】Tab 可用，通用/发布/账号 3 个 Tab 为占位禁用状态。未来需按需实现各自设置面板。前端下拉菜单使用了全局 click 监听（handleOutsideClick），组件卸载时已配对移除

2026-07-15 | preload PUBLIC_METHODS 白名单遗漏渲染/流水线方法 | 🔴 严重 | ✅ 已修复 | `preload/index.js` 的 `PUBLIC_METHODS` 白名单未包含 `renderGetStatus`/`renderInstallDeps`/`onRenderInstallProgress`/`pipelineList`/`pipelineGet`。打包模式下 `accessLevel='public'`（无 Pro license/未登录），这些方法被 `filterApiByAccessLevel` 过滤，前端 `invokeWithFallback` 返回 `{}`，导致视频创作页面误报"缺少 remotion-composer"。修复：将上述 5 个只读方法加入 PUBLIC_METHODS，同时 CreateView.vue 增加 ipcError 防御性处理区分 IPC 失败和实际状态。commit df99ff6

2026-07-15 | story2video 双界面并存 | 🟡 中 | ✅ 已修复 | CreateView.vue（统一界面）和 PipelineView.vue（S2V 专属配置面板）并存，两套独立 UI+数据流，用户体验割裂。修复：将 S2V 编排模式（isOrchestratedPipeline/s2vConfig/startOrchestratedPipeline/updateOrchestrationStatus/advanceOrchestration）合并到 CreateView.vue，删除 PipelineView.vue，路由移除 /create/pipeline。commit df99ff6

2026-07-15 | 14条流水线共享全局 LLM 配置但 UI 暴露独立选择 | 🟢 低 | ✅ 已修复 | CreateView.vue 高级配置区暴露 LLM 提供商/模型选择，但 14 条流水线共享全局 LLM 配置，无独立模型选择环节。修复：llmConfig 精简为 { temperature }，移除 loadLlmProviders/availableLlmProviders 及对应 UI，startPipeline 传 llm:{temperature} 让后端用 getDefault(category) 默认供应商。commit df99ff6

2026-07-15 | keywordPersistTimer setInterval 未清理 | 🟡 中 | ✅ 已修复 | `phase3-services.js` 的 `keywordPersistTimer`（5分钟持久化定时器）仅 `.unref()` 但从未 `clearInterval`，应用退出时内存泄漏。修复：`startServices()` 返回 `{ keywordPersistTimer }`，`bootstrap.js` 捕获并加入 context，`shutdown.js` 在 window-all-closed 中 `clearInterval`

2026-07-15 | rpa-view-manager innerHTML 字符串拼接重复 | 🟢 低 | ✅ 已修复 | `rpa-view-manager.js` 3 处 innerHTML 设置通过字符串拼接构建 executeJavaScript 代码，虽已用 JSON.stringify 转义但模式重复。修复：抽取 `_setElementContentSafe(win, selector, content, opts)` helper 统一转义逻辑，重构 zhihu content 填充使用 helper

2026-07-15 | CreateHistory.vue stageClass(null) 抛错 | 🟡 中 | ✅ 已修复 | `stageClass(s)` 用 `typeof s === 'object'` 判断，但 `typeof null === 'object'` 导致 `null.status` 抛 TypeError。修复：改为 `s && typeof s === 'object'`

2026-07-15 | preload sendSync 无缓存 | 🟢 低 | ✅ 已修复 | `preload/index.js` `getAccessLevel()` 每次调用都执行 `sendSync`。虽实际只调用一次，但缺乏缓存防御。修复：添加 `_cachedAccessLevel` 模块级缓存 + 架构说明注释（contextBridge 同步约束使 sendSync 不可替代）

2026-07-16 | 缺少 CSP 内容安全策略 | 🔴 严重 | ✅ 已修复 | `src/index.html` 无 Content-Security-Policy，sandbox:false 下无法防 XSS。修复：添加 CSP meta 标签，script-src 'self'，允许 Fontshare/Google Fonts 字体 + Vite HMR (ws:/localhost)。安全性由 contextIsolation:true + nodeIntegration:false + CSP 三重保障

2026-07-16 | 空 catch 吞错误（10 处） | 🟠 高 | ✅ 已修复 | `api-publish-engine/src/` 10 处 `catch(e) {}` 错误完全消失。修复：scheduled-publish/publish-plan/audit-log/publish-api-client/plugin-loader(4处)/zhihu 共 10 处加 console.warn。未误改合理 fallback：md-converter.js/browser-data.js/http-provider.js

2026-07-16 | IPC 无 sender 验证（9 个敏感 handler） | 🔴 严重 | ✅ 已修复 | `isTrustedSender()` 已定义但仅覆盖 3/212 handler。修复：提取 `withSenderCheck(fn)` 高阶函数到 `ipc-handlers/helpers.js`，包装 9 个敏感 handler（auth:save-credentials/store:delete-account/store:update-account/payment:complete/payment:simulate/batch:execute/batch:delete/scheduler:create/scheduler:cancel）。测试环境跳过验证

2026-07-16 | IPC handler try-catch 模板重复 | 🟡 中 | ✅ 已修复 | ~40 handler 完全相同的 try-catch 模式。修复：提取 `wrapIpcHandler(fn)`/`wrapIpcHandlerRaw(fn)` 高阶函数到 `ipc-handlers/helpers.js`，统一 try-catch + 参数校验 + 错误日志。scheduler.js 迁移为示例，保留原响应格式 + catchData 兜底

2026-07-16 | 两套 preload 并存（旧版 423 行未删除） | 🟠 高 | ✅ 已修复 | 旧版单文件 `electron/preload.js`（423 行）已弃用，window.js 实际加载 `preload/index.js`，但 CI 脚本和测试仍依赖旧版。修复：重构 `check-ipc-bridge.js` 改用 `preload/` 子目录递归扫描，更新 `ipc-handlers.test.js` 移除旧版读取逻辑，HIDDEN 集合补充 8 个 pipeline 内部 handler，删除旧版 preload.js

2026-07-16 | ai-writer 包 100% var 声明遗留 | 🟢 低 | ✅ 已修复 | `packages/ai-writer/src/` 2 个源文件 38 处 var 声明。修复：index.js 18 处（16 const + 2 let）+ cli.js 20 处（全部 const），按是否重新赋值判断 const/let

2026-07-16 | setTimeout unref 覆盖不足（32%） | 🟢 低 | ✅ 已修复 | 主进程 104 处 setTimeout/setInterval 仅 33 处 unref。修复：所有 13 处 setInterval 已有 unref（100%），新增 7 处长期 setTimeout unref（auth-view-session 10s 超时 + rpa-view-manager 60s/120s 发布超时）。短期定时器和浏览器上下文定时器不修改

2026-07-16 | 10 处硬编码 127.0.0.1/端口 | 🟡 中 | ✅ 已修复 | callback-server/oauth-manager/window/python-bridge/prompt-bridge/splitter-bridge 6 个文件 13 处硬编码。修复：新建 `electron/config/app-config.js` 统一 6 个服务配置（环境变量优先），替换 13 处硬编码。保留安全检查代码中的 127.0.0.1（isTrustedSender 字面量）

