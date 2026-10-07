---
record: guard-create-order-in-prod
task: 给 payment:create-order 加打包态拒收（纵深防御）——UI 已关入口，IPC 层补一道
date: 2026-10-07
# 下面三个字段只在「远程同步」尚无法收口时填写；回填成 PASS 后必须整段删除。
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话
---

## 本次执行记录：create-order 打包态拒收（guard-create-order-in-prod，2026-10-07）

> 分支：`guard-create-order-in-prod`；worktree：**沙箱内无法执行**（无 Windows + Git Bash）
> 范围：🔐 安全加固 + 🧪 测试 —— `payment.js` 加 6 行拦截，`payment-ipc.test.js` 补 4 条回归
> 前置：#3064（`ff9b4b93`）已合并，UI 层购买入口已在正式包关闭
> 判定：`classify-docs-only` → **docs-only=false**（改运行时代码）⇒ 走完整质量节拍

## 为什么 UI 关闭之后还要加这一道

#3064 已让正式包渲染不出「立即升级」按钮，正常用户路径已到不了下单。
但 **`withSenderCheck` 只验 `senderFrame` 是 `app://`，不验调用意图**——
应用自身有 XSS 时，攻击者可在主窗口上下文里直接 `invoke('payment:create-order')`。

即：UI 关闭解决的是「误导用户」，不解决「被利用」。这是**纵深防御**，两层各管一件事。

## 拦截口径

与 `payment:simulate`（#3006）完全一致：

```js
if (!app || app.isPackaged !== false) {
  return { code: EC.REQUEST_ERROR, message: '付费通道筹备中，暂不支持创建订单' }
}
```

- 放在**参数校验之前**：打包态下不暴露参数校验的存在
- `!== false` 而非 truthy：**只有明确 `false` 才放行**，`undefined` 同样拒收
- 环境变量不能覆盖打包事实
- 返回消息与 `UpgradeModal` 正式包显示的 `memberCenter.paymentChannelUnavailable`
  （`付费通道筹备中，暂不支持购买`）同源，用户看到的是同一口径

## 回归保护（4 条）

`payment-ipc.test.js` 里该通道此前**只有一条 untrusted sender 测试**，
`beforeEach` 把 `app.isPackaged` 钉死 `false` ⇒ 打包态分支从未被执行过。
新增 `describe('payment:create-order 打包态拒收')`：

1. `isPackaged=true` → 拒收，且 `createOrder` **未被调用**（不只看返回值）
2. `isPackaged=undefined` → 拒收（`!== false` 的严格性）
3. 拦截**优先于参数校验**（锁定判断顺序）
4. `isPackaged=false` 仍放行 —— 防「恒绿」，拦截若写成永远 return 此条必须红

## 验证

沙箱无 `apps/desktop` 的 node_modules（vitest 不可用），用 node 直接 require 真实
`payment.js` 驱动 handler（与 `payment-ipc.test.js` 同构）：

| 状态 | 结果 | 服务被调用 |
|---|---|---|
| `isPackaged=false` | 放行 code=0 | 是 |
| `isPackaged=true` | 拒收 code=-1 | 否 |
| `isPackaged=undefined` | 拒收 code=-1 | 否 |

**变异测试**（拆掉拦截必须红）：

| 变异 | 结果 |
|---|---|
| `!== false` 改成 truthy | ❌ undefined 档被抓住 |
| 删除整段拦截 | ❌ 两档打包态均被抓住 |
| 还原 | ✅ 全符合 |

## 遗留（不在本 PR）

`payment-manager.js` 的 `PLANS`（只有 pro、¥99 一次性）与 `license-manager` 的
买断授权（`expiresAt = null`）仍与 `plan-matrix.js` 的三档订阅脱节。
真正统一需另立项：涉及金额来源、授权有效期校验与续期逻辑。

| 远程同步 | PENDING |
|---|---|
