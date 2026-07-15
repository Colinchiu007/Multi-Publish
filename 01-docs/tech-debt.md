# 技术债务记录

记录日期 | 债务 | 优先级 | 说明
---|---|---|---
2026-07-04 | 全局 UTF-8 BOM 残留 | 🟡 中 | ~60+ 文件（含测试/脚本/文档）带 BOM，影响 Vitest/PostCSS 解析。已在 apps/desktop/package.json 修复，其余待清理

2026-07-06 | UTF-8 BOM 残留 | 🟡 中 | ✅ 已修复 | apps/desktop 74个 + packages 29个 + 01-docs 19个，共 122 个 BOM 文件已批量移除

2026-07-15 | FLUX listModels 浅拷贝突变污染 | 🟠 高 | ✅ 已修复 | `flux.js` listModels() 用 `slice()` 仅浅拷贝数组，对象引用共享，调用方修改返回值污染内部 FLUX_MODELS 静态列表。修复为 `map(m => ({ ...m }))`。由质量节拍补跑步骤② TDD 场景脑暴发现

2026-07-15 | Hunyuan Video Adapter 待实现 | 🟡 中 | 待实现 | IVideoAdapter mixin 已在 base.js 定义（generateVideo + getVideoStatus），但无 Adapter 实现。4 类 mixin 中 Video 类别空缺。下一步可选 Hunyuan(TC3签名) / CogVideo(Bearer) / Kling(Bearer)

2026-07-15 | Anthropic streamChat 无集成测试 | 🟢 低 | 部分覆盖 | 质量节拍补跑已补充 9 个单元测试覆盖 SSE 解析逻辑，但缺真实 Anthropic API 端到端集成测试（需 API Key，CI 环境无法执行）
