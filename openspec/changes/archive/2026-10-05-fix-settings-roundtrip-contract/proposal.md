## Why

桌面端主进程存在一个**读写口径不对称**的缺陷，导致四类持久化配置「写得进去、读不回来」：`settings-store.js:22` 的 `getSetting` 返回**已解析的对象**（`safeJsonParse(row.value, row.value)`），而 4 个消费服务按**字符串**读取（`String(getSetting(KEY))` → `[object Object]` → `JSON.parse` 抛 → 恒为 `{}`）。

后果是用户报告的直接症状：运营中心「应用菜单」改了显隐/排序，应用侧**永远不会变**——因为 `openspec/specs/app-menu/spec.md:51` 要求的「应用菜单配置落入本地缓存，**重启后仍可恢复**」自 `384b5c8b`（2026-08-10）起从未被满足。同一形状还使 `diagnostics/publish/usage` 三个上报水位线恒为 0（重复上报）。

实测证据（非推断）：真实 Store + 真实服务往返复现——落盘行内容完好（`controlDirectParse` 读出 `url`/`apiKeyEnc`/`runtimePublicKey` 俱全），`getConfig()` 返回空；改动前该 4 文件 **90 个用例全绿**（68+8+9+5），含「重启后从 settings 恢复 appMenu」那条，原因是测试夹具 `getSetting: () => data / setSetting: (_k, v) => { data = v }` 把「存入的类型」原样回吐，与真实 store「字符串进、对象出」**不同形**，对这类缺陷结构性免疫。

## What Changes

- **读取侧收敛为单一实现**：在 `settings-store.js` 新增存储侧方法 `getSettingObject(key, defaultValue)`（决策与备选见 design.md D1），兼容「对象 / JSON 文本 / null / 垃圾」四种输入，`ops-center-sync.js`（6 处）与三个 reporter（各 1 处）一律改用该方法，禁止再各写一份剥壳逻辑。
- **写入侧改为直接传对象**：`setSetting(KEY, cfg)` 取代 `setSetting(KEY, JSON.stringify(cfg))`。`safeJsonStringify` 对字符串原样返回、对对象做 `JSON.stringify`，因此**落盘字节与今天逐字相同 ⇒ 无迁移、无兼容层**（旧行经 `getSetting` 解析后即为对象，新读取路径同样能读）。
- **测试夹具改为与真实依赖同形**：`ops-center-sync.test.js` 等夹具必须实现「字符串进、对象出」，使这类缺陷在单元层就能变红，而不是继续靠真实 store 的运行时行为去暴露。
- **新增真实 Store 回归锁**：逐文件覆盖 `save → 新建服务实例（模拟重启）→ read` 语义，含 appMenu 与三个 watermark；使用 `os.tmpdir()` 下带 PID/随机后缀的独立目录与仓库内真实 `Store`（sql.js），禁止共享仓库路径与纯 mock。
- **流程资产**：AGENTS.md 增一条 MUST（落盘读回必须与 store 实际契约一致，且契约夹具不得替对方改类型）；`01-docs/learnings.md` 记录根因与逃逸链；CHANGELOG 收口。

## Capabilities

### New Capabilities
- `desktop/settings-persistence`: 规定主进程「应用设置」真源的读写契约——`setSetting`/`getSetting` 的类型语义、落盘编码形态、消费方读回时的归一化要求，以及「任何以 settings 为真源的恢复路径必须有真实 Store 往返回归锁」。当前 `openspec/specs/` 下无任何规格覆盖此契约（`grep -l getSetting|setSetting openspec/specs/` 零命中）。

### Modified Capabilities
（无）`app-menu` 的既有要求不变——本次不新增或放宽任何行为要求，只是使其 `spec.md:51`「重启后仍可恢复」那条**第一次被真正满足**。

> **差异审计**：本 change 不重复规格化已交付功能。已交付且行为不变的部分（同步通道解耦、广播免重启、验签与信任锚、运营端 CATALOG 补齐）均已有规格；本 change 只补「设置持久化读写契约」这一处从未被描述的横切约束，并修复该契约上的真实缺陷。

## Impact

- **代码**：`apps/desktop/electron/services/store/settings-store.js`（新增 1 个方法）；`ops-center-sync.js`（134 / 190 / 200 / 290 / 299 / 309 六处读取 + 181 / 257 / 324 三处写入）；`diagnostics-reporter.js:150,157`、`publish-reporter.js:64,72`、`usage-reporter.js:62,69`。
- **测试**：`ops-center-sync.test.js`（68）/ `diagnostics-reporter.test.js`（9）/ `publish-reporter.test.js`（5）/ `usage-reporter.test.js`（8）夹具同形化；新增 1 个真实 Store 往返回归锁文件，落在 `apps/desktop/electron/services/`——该目录由 vitest workspace 自动收集并进 CI（与 `scripts/`、`.github/scripts/` 必须逐个点名接线不同，见 design.md D4），仍须跑 `node scripts/check-unwired-tests.js` 证明它确实被看见。
- **不影响**：DB schema 与既有行字节、IPC 通道与 preload 契约、渲染层与 locale、运营中心后端、验签与信任锚逻辑。
- **并发**：分支 `automation-content-category` 在 `ops-center-sync.js` 有 14 行新增（`contentCategories`），与本次改动同文件但不同区段（其改动落在 runtime 对象字面量与新方法，本次落在读写表达式），预期为可干净合并的小冲突；按既有置顶文档 union 法处理。
- **风险**：读取侧一旦收敛，原本"静默降级到内置默认"的路径会开始真正生效——运营中心若下发了错误配置，将从"看不见"变为"看得见"。这属于把潜伏缺陷显式化，验收须覆盖 fail-open 语义（`_loadRuntimeState` 对缺失/非法字段仍返回安全默认）。
