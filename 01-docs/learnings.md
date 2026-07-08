## 本轮质量节拍复盘 v2.3.41 (2026-07-08)

### ✅ 做得好的
1. DI 容器重构 — 28 处 inline new 替换，main.js import 减少 50%
2. UAT 执行 — 发现 3 个真实 bug，其中 BUG-001 为 MAJOR
3. 测试覆盖提升 — 3 个模块覆盖率提升，新增 28 测试
4. 文档同步 — Release Checklist、Decision Log 制度执行

### ⚠️ 需要注意的
1. 版本号一致性 — package.json vs CHANGELOG vs PRD 需要制度化检查
2. jest 30 + hoisted deps — findNodeModule 行为变化导致 JS 测试不可用
3. Electron 打包验证 (QM-1) 未执行 — 本地 D 盘延迟导致跳过
4. 版本号规范 — CHANGELOG 用 v2.3.41 但 pkg 曾是 1.2.0，命名体系需统一

### 🧠 经验沉淀
- UAT 前必须检查 try-catch 覆盖率（尤其是 IPC handlers）
- monorepo 中 jest 30 需要特殊配置处理 hoisted 依赖
- 重构时应当先建测试保护（video_stitch 的测试在重构前就建立了）
- 质量节拍 6 步循环 → 每次改动自动触发，养成习惯
