## Why

`apps/desktop/src/api/publisher.js` 里有三个导出的 async wrapper，它们调用的 IPC 方法名在 preload 侧**从来就不存在**，且全仓**零功能调用点**：

```js
export async function pipelinePauseWithCheckpoint()   { return invokeWithFallback("pipelinePauseWithCheckpoint",   { code: -1 }) }
export async function pipelineResumeFromCheckpoint() { return invokeWithFallback("pipelineResumeFromCheckpoint", { code: -1 }) }
export async function pipelineRegisterPipeline(def)  { return invokeWithFallback("pipelineRegisterPipeline",      { code: -1 }, def) }
```

它们不是无害的死代码，而是**给未来埋的雷**：任何人看到导出就会以为这是可用能力，一旦接上组件就会得到与 CRITICAL-1 同形的静默失效——桥接层 `typeof api[method] !== "function"` 直接 `return undefined`，`invokeWithFallback` 回落 `{ code: -1 }`，调用方 `code === 0` 恒为 false，**无异常、无 console、界面零提示**。

上一轮（`fix-ipc-namespace-contract`）的 D7 决策是「不删，只登记进契约测试的 `KNOWN_GAP` 白名单」，理由是删除会牵动 `publisher.js` 的导出面与他人在途分支。现在那个理由已不成立：分支已合并、导出面无人引用、且白名单本身需要一条**永不复位**的棘轮来防止死代码重新堆积。

## What Changes

- **删除** `publisher.js` 中三个零引用 wrapper（`pipelinePauseWithCheckpoint` / `pipelineResumeFromCheckpoint` / `pipelineRegisterPipeline`）
- **翻转白名单棘轮**：`ipc-exposure-contract.test.js` 的 `KNOWN_GAP` 收空，并新增断言**该白名单必须保持为空**——即「删除后不允许再悄悄加回来」，新增死 wrapper 立即判红
- **更新处置记录**：`docs/ipc-exposure-contract.md` 的差集表把三个死 wrapper 的处置从「登记而非删除」改为「已删除」，并在 §七补本轮的取证方法

**不改**：preload 暴露面、主进程 handler、IPC channel、任何 spec 级行为（故 `skip_specs: true`）。

## 差异审计

`openspec/specs/**` 全量检索三个名字：0 命中。`desktop/ipc-exposure-contract` 的三条 Requirement 描述的是「调用名必须存在于暴露面」这一**约束**，删除不触犯约束、反而消除三个当前正在违反约束的调用点。

## Impact

- **删除代码**：`apps/desktop/src/api/publisher.js` 三行导出
- **改动门禁**：`apps/desktop/electron/tests/ipc-exposure-contract.test.js`（`KNOWN_GAP` 收空 + 新增「不得复加」断言）
- **改动文档**：`docs/ipc-exposure-contract.md`
- **不改动**：归档的 `fix-ipc-namespace-contract` 工件（design D7 / tasks 4.2）与执行记录——它们是**当时决策的历史记录**，本 change 在 design 里显式声明推翻 D7 并给出理由，不回头改写历史
- **风险**：低。5937 文件全域扫描确认代码引用仅 2 处（定义自身 + 白名单），零功能调用点；但 `publisher.js` 是 400+ 行的公共 API 面文件，删除后须跑 `publisher.test.js`（251 用例）与契约测试全量回归，并做 QM-1 打包
