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

---

## 安全审计复盘 v2.3.42 (2026-07-09)

### ✅ 做得好的
1. project_memory.md 规则触发准确 — "audit" → /cso + /guard 双重审查，发现前次审计遗漏
2. TDD 应用到安全修复 — SQL 注入防护先写 3 个测试再实现 sanitizeUpdateFields
3. 基线提升而非维持 — 修复同时新增 5 个安全防护测试，1786→1791
4. 并行 agent 提效 — Group B（IPC try-catch）和 Group E（.ts 死代码清理）并行执行

### ⚠️ 需要注意的
1. 前次 security-audit-2026-07-08.md 结论"GOOD"不成立 — 审计范围不足（仅查主窗口，未扫描 7 个 BrowserWindow 全集；未做 /guard 6 key checks）
2. decision-log 数据质量问题 — D-004/D-005 撞号、D-024 乱码，说明文档提交前未做编码校验
3. QM-1 仍未闭环 — learnings 上轮已识别但本轮仍未执行 Electron 打包验证
4. 硬编码 IP 在 3 个文件重复 — DRY 原则违反，应提取为单一 config 入口

### 🧠 经验沉淀
- 安全审计必须覆盖 /cso + /guard 双维度，单维度会遗漏（前次只做 /cso 部分）
- SQL 字段名拼接是隐蔽注入点 — 参数化查询只保护值，字段名仍需白名单
- Electron IPC 来源校验 _assertTrustedSender 模式可复用 — event.sender 比对 BrowserWindow.getAllWindows()
- 文件原子写模式：tmpPath + renameSync，应作为所有持久化文件的默认模式
- .ts/.js 同名共存是 monorepo 常见死代码源 — 应在 CI 加检测脚本
- callback-server 本地服务也需鉴权 — 127.0.0.1 绑定不防浏览器 CSRF，恶意网页可跨域 POST
