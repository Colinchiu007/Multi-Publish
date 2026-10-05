## 1. 取证（删除前必须先有据）

- [x] 1.1 全域扫描确认三个名字**零功能调用点**：用 `Get-ChildItem -Recurse` 枚举（**不得**用 `Select-String -Path '**\*.js'`，其 `**` 不是 globstar，会静默零命中），并**核对扫描文件数**（基线 5937）；逐条列出代码引用与文档引用，代码引用必须恰好是「定义自身 + 白名单」两处 —— **已完成**。`Get-ChildItem -Recurse` 枚举 5937 个文件（**核对扫描文件数**是关键，见 docs §七 第 6 条）。逐个名字得到：代码引用 2 处（`publisher.js` 定义自身 + 契约测试 `KNOWN_GAP`），文档与记录 5 处（审查报告、本文、归档 design/tasks、执行记录），**零功能调用点**。⚠️ 曾先用 `Select-String -Path 'apps\**\*.js'` 取证得到"0 引用"，那是假阴性——`**` 在 PowerShell 不是 globstar，路径不匹配即静默返回 0，连确定含目标名字的 `publisher.js` 都没命中就是征兆
- [x] 1.2 记录 `git log -S <name> -- apps/desktop/src/api/publisher.js` 的引入提交，确认三者同源且 preload 从未兑现同名方法；把 preload 侧真实存在的 `pipelinePause` / `pipelinePauseRun` / `pipelineResumeOrchestration` 列进记录 —— **已完成**。三者同源于 `2d509abe`（整合 Story2Video + smart-sentence-splitter + prompt-engine 的大批量 API 面迁移），preload 从未兑现同名方法：真实存在的是 `pipelinePause()`/`pipelinePauseRun(runId)`/`pipelineResumeOrchestration(runId)`，参数形状也不同（无 runId vs 带 runId）。已列进 design 的 Context 表

## 2. 实现

- [x] 2.1 删除 `apps/desktop/src/api/publisher.js` 的三个 wrapper。**测试目标**：删除后全仓仍零引用（重跑 1.1 的扫描） —— **已完成**。删除 `publisher.js` 三行导出。删除后全仓代码引用归零（复核扫描：三个名字在 `src/**` 零命中）
- [x] 2.2 `ipc-exposure-contract.test.js`：`KNOWN_GAP` 收空，并新增**「白名单必须为空」**断言（见 design D2）。**测试目标**：三条断言同时成立——白名单为空、对账用例无未登记缺口、「只能缩小」用例在空表时显式说明而非空转 —— **已完成**。`KNOWN_GAP` 收空为 `[]`；新增「KNOWN_GAP 必须保持为空：登记不再是处理死代码的出路」用例；原「只能缩小」用例改为**白名单非空时才生效、空表时显式说明**（不空转）。理由见 design D2：空数组上原断言会空转通过，与「负例不得误伤否则下个会话把锁删掉」是同形陷阱
- [x] 2.3 `docs/ipc-exposure-contract.md`：差集表里三个死 wrapper 的处置列由「登记而非删除」改为「已删除（`fix-dead-pipeline-wrappers`）」；§七补本轮取证方法与 `Select-String -Path '**'` 的坑 —— **已完成**。`docs/ipc-exposure-contract.md`：§五加「A2–A4 的处置演进（登记 → 删除）」两行表格并标注删除后的白名单棘轮结论；§七补 4 条坑（`Select-String -Path '**'` 静默零命中、判定器清空后要重新证明承重、`spawnSync` 的 `maxBuffer` 与 vitest 过滤参数基准）
- [x] 2.4 **不改**归档的 `fix-ipc-namespace-contract` design D7 / tasks 4.2 / 执行记录——那是历史记录，推翻由本 change 的 design 显式声明（design D3） —— **已完成（刻意不改）**。归档的 `fix-ipc-namespace-contract` design D7 / tasks 4.2 与执行记录**保持原样**——它们是当时决策的历史记录，改写等于篡改。推翻由本 change 的 design D1/D3 显式声明

## 3. 棘轮有效性证明（删完之后守卫还咬不咬得住）

- [x] 3.1 **红证据**：往 `publisher.js` 注入一个**新的**零引用死 wrapper（指向不存在的 preload 方法），确认 `除已登记的已知缺口外…` 用例判红并点名它。**这一步证明清空白名单没有削弱守卫**——若此处不红，说明白名单清空把锁拆了 —— **已完成，红证据成立**。往 `publisher.js` 注入 `pipelineDeadProbe()`（指向不存在的 `pipelineDeadProbeNotExposed`，零调用方）⇒ 恰「除已登记的已知缺口外，不得有任何一个调用名落在暴露面之外」判红（1 failed / 18 passed）。**这一步证明清空白名单没有把锁拆掉**：真正承重的是对账用例本身，不需要白名单
- [x] 3.2 变异后按 **md5 逐字节还原**，复跑确认契约测试回到全绿 —— **已完成**。变异后 md5 `9adde3fde0e7` → 还原 `1b381092ce02`，**逐字节一致**，复跑回到 19/19 全绿
- [x] 3.3 反证：把 `KNOWN_GAP` 故意填回一个条目，确认「白名单必须为空」断言判红（即该锁能挡住白名单被静默复加） —— **已完成，反证成立**。把 `KNOWN_GAP` 填回 `['pipelinePauseWithCheckpoint']` ⇒ 恰「KNOWN_GAP 必须保持为空」判红（1 failed / 18 passed）⇒ 白名单无法被静默复加。md5 `a7c623a9e222` → 还原 `6b206780e5dd` 逐字节一致，复跑 19/19 绿。两项合计 **2/2 通过**

## 4. 回归与门禁

- [x] 4.1 `publisher.test.js` 全量（基线 251 用例）不得回归；连带跑 `electron-bridge.test.js` 与契约测试 —— **已完成，零回归**。`publisher.test.js` **251 passed**（与删除前基线一致，删三个导出未打破任何断言）、`electron-bridge.test.js` 8、契约测试 19、`preload.test.js` 372 ⇒ 合计 **650 passed / 0 failed**
- [x] 4.2 QM-1 本地打包：`build:dir` 通过 + 产物内确认三个名字**不再出现** + 独立临时 userData 启动 8 秒存活且 **stderr 0 字节**（进程存活不等于通过） —— **QM-1 通过**。`verify-worktree-deps.js` OK 11 项 → `build:dir`（vue 11.70s + electron-builder 25.1.8）。**产物核验**：62 个 chunk / 3.15 MB，三个死 wrapper 名字**各 0 次出现**；对照组 `pipelineGetRunContext` / `pipelineAdvanceToNextCheckpoint` / `filmEngineering` **均在场**，证明产物确实构建自本分支源码（不是「搜不到因为没构建」）。启动验证：独立临时 userData 启动 8 秒，**进程存活、stderr 0 字节**，未命中任一 QM-1 禁用特征
- [x] 4.3 QM-2 必检项复核：本次只删导出、未改任何 IPC 调用参数，按 N/A 登记并说明依据 —— **N/A（附依据，不含糊过）**。QM-2 必检项是「所有新增/改动 IPC 调用参数为纯 JSON，Vue ref/reactive 嵌套对象须脱壳后再传」。本次变更**只删除了三个导出，未新增或修改任何 IPC 调用**，因此不存在需要复核的参数。旁证：全仓对账用例 19/19 绿，且 `invokeNamespace` 的 `toPlainIpcValue` 脱壳路径（`electron-bridge.js:102`）本轮未触碰
- [x] 4.4 `openspec-sync-check.js` 归档前后逐条差分，**零新增违规** —— **已完成，零新增违规**。`openspec-sync-check.js` 归档前后逐条差分：14 → 14，零新增、零消失（基线 14 条为 `openspec/changes/archive/` 下既有历史债，本 change 不假装已清）

## 5. 收口

- [x] 5.1 CHANGELOG 顶部插入条目；`docs/` 与 `openspec/` 工件同步 —— **已完成**。`CHANGELOG.md` 顶部插入 24 行条目（清掉的隐患 / 处置的演进 / 证据 / 取证方法坑 / 后续影响五段，64688 → 64736 行，无 U+FFFD）；`docs/ipc-exposure-contract.md` §五补处置演进两行表格并更新结论、§七补 4 条坑；change 工件同步
- [x] 5.2 写 `openspec/records/fix-dead-pipeline-wrappers.md` 执行记录（QM-5 ①第一性原因 ②逃逸分析 ④修复+回归 ⑤防止再次发生 + 行尾 + QM-1/QM-2/QM-6 + 远程同步 PENDING） —— **已完成**。`openspec/records/fix-dead-pipeline-wrappers.md`：11 行门禁表逐条给 Fresh 证据（隔离/第一性原因/逃逸/修复+回归/棘轮证明/防复发/取证方法纠正/行尾/接线棘轮/QM-1/QM-2/QM-4/QM-6/远程同步）+ 与上一轮决策被推翻的关系 + 4 条遗留（含 **QM-6 未执行的如实登记**）
- [x] 5.3 `.quality-gates.md` 追加记录 + `scripts/gate-record-debt-ledger.json` 登记 —— **已完成**。`.quality-gates.md` 追加完整模板记录（line 8940，远程同步 PENDING）；`scripts/gate-record-debt-ledger.json` 登记本条（键数 18 → 19）
- [x] 5.4 归档三同步：`openspec archive` + CCG task 归档（本 change 未建 CCG 任务 ⇒ N/A）+ 质量节拍复盘 —— **已完成**。① `openspec archive fix-dead-pipeline-wrappers -y` 完成，change 移入 `openspec/changes/archive/2026-10-05-fix-dead-pipeline-wrappers/`；② **CCG task 归档 = N/A**：本 change 未建 CCG 任务（与 `fix-ipc-namespace-contract` 同），不凭空造一个；③ 质量节拍复盘 = 执行记录 + `.quality-gates.md` 记录；④ `openspec-sync-check.js` 归档前后 **14 → 14，零新增违规**
