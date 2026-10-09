## Why

api-publish-engine-w3 的 6.3 活体定案（not-go）表明：快手 API 轨在 `upload/complete` 恒定被裸 400 拒绝，根因在传输层指纹（TLS/HTTP 版本/QUIC），Node 侧不可复刻；但 `config/platforms.yaml` 中 kuaishou 仍为 `publishMode: api-then-dom`，于是**每次快手发布都先跑一轮注定失败的 API 尝试再降级 DOM**。这个空转开关目前只有一条 `logger.warn('degraded to dom')` 文本日志，无法回答「一天空转多少次、白烧多少秒、失败原因码分布如何」，因此也无法用数据判断是否应当回拨 `dom-only`。

先加观测、再决定回拨，是本波的唯一目标：**把空转成本变成可复跑、可聚合的指标**，而不是凭感觉改配置。

## What Changes

- `packages/api-publish-engine` 新增降级观测模块 `src/publish/core/degrade-observatory.js`：进程内按平台聚合 API 轨尝试次数、失败次数、降级 DOM 次数、API 尝试累计/平均耗时与 reasonCode 分布，并 best-effort 落盘快照（写失败绝不阻断发布主链）。
- `src/publish/core/publish-mode-runner.js` 对 API 尝试计时，并在「留在 API / 停报 / 降级 DOM」三类出口向注入的观测器投递结构化事件（含 `platform`、`mode`、`outcome`、`reasonCode`、`apiMs`、`degraded`）。
- `src/publish/publish-service.js` 与 `src/index.js` 装配服务级观测器单例，导出 `getDegradeSummary()` 供上层（诊断中心 / OPS / 脚本）读取；观测器与落盘路径均可注入，单测零外发、零真实磁盘。
- **不改** `publishMode` 配置值，**不改** 路由决策语义，**不含** 任何 UI/IPC 改动（读取入口留下一波）。

## Capabilities

### New Capabilities
- `api-publish-degrade-observability`: 双轨发布降级路径的结构化观测契约——记录什么、如何聚合、落盘失败不得影响发布、以及「观测数据不足以证明结论时禁止据此改配置」的收口纪律。

### Modified Capabilities
<!-- 无：本波不改变 api-publish-chain / api-publish-kuaishou-chain 既有 Requirement 的语义（publishMode 取值与路由决策均不动）。 -->

## Impact

- 代码：`packages/api-publish-engine/src/publish/core/degrade-observatory.js`（新增）、`src/publish/core/publish-mode-runner.js`、`src/publish/publish-service.js`、`src/index.js`。
- 测试：新增 `test/degrade-observatory.test.js`；扩展 `test/publish-mode-runner.test.js`（计时与事件投递）、`test/publish-service.test.js`（注入与导出）。
- 数据/磁盘：新增一份指标快照文件（默认落在运行时数据目录，路径可注入）；沿用既有 atomic-rename 写入范式，写失败仅告警。
- 决策影响：产出的 `getDegradeSummary()` 数据是「kuaishou 是否回拨 dom-only」的判据来源（用户裁决：先观测再决定）。
- 文档：CHANGELOG 条目、`.quality-gates.md` 执行记录；主规格在归档时新增 `api-publish-degrade-observability`。
