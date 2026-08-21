# restore-s2v-foreground-progress

## 根因
- PR #1019「auto-background video pipeline runs」把「启动流水线」改为成功即自动脱离到后台 + toast，
  并移除原有「后台运行」按钮；前端不再在当前视图展示流水线阶段进度（历史回归）。
- 启动成功立即 resetPipelineUiState 清空 orchestrationRunId，导致「启动流水线」按钮保持可点；
  用户连点会在主进程起出多条重复后台任务（并发预算内）。

## 修复目标
1. 点击「启动流水线」后 run 挂回当前视图，实时展示阶段进度（恢复旧流程，含实时推送 + 3s 轮询兜底）。
2. 运行中 / 启动请求在途时禁止重复启动：按钮禁用（canStartPipeline）+ 方法守卫（startPipeline busy 标志 + orchestrationRunId）。
3. 保留主进程 background 推进（IPC 不阻塞）与历史记录 / 断点恢复 / 关闭窗口后台等既有能力。

## 改动面
- apps/desktop/src/views/CreateView.vue：三条编排启动路径成功分支改用 openRunningPipeline（前台跟踪）；
  新增 startingPipeline busy 标志与 canStartPipeline / startPipeline / handleStartPipeline 防重门控。
- apps/desktop/src/views/CreateView.test.js：更新启动行为断言 + 新增防重复启动回归测试。
