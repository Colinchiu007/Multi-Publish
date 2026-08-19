## 1. Root Cause And Contracts

- [x] 1.1 固化项目/运行记录身份合并规则，并覆盖 completed 项目、completed 运行记录与身份不匹配数据。
- [x] 1.2 保持项目删除与运行删除的错误消息键和 fail-closed 语义。

## 2. Regression Tests First

- [x] 2.1 在 CreateViewHistory.test.js 增加 completed 项目和 completed 运行记录删除事件测试。
- [x] 2.2 在 CreateView.test.js 增加从历史记录分流到项目/运行删除确认、成功移除和失败保留测试。
- [x] 2.3 在 story2video-project-service.test.js 增加当前 owner 项目索引缺失时删除失败且索引不被误改的测试。
- [x] 2.4 在相关 IPC 测试中覆盖项目删除失败消息来源和运行删除错误映射。

## 3. Implementation

- [x] 3.1 实现历史合并与删除目标身份修复。
- [x] 3.2 运行受影响 Vitest、Electron IPC 测试和类型/构建检查。

## 4. Review And Delivery

- [x] 4.1 完成双模型审查、QM-5 根因/逃逸/预防复盘，并将结果写入 CCG review.md。
- [x] 4.2 运行 OpenSpec validate，更新 task.json 阶段并准备分支提交/PR。
