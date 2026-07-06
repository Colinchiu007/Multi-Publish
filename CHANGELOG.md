# CHANGELOG

## [v2.1.1] - 2026-07-06

### Fixed
- **.gitignore**: 移除 broad `test_*.py` 规则，恢复 5 个 Python 测试文件追踪
- **pyproject.toml**: 修复 BOM + 重复 `[project.optional-dependencies]` 段
- **test_integration.py**: 修复 `list()` → `list_tools()` 方法名

### Chore
- **临时文件清理**: 删除 10 个根目录临时脚本（fix_*/gen_*/temp_* 等）
- **远程分支清理**: 删除 62 个已合并的 stale 远程分支（72 → 10）
- **package-lock.json**: 更新以修复 `npm ci` CI 失败

### Docs
- **代码深度分析报告**: `01-docs/code-depth-analysis-2026-07-06.md` — 92K 行代码概况、目录结构、重构建议
- 学习记录通过 `gstack-learnings-log` 写入

### 质量门禁
- Python 测试: 394 passed / ALL GREEN
- PR #283: gitignore/pyproject 修复 — 已合并
- PR #284: 代码分析报告 — 已合并

---

## [v2.1.0] - 2026-07-05

### OpenMontage 全阶段集成 (Phase 0-7)
- **PR #274**: OpenMontage 集成计划 v3（文档）
- **PR #275**: Phase 0 — 视频创作基础设施（base_tool/tool_registry/cost_tracker/config_model + 28 tests）
- **PR #276**: Phase 1-3 — 视频/图像/音频创作模块集成（343 tests）
- **PR #277**: fix — 移除 30 个文件中的 BOM
- **PR #278**: Phase 4 — 视频分析模块集成（12 tools + 15 tests）
- **PR #279**: Phase 5 — 视频增强/字幕/录制模块集成（10 tools + 12 tests）
- **PR #280**: chore — 删除 __pycache__
- **PR #281**: Phase 6+7 — Pipeline 编排 + 角色动画模块集成
- **PR #282**: chore — __pycache__ gitignore

### Phase C3: ESLint 清理
- 201 个 ESLint 问题归零（14 errors + 173 warnings → 0/0）
- store.js 隐式吞并代码行 bug 修复
- rpa-view-manager.js 重复声明 + 编码清理

### PRD v1.4.0
- PRD 全量审查优化完成

### Accounts.vue 响应式布局修复
- `.account-row` 添加 `flex-wrap: wrap`，修复窄屏文字重叠 bug
- 新增 CSS 源码断言测试和 Playwright 响应式截图测试

### Vue 测试提升
- P0 覆盖提升 4 项：license.js (98%)、CreateView.vue (73%)、CloudPublish.vue (80%)、FirstRun.vue (88%)
- Publish.vue 覆盖 58% → 68%
- api/publisher.js 覆盖 8% → 97%
- 整体项目覆盖率: 71.7% → 84.75%
- 测试总数: 708 tests / 49 files / ALL GREEN

### 响应式布局修复
- Accounts.vue: flex-wrap + min-width 修复窄屏文字重叠
- e2e-responsive-layout.js: 新增 Playwright 截图测试

---

## [v2.0.9] - 2026-07-05
- Publish.vue ref 声明修复 + 覆盖提升

## [v2.0.8] - 2026-07-05
- api/cloud-publisher.js 覆盖 50% → 100%

## [v2.0.7] - 2026-07-05
- api/providers.js 覆盖 48% → 94%

## [v2.0.6] - 2026-07-05
- api/publisher.js 覆盖 8% → 97%

## [v2.0.5] - 2026-07-05
- ResultView.vue 覆盖 43% → 79%

## [v2.0.4] - 2026-07-05
- Views 全面覆盖提升完成（14 个 views 全部达标）

## [v2.0.3] - 2026-07-05
- 注释标准化修复（70+ 文件）

## [v2.0.2] - 2026-07-05
- store.js 多实例测试 + 同步回调安全

## [v2.0.1] - 2026-07-04
- TS 迁移 Phase 3 (Batch 10-12) + Vue 测试增强

## [v2.0.0] - 2026-07-02
- 里程碑: v2.0.0 发布
- PRD、架构、定价策略等文档体系完善

## [v1.8.0] - 2026-07-03
- Plugin Level 2B Dynamic + CI Fix

## [v1.7.0] - 2026-07-03
- 设计体系落地

## [v1.6.x] - 2026-06-29 ~ 2026-07-03
- api-publish-engine 架构 & 开发经验
- Config 文件支持 + Client SDK
- 质量节拍第 30 轮完成

## [v1.5.0] - 2026-06-28
- 小红书/Bilibili RPA 发布器实现

## [v1.4.0] - 2026-06-28
- PreCheck 前端开关 + platforms.json 外部化

## [v1.3.0] - 2026-06-27
- AI 内容创作功能（AI Writer, 标题助手等）

## [v1.2.0] - 2026-06-26
- 插件系统 + 定时发布 + 评论管理

## [v1.1.x] - 2026-06-13 ~ 2026-06-17
- CLI 工具 + 内容格式化 + Docker 支持

## [v1.0.x] - 2026-06-03 ~ 2026-06-13
- 初始版本：Electron 桌面端 + FastAPI 后端
- 15 平台发布器
- 账号管理（Cookie 加密）
- 内容智能分析

---

