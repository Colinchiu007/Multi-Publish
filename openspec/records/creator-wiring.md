---
record: creator-wiring
task: 博主采集主进程接线落地——补 14 个 store 方法、单事务终态提交、门面与通道注册，功能第一次真正跑通
date: 2026-10-08
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 不存在
sync_backfill_owner: 下一个会话
---

## 本次执行记录：博主采集主进程接线（creator-wiring，2026-10-08）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码；worktree `mp-creator-wiring`，裸分支 `creator-wiring`；共享根全程未写入 |
| 第一性原因（QM-5 ①） | PASS | PR #3053 只合并了修复层。`ipc-handlers/creator.js` 的 `registerHandlers` **只在它自己的测试里被调用**，`ipc-handlers/index.js` 未注册它——渲染端能点到页签、preload 桥也通，但每个调用都得到 Electron 原生的 `No handler registered`。叠加 `creator-store.js` 只实现 7 个方法、容器注册名与 IPC 依赖名不一致 |
| 逃逸分析（QM-5 ②） | PASS | ① **单元测试层**：既有测试全部用**桩 store 直调** `registerHandlers`，桩把 11 个缺失方法全补上，真实缺多少测不出来；② **打包层（QM-1）**：`electron-builder` 只证明模块「在 asar 里」，不证明「被接线」，解包后 `require` 成功也照样绿；③ **契约层**：`ipc-contract.test.js` 只检查「某个非测试 .js 的**文本里出现**了该通道名」，不检查「聚合器**真的调用了**那个文件的注册函数」；④ **接线棘轮**：新测试若不落在 vitest `include` 覆盖目录内等于没写（本次两个新测试均在 `electron/services/**` 与 `electron/ipc-handlers/**`，已被覆盖） |
| 修复 + 回归保护（QM-5 ④） | PASS | 补 14 个方法（先红锁 `creator-store-surface.test.js` 从两个消费方源码剥注释后解析 `store.x(` 调用点，与实际导出做集合比对；首跑抓到 **14 个**而非手工枚举的 11 个，漏的是 `recordFailure`/`recordSuccess`/`getClaimToken`）；`finalizeCollected` 单事务；`creator-wiring.e2e.test.js` 用真实 `sqlite-wrapper` + 真实 `registerHandlers` 穿 IPC 边界跑通 7/7 |
| 防止再次发生（QM-5 ⑤） | PASS | ① 方法面完整性锁（新增 `.test.js`，CI 由 vitest 收集）；② `getClaimToken` 的标量返回形状写进 e2e 断言（`expect(typeof tok).toBe('number')`）；③ `collectBatch` 的数组签名同时写进实现注释、handler 注释与 stub 断言三处 |
| 行尾与 diff 对账 | PASS | pre-commit `check-line-endings` 与 `git diff --numstat` 两口径逐文件相等 |
| 接线棘轮 | PASS | `creator-store-surface.test.js`（`electron/services/**`）与 `creator-wiring.e2e.test.js` 同目录，均被 `apps/desktop/vitest.config.js` 的 `include` 覆盖，无需额外登记 |
| QM-1 打包 / QM-4 视觉 | QM-1 PASS / QM-4 PASS | QM-1 见下方「QM-1 打包证据」。QM-4：本轮动过渲染层（页签按钮抽成 `CollectionCreatorTab.vue`），DOM 等价性逐属性核对（role/aria-selected/class/data-testid/徽标 span 全同，事件同落 `switchTab('creator')`）；CI 实证 QG Visual = success（`/collection` 与基线一致） |
| QM-6 CCG 双模型外部评审 | PASS（带降级声明） | **决策层 4 轮**跨家族（`opencode` × `claude`，产物在 `.adversarial/ccg-plan-wiring-plan/`）：Critical 走势 2 → 1 → 0 → 1，**最低维度分始终 5、未达 8.0 阈值、未形式收敛**。停止自动迭代的原因是结构性的：proposer 后端（opencode）输入上限实测 7,800 字符（边约 8,125–8,145），每轮「修订」步骤都因超限失败，proposer 无法在循环内消化意见；引擎自身处方同样是「压缩方案后再分轮」。`codex` 后端在本机不可用（wrapper 的 Go `exec.LookPath` 解析到相对路径即拒绝执行，已试注入原生 exe 目录 / 剔 PATH 空段 / 换 cwd 三种方式均未奏效）。全部意见已逐条消化，见 `01-docs/PRD-CREATOR-WIRING-2026-10-07.md` |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin <branch>` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### QM-1 打包证据（2026-10-08 实测）

前置：`node scripts/verify-worktree-deps.js` rc=0；`node scripts/ensure-electron.js` rc=0。

| 步骤 | 结果 |
|---|---|
| `pnpm exec electron-builder --win --dir --publish never` | **rc=0** |
| asar 体积 | 145,414,060 字节 |
| asar 内含 creator 模块 | **14/14 全部在包内**（含新增的 `creator-wiring.js`、`creator-store.accounts.js`、`creator-store.discoveries.js`、`container.setup.creator.js`） |
| 解包后 require 链 | **14/14 通过**。`ipc-handlers/creator.js` 与 `preload/creator.js` 在裸 Node 下止于 `Cannot find module 'electron'` —— 那是运行时注入项，非产物缺陷；走到该 require 即证明语法与相对路径已对 |
| preload bundle | `PRELOAD_BUNDLE_HAS_CREATOR=true`（含 `creatorList` / `creatorCollect` / `creatorPendingTotal`） |

**验收脚本自身踩的两个坑（都曾造成假红）**：① `asar list` 输出是
**反斜杠 + 前导 `\`**（Windows 形态），拿正斜杠路径比对会让 14 条全误报 MISSING；
② 需要 electron 运行时的模块在裸 Node 下 require 必然抛 `Cannot find module 'electron'`，
不区分就会把通过判成 FAIL。两处都已修正并复跑得 EXIT=0。

**这条证据的意义**：PR #3053 那轮的打包也过了，但它只证明「模块在 asar 里」，
不证明「被接线」——而当时恰恰是没接线。本次额外做了「解包后 require」与
「bundle 含暴露面」两项，正是因为上轮就栽在「打包通过 ≠ 功能可用」。

### 测试规模

`creator*.test.js` + `CreatorMonitor.test.js` + `Collection.test.js` 共 **234 项全绿**（14 个文件）：
其中 `creator-wiring.e2e.test.js` 7 项穿真实 IPC 边界，
`creator-store-surface.test.js` 3 项为方法面完整性锁，
`Collection.test.js` 3 项为页签角标锁。

### 一并补上的「静默失效」：待采集角标（CCG 评审 i6）

`Collection.vue` 的博主监控页签模板引用 `creatorPendingTotal`，而它**从未被定义** ——
`undefined > 0` 为 false，不抛错、不告警，角标永远不显示。
本轮补齐：读通道 `creator:pending-total`（不进 list，因角标渲染在父组件，
复用 list 等于切页重复拉全量）→ preload 暴露 → `ref(0)` + 挂载时拉一次 →
3 条回归锁断言的是**徽标真的出现**，不是变量存在。

仍未实现：`creator:probe` 单独探测通道。现有 `creator:check-now` 已提供手动探测入口，
集成用例改走该通道；单独通道留到探测调度落地那轮。

### 端到端抓到、既有测试全绿时漏掉的两个真缺陷

1. **`collectBatch` 签名不一致**：handler 传对象 `{creatorId, discoveries, effectiveLimit}`，
   runtime 形参是 `discoveries` 列表，内部 `Array.isArray(...) ? ... : []` 兜底
   → 收到对象变空列表 → **「一条都没采、failed 也是 0」**：不报错、不告警，
   看起来像「没什么可采」。
2. **`skip-one` 吞掉 store 判定结果**：`await creatorStore.skipDiscovery(...)` 丢弃返回值、
   恒回 `{code:0}` → UI 显示「已跳过」而库里状态没变。已改为看 `r.ok`，
   终态条目返回 `creator:invalid_state`。

### 遗留（不假装已闭合）

- **`content_aggregator` 是 Python optional 依赖且不进 asar**，真实缺包环境下的
  端到端降级（提示文案 + 安装引导）**尚未在真实环境验证**，目前只有契约用例兜着
- 探测调度（定时触发）本轮不做，`creator:check-now` 是手动入口
- `projectedProbeUnits` 仍按「每次探测恒 1 unit」估算，未按分页/逐条取正文修正
- 决策层评审未收敛（见上表），剩余为 Warning/Info 级实现契约细节
