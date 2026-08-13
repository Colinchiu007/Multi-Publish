# Analysis — antigravity 后端不可用（2026-08-13）

CCG 要求 M+ 复杂度双模型并行分析（antigravity + Claude）。本次探测结果：

- `codeagent-wrapper.exe --backend antigravity`：**不可用** —— `Eligibility check failed: Your current account is not eligible for Antigravity, because it is not currently available in your location.`（地区限制）。
- 按「机制硬化规则 / 子代理降级」：出现后端不可用错误立即降级为主代理直接执行，不盲等。

降级说明：本 change 的规划（proposal/spec/design/tasks）由主代理基于以下证据直接编写：
- 已合并方案文档 `01-docs/PLAN-VIDEO-PIPELINE-PROGRESS-FEEDBACK-2026-08-13.md`（PR #746）
- PRD `01-docs/PRD.md` §7.1.9.3 / `01-docs/PRD-video-creation.md` §3.1.23
- 代码实测：`apps/desktop/electron/services/pipeline-engine.js`（run/stage 结构、getRunSnapshot、_executeStage）、`stage-executor.js`（execute/COMPOSE onProgress/PUBLISH 循环）、`story2video-stages.js`（optimize_progress/assets_progress/finalize_assets）、`apps/desktop/src/views/video-creation/StageProgress.vue`（特判渲染）
- 基线差异审计：`openspec/specs/story2video-compose-progress/spec.md` 已覆盖 compose/select_video_scenes/generate_assets 子进度；本 change 只承载未规格化缺口。

补充：`--backend claude` 探测 60s 超时无输出，同样降级。
