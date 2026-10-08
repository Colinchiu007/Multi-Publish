## Context

双轨发布服务层（`packages/api-publish-engine/src/publish/`）已经是唯一事实路由：`publish-mode-runner` 读 `publishMode` → spacer 频控 → 跑 API 链 → `outcomeOfResult` 归一 → `decideRoute` 决定「留 API / 停报 / 降级 DOM」。W3 定案后，kuaishou 仍为 `api-then-dom`，每次发布都会走完「API 尝试 → 失败 → 降级」的全程，但当前只有一条 `logger.warn('publish-mode', 'degraded to dom', {...})` 文本日志：不可聚合、重启即丢、也无法回答「空转烧了多少秒」。

约束：
- 观测不能改变路由语义，更不能因为自身失败影响发布（发布是主链，观测是旁路）。
- 引擎被 Electron 主进程、`publish-api-server`、脚本多入口消费，进程数不唯一；`index.js ↔ api-router` 已存在惰性循环依赖，新模块必须是不依赖上层的叶子。
- 日志纪律：不得把 cookie / 账号 token / 内容正文写入观测数据（沿用 `log-redact` 口径）。
- 用户裁决：本波只加观测，**不改** `config/platforms.yaml` 的 `publishMode`。

## Goals / Non-Goals

**Goals:**
- 每次 API 轨尝试产生一条结构化事件：`platform / mode / outcome / reasonCode / apiMs / degraded / stopped`。
- 按平台聚合的可读汇总：尝试数、成功数、失败数、降级数、累计与平均耗时、原因码分布、观察窗口、样本是否充足。
- 旁路 fail-open：观测器缺失 / 异常 / 落盘失败都不改变发布结果。
- 汇总可跨进程重启读取（持久化快照），供后续「是否回拨 dom-only」决策引用。

**Non-Goals:**
- 不改发布模式配置、不改 `decideRoute` 判定、不新增降级策略。
- 不做 UI / IPC / 诊断中心展示（读取入口留下一波）。
- 不做跨平台大盘、不上报远端、不引入 metrics 框架（Prometheus 等）。
- 本波不下「该不该回拨 dom-only」的结论——只提供数据。

## Decisions

**D1：新建叶子模块 `src/publish/core/degrade-observatory.js`，通过 deps 注入 runner/service。**
`createDegradeObservatory({ persistPath, clock, logger, minAttempts, windowMs, persistIntervalRecords })` → `{ record(evt), summary(), reset(), snapshotPath() }`。
- 备选 A（在既有 logger 里加字段）：只能逐条 grep，无法聚合与跨重启读取 → 否。
- 备选 B（复用 `audit-log.js`）：audit 是面向用户的操作审计条目，把高频指标塞进去会污染审计并撑爆体积 → 否。
- 备选 C（`usage-tracker.js`）：语义是 API Key 请求计量，键空间与用途不同 → 否。

**D2：计时点在 runner 内包裹 `apiPublish` 调用，时钟可注入。**
`const t0 = clock(); try { apiRes = await apiPublish(...) } finally { apiMs = clock() - t0 }`。异常路径（`catch`）同样计时，保证「抛异常的空转」也被计入。
- `clock` 默认 `Date.now`，单测注入虚拟时钟，避免时间敏感断言（condition-based-waiting 纪律）。
- 不用 `performance.now()`：跨入口（Electron 主进程 / Node server）语义与可注入性更差。

**D3：进程内聚合为主，落盘为节流快照，读入合并、按 pid 分区。**
`record()` 只改内存；每累计 `persistIntervalRecords`（默认 5）条或显式 `summary({persist:true})` 时写快照：读旧文件 → 只覆盖本 `process.pid` 分区 → 写 `*.tmp` 后 `fs.renameSync` 原子替换（沿用 `atomic-rename` 范式）。任何读写异常：首次 `logger.warn` 一次，之后静默，绝不抛给发布链。
- 理由：多进程共存时后写者不能抹掉前者数据；按 pid 分区让「合并视图」可加和。
- 默认路径取运行时数据目录（`runtime-config-path`）下的 `publish-degrade-metrics.json`；路径必须可注入，单测一律用 `os.tmpdir()` 自建路径，禁止依赖构建残留目录。

**D4：汇总带样本门禁，不带结论。**
每个平台条目附 `windowMs`（首事件→末事件跨度）、`insufficientSample`（`attempts < minAttempts`（默认 20）或窗口 < `windowMs` 门槛（默认 7 天））。模块不生成「建议回拨/保留」文本。
- 理由：把「数据」与「决策」分开，避免代码替人做未验证的结论；对应规格「样本门禁」Requirement。

**D5：字段白名单。**
落盘事件不含 `accountId`/cookie 派生串（runner 内部为风控台账才派生的 `slice(cookie,0,16)` 不进入观测），只含平台、模式、结果、原因码、耗时与计数。

## Risks / Trade-offs

- **长尾耗时污染均值**：网络抖动会使 `avgApiMs` 失真 → 汇总同时给 `totalApiMs` 与 `maxApiMs`，决策看累计与分布而非单点均值。
- **内存无界增长**：只保留聚合计数 + 每平台最近 N 条事件（默认 50，环形淘汰），不保留全量事件流；代价是无法做逐条回放（可接受，逐条已有 logger.warn）。
- **快照与内存不一致窗口**：节流写入意味着崩溃可能丢最后 <5 条 → 明确标注为「尽力而为」，`summary()` 以内存为准、文件仅作跨重启复盘。
- **误用为改配置的直接依据**：规格已加样本门禁 Requirement + 场景，Code Review 与 `.quality-gates.md` 记录需复核「配置变更独立成波」。
- **修改 `apps/desktop/electron/` 之外的引擎代码仍可能被打包产物遮蔽**：按 QM-1 走 `electron-builder --dir` 三件套（asar 清单 / require 链 / exe 存活）验证新模块确实进入产物。
