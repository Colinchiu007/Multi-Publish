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

---

## 前期流程 8 阶段文档补齐复盘 (2026-07-09)

### ✅ 做得好的
1. 对照前期流程 8 阶段系统性审查 — 不只查"有没有文档"，还查"内容完不完整"，发现 3/8 阶段为"部分完整"
2. 复用既有材料 — MARKET-RESEARCH 整合了 PM-PRD-rongmeibao + pricing-strategy + viral-copy-concept，避免重复劳动
3. REQUIREMENTS-SIGNOFF 含变更控制流程 — 不只是签字记录，还定义了 baseline 锁定后的变更审批机制

### ⚠️ 需要注意的
1. PM-PRD-v1.1.md 标注"待 CEO 确认"长达近 1 个月（06-13 → 07-09）— 状态字段应定期 review
2. review-process.md 实为代码评审，与"设计评审"混淆 — 文档命名应更精确
3. 市场调研数据多为估算 — 缺一手用户访谈，Persona 假设需 P1 发布后验证

### 🧠 经验沉淀
- 前期流程审查应作为项目启动 checklist 的一部分 — 而非事后补救
- 签字记录必须含变更控制流程 — 否则 baseline 锁定形同虚设
- 设计评审纪要应记录"为什么选 C 不选 A/B" — 决策理由比结论更重要
- 市场调研的 Persona 需标注"假设/已验证" — 避免未验证假设进入开发决策

---

## PRD 功能验证复盘 v2.3.43 (2026-07-09)

### ✅ 做得好的
1. 系统性验证而非抽样 — 93 个子功能逐项对照代码，发现 10 项未实现 + 1 bug，而非"大致检查"
2. 并行 agent 提效 — 3 个 search agent 并行验证 F1-F6 / F7-F17 / F6视频+§7+§9，10 分钟完成 93 项验证
3. 修复优先级清晰 — P0 bug（1 行）→ P1 核心（F1.3/F9/F8.5）→ P2 增强（F10.8/F16.3）→ P3 文档对齐
4. 修复时同步更新 PRD 状态 — 不只改代码，还把 PRD 中"✅"改为"✅ v2.3.43"标注真实实现版本

### ⚠️ 需要注意的
1. PRD 标注 ✅ 但代码未实现是"文档债务" — 10 项缺失中 9 项 PRD 标 ✅，说明 PRD 更新与代码实现脱节
2. F2.4 定时发布 bug 存在多版本未发现 — `addTask` 方法名错误，定时任务从未真正执行过，但 PRD 一直标 ✅
3. F9 平台分类 4 项全缺但 PRD 标 ✅ — 最严重的文档-代码偏差，可能是历史迁移中丢失
4. JS ai-generator.js 注册表与 Python 后端不同步 — JS 列 8 video/4 image/4 TTS，Python 实际 14/14/5，前端 UI 看到的 Provider 数偏少
5. §9.3 爆款分析依赖外部 orchestrator（localhost:8000），本仓库不可独立运行 — 需在 PRD 明确标注外部依赖

### 🧠 经验沉淀
- PRD 功能验证应作为发布前 mandatory 步骤 — 不能只靠"开发者记得实现了"
- 方法名错误类 bug（addTask vs add）可通过 TypeScript 或更严格的单元测试预防
- 文档状态字段应含"实现版本"而非仅 ✅ — "✅ v2.3.43"比"✅"更有追溯性
- 插件钩子设计应支持"拒绝/修改"双模式 — beforePublish 返回 {proceed:false,reason} 比 return false 更友好
- 文件上传双路径（CDP + JS）是 Electron RPA 的必备模式 — CDP 在某些平台/版本不稳定，JS File API 是可靠回退
- 平台分类枚举应定义在 shared-utils 而非散落各处 — PlatformCategory 作为 Object.freeze 导出，前后端共享

---

## 附加观察项修复复盘 v2.3.43 (2026-07-09)

### ✅ 做得好的
1. PRD 验证报告的"附加观察项"分类清晰 — 区分 P0/P1 缺陷 vs 观察项，观察项单独处理不阻塞主线
2. 服务注册遵循既有模式 — comment-manager.js 完全复用 viral-engine/webview-manager 的 registerIpcHandlers + container.register 模式，零学习成本
3. 本地 fallback 设计为"启发式"而非"模拟" — viral-engine 本地分析基于真实输入数据计算，不是返回假数据，用户能看到有意义的分数和因子

### ⚠️ 需要注意的
1. JS/Python 双语言后端的注册表同步是持续维护成本 — 每次新增 Provider 需同时改 ai-generator.js 和 Python providers/ 目录，应考虑代码生成或共享配置
2. comment-service.js 早已实现但未接入 IPC — "代码存在 ≠ 功能可用"，已实现的库需要主动集成到主流程
3. viral-engine 默认 ORCHESTRATOR_BASE 是 localhost:8000 而非空字符串 — 与 comment-manager/bootstrap 的空字符串策略不一致，后续应统一

### 🧠 经验沉淀
- PRD 验证应包含"代码存在但未接入"维度 — 不只检查"功能是否实现"，还要检查"已实现的库是否被正确调用"
- 外部依赖功能必须有本地 fallback — orchestrator 不可用时 viral-engine 回退到本地启发式分析，确保离线环境功能不完全瘫痪
- IPC 集成应同时更新三处 — handler 文件 + container.register + preload API + preload.test.js 计数断言，遗漏任何一处都会导致测试失败或前端调用不通
- 本地 fallback 返回数据应带 mode 标记 — `mode: 'local-fallback'` 让前端能区分"AI 深度分析"和"本地启发式分析"，避免用户误判分析质量
