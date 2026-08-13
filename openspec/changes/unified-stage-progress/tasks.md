# Tasks: 统一阶段进度契约

## Layer 1（无依赖，可并行）

### Task 1: stage.progress 契约（pipeline-engine.js）
- **文件**：`apps/desktop/electron/services/pipeline-engine.js`
- **改动**：
  1. `_createRun` stage 初始化增加 `progress: null`
  2. `_executeStage` 注入 `onProgress` 回调到 `fullStage.onProgress`
  3. `_normalizeStageProgress(update)` 通用归一化函数
  4. `getRunSnapshot` 无需改动（stage 对象已包含 progress）
  5. `_calcProgress` 升级为加权计算
- **测试**：新增 stage.progress 契约测试 + 加权进度测试
- **TDD**：先写测试断言 stage.progress 结构

### Task 2: StageProgress.vue 去特判（前端）
- **文件**：`apps/desktop/src/views/video-creation/StageProgress.vue`
- **改动**：
  1. `stageSubProgressPercent` 已通用化（2026-08-14 已完成），确认兼容 stage.progress
  2. `stageDetailText` 中的硬编码 stage.name 检查改为通用：优先读 `stage.progress.message`，再 fallback 到 context
  3. 移除 `stage.name === 'compose'` 等硬编码特判
- **测试**：UE contract 测试 + StageProgress 单元测试

### Task 3: 归一化函数单元测试
- **文件**：`apps/desktop/electron/services/pipeline-engine.js`（或独立模块）
- **改动**：`_normalizeStageProgress(update)` — percent 0-100 finite、message 非空限长 200、updatedAt ISO
- **测试**：正常值/越界/类型错误/空值 fail-closed

## Layer 2（依赖 Layer 1）

### Task 4: optimize 阶段接入 ✅
- **文件**：`apps/desktop/electron/services/story2video-stages.js`
- **改动**：optimize 执行循环中调用 `stage.onProgress?.({ percent, message })`
- **数据源**：复用现有 `optimize_progress.done/total`
- **测试**：断言 onProgress 被调用且 stage.progress 更新

### Task 5: publish 阶段接入 ✅
- **文件**：`apps/desktop/electron/services/stage-executor.js`
- **改动**：PUBLISH 循环中调用 `stage.onProgress?.({ percent, message })`
- **测试**：断言逐平台进度上报

### Task 6: split/select_video_scenes 增强 ✅
- **文件**：`apps/desktop/electron/services/stage-executor.js` + `story2video-stages.js`
- **改动**：split 完成写 summary；select_video_scenes 启动时上报初始 message
- **测试**：断言 summary/message 写入

## Layer 3（可选增强）

### Task 7: 实时推送（可选）
- **文件**：`apps/desktop/electron/services/pipeline-engine.js`
- **改动**：`_emit('stage:progress', { runId, stageName, progress })` 事件 + 前端监听
- **降级**：3s 轮询作为兜底
- **标注**：Phase 3，视 Phase 1-2 效果决定是否实施

## 验收标准

- [x] 任意阶段运行中均显示进行中文案
- [x] 可计数阶段（optimize/publish/generate_assets）显示 done/total + 百分比
- [ ] 总进度条平滑前进（加权计算）
- [ ] 旧数据（无 stage.progress）正常 fallback
- [ ] onProgress 异常不阻断阶段执行
- [ ] 所有现有测试不回归
