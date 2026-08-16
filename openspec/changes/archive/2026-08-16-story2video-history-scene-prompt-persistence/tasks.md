# Tasks

> 状态：规划完成，实施中（2026-08-16）。

## - [ ] 详情弹窗完整展示
  - [ ] `CreateViewHistory.vue` detailScenes 列表移除 60 字符截断，text/prompt 分行完整展示（滚动）
  - 测试：`CreateViewHistory.test.js` 完整展示/单字段/预览保持

## - [ ] 结果页未保存可见性
  - [ ] `ResultView.vue` 分段编辑区标题行 dirty chip（locale 键）
  - 测试：`ResultView.test.js` dirty chip 出现/保存后消失

## - [ ] 离开守卫
  - [ ] `ResultView.vue` beforeRouteLeave + unsavedLeaveDialog 三按钮（保存并离开/不保存离开/取消）+ unmounted 兜底
  - 测试：`ResultView.test.js` 四分支（保存成功导航/保存失败留页/放弃导航/取消留页/无 dirty 放行）

## - [ ] 文案 zh/en 成对
  - [ ] `locales/zh.js` + `locales/en.js` 新增 unsavedChanges / unsavedLeaveTitle / unsavedLeaveMessage / saveAndLeave / discardAndLeave
  - 测试：`node scripts/check-locale-sync.js` 通过

## - [ ] 门禁与文档
  - [ ] 运行受影响的 Vitest 用例（ResultView / CreateViewHistory / views-deep）
  - [ ] `apps/desktop` vue build 通过
  - [ ] `01-docs/CHANGELOG.md` + `01-docs/PRD-video-creation.md` 记录
  - [ ] openspec validate 通过
