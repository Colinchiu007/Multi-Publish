# 审查结论：bilibili-audit-check.js / publish-monitor.js（前端/集成轴）

- 审查对象：`.ccg/review/buckets-runtime.diff`（两文件：`apps/desktop/electron/services/bilibili-audit-check.js`、`apps/desktop/electron/services/publish-monitor.js`）
- 审查轴：命名与模式一致性、可维护性、跨模块集成风险（publish-monitor 与 phase4-events 消费 result 的方式）、重复实现
- 方法：diff 逐条核对 + 消费方全链路追读（`phase4-events.js` → `publish-audit-status.js` → `logger.js`）+ 全仓 grep 查重复实现 + 与 PRD `docs/PRD-BILIBILI-AUDIT-BUCKET-QUERY-2026-10-07.md` 契约对账 + 跑 `bilibili-audit-check.test.js` / `publish-monitor.test.js`（36 passed，2026-10-07）
- 结论速览：**Critical 0 / Warning 1 / Info 8**。无 Critical：`published` 仍只能由主桶命中产出、所有桶结论均为 `pending`、第三方键入 URL 前有形态白名单、`checkPublishStatus` 第 5 参向后兼容、A13 用真 `buildAuditPatch` 锁住写回边界。

## 正面确认（无问题项）

- **无重复实现**：全仓 grep `arc_audits` / `status=pubed` / `withStatusParam` —— 列表 URL 构建唯一落在 `bilibili-audit-check.js`；`publish-monitor.js:23` 的 `CHECK_URLS.bilibili` 直接引用导出的 `BILIBILI_LIST_URL`（同源引用，PRD A12 parity 锁），未抄第二份端点。
- **跨模块消费安全**：桶结论全部是 `pending`，`phase4-events.js:79-98` 的 callback 只在终态触发；`buildAuditPatch`（`packages/shared-utils/src/publish-audit-status.js:110-124`）只读 `status`/`postId`，`pending`→`null`→不落库，符合单向证据规则，且被 `bilibili-audit-check.test.js:458`（A13）以**真** shared-utils 实现锁住。
- **传输层注入贯通**：`createMonitorTask` → `checkPublishStatus(..., { axios })`（`publish-monitor.js:61`）→ `checkBilibiliAuditStatus`（`bilibili-audit-check.js:145`）一线贯通，装配层可注入（A11 已测）。

## Warning

### W1. `withStatusParam` 作为导出 API 不自带形态白名单，契约只存在于调用点注释
- 文件:行号：`apps/desktop/electron/services/bilibili-audit-check.js:216`（导出）、`:89-93`（实现）、`:55-57`（白名单注释）、`:183`（唯一校验点）
- 问题：`BUCKET_KEY_SHAPE` 白名单（第三方 `data.class` 的键要进 URL 必须先过形态校验，防 `#`/`&`/空格注入查询串）只在扇出循环的调用点执行；`withStatusParam` 本身被 `module.exports` 导出（`:216`），是一个「传入任意字符串即改写 URL」的公开原语。注释 `:55-56` 声明了「要进 URL 就必须先过形态白名单」，但该不变量没有落在函数边界上。
- 影响：当前无实际缺陷（唯一调用点 `:183` 已校验，且 A12 锁死）；但导出面把安全契约降级为「调用方自律」，未来新增调用方极易绕过白名单直接拼 URL。
- 建议：在 `withStatusParam` 内部对 `status` 参数做 `BUCKET_KEY_SHAPE.test` 校验（非法值抛错或回落主桶），把不变量收进函数边界；或在导出 JSDoc 上显式标注 precondition。

## Info

### I1. reason 词表两条命名不对称：一条机械映射、一条语义映射
- 文件:行号：`apps/desktop/electron/services/bilibili-audit-check.js:50-53`
- 说明：`not_pubed → 'in-not-pubed-bucket'` 是机械映射（保留桶名），`is_pubing → 'in-review-bucket'` 是语义映射（丢掉桶名、代入"review"解读）。同文件注释（`:44-49`）与 PRD §3.2 均声明桶名中文语义**未实测**，且 PRD 已认可该词汇（「是存在性证据，不是状态结论」）。风险是读者把 `in-review-bucket` 当成「审核中」的结论。
- 建议：在 `BILIBILI_BUCKET_REASONS` 的 JSDoc 里把「该标签是存在性证据、不构成状态结论」写进导出常量注释（现在只写在文件头与 PRD 里）。

### I2. `monitor-timeout` 事件不带 bucket/state —— 超时时刻取证需跨行关联
- 文件:行号：`apps/desktop/electron/services/publish-monitor.js:78`
- 说明：超时出口只带 `lastReason`，不带 `bucket`/`state`/`primaryState`/`stateDesc`。PRD A11 只要求 timeout 带 reason（**符合规范**，非缺陷）；但本切片的目的是取证，超时恰是最需要一行定场的时刻，目前只能靠翻 `poll-progress` 历史行关联。
- 建议（可选增强）：timeout 事件补 `lastBucket`/`lastState`，成本一行。

### I3. `probed.push` 在 await 之后：扇出中途抛错时 error 出口完全不带 `bucketsProbed`
- 文件:行号：`apps/desktop/electron/services/bilibili-audit-check.js:161`、`:188`、`:203-204`
- 说明：`probed.push(primaryBucket)` / `probed.push(key)` 都在 `await fetchArchiveList(...)` 落定后执行；传输层抛错走 catch 时，`error` 出口（`:204`）没有任何 `bucketsProbed`，排障看不出「当时正探哪个桶」。A8 只要求「抛错不得产出正向结论」（已满足），此为观测性小缺口。
- 建议：catch 前或在 `probed` 声明处记录「尝试中」的桶（如 `probed.push(key)` 移到 await 前并标注语义）。

### I4. 未知桶 reason 兜底用冒号分隔，与本模块 kebab-case 词表不一致
- 文件:行号：`apps/desktop/electron/services/bilibili-audit-check.js:195`
- 说明：`BILIBILI_BUCKET_REASONS[key] || ('in-bucket:' + key)` 的兜底值形如 `in-bucket:some_key`，而模块内全部其它 reason（`no-post-id`/`nav-not-established`/`envelope-not-ok`/`no-audit-array`/`state-unobserved`/`not-in-list`/`in-review-bucket`）都是纯 kebab-case。日志检索/分词时多一种形态。
- 建议：统一为 `'in-bucket-' + key` 或 `'in-' + key + '-bucket'`。

### I5. poll-progress 参数回退口径不一致：`state`/`primaryState` 裸透传
- 文件:行号：`apps/desktop/electron/services/publish-monitor.js:92-93`
- 说明：`bucket`/`stateDesc` 有 `|| ''`、`bucketsProbed` 有 `Array.isArray` 兜底，而 `state`/`primaryState` 原样透传 —— 字段缺席时为 `undefined`，被 `logger.js:243-247`（只收 string/number/boolean）静默丢弃。行为无害，但同一行内两种回退风格，日志 schema 不稳定（键时有时无）。
- 建议：统一回退口径（如 `state: result.state ?? ''`），或注释说明「缺席即丢键」是刻意为之。

### I6. 正则式 URL 编辑与仓库既有 URLSearchParams 模式分叉（刻意，但值得知悉）
- 文件:行号：`apps/desktop/electron/services/bilibili-audit-check.js:80-93`
- 说明：仓库 URL 处理惯例是 `URLSearchParams`（`oauth-manager.js:117`、`services/adapters/pexels.js:79`、`services/adapters/pixabay.js:81`、`webview-manager/utils.js:141`）；本实现用正则以「其余 query 与顺序原样保留」（注释 `:85-88`）—— 为让扇出请求与取证时的请求逐字节同形（除 status 外），偏离是合理的。PRD §3.4 也规定「不得新增第二份 URL 拼接」（已遵守）。
- 建议：无需改动；若未来端点参数顺序不再敏感，可迁移到 URLSearchParams 以合流。

### I7. 扇出无显式上限：探桶数随端点 `data.class` 键数线性增长
- 文件:行号：`apps/desktop/electron/services/bilibili-audit-check.js:180-200`
- 说明：循环对 `Object.keys(counts)` 中每个 count>0 的非主桶补查。今日端点只回报 3 个桶且有 `count > 0` 门槛（`:185`），常见路径 1 次请求（PRD 设计已最小化）；但若端点扩桶表，单次轮询请求数随之线性增长 —— 本仓对「给风控送量」高度敏感（文件注释 `:178-179`），此处是唯一无上限的放大面。
- 建议：加 `MAX_BUCKET_PROBES` 常量上限（如 3）并在超限时 warn，把放大面钉死。

### I8. `checkPublishStatus` 新增第 5 参 `opts` 未在其自身 JSDoc 登记；`classCounts` 当前无消费方
- 文件:行号：`apps/desktop/electron/services/publish-monitor.js:125-128`（JSDoc 未含 `pollUrl`/`opts`）、`apps/desktop/electron/services/bilibili-audit-check.js:134`（返回 `classCounts`）、`publish-monitor.js:88-95`（未打 `classCounts`）
- 说明：`createMonitorTask` 侧 JSDoc（`publish-monitor.js:38-40`）已登记 `axios`，但被调方 `checkPublishStatus` 的 JSDoc 还是「检查发布状态」一行，未登记新参；`classCounts` 按 PRD §3.2 随多个出口返回，但 `poll-progress` 日志与 phase4-events 写回链路均不消费，属「写了没人读」字段。
- 建议：补 `checkPublishStatus` 的参数 JSDoc；`classCounts` 要么进日志（排障价值：桶计数本身就是现场），要么在 JSDoc 注明「预留给取证通道」。

## 集成链路备注（非问题）

- `phase4-events.js:77-78` 生产调用未传 `axios`（走默认 `require('axios')`），测试经 `createMonitorTask` 注入 —— 装配层注入路径已被 A11（`bilibili-audit-check.test.js:415-436`）覆盖，生产/测试两侧一致。
- 桶结论不经过 `phase4-events.js:85` 的 `buildAuditPatch` 写回（`pending`→`null`），只进日志 —— 这是 PRD §3.2「落桶信息只进 reason 与日志，不改写任何真源状态」的直接落地，集成面无越权写回风险。
