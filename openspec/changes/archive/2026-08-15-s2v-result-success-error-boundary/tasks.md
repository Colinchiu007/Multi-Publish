## 1. 完成时序回归与实现（pipeline-engine）

- [x] 1.1 先写失败测试：`_advanceRun` 最后阶段完成时，`pipeline:complete` 必须发生在 `story2videoProjectService.saveRun` 之后；saveRun 抛错时不得 emit 完成、run 终态为 failed（`apps/desktop/electron/tests/pipeline-engine.test.js`）
- [x] 1.2 实现：`_advanceRun` 完成分支先 `_finalizeRun`，仅在 run.status 仍为 completed 时 emit `pipeline:complete` 并返回 completed
- [x] 1.3 跑通 `apps/desktop/electron/tests/pipeline-engine.test.js`（测试目标：时序与失败不误报）

## 2. 结果页错误隔离与文案（ResultView）

- [x] 2.1 先写失败测试：项目读取成功但某场景 URL/旁白 URL 失败时，成片仍加载、项目不置空、只显示预览级提示；主视频 error 不再触发 operation_failed（`apps/desktop/src/views/ResultView.test.js`）
- [x] 2.2 实现：`loadProject` 拆分为项目读取、主视频 URL、旁白 URL、场景素材 URL 独立容错；主视频 `@error` 使用 `videoPreviewFailed`
- [x] 2.3 新增 `story2video.videoPreviewFailed` zh/en 文案并同步 CJK baseline（测试目标：ResultView 用例 + `node .github/scripts/check-locale-sync.js --cjk`）
- [x] 2.4 跑通 `ResultView.test.js` 与关联 renderer 套件（测试目标：新增隔离用例）

## 3. 验证与文档

- [x] 3.1 运行相关单测与 Vite build
- [x] 3.2 更新 `01-docs/PRD.md`、`CHANGELOG.md`、`.ccg/spec/frontend/index.md`/learnings（如有可沉淀经验）
- [x] 3.3 `openspec validate --strict` + 三同步归档（OpenSpec change、CCG task、质量节拍复盘）
- [x] 3.4 提交隔离 worktree 分支并开 PR；远程合并后回填 remoteStatus
