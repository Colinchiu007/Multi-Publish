## Context

- 三个 wrapper 由同一个大批量整合提交 `2d509abe`（整合 Story2Video + smart-sentence-splitter + prompt-engine）引入。那次渲染层一次写了几十个 wrapper，preload 侧给绝大多数配了同名方法，但这一组最终采用了**另一套命名与参数形状**：
  | preload 里真实存在的 | channel | 三个 wrapper 想调的 |
  |---|---|---|
  | `pipelinePause()` | `pipeline:pause` | ~~`pipelinePauseWithCheckpoint`~~ |
  | `pipelinePauseRun(runId)` | `pipeline:pause-run` | ~~`pipelineResumeFromCheckpoint`~~ |
  | `pipelineResumeOrchestration(runId)` | `pipeline:resumeOrchestration` | ~~`pipelineRegisterPipeline`~~ |
  | `pipelineAdvanceToNextCheckpoint(runId)` | `pipeline:advanceToNextCheckpoint` | （存在，正确） |
  ⇒ 三个 wrapper 从未被 preload 兑现，调用方也从未写过。
- 全域取证（`Get-ChildItem -Recurse` 扫 5937 个文件，post-merge main）：每个名字 7 处引用，但**代码仅 2 处**——`publisher.js`（定义自身）与 `ipc-exposure-contract.test.js`（`KNOWN_GAP` 白名单）；其余 5 处是文档与记录（审查报告、`docs/ipc-exposure-contract.md`、归档 design/tasks、执行记录）。**零功能调用点。**
- ⚠️ 取证方法上的一个坑（已踩并纠正）：`Select-String -Path 'apps\**\*.js'` 里的 `**` 在 PowerShell 不是 globstar，路径不匹配即**静默返回 0 命中**。用它得出「零引用」会把「扫描失败」误当成「确实没有」——连确定含这三个名字的 `publisher.js` 都没命中就是征兆。取证必须用 `Get-ChildItem -Recurse` 枚举并核对扫描文件数。

## Goals / Non-Goals

**Goals:**

- 删掉三个零引用 wrapper，消除「接上就静默失效」的雷
- 让 `KNOWN_GAP` 白名单**收空并永不复位**，死代码重新堆积的成本从「需要人为想起来」变成「测试立刻判红」
- 处置记录与事实一致

**Non-Goals:**

- 不删 `publisher.js` 里其他任何 wrapper（该文件 400+ 行、250+ 导出，本次只动有确凿证据的三个）
- 不改 preload 暴露面 / handler / channel
- 不回头改写归档 change 的 design D7 / tasks 4.2 与执行记录——那是历史记录，推翻与否由本 change 显式声明

## Decisions

### D1：删除，而不是继续登记

上一轮 D7 选择「登记而非删除」，理由是「删除会牵动 `publisher.js` 的导出面与其他人的分支」。该理由现已失效：相关分支已合并（#2952 / #2954），5937 文件扫描证明零功能调用点。继续登记等于承认仓库里长期躺着三个「看起来能用、实际必坏」的公共 API。

### D2：把 `KNOWN_GAP` 收空并加「不得复加」断言

原白名单是「只能缩小」的棘轮。三个条目清空后，若只把 `KNOWN_GAP` 留成空数组，**「只能缩小」这条断言会变成空循环、不再承重**——正是判据矩阵那条「负例不得误伤，否则下个会话把锁删掉」的同形陷阱。

因此本轮把棘轮**升级为不可复位**：

- `KNOWN_GAP` 保持为空常量，并**断言它必须为空**（写死零容忍）
- 「只能缩小」用例在白名单为空时**显式跳过并说明原因**，而不是空转通过
- 真正承重的是**对账用例本身**：任何人新写一个指向不存在方法的 wrapper（含这次的三个名字复活），`除已登记的已知缺口外…` 用例会直接判红并点名

### D3：历史工件不改写，推翻由本 change 声明

归档的 `fix-ipc-namespace-contract/design.md` D7 写的是「不删」。改写归档件等于篡改当时的决策记录。本 change 在 design 顶部显式声明「D7 被本 change 推翻，理由见 D1」，并由 `docs/ipc-exposure-contract.md`（活文档）承载当前的处置事实。

## Risks / Trade-offs

- **导出面变窄**：理论上存在仓外/未扫描到的消费者（如外部脚本按 `publisher.js` 的导出名反射调用）。缓解：5937 文件全域扫描 + `publisher.test.js` 251 用例 + 契约测试全量回归；`publisher.js` 是 `src/api` 内部模块，不对外发布为库。
- **白名单清空后失去「已知缺口」的表达能力**：将来若又出现确证的死 wrapper，正确做法是**删掉它**而不是登记。若出现「暂时不能删」的真实约束（如他人在途分支），需要重新引入带原因与到期条件的白名单条目——那应是显式决策而非默认路径。本轮把默认路径改成「删」。
- **QM-6 仍不执行**（本机 `codeagent-wrapper` 通道此前实测不干净），沿用上一轮记录里的同一缺口声明。
