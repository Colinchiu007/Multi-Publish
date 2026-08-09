# 审查结果

## 审查方式
- 有界外部审查：codeagent-wrapper --lite --backend claude，只读 diff（C:\tmp\claude-targeted-review-non-carousel-e2e.txt / .md），exit 0，约 148s。
- 子代理（探子）后端 403 不可用，按机制硬化规则降级为主代理 + 外部有界审查 + 自审。

## 外部审查结论
- Critical：0
- Warning：2（已修复）
  1. route-functional-suite.js screen-demo 禁用断言：原 `.isDisabled().catch(() => true)` 定位失败会被当成通过 → 改为「启动按钮存在 且 禁用」，不再吞错误为 true。
  2. assertPipelineStarted 依赖 __ipcCallsByMethod 计数 + __ipcCalls 数组两套状态 → 改为单一数据源（等待 __ipcCalls 中出现 method+流水线名 的调用）。
- Info（记录，不改）：
  - 14 条流水线在 mock/分组/断言处三处硬编码，引擎↔mock 漂移由 pipeline-engine.test.js 的 available 断言 + E2E cardCount===14 双重兜底；跨文件统一导出列为后续改进。
  - fillByPlaceholder 结果未单独断言：空输入启动会被 TEXT_REQUIRED 拦截且不触发 IPC，流水线名断言已间接覆盖。
  - selectPipelineByName 与循环内 waitForVisible('.pipeline-detail') 重复等待：无害。
  - mock originalName/runId 为测试内耦合：已确认无其他测试依赖旧 runId。

## 自审结论
- 变更仅测试设施；无生产代码、无密钥、无硬编码等待（waitForTimeout 未新增）。
- eslint 0 warning；node --check 通过。

## 修复后复验
- create 路由 E2E 58/58（修复后重跑）；全量 E2E 314/314（修复后终跑）；引擎级 vitest 145/145 + 契约 18/18 + node:test orchestrator 6/6。
