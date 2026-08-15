## Context

PipelineEngine 的 `_advanceRun` 在阶段推进到最后时先 `_emit('pipeline:complete')`，再调用 `_finalizeRun(run, 'completed')`；`_finalizeRun` 内同步执行 `story2videoProjectService.saveRun()`，复制 27 组素材并写入 `project.json`。实测本次 run：finalize 日志 `12:41:40.737`，项目 `updatedAt` `12:41:41.888`，相差约 1.15 秒。renderer 在 `pipeline:complete` 推送或轮询快照后跳转结果页，`ResultView.loadProject` 又用一个 try/catch 包住项目读取、场景 URL、旁白 URL、成片 URL，任一步失败都显示任务级 operation_failed；主视频 `@error` 也复用同一文案。

## Goals / Non-Goals

**Goals:**
- 完成事件/结果页可见性严格晚于项目持久化。
- 结果页按资源隔离错误：成片、旁白、场景素材独立降级。
- 视频播放错误使用预览级文案，不污染项目状态。
- 回归测试覆盖完成时序、持久化失败、附加资源失败和视频 error。

**Non-Goals:**
- 不改动素材生成、合成算法、发布逻辑。
- 不新增重试队列或后台任务系统。
- 不改变已完成项目的数据结构（兼容旧 project.json）。

## Decisions

### D1: 完成信号移到持久化之后

`_advanceRun` 完成分支改为先执行 `_finalizeRun`（含同步 saveRun），再发 `pipeline:complete`，最后返回 completed。备选方案：把 saveRun 移到 `_advanceRun` 之前由 stage executor 单独完成，改动面更大且破坏“finalize 是唯一终态收敛点”；不采用。

持久化失败处理：`_finalizeRun` 已把 run 终态改为 failed 并写 error；完成分支需要先检查 `run.status === 'completed'` 才发完成事件与返回 completed，否则返回失败结果，避免误报。

### D2: 结果页按资源隔离

`loadProject` 拆为：项目读取（整体失败仍可提示任务级）→ 主视频 URL（失败进入 preview-missing）→ 旁白 URL（失败置空并记 preview error）→ 场景素材 URL（逐项 catch，失败置空并显示单场景不可用）。主视频 `<video @error>` 改为预览级提示，不再调用 `showStory2VideoOperationFailure`。

### D3: 新增 i18n 文案

新增 `story2video.videoPreviewFailed`（zh/en 成对），用于主视频 error。已有 `story2video.previewMissing` 可继续表示成片路径缺失。

## Risks / Trade-offs

- 完成信号后移最多增加数秒延迟，但该延迟原本存在于轮询路径，用户感知可忽略。
- 结果页资源隔离会保留“成片可用但部分素材预览缺失”的混合状态；这是期望行为，但需要测试锁定，防止回归成大 try/catch。
- 修改 `_advanceRun` 影响所有编排流水线；同步执行持久化的流水线均受益，非 story2video 流水线不受影响（saveRun 返回 null 时行为不变）。
