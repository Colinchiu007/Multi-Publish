---
id: s2v-manual-video-parallel
title: manual 模式视频候选生成并行化 - 任务清单
status: proposed
created: 2026-08-13
---

# Tasks

- [x] 差异审计：manual 候选生成（story2video-stages.js buildManualSceneCandidates）视频串行 + 图片等待视频；auto 已有预算并发 + 三路并行（PR #726 已合并）；仅 manual 需改
- [x] OpenSpec 工件：proposal / design / specs（story2video-creation-mode MODIFIED）
- [x] 实现：executor manual 分支计算 videoConcurrency（requested 默认 2，预算收敛）并传 ctx + 并发日志
- [x] 实现：buildManualSceneCandidates 视频 `_mapWithConcurrency` 有界并行 + 与图片 Promise.all 并行启动（保留失败回退/进度/检查点契约）
- [x] 测试：story2video-manual-assets.test.js 新增并行（in-flight=2）、预算收敛（in-flight=1）、失败回退、图片与视频并行启动断言（19 全绿）
- [x] 测试：`npx vitest run services/story2video-manual-assets.test.js services/story2video-stages.test.js` 全绿（83+19）；story2video-text-config 68 全绿
- [x] 文档：PRD.md 7.1.3a 候选生成补充 manual 并行机制（三副本同步）；CHANGELOG.md 记录
- [x] 审查：质量节拍上下文审查（并发安全/契约不变/scope）；Claude 审查 0 Critical/2 Major 已修复（antigravity 区域不可用降级记录）；见 .ccg/tasks/s2v-manual-video-parallel/review.md
- [ ] 门禁：openspec validate 通过；提交 codex/ 分支；PR；归档三同步（openspec archive + CCG task 归档 + learnings）
