# 实施计划：Story2Video 流水线页面 UX 统一

## 阶段 0：分析（双模型 → 降级 claude 单模型）
- antigravity 地域不可用，claude 架构分析已并行执行；结论并入本计划。

## 阶段 1：TDD（先写/改测试）
- CreateViewHistory.test.js：重写弹窗相关测试为 open-result 直跳；删除按钮全状态可见；编辑按钮文案；失败原因自然语言。
- ResultView.test.js：新增 voiceSpeed range、音色下拉、重试按钮消失、返回跳历史、底部操作条、分段跳转、无 videoPath 可编辑。
- pipeline-engine.test.js / ipc-handlers/pipeline.test.js：deleteRun 契约。
- story2video-project-service 不动。

## 阶段 2：实现（按依赖序）
1. 主进程：pipeline-engine.deleteRun + ipc-handlers/pipeline.js pipeline:delete-run + src/api/publisher.js pipelineDeleteRun + 通知 key（zh/en）。
2. CreateViewHistory.vue：删弹窗、openDetail 直跳、删除按钮全状态、编辑文案、失败原因、标题回退链。
3. CreateView.vue：action-bar fixed、StageProgress sticky、failed 状态文案修复、query view=history 支持、删除分流（run/project）、注释术语统一。
4. ResultView.vue：底部操作条、分段跳转、卡片结构、生成 AI 视频、音色下拉、语速滑条、删重试按钮、返回跳历史、标题、无成片可编辑。
5. CreateHistory.vue / router：/create/history 重定向 /create?view=history。
6. locales zh/en 成对 + history-panel.css / ResultView 样式。

## 阶段 3：门禁
- 桌面 Vitest（长超时单 worker）、eslint、check-locale-sync --cjk、verify-worktree-deps、electron-builder --dir（QM-1）、Story2Video 相关测试全量。

## 阶段 4：审查与文档
- claude 单模型审查（降级记录）、review.md、PRD/文档详细补充、CHANGELOG、learnings、.quality-gates.md。

## 阶段 5：交付
- 提交（worktree pre-commit 自动声明分支）→ push → PR → CI 全绿 → squash 合并 → CCG task 归档。
