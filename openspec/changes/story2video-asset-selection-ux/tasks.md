# 实现任务清单（差异审计后更新）

> 审计结论：分镜素材自选完整链路（manual 配置、scene_asset_selection 检查点、candidates、confirmSceneAssets、paused 断点恢复、选择面板）已在 main 交付（PRD 7.1.3a；CreateView.vue:798/2900；pipeline-engine.js:1513/1974）。本清单仅承载「等待态展示 + 注意力引导」待办。

## 1. 阶段状态语义展示（P0）

- [x] 1.1 StageProgress 增加 `paused` 映射（class waiting / 图标 ⏸ / 标签 i18n） → `apps/desktop/src/views/video-creation/StageProgress.vue` + `apps/desktop/src/styles/stage-progress.css`
- [x] 1.2 StageProgress 新增 `checkpoint` prop，scene_asset_selection 时标签「等待选择素材」 → 同上
- [x] 1.3 locales zh/en 新增阶段状态键（等待选择素材/已暂停） → `apps/desktop/src/locales/zh.js` + `en.js`
- [x] 1.4 测试：StageProgress.test.js 新建，覆盖 paused/waiting/手动暂停 渲染 → `apps/desktop/src/views/video-creation/StageProgress.test.js`

## 2. 引导横幅与自动定位（P1）

- [x] 2.1 CreateView 检查点激活横幅（场景数 + 「去选择素材」按钮 + role=status + testid） → `apps/desktop/src/views/CreateView.vue`
- [x] 2.2 首次激活自动 scrollIntoView + 短时高亮（一次性 selectionGuided） → 同上 + SceneAssetSelection 容器 class
- [x] 2.3 locales zh/en 横幅/按钮/等待文案键 → `zh.js` + `en.js`
- [x] 2.4 测试：CreateView.test.js 补检查点激活 → 横幅出现/滚动被调用/面板可见 → `apps/desktop/src/views/CreateView.test.js`

## 3. 运行控制区与面板位置（P2）

- [x] 3.1 运行控制区等待文案 + 确认按钮常显 → `CreateView.vue`
- [x] 3.2 取消二次确认对话框 → `CreateView.vue`（复用 UiModal）
- [x] 3.3 SceneAssetSelection 渲染位置上移到 StageProgress 之后 → `CreateView.vue`
- [x] 3.4 测试：取消确认流 + 面板 DOM 位置断言 → `CreateView.test.js` + `SceneAssetSelection.test.js`

## 4. 门禁与交付

- [x] 4.1 desktop vitest 全量通过（7316 passed / 1 failed 为 ai-writer junction 双实例既有环境差异，见 fix-worktree-node-modules.sh；before-pack-media-tools/check-asar 需打包产物属环境条件）+ locale 成对校验 → `npm test`（apps/desktop）
- [x] 4.2 双模型审查（antigravity 降级记录 + Claude 全量审查 C1/W1/W2/W3 已修复、I5 补测试） → `.ccg/tasks/story2video-asset-selection-ux/review.md`
- [x] 4.3 PRD/learnings/CHANGELOG/质量门禁清单更新 → 01-docs/PRD.md、01-docs/learnings.md、CHANGELOG.md、.quality-gates.md
- [ ] 4.4 push → PR → CI 通过 → merge main → `gh pr view` 核对
- [ ] 4.5 openspec archive + CCG task 归档 + 记忆更新（三同步，同一 commit 族）