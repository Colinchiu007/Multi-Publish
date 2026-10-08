---
record: batch-c-getapi-unify
task: M-9 IPC 桥接层收敛 —— getApi 单一真源 + API Key 链路脱壳 + publisher 四处绕过清零
date: 2026-10-08
---

## 任务执行记录：批次 C（batch-c-getapi-unify，2026-10-08）

编号约定：M-9 为**审查报告正文编号**（`docs/frontend-deep-review-2026-10-05.md`）。

| 节拍 | 状态 | Fresh 证据 |
|------|------|-----------|
| 会话隔离前置 | PASS | 独立 worktree `mp-batch-c-getapi-unify`（D 盘），分支 `batch-c-getapi-unify`，基线 `2809128e`；`pnpm install --frozen-lockfile` rc=0 |
| 时效性核验（§13） | PASS | 动手前用 `git show origin/main:<file>` 逐文件核实 M-9 现状：发现报告部分结论已过时（守卫有人补过），但 8 份重复 getApi、API Key 不脱壳、publisher 4 处直访（比报告多 1 处）、契约测试 SCAN_DOMAIN 缺 8 文件均属实——侦察结论存 `01-docs/BATCH-C-M9-RECON-2026-10-08.md`（随本 PR 入库） |
| 找第一因（QM-5 甲） | PASS | 根因不是"少改了几个文件"，而是**缺机械守卫**：旧契约测试的域守卫判据只认 `invoke(` 字面，8 个自持 getApi 的文件恰好从缝里漏出去；creatorPendingTotal 是报告之后新长出的第四处直访，证明"没有守卫必复发" |
| 修复 + 回归保护（QM-5 丙） | PASS | 9 个 api 文件收敛 + 契约测试扩域（SCAN_DOMAIN 5→13、判据加 3 种 IPC 形态、新增 M-9 直访守卫、extractCalls 支持 ns 常量首参）；契约测试 20/20、src/api 全量 423/423 |
| 反证 ×2（QM-5 丙必做） | PASS | ①拼错方法名 `modelProviderCreat` ⇒ 对账精确点名转红；②tts-voice-catalog 注入 `window.electronAPI` 直访 ⇒ M-9 守卫精确点名文件。恢复后回绿 |
| 数据方差（QM-5 乙） | PASS | 全部调用侧零改动；信封逐字段兼容（data/config 缺省形态照抄）；creatorPendingTotal 无 IPC 时回 total:0（与"无记录"语义一致，不打扰用户） |
| 防止再次发生（QM-5 丁） | PASS | 三层守卫驻库：①域守卫拦"触碰 IPC 却不登记"；②M-9 守卫拦"直访 electron-bridge 之外的 getApi/window.electronAPI"；③既有对账拦"调用名不在暴露面" |
| 行尾 diff 对账 | PASS | 两口径 numstat 一致 |
| 门禁自测 | PASS | check-max-lines rc=0；check-debt-budget rc=0；check-test-microtask-spin rc=0（1188 测试文件 0 自旋） |
| QM-1 打包 / QM-4 视觉 | N/A | 无运行面/视觉改动，调用侧零改动 |
| QM-6 CCG 跨家族外部评审 | 已执行 | deep-review.sh（critic=claude）产出 7 条（5 Warning/Info 入实质）：i1 拒绝转信封缺 catch 已修并配运行时回归锁 tts-reject-envelope.test.js（反证撤 catch 转 2 红）；i2 域判据补 on()；i3 脱壳运行时验证 apikey-plain-ipc.test.js（走真实桥接层）；i4 UNAVAILABLE freeze；i5 PRD 语义纠正；i6/i7 评估后不改（理由见提交 b312eeec9） |
| 远程同步 | PASS | merge SHA f03a53a1（PR #3174，2026-10-09）；git ls-remote 证远端分支 batch-c-getapi-unify 已删（0 行输出） |

## 关键判断与取舍

1. **先扩契约测试再改源码**：守卫先行，改动的每一步都有机械判据盯着；测试先红
   （点名 9 个绕过文件）、改完转绿，这个红-绿过程本身就是"覆盖真的生效"的证据。
2. **identity.js 的语义差异显式声明**：旧实现主进程 reject 时回信封，新实现会抛出
   ——调用侧 store 的 try/catch 早已存在，行为兼容；宁可抛错也不静默吞掉真实故障。
3. **cloud-publisher 的 `_api` 模块级缓存一并删除**：它会把「preload 晚注入」
   永久缓存成 null，属于顺带修掉的隐藏缺陷。
4. **tts 文件每个导出直写字面量**：method 经辅助函数参数转发会让契约对账"看不见"
   （C-1 形态）；直写字面量让每条路径都在账上。
5. **creatorPendingTotal 的 fallback 回 `{code:0, data:{total:0}}`**：无 IPC 时角标
   显示 0 与后端"无记录"语义一致，不弹错误打扰用户——fallback 不是随便填 null。

## 与报告 M-9 结论的差异（时效性）

- 报告称 4 个文件"无守卫"已过时（现均有 `|| null` 守卫）；
- 报告称 publisher.js 3 处直访，现为 4 处（+creatorPendingTotal）；
- 报告修复建议①「补 preload 契约测试」已由 #2952 落地（532 行），本批是其扩域。
