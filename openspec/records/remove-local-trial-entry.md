---
record: remove-local-trial-entry
task: 产品决策 A——正式构建不再提供本地免费试用入口
date: 2026-10-07
# 下面两个字段只在「远程同步」尚无法收口时填写；回填成 PASS 后必须整段删除。
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由 docs-only PR 回填
sync_backfill_owner: 下一个会话
---

## 本次执行记录：关闭本地免费试用入口（2026-10-07）

> 分支：`remove-local-trial-entry`；范围：产品决策落地（UI + IPC + i18n + 测试）
> 判定：`classify-docs-only` → **docs-only=false**（改运行时代码与 UI）⇒ 走完整质量节拍

## 决策

用户选定 **方案 A：删掉本地 trial**（另一个选项是服务端做 trial plan，本轮不做）。

## 依据（不是"看着没意义"，是取证结论）

| 层 | 判断依据 | 认不认 trial |
|---|---|---|
| 渲染层 UI | `license:has-feature` → 只读本地 `licenseManager`，**不查服务端** | ✅ 认（8 项 PRO_FEATURES） |
| 主进程执行门禁 | `identityService.requireEntitlement(feature)` → 服务端 plan-matrix | ❌ **不认** |

`grep -c trial packages/api-publish-engine/src/auth/plan-matrix.js` = **0**，
服务端只有 `free` / `standard` / `pro`。

`cloud-publisher.js:90` 的 `submitTask()` 开头即
`requireEntitlement('cloud_publish', { onlineOnly: true })` ——
**`onlineOnly: true` 意味着连离线兜底都没有**。

⇒ 试用用户看到 UI 显示 Pro，点击被服务端拦下，**且没有任何降级提示**。
这是「能看见、点不动」，**比明确告知伤害更大**。

## 变更

1. **IPC**（`license:activate-trial`）：正式构建拒收，口径与 `license:activate`（#3085）
   一致 —— 只认 `app.isPackaged !== false`，`undefined` 同样拒收。
2. **UI**（`UpgradeModal`）：`trialAvailable = import.meta.env.DEV`，
   正式包改为显示 `memberCenter.trialUnavailable`，不渲染试用按钮。
3. **i18n**：补 `memberCenter.trialUnavailable`（zh/en 成对）。

## 刻意没做的事

- **不删 `activateTrial()` 与 `doTrial()`**：将来若做服务端 trial，这两个可直接复用。
- **不删 `TrialBanner.vue`**：它的 free 分支显示「当前为免费版，部分功能受限」，
  那是**给所有免费用户的权益提示**，与 trial 无关。trial 分支自然成为死代码但无害。
- **不动 `UpgradeModal.vue:143` 的既有硬编码 `激活成功！`**：在 locale 基线内，
  不属本次范围，避免扩大 diff。
- **不做服务端 trial plan**：本轮只关本地路径。

## 验证（沙箱无 vitest，node 直驱真实 handler）

3 档 × 2 通道 = **6/6 全对**：

| 档 | `license:activate` | `license:activate-trial` |
|---|---|---|
| 正式包 `isPackaged=true` | 拒收 ✅ | 拒收 ✅ |
| `isPackaged=undefined` | 拒收 ✅ | 拒收 ✅ |
| 开发包 `isPackaged=false` | 放行 ✅ | 放行 ✅ |

**变异验证**：摘掉 `activate-trial` 的拒收 → 正式包与 undefined 档立刻变成"到达实现"，
**漏洞复现被抓住**；`activate` 通道不受影响 ⇒ **变异作用在正确的代码上**
（这正是「先数一遍同名定义有几份」的检查：两个 handler 各有一份 `const { app }`，
变异只改了 activate-trial 那份）。

## 逃逸分析

- `license.test.js` 原有 12 条**全测访问级别与 activate**，activate-trial 零覆盖。
- `access-level-bus.test.js` 里虽有 `emitAccessLevelInvalidated('license-activate-trial')`，
  但它 `require('./access-level-bus')` **完全绕过 `license.js` 的 handler**，
  故提前 return 不会打红它——动手前已确认，避免误判。

## 遗留

服务端 trial plan 未实现。若将来要做，需往 `plan-matrix` 加 trial plan +
注册后自动发放，与 standard/pro 走同一套权益。

| 远程同步 | PENDING |
|---|
