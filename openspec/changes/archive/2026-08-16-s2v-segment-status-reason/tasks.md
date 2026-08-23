# Tasks — s2v-segment-status-reason

进度以本文件 checkbox 为唯一来源（openspec-integration Requirement: 进度单一来源）。

## 差异审计

- [x] 基线差异审计：已交付（任务级历史失败阶段/错误摘要、重试失败 toast 归一化）vs 待办（分段内联状态/原因、成功路径 error 清理）记录于 proposal.md

## 实现（主进程）

- [x] 服务层：`story2video-project-service.js` 所有置 `completed` 的写回路径清除 `error`（replaceSegmentAudio / regenerateSceneAudio / retrySegment image+video / generateSceneImage / generateSceneVideo / generateSceneAiVideo / regenerateScenePrompt / regenerateSceneSubtitle 已逐一核对；recomposeProject 为项目级状态、selectSceneMaterial 不写 status，均不涉及）；失败 catch 路径保持写 `error`
  - 测试目标：`apps/desktop/electron/services/story2video-project-service.test.js`（成功清 error、失败保留 error）✅ +2 回归用例

## 实现（渲染层 + 文案）

- [x] `ResultView.vue`：分段状态徽标本地化标签（`segmentStatusLabel`，映射 `story2video.segmentStatus.*`，默认 completed）
  - 测试目标：`apps/desktop/src/views/ResultView.test.js` ✅ +3 渲染用例
- [x] `ResultView.vue`：`status=failed` 且存在 error 时内联原因行（复用 `story2video-notifications.js` 归一化 + 码点截断 ~120），completed 残留 error 不显示
  - 测试目标：`apps/desktop/src/views/ResultView.test.js` ✅
- [x] `locales/zh.js` + `locales/en.js`：成对新增 `story2video.segmentStatus.*`（completed/failed/processing/pending）
  - 测试目标：CI Gate 7 locale 同步 ✅（CJK 基线仅行号位移 18+18，无新增硬编码）

## 验证与交付

- [x] 运行相关测试（project-service 87 / ResultView 76 / notifications 27 共 190 例通过）与门禁（eslint、node --check、git diff --check、check-locale-sync --cjk）
- [x] 双模型审查（antigravity 地区不可用 + claude ConnectionRefused → 降级主代理自审 0C/0W，review.md 留证）
- [x] openspec validate ✓（--changes 该 change 通过）；archive 时 delta 并入 openspec/specs/story2video-retry-error-transparency/spec.md
- [x] 提交推送 PR，CI 全绿后合并，完成三同步归档（openspec archive + CCG task 归档 + learnings）
