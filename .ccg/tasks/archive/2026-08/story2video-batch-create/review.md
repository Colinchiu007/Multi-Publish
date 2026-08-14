# Review — story2video-batch-create

## 双模型审查降级记录（机制硬化）

- **antigravity**：地区限制不可用（与历史记录一致，见 learnings 既有降级模式）。
- **Claude**：codeagent-wrapper 调用 exit 1 无输出（既有降级模式，与 prompt-engine-higgsfield-round3a / watermark-slow-drift 一致）。
- **降级执行**：主代理按 reviewer 清单自审，逐项复核关键路径。

## 主代理自审结果：0 Critical / 0 Warning / 0 Info

### 复核关键点

1. **调度循环补位**（`_drain`）：死循环 `_collectPending + _canStartNow` 一轮可启动多个；`_draining` 防重入；终态/创建/取消事件均触发 drain，尾部补偿覆盖事件窗口。
2. **预算拒绝 ≠ 失败**：`PIPELINE_CONCURRENCY_LIMIT` 走 1s 退避重试（`_scheduleRetry`），不标记 failed；仅真实错误标记 failed。
3. **索引隔离**：批量 run 不写 `_<name>` 索引与 `_currentPipeline`，不扰动手动任务详情页；`_countActiveManualRuns` 只统计手动 run。
4. **fail-closed 整体拒绝**：createBatch 任一输入项校验失败（超长/空/超限）整体拒绝 + `failedItems` 明细透传；文件读取失败（非 UTF-8/超 2MB）同样整体拒绝。
5. **IPC 参数校验**：create payload 严格校验 mode（text/files）、texts 数组（1-10 条、≤6000 字符）、files 数组（1-20 个）；withSenderCheck 全通道；队列服务缺失返回 `{code:-1}` 不抛错。
6. **取消语义**：仅 pending 可取消；running/completed 拒绝并返回 cancelled 明细。
7. **locale 成对**：zh/en 38+38 键成对；`--cjk` 基线 1530 条 PASS；无新增硬编码中文字符串。
8. **测试覆盖**：队列 15 例、IPC 21 例、CreateView 7 例批量用例、preload 338 例；全量 vitest 444 文件 7712 passed（preload 键数断言已同步新 API 至 96/286/84）。
9. **QM-1**：electron-builder exit 0；asar 含 `story2video-batch-queue.js`；启动 8s stderr 无错误。

## 结论

Critical/Warning 均为 0，可进入合并流程。
