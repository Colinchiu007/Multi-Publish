# s2v-resume-btn-policy-hint — 内容政策失败恢复按钮一致性 + 不可恢复原因提示

## Why

历史列表中内容政策失败任务会隐藏「从断点继续」（设计行为），但存在两处用户可感知缺陷：
1. CreateView 错误对话框正则用 `content\s*policy`（仅空格），历史列表/主进程用 `content[_-\s]?policy`（含连字符）——"content-policy" 连字符错误在实时失败对话框会先显示恢复按钮，点击后被后端 `PIPELINE_USER_INPUT_REQUIRED` 拒绝，按钮闪现后消失。
2. 历史卡片对这类失败没有任何说明，用户不知道为什么没有恢复按钮，也不知道哪些场景需要修改文案。

## What Changes

- 统一恢复门控正则：`CreateView.vue` `canResumeStory2Video` 由 `content\s*policy` 改为 `content[_-\s]?policy`，与 `usePipelineHistory.js`、`CreateViewHistory.vue`、主进程 `pipeline-engine.js` 一致。
- 历史卡片失败区与详情弹窗：当 failed 任务因内容政策不可恢复（error 命中门控关键词）时，显示本地化提示「需修改文案后重新生成」，并从 error 文本解析内容政策失败的具体场景号（`Image #N` 且该项错误命中政策关键词），按升序、连续区间压缩展示（如 `#49、#73-77`）；解析不到场景号时显示无场景号兜底文案。
- 文案成对写入 locales：`create.history.policyResumeBlockedHint`（含 `{scenes}` 参数）与 `create.history.policyResumeBlockedGeneric`，zh/en 成对。
- 回归测试：`canResumeStory2Video` 连字符用例、场景号提取/区间压缩用例、不可恢复提示渲染用例。

## Capabilities

### New Capabilities

- `story2video-resume-gating`: 内容政策失败恢复门控的关键字规则在三处前端判定点一致（连字符/空格/下划线均命中），且历史记录对不可恢复任务展示可操作的本地化原因提示（含具体场景号）。

### Modified Capabilities

（无既有 spec 需求语义变更）

## Impact

- `apps/desktop/src/views/CreateView.vue`（正则统一）
- `apps/desktop/src/views/CreateViewHistory.vue`（提示渲染 + 场景号解析）
- `apps/desktop/src/composables/usePipelineHistory.js`（如提示所需辅助函数放此）
- `apps/desktop/src/locales/zh.js` / `en.js`（成对新增文案）
- 测试：`CreateView.test.js`、`CreateViewHistory`/`usePipelineHistory` 相关测试
- 不涉及主进程行为、数据库、API 契约
