# Story2Video 提示词翻译并行合成审查

日期：2026-08-17
分支：`codex/story2video-translate-parallel-compose`

## 审查结论

- Critical：0
- Major：0
- Minor：0
- 结论：通过，可进入打包、提交和远程 PR 流程。

## 审查范围

- `apps/desktop/electron/services/stage-executor.js`：可选 compose 并行任务、任务级 timeout、AbortController/cancel、compose 失败优先、fail-open 收尾。
- `apps/desktop/electron/services/story2video-stages.js`：pending JSON 合同、稳定 scene index、批量翻译、人工/自动模式分流、断点恢复。
- `apps/desktop/electron/services/pipeline-engine.js`：仅 Story2Video compose stage opt-in。
- 相关 Vitest、PRD、CHANGELOG、learnings 和 OpenSpec。

## 已修复审查项

1. 并行任务的 deadline 从任务工厂启动时建立，且优先使用任务返回的 `timeoutMs`，其次使用 stage 配置，最后使用默认 60 秒。
2. compose 抛异常或返回失败对象时，执行器会 abort 并调用可选 `cancel()`，同时清理 timeout；后台 Promise 已绑定 rejection handler。
3. 翻译请求携带稳定场景 `index`，响应按批次长度、index、prompt 严格校验，避免稀疏/乱序场景错配。
4. pending 合并过滤非法 index、空 prompt 和重复 index；非数组批量优化响应归一化为空数组并 fail closed。
5. 批次超时不会提前放弃后续批次；已完成结果仍会保留，未完成项继续作为 pending。
6. 完成态只接受非空字符串 translation；等于原文、JSON 包装和代码围栏不会作为有效译文。

## 验证证据

- 聚焦 Vitest：3 个测试文件，214 passed。
- 覆盖：自动模式不提前翻译、manual checkpoint 前翻译、compose 与翻译真实重叠、任务级 timeout、compose 失败取消、翻译失败 fail-open、首批超时后续批次、乱序 index、JSON 快照恢复、非法/重复 index。
- `git diff --check`：通过。
- `openspec validate --changes`：本 change 通过；其他既有 change 存在独立失败，未扩大范围处理。

## 外部审查降级

按项目机制硬化规则，外部 wrapper 结果如下：

- antigravity：不可用，exit 1/既有 403 地域资格限制记录。
- Claude：不可用，wrapper exit 1。

因此使用本地固定 diff 审查和独立回归测试替代，未将外部模型不可用误判为代码通过；本报告保留该降级事实。

## 遗留信息

- 全仓 lint 存在大量基线问题，分布在未修改文件和生成 preload bundle；本次变更文件未发现新增 lint 问题，未扩大范围修复。
- UI 组件未修改，沿用现有非空 `promptTranslation` 只读显示合同，因此未新增 UI 组件测试。
