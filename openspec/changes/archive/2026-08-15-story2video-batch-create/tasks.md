# Tasks: story2video-batch-create

> 进度唯一来源：每完成一项勾选 [x]。任务序号即实现顺序（存在依赖）。

## 后端

- [ ] T1 引擎扩展：pipeline-engine.js start() run 打标（source/batchId/batchItemId）+ source==='batch' 跳过 _<name> 索引与 _currentPipeline；startOrchestrated normalize 前提取、后附加 batch 标记；新增 _countActiveManualRuns()
  - 测试：pipeline-engine.test.js 增补——批量 run 打标、索引隔离（getStatus(name) 保持 idle）、手动计数
- [ ] T2 新增 services/story2video-batch-queue.js：状态机（pending/running/completed/failed/cancelled）、调度 drain（并行≤2、手动互斥≤1、全局预算退避）、Backlot 事件订阅、文件读取校验（扩展名/2MB/utf-8/非空/超长）、错误码、getBatches()
  - 测试：story2video-batch-queue.test.js——入队/调度顺序/并行上限/手动互斥/预算退避/取消/校验错误码
- [ ] T3 IPC 注册：ipc-handlers/pipeline.js 新增 story2video:batch:create/status/cancel + story2video:pickBatchFiles（dialog 过滤 .txt/.md）；container.setup.js 注册 batchQueue 依赖
  - 测试：ipc-handlers/pipeline.test.js 增补或独立 handler 测试

## 前端

- [ ] T4 preload/publish.js + src/api/publisher.js：暴露 story2videoBatchCreate/Status/Cancel/PickBatchFiles（统一 {code,data} 包裹与 fallback）
  - 测试：preload.test.js 增补
- [ ] T5 CreateView.vue：批量创作按钮（action-bar，仅编排流水线）+ UiModal 弹窗（视频增强模式下拉、标签页、文案输入 1-10 条带「+」、文件选择与列表、启动按钮）+ 队列展示面板（任务行/统计/取消）+ 3s 轮询 + 关闭弹窗后台继续
  - 测试：CreateView.test.js 增补——打开弹窗、文案上限、文件列表、启动校验、队列展示
- [ ] T6 locales zh.js/en.js 成对新增批量创作文案；渲染端无硬编码中文（CI 基线扫描通过）

## 文档与交付

- [ ] T7 01-docs PRD/相关文档补充：数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字
- [ ] T8 CHANGELOG + learnings + 质量节拍自检（.quality-gates.md）
- [ ] T9 全量门禁：vitest 相关测试、locale-sync、打包验证（electron-builder --win --dir 或已有门禁）
- [ ] T10 推送分支、创建 PR、CI 通过、合并回 main
- [ ] T11 OpenSpec apply + archive、CCG task 归档、记忆更新（三同步）
