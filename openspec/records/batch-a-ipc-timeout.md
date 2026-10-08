---
record: batch-a-ipc-timeout
task: M-13 IPC 超时兜底 + M-14 权限不足兜底 + M-16 Collection 卸载清理
date: 2026-10-07
---

## 本次执行记录：批次 A — IPC 韧性三项（batch-a-ipc-timeout，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码 ⇒ 隔离 worktree。`D:\Data\projects\mp-worktrees\mp-batch-a`（D 盘）、裸分支 `batch-a-ipc-timeout`，基线 `8409afa6`；共享主工作区未写入。`pnpm install --frozen-lockfile` 完成（35.4s） |
| 第一性原因（QM-5 ①） | PASS | ①M-13：`invoke()` 直接 `return api[method](...)`，零超时包装；②M-14：preload `createPermissionError()` 同步 throw → async `invoke` 变 rejected promise → `invokeWithFallback` 的 `await` 抛出，**fallback 分支永不执行**；③M-16：`onUnmounted` 已清 4 项，但漏了 `videoStageTimers`（只在两处 `finally` 停）与 ASR 的 1200ms 重试计时器 |
| 逃逸分析（QM-5 ②） | PASS | ①M-13：无任何测试构造「主进程永不 settle」；②M-14：既有 6 条 `invokeWithFallback` 用例**全部是「无 API / 正常返回」两种**，没有一条让 preload 抛权限错误；③M-16：`Collection.test.js` 115 条用例**无一条做 unmount 后验证** |
| 修复 + 回归保护（QM-5 ④） | PASS | 见下节三条反证。新增回归：`electron-bridge.test.js` +12 条（原 8 条全部保留、风格一致）、`Collection.test.js` +3 条。合计 **135/135 通过** |
| 防止再次发生（QM-5 ⑤） | PASS | ①M-14 用 `error.name` 而非 message 判定，并有「改文案不影响兜底」用例；②M-13 有「普通错误不被 fallback 吞」用例；③M-16 有反向锁「清理不得把功能关掉」。三条都设了反向锁，避免守卫退化成「一律兜底」 |
| 行尾与 diff 对账 | PASS | 两口径 numstat 一致 |
| 接线棘轮 | PASS | 未新增测试文件（追加进既有两个），`vitest.config.js` 的 `include` 已覆盖 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行面（无 `electron/`、`packages/rpa-engine/` 改动）；纯逻辑与生命周期改动，视觉无变化 |
| QM-6 CCG 双家族外部评审 | 补充执行（deep-review.sh，2026-10-08） | critique 抓到 3 处新增硬编码中文（DEV-only 诊断日志），已改英文并经 check-locale-sync --cjk rc=0 验证；见提交 eeabf5ad |
| 远程同步 | PASS | merge SHA bd01d578（PR #3109，2026-10-08）；git ls-remote 证远端分支 batch-a-ipc-timeout 已删（0 行输出） |

## 过程中被门禁挡下的一次返工（这是本批最有价值的部分）

第一次提交前跑 `check-max-lines.js`，报：

    LEDGER_GREW: apps/desktop/src/views/Collection.vue 较登记值 2721 膨胀 211 行（容差 200）

**这不是误报。** `Collection.vue` 在我动手前就已经 2919 行（登记 2721，即 +198，离红线
只差 2 行），我为修 M-16 加的那 13 行正好把它推过去了。

查了 `--update` 的 `blockedRaise`：它只**记录**不抬高，`--update` 也不会写回登记值
（只有 `--update --rewrite` 才会，而它会把全部 98 个文件重生成、掩盖所有漂移）。
**门禁提示里那句「或经审阅后 --update」其实是个死出口。**

两条路：
1. 把注释压到 0 行、用「后推覆盖」的方式绕过门禁 ❌
2. **把文件变小** ✅

选了 2：把 ASR 安装流程抽成 `useAsrInstall` composable。这不是「为了减行数而减行数」——
「订阅进度事件 → 调主进程 → 成功后延时重试」本就是自成闭环的流程，与采集列表/草稿/
视频采集无关，与 M-4 把批量轮询抽成 `useBatchPollGuard` 是同一个动作。

抽完顺带把 M-16 的**根因**也消了：进度订阅与重试计时器现在由同一个模块持有，
组件侧不再有两份「清理逻辑在不同地方」的句柄。

**净效果：Collection.vue 2932 → 2888 行（−44），LEDGER_GREW 自然消失，无需任何绕过。**

## 四条反证（提交前强制关卡）

| 反证 | 注入 | 结果 |
|---|---|---|
| M-13 | 把 `if (!(timeoutMs > 0)) return pending` 改成恒真（关掉超时） | **2 条转红**，耗时 3s → 23s ——「promise 永不 settle 挂到测试超时」的症状直接可见 |
| M-14 | 撤掉 `invokeWithFallback` 里的 `catch` | **3 条转红**（同步抛 / name 判定 / 异步 reject） |
| M-16（在组件内修的版本） | 从 `onUnmounted` 移除 `stopVideoStageProgression()` | **1 条转红** |
| M-16（重构后终版） | 撤掉 composable `stop()` 里的计时器清理 | **1 条转红** |

## 过程中的三处自身失误（已修）

1. **覆盖了既有的 `electron-bridge.test.js`**（74 行 / 8 条用例）—— 用 Write 直接覆写而不是追加。
   已 `git checkout --` 恢复后改为**追加**，并沿用原文件的**动态 `await import()` 风格**
   （该文件的用例全靠「调用前改 `globalThis.window`」生效，混用静态 import 容易串味）。
2. **M-16 用例里把函数名猜成了 `checkAsrInstall`**，实际是 `startAsrInstall` ⇒ 首跑 1 条红。已改正。
3. **重构一度让既有测试回归**：既有用例断言 `w.vm.asrInstallPendingUrl`，而该状态已被我移进
   composable。**没有改测试**，而是把 `pendingUrl` 作为 ref 从 composable 暴露出来并在组件
   侧重新绑定 —— 状态仍然存在，只是换了归属，改断言才是掩盖。

这三处都是「没先读就动手」，与本会话前面几次同类失误同源。

## 遗留（不假装已闭合）

- **QM-6 CCG 双家族外部评审未执行**：`opencode` 已在 PR #3081 上验证可产出实质评审，本批未再跑一次；
  `claude`（anthropic）后端仍存在「进程启动但输出不落盘」的问题。
- **只补了桥接层能力，没有批量改造调用方**：`invokeWithTimeout` 需要调用方显式指定 `timeoutMs`，
  哪些调用点该设、设多少，属独立 change。当前**默认行为未变**，零回归，但也意味着
  「用户零错误提示」只在显式改用新函数后才成立。
- **M-16 的 `onUnmounted` 只补了这两处**：该文件其它潜在的异步副作用（如未追踪的
  `requestAnimationFrame` / 观察器）未逐一审计。
- M-9 / M-11 / M-12 / M-15 / M-8 未处理，分别排在批次 C / B / B / D / D。