# 流水线进度弹窗「后台运行」按钮缺失

## 问题描述
流水线启动后（新启动和断点继续），进度弹窗中原来有的「后台运行」按钮不见了。

## QM-5 根因分析

### 1. 第一性原因
`openRunningPipeline`（断点继续入口）缺少 checkpoint 状态重置，与 `startOrchestrationForeground`（新启动入口）不一致。

具体差异：
- `startOrchestrationForeground` 重置了 `needsCheckpoint`、`providerWarnings`、`dismissedProviderWarnings`、`sceneAssetSelectionActive`、`sceneAssetCandidates`、`sceneAssetSelectionError`、`sceneAssetConfirming`、`dismissedBgmSkippedNotice`
- `openRunningPipeline` 缺少上述全部 8 个重置

**触发链路**：
1. 用户在旧 run 处于人工检查点（如素材选择 `sceneAssetSelectionActive=true`）
2. 用户从历史记录点击「断点继续」
3. `openRunningPipeline` 未重置 `sceneAssetSelectionActive` 和 `needsCheckpoint`
4. `updateOrchestrationStatus` 若失败/异常，旧值残留
5. `isPipelineManualCheckpoint()` 返回 true（因为 `sceneAssetSelectionActive=true`）
6. `canDetachPipelineToBackground` 返回 false
7. 弹窗打开但「后台运行」按钮隐藏

新启动场景也可能受影响：如果用户在已暂停/检查点状态下直接点击启动，`needsCheckpoint` 等状态未清理。

### 2. 逃逸分析
| 层级 | 为什么没拦住 |
|------|-------------|
| 单测 | `openRunningPipeline` 测试未覆盖 checkpoint 状态清理 |
| 集成 | 无 |
| E2E | 无 |
| 审查 | Aug 23 引入两个方法时，审查未发现状态重置列表不一致 |

### 3. 系统性漏洞定位
**审查盲区** — 两个功能相似的方法（`startOrchestrationForeground` / `openRunningPipeline`）的状态重置列表不一致，缺乏抽取公共函数来保证一致性。

### 4. 修复
在 `openRunningPipeline` 中补充 8 个缺失的状态重置，对齐 `startOrchestrationForeground`：
- `needsCheckpoint = false`
- `providerWarnings = []`
- `dismissedProviderWarnings = false`
- `sceneAssetSelectionActive = false`
- `sceneAssetCandidates = []`
- `sceneAssetSelectionError = ''`
- `sceneAssetConfirming = false`
- `dismissedBgmSkippedNotice = false`

### 5. 预防措施
建议后续抽取 `resetPipelineForegroundState()` 公共函数，被 `startOrchestrationForeground` 和 `openRunningPipeline` 复用，避免再次遗漏。
