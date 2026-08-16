## Implementation

- [x] OpenSpec 前置：proposal/design/specs 就绪（本文件）。
- [x] history-utils.js 新增 `RESUME_BLOCKING_ERROR_PATTERN` 与 `contentPolicyScenes(error, locale)`（集中正则 + 场景解析）。
- [x] CreateView.vue `canResumeStory2Video` 改用统一正则并补 rawError 门控；`historyItemResumable` 引用共享常量。
- [x] CreateViewHistory.vue / usePipelineHistory.js 恢复判定引用共享常量。
- [x] CreateViewHistory.vue 卡片失败区 + 详情弹窗：不可恢复政策失败时渲染本地化提示（含场景号 / 兜底）。
- [x] locales zh.js/en.js 成对新增 `create.history.policyResumeBlockedLabel`、`policyResumeBlockedHint`（{scenes}）与 `policyResumeBlockedGeneric`。

## Validation

- [x] CreateView.test.js：`canResumeStory2Video` 对 "content-policy"（连字符）返回 false、非政策错误返回 true。
- [x] history-utils.test.js：`RESUME_BLOCKING_ERROR_PATTERN` 变体矩阵；`contentPolicyScenes` 混合错误只提取政策场景、区间压缩、去重、en 分隔符、空命中。
- [x] CreateViewHistory.test.js：政策失败卡片/详情显示 hint、可恢复失败不显示、无场景号兜底。
- [x] 相关 vitest 用例通过（CreateView 199 / CreateViewHistory 14 / history-utils 10 全绿）。
- [x] CI Gate 7 locale 成对同步校验通过（zh/en 成对提交）。
- [x] 审查：antigravity 因地区限制不可用；Claude 审查发现的 Critical（vue-i18n 函数消息不插值 {scenes}）已修复（locales 改函数消息 + 测试 mock 复刻真实契约）并回归；远程 PR #876 CI 13/13 全绿后合并（squash 20366e0d）。
