---
record: fix-dead-pipeline-wrappers
task: 删除 publisher.js 三个零引用死 wrapper（preload 从未兑现同名方法、接上即静默失效），并把契约测试的 KNOWN_GAP 白名单收空为「不得复加」的零容忍棘轮
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在，无法取证
sync_backfill_owner: 下一个会话（合并后就地改写为 PASS + merge SHA，并在同一次提交删除本段三个 sync_* 字段与 scripts/gate-record-debt-ledger.json 的本条登记）
---

## 本次执行记录：删除三个死 pipeline wrapper + 白名单收空（fix-dead-pipeline-wrappers，2026-10-05）

> 分支：`fix-dead-pipeline-wrappers`（worktree `D:/Data/projects/mp-worktrees/mp-fix-ipc-namespace-contract`，分支自 `origin/main@46ae533d` 切出）
> 范围：🧹 **死代码清理 + 门禁棘轮强化**，含运行时代码变更 ⇒ 完整质量节拍。
> 变更面：`apps/desktop/src/api/publisher.js`（删 3 行）、`apps/desktop/electron/tests/ipc-exposure-contract.test.js`（白名单收空 + 2 条新断言）、`docs/ipc-exposure-contract.md`、change 工件。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 隔离 worktree 内编辑，共享根全程未写入。**工作区复用已如实登记**：本任务未走 `start-mp-task.ps1` 建新 worktree（共享根当时有他会话 1 项已跟踪改动，`-RequireClean` 会拦），而是复用**我自己那个已隔离、依赖已验证、分支已合并**的 `mp-fix-ipc-namespace-contract` worktree 另开分支。隔离属性（独立目录 / 独立索引 / 基线取自 origin/main）全部保持，未触碰共享根工作区与索引 |
| 第一性原因（QM-5 ①） | PASS | 三个 wrapper 由 `2d509abe` 大批量 API 面迁移引入，preload 最终采用了另一套命名与参数形状（`pipelinePause()` 无 runId / `pipelinePauseRun(runId)` / `pipelineResumeOrchestration(runId)`），这三个名字**从未被 preload 兑现**、调用方**从未写过**。它们不是无害死代码而是**给未来埋的雷**：任何人看到导出就会以为可用，接上即得与 CRITICAL-1 同形的静默失效（桥接层 `typeof api[method] !== "function"` → `return undefined` → 回落 `{code:-1}` → 调用方 `code===0` 恒 false，无异常、无 console、界面零提示） |
| 逃逸分析（QM-5 ②） | PASS | 单元/集成/E2E/视觉四层**均不适用**（无运行行为变化）。逃逸在**流程层**：`KNOWN_GAP` 白名单被当成「处理死代码的出路」而非「临时的显式决策」——登记之后它就成了默认路径，死代码可以长期合法滞留仓库；而「只能缩小」断言在白名单清空后还会**空转通过**（判据失效但测试仍绿），是「负例不得误伤否则下个会话把锁删掉」的同形陷阱 |
| 修复 + 回归保护（QM-5 ④） | PASS | ① 删除三个 wrapper（5937 文件全域扫描确认零功能调用点）；② `KNOWN_GAP` 收空并新增「必须保持为空」断言，「只能缩小」用例改为空表时显式说明而非空转；③ 回归 **650 passed / 0 failed**（`publisher.test.js` 251 与删除前基线一致、`electron-bridge` 8、契约 19、`preload` 372） |
| 棘轮有效性证明（先证明锁还咬得住） | PASS | **2/2 通过**。变异①：注入 `pipelineDeadProbe()`（指向不存在的 preload 方法、零调用方）⇒ 恰「除已登记的已知缺口外…」判红（1 failed / 18 passed）——**证明清空白名单没有把锁拆掉**，真正承重的是对账用例本身；变异②：把 `KNOWN_GAP` 填回一个条目 ⇒ 恰「KNOWN_GAP 必须保持为空」判红 ⇒ 白名单无法被静默复加。两次均 md5 逐字节还原（`9adde3fde0e7`→`1b381092ce02`、`a7c623a9e222`→`6b206780e5dd`）且还原后复跑 19/19 绿 |
| 防止再次发生（QM-5 ⑤） | PASS | ① 默认路径从「登记」改成「删」：对账用例的诊断文案已改写为「若确认是死代码请**删掉它**（KNOWN_GAP 已收空，登记不再是出路）」——下一个人看到判红时拿到的是正确指引；② 白名单零容忍 + 复加即判红；③ 若将来确有「暂时不能删」的约束，必须显式新增条目并写明原因与到期条件（写进 design 与代码注释），使它成为显式决策而非默认路径；④ `docs/ipc-exposure-contract.md` §五 补「处置演进（登记 → 删除）」两行表格，让后来者知道这段历史而不是只看到结论 |
| 取证方法纠正 | PASS | 首次用 `Select-String -Path 'apps\**\*.js'` 做「全仓零引用」取证得到 **0 引用**的假结论——`**` 在 PowerShell 不是 globstar，路径不匹配即**静默返回 0 命中**；连确定含目标名字的 `publisher.js` 都未命中即征兆。改用 `Get-ChildItem -Recurse` 枚举并**核对扫描文件数**（5937）后得到真结论：代码 2 处、文档 5 处。已写入 `docs/ipc-exposure-contract.md` §七 第 6 条 |
| 行尾与 diff 对账 | PASS | 变更文件两口径 `numstat` 逐个一致。`docs/ipc-exposure-contract.md` 与 change 工件沿用各自既有行尾；`publisher.js` 维持 CRLF；契约测试沿用其既有形态 |
| 接线棘轮 | PASS | 未新增测试文件，只改动既有 `ipc-exposure-contract.test.js`（已被 `vitest.config.js` include 与 Gate 4 分片覆盖） |
| QM-1 本地打包 | PASS | `verify-worktree-deps.js` OK 11 项 → `build:dir`（vue 11.70s + electron-builder 25.1.8）。**产物核验**：62 个 chunk / 3.15 MB，三个死 wrapper 名字**各 0 次出现**；**对照组** `pipelineGetRunContext` / `pipelineAdvanceToNextCheckpoint` / `filmEngineering` **均在场**——证明产物确实构建自本分支源码，而不是「搜不到因为没构建」。启动：独立临时 userData 8 秒存活、**stderr 0 字节**、无禁用特征 |
| QM-2 必检项 | N/A（附依据） | 本次**只删除三个导出，未新增或修改任何 IPC 调用**，不存在需要复核的参数。旁证：契约测试 19/19 绿；`invokeNamespace` 的 `toPlainIpcValue` 脱壳路径（`electron-bridge.js:102`）本轮未触碰 |
| QM-4 视觉 | N/A | 无模板/样式/组件结构变更 |
| QM-6 CCG 双模型外部评审 | **未执行（如实登记）** | 本机 `codeagent-wrapper` 通道此前实测不干净（前端路两次空转、后端路 stdout 截断且无 rollout）。**不以自审冒充通过**。本轮的机械反证能证明「新锁承重、白名单不可复加」，**不能替代对实现的多视角评审**——这是连续第二个 PR 的同一缺口 |
| 远程同步 | PENDING | 本 PR 在途：合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin fix-dead-pipeline-wrappers` 返回 0 行证远端分支已删；回填后删除上方三个 `sync_*` 字段，并在**同一次提交**删除 `scripts/gate-record-debt-ledger.json` 的本条登记 |

### 与上一轮的关系（决策被推翻，不改写历史）

`fix-ipc-namespace-contract` 的 design D7 决策是「不删，只登记进 `KNOWN_GAP`」。本 change **推翻 D1/D3**：删除该理由（牵动导出面与他人分支）已随相关分支合并而失效，5937 文件扫描证明零功能调用点；而「登记」本身有代价——仓库里长期躺着三个「看起来能用、实际必坏」的公共 API。

归档件的 design D7 / tasks 4.2 与执行记录**保持原样不改**：它们是当时决策的历史记录，推翻由本 change 显式声明。

### 遗留（不假装已闭合）

- **QM-6 未执行**，见上表。
- `publisher.js` 里其余 250+ 个 wrapper **未做同类审计**。本轮只删了有确凿证据的三个；是否存在其他「preload 未兑现 + 零调用方」的 wrapper，契约测试的对账用例**其实已经覆盖**——它会把所有落在暴露面之外的调用名都点名（`KNOWN_GAP` 为空 ⇒ 任何缺口都直接判红）。换言之：**这个类别以后不会再静默存在**，无需再专门扫一遍。
- `docs/ipc-exposure-contract.md` §七列的判据固有边界（拆句等价、别名/动态取名、字面量右括号、扫描域写死）**未消除**，沿用上一轮登记。
