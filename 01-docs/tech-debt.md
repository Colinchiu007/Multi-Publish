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

