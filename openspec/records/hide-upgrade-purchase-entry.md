---
record: hide-upgrade-purchase-entry
task: 正式包隐藏 UpgradeModal 购买入口 + 移除「¥99/永久」不实口径 + 修掉 3 处恒真/条件断言
date: 2026-10-07
# 下面三个字段只在「远程同步」尚无法收口时填写；回填成 PASS 后必须整段删除。
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话
---

## 本次执行记录：隐藏购买入口（hide-upgrade-purchase-entry，2026-10-07）

> 分支：`hide-upgrade-purchase-entry`；worktree：**沙箱内无法执行**（无 Windows + Git Bash）
> 范围：🎨 UI + 🐛 Bug 修复 —— `UpgradeModal.vue` 正式包不再渲染购买入口与价格；
> `payment-manager.js` 标注脱节；测试修掉 3 处恒真/条件断言
> 判定：`classify-docs-only` → **docs-only=false**（改 `.vue` 与运行时代码）⇒ 走完整质量节拍

## 起因：用户指出「¥99 /永久应该已经去掉了」

用户是对的，而审计的缺口在于**只看了定价文档，没看代码链**。实际存在一整套
与 `plan-matrix.js` 脱节的第二体系：

| 层 | 位置 | 定价/授权模型 |
|---|---|---|
| **权威源** | `packages/api-publish-engine/src/auth/plan-matrix.js` | free ¥0 / standard ¥29月 ¥199年 / **pro ¥79月 ¥599年**（三档订阅） |
| 后端下单 | `apps/desktop/electron/services/payment-manager.js` `PLANS` | **只有 pro，`amount: 99` 一次性** |
| 授权落库 | `apps/desktop/electron/services/license-manager.js:176` | **买断**（`expiresAt = null`），全文件零订阅关键词 |
| 前端显示 | `apps/desktop/src/components/UpgradeModal.vue:26,59` | 写死「¥99 /永久」「确认支付 ¥99」 |

PR #3003 只统一了 `plan-matrix.js` 与对外文档，**这条下单→授权链一处未动**。
前端完全没有引用 `plan-matrix`——不存在取价路径。

## 本次只做缓解，不是修复

用户决定「隐藏购买入口」。按该决定执行：

1. **`UpgradeModal.vue`** 新增 `purchaseAvailable = import.meta.env.DEV`
   - 正式包：Pro 卡价格位改为 `t('memberCenter.paymentChannelUnavailable')`，
     「立即升级」按钮改为不可点击的「筹备中」徽标
   - 开发包：入口与 ¥99 文案原样保留（支付流程仍可调试）
   - 口径与 #3006 的 `simulatedPaymentAvailable` 一致：**只读 `import.meta.env.DEV`，
     不给组件开测试注入口**
   - **激活码入口保留**——那是买断授权的既有通道，不属于购买入口
2. **`payment-manager.js`** 的 `PLANS` 上方补注释，写明它不是定价权威源、
   与 `plan-matrix` / `license-manager` 的脱节，以及「需另立项」的后续。
   **不改行为**——动金额来源与授权有效期属独立工程。

**真正的修复**（让 `payment-manager` / `license-manager` 接入 `plan-matrix` 的
订阅制）涉及金额来源、授权有效期校验与续期逻辑，需另立项，不在本 PR 内。

## 顺带修掉的测试缺陷

改动过程中发现 `UpgradeModal.test.js` 里有三处**恒真或条件跳过**的断言——
它们让支付链路坏掉时测试依然绿：

| 位置 | 原写法 | 问题 |
|---|---|---|
| `submits order and shows QR step` | `if (confirmBtn.length > 0) { …断言… }` | 按钮找不到就整段跳过 |
| `handles order creation failure` | 同上 + `expect(true).toBe(true)` | 既跳过又恒真，**什么都没验** |
| `cancels order and returns to select` | `if (returnBtn.length > 0)` + `expect(true).toBe(true)` | 同上 |

改为显式 `expect(…length).toBeGreaterThan(0)` 后接无条件的实质断言
（下单失败必须显示「支付失败」；返回必须退回「选择支付方式」）。

另补：购买入口相关的 5 个测试显式 `vi.stubEnv("DEV", true)`，
并在顶层 describe 加 `afterEach(() => vi.unstubAllEnvs())`——
否则 stub 会**泄漏到后续用例**，把「正式包不显示购买入口」的断言悄悄变成开发包形态。

## 新增回归保护

`describe("模拟支付入口的构建期可见性")` 内新增/改写 4 条：

1. 正式包：无「立即升级」、无「确认支付」、无「¥99」/「永久」，
   有「付费通道筹备中」，**且激活码入口仍在**
2. 正式包：**把当前所有按钮都点一遍**，断言 `paymentCreateOrder` /
   `paymentSimulate` 均未被调用、界面到不了扫码页
   （不用 `vm.startPayment()`——它未 expose；用 `if (typeof … === "function")`
   包起来就是恒绿通道，条件永不成立）
3. 开发包：模拟支付按钮仍渲染，原流程不被打断
4. 开发包：购买入口与 ¥99 文案均保留


## CI 首轮抓到：实质断言暴露了一个从未验证的假设

首轮 CI 抓出一条红：`cancels order and returns to select`。

**根因不是产品缺陷，是我的断言方向写错了。** 该测试原为
`if (returnBtn.length > 0) {…} expect(true).toBe(true)`，改成实质断言后我才发现：

- 模板里有两个语义相近但完全不同的按钮
  - 「返回」在 `paymentStep === 'select'` 时绑定 `showPaymentFlow = false` ⇒ **退出整个支付流程**
  - 「取消订单」在 `paymentStep === 'paying'` 时绑定 `cancelOrder` ⇒ 调 `paymentCancel` + `resetPayment()` 回 select 步
- 我在「选择支付方式」步就点了「返回」（从没走到扫码页），断言「回到选择支付方式」自然失败

**这正是把恒真断言换成实质断言的价值**：恒真时代「返回」的语义从未被任何人验证，
`cancels order and returns to select` 这个测试名承诺的行为也没有对应实现路径检查。

修法：按测试名本意重写三步（立即升级 → 确认支付 → 取消订单 → 回到选择支付方式），
并**新增一条**独立测试锁住「返回」的真实语义（退出流程、不是退回上一步）。
两个按钮从此各自有覆盖。

**另修一处**：`calls deactivate when deactivate button clicked` 里的
`if (typeof vm.doDeactivate === "function")` —— `doDeactivate` 确实在 `defineExpose` 里，
条件恒真。改为先 `expect(typeof …).toBe("function")` 再调用。

**本次共清理 4 处恒真/条件断言**（原记录写 3 处，漏统计这一处）。

## 门禁

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| `check-debt-budget` | PASS | `UpgradeModal.vue` 净增行数在阈值内 |
| `check-no-brand-residue` | PASS | |
| `check-gate-record-debt` | PASS | 本篇含 `\| 远程同步 \|` 行 |
| `check-text-encoding-integrity` | PASS | |

## 验证边界（必须如实记录）

沙箱无 `apps/desktop` 的 node_modules（vitest 不可用），**组件测试未本地运行**，
由 CI 完成真实验证。本地只做了静态核对：

- 5 个点 `.upgrade-btn` 的测试全部有 dev stub（脚本逐块核对）
- `expect(true).toBe(true)` 与 `if (…>0)` 包裹已清零（grep 复查）
- 括号/花括号配平为 0

**未做的事**：没有对本次测试做变异验证（需要能跑 vitest）。
断言本身全部锚定可见文本与 mock 调用，属可变异形态，但**未实测**。

| 远程同步 | PENDING |
|---|---|
