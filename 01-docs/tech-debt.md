# 技术债务记录

记录日期 | 债务 | 优先级 | 说明
---|---|---|---
2026-07-04 | 全局 UTF-8 BOM 残留 | 🟡 中 | ~60+ 文件（含测试/脚本/文档）带 BOM，影响 Vitest/PostCSS 解析。已在 apps/desktop/package.json 修复，其余待清理
