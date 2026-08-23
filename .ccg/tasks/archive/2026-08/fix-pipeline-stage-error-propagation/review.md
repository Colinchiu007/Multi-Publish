# Review: fix-pipeline-stage-error-propagation

## 变更概述
- 文件：`apps/desktop/electron/services/pipeline-engine.js`
- 变更：+1 行
- 修复 `_finalizeRun` 在阶段失败时未设置 `terminalStage.error` 的问题

## 根因分析
`_finalizeRun` 方法设置 `terminalStage.status = status` 和 `terminalStage.completedAt`，但遗漏了 `terminalStage.error = error`。
导致渲染器 `StageProgress.vue` 的 `stageTimeDetailText()` 无法获取错误信息，用户看不到任何失败提示。

## 风险评估
- **正确性**：低风险，仅在失败路径添加 error 赋值
- **兼容性**：不影响成功路径，不影响其他阶段
- **测试覆盖**：现有 131 个测试全部通过

## 审查结论
- ✅ Critical: 无
- ✅ Warning: 无
- ✅ Info: 修复最小化，仅补全遗漏的 error 传递
