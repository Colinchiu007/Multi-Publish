# 实施计划

1. 同步 UE 建议、产品 PRD 与架构文档，标记“已确认/实施中”及外部验收边界。
2. 增加路由动态加载错误边界、重试和刷新动作，覆盖 `/create` 空白页根因。
3. 将 Story2Video 表单重排为五个折叠区，保持现有字段、TTS 用户克隆和发布合同。
4. 将图片轮播运行反馈固定为六阶段清单，补稳定状态摘要与测试选择器。
5. 补充路由、Vue 功能和编排回归测试，运行 Vue build 与目标 Vitest。
6. 启动独立 Electron + 既有 profile 副本，验证可见窗口与真实 renderer console。
7. 双模型分析/审查，修复 Critical，更新任务状态并归档后提交交付。

## 文件边界

- `apps/desktop/src/views/CreateView.vue`
- `apps/desktop/src/router/index.js`
- `apps/desktop/src/App.vue`（如错误边界需要）
- `apps/desktop/src/components/RouteLoadError.vue`（新增）
- 相关前端测试文件
- `01-docs/UX-IMAGE-CAROUSEL-CONFIGURATION-PROPOSAL-2026-08.md`
- `01-docs/PLAN-STORY2VIDEO-IMAGE-CAROUSEL-AUTOPILOT-2026-08.md`
- 必要时同步 `01-docs/PRD.md`、`01-docs/PRD-video-creation.md`、`01-docs/architecture-video-integration.md`

不触碰其他会话现有脏文件：`apps/desktop/electron/preload/index.bundle.js`、`packages/ai-writer/src/cli.js`、`packages/api-publish-engine/bin/publish-api`。
