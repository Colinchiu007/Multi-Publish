# Tasks

> 状态：实现与门禁完成，待双模型审查 → PR 合并后归档。

## - [x] 历史重生成视频优化词显式顶格
  - [x] `story2video-project-service.js` regenerateScenePrompt（kind=video）请求新增 `max_length: VIDEO_ENGINE_LIMITS.videoMaxLengthMax`（20000），引入 `video-prompt-engine-contract` 的 `VIDEO_ENGINE_LIMITS`
  - 测试：`story2video-project-service.test.js` video regen 断言 `optimizeVideoPrompt` 收到 `{ index, max_length: 20000 }`；新增超长 5000 字符返回完整落库（safeText 20000）

## - [x] 共享契约不放松
  - [x] 共享 kernel `PROMPT_ENGINE_LIMITS.maxLength.default`（500）、视频 `videoMaxLengthRanges`/`videoMaxLengthBatchDefault`/`videoMaxLengthRefinedDefault` 零改动
  - 测试：`video-prompt-engine-contract.test.js` 既有 legacy/standalone clamp 断言值不改（184/184 全绿）

## - [x] 门禁与文档
  - [x] 定向 Vitest 通过（story2video-project-service + video-prompt-engine-contract）
  - [x] `01-docs/PRD-video-creation.md` 3.1.29.5 状态更新（待实现 → 已实现）
  - [x] `01-docs/CHANGELOG.md` 置顶条目
  - [x] `.quality-gates.md` 本次执行记录
  - [x] openspec validate 通过
  - [x] 双模型审查（antigravity 地域不可用 + claude 本地代理 127.0.0.1:15721 未监听 → 降级主代理直审，结论 PASS，见 .ccg/tasks/s2v-history-video-maxlength/review.md）
  - [x] PR #906 合并（squash b885ce53，2026-08-16T14:59Z）→ 本 change 归档 + CCG task 归档 + quality-gates 远程同步回填
