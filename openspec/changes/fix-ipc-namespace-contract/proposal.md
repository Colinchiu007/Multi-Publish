## Why

影视工程「单镜重试」功能**永久失效且零错误提示**：渲染层按扁平名 `filmEngineeringRetryShot` 调用，而 preload 只在 `filmEngineering` 命名空间下暴露 `retryShot`（`apps/desktop/src/api/publisher.js:396` ↔ `apps/desktop/electron/preload/film-engineering.js:26`）。`electron-bridge.js:34` 判 `typeof api[method] !== "function"` 即 `return undefined`，两个生产调用方判 `res.code === 0` 恒为 false，用户点重试永远失败且界面无任何错误文案。

根因不是这一行写错，而是**接缝无人测**：`preload.test.js` 把 preload 侧测得很全（`api.filmEngineering[method]` 转发断言、`toHaveProperty` 暴露面断言、334 键总数锁），渲染层测试则用 `vi.mock('@/api/publisher')` 整体 mock 掉本模块、从不断言 preload 是否真有该方法。两边各自绿，**没有任何一条断言跨越这两侧**——这才是能一路进主干的机制性原因。同一形状还有 8 份独立 `getApi()` 与 6 个绕过桥接层的文件。

现在做的理由：暴露面基线已经存在且稳定（`expect(Object.keys(api).length).toBe(334)` 这类断言可直接复用为对账基准），补反向契约的成本极低，而收益是拦死本类及未来全部同类缺陷。

## What Changes

- **修 C-1 调用侧**：`filmEngineeringRetryShot` 改走 preload 实际暴露的命名空间路径，决策与备选见 `design.md` D1。不改 preload 暴露面、不改主进程 handler、不改 IPC channel。
- **新增反向契约测试（本次核心）**：新增 `apps/desktop/electron/tests/ipc-exposure-contract.test.js`，从 `src/api/**` 静态抽出全部 `invokeWithFallback("<扁平名>", ...)` 的调用名，与 preload 实际暴露面（扁平键 ∪ 各命名空间下的方法名）对账，**缺失即红**。这把"两側各自测"补成"接缝被测"。
- **契约测试接线进 CI**：纳入既有 quality gate 的必检项，并登记进受影响测试选择（若该机制适用）。
- **不在本次范围**：9 份 `getApi()` 的收敛、6 个绕过桥接层文件的迁移、其余 16 条 MAJOR / 11 条 MINOR。按 `01-docs/tech-debt.md` 独立切片。

## Capabilities

### New Capabilities

- `desktop/ipc-exposure-contract`: 规定渲染层经 `invokeWithFallback` 调用 preload 能力时，**方法名必须存在于 preload 实际暴露面**（扁平键或命名空间成员）这一契约，并要求存在一条跨两侧的反向对账测试，使"调用名不存在 ⇒ 静默 `undefined` ⇒ 功能永久失效且无报错"这一形状无法进入主干。

### Modified Capabilities

（无）经差异审计（`openspec/specs/**` 全量检索 `preload` / `命名空间` / 契约测试相关 Requirement）：现存 131 项能力中**没有任何一条**描述渲染层与 preload 之间的方法名暴露契约，也没有任何一条描述"单镜重试"的行为要求。故本次不修改既有 requirement——C-1 是实现缺陷而非规格违背，新增的是此前从未被描述的横切约束。

## Impact

- **改动代码**：`apps/desktop/src/api/publisher.js`（C-1 调用侧一处）、新增 `apps/desktop/electron/tests/ipc-exposure-contract.test.js`
- **不改动**：`apps/desktop/electron/preload/film-engineering.js` 暴露面、`ipc-handlers/film-engineering.js` handler、IPC channel 名、`useFilmProduction.js` / `useFilmVideoGen.js` 调用方
- **受影响测试**：`preload.test.js`（暴露面基线被对账测试引用）、`useFilmProduction.test.js` / `useFilmVideoGen.test.js`（mock 手法需保留但不得再是唯一防线）
- **门禁**：新增测试纳入 quality gate；契约测试失败应判为阻塞而非告警
- **风险**：契约测试采用静态抽取，扫描域是写死的文件清单（与 `settings-roundtrip-contract.test.js` 的结构锁同形态的已知边界），新增同用途文件不会自动被守——该边界在 design.md D3 登记
