---
record: fix-license-activate-accepts-anything
task: 修复 P0 权限泄漏——license:activate 任意字符串即可获得永久 Pro
date: 2026-10-07
merged: PR #3085 → squash `f5b18dab`（2026-10-07，quality-gate 11/11 全绿）
---

## 本次执行记录：修复 license 激活码权限泄漏（fix-license-activate-accepts-anything，2026-10-07）

> 分支：`fix-license-activate-accepts-anything`；worktree：**沙箱内无法执行**（无 Windows + Git Bash）
> 范围：🔐 安全修复 —— `license.js`（IPC 拒收）+ `license-manager.js`（最小校验）+
> `UpgradeModal.vue`（正式包隐藏输入框）+ 测试
> 判定：`classify-docs-only` → **docs-only=false**（改运行时代码 + UI）⇒ 走完整质量节拍

## 缺陷（QM-5 ①根因）

`licenseManager.activate(licenseKey)` 原本**只对 key 做 `trim()`，没有任何有效性校验**：

```js
activate(licenseKey) {
  if (!licenseKey) return false
  if (this._data.type === "pro" || this._data.type === "lifetime") return false
  const key = licenseKey.trim()          // ← 唯一处理
  this._data.type = "pro"
  this._data.expiresAt = null            // ← 永不过期
  this._data.features = PRO_FEATURES.slice()
```

**实测（node 直驱该类）**：

| 输入 key | activate | type | expiresAt | features |
|---|---|---|---|---|
| `a` | ✅ true | pro | **null（永久）** | 8 |
| `随便什么字符串` | ✅ true | pro | null | 8 |
| `"   "`（纯空格） | ✅ true | pro | null | 8 |
| `!!!` | ✅ true | pro | null | 8 |

可达路径：preload 通过 contextBridge 暴露 `licenseActivate` → `UpgradeModal` 的
激活码输入框在正式包可见（#3064 特意保留，理由是「激活码属于买断授权的既有通道」）⇒
**正式包用户输入 `a` 即得永久 Pro**。

## 根因不是"少了个校验"（QM-5 ③系统性漏洞）

**本地存在一条不经服务端核销的授权路径。** 服务端 `POST /api/v1/redeem`
（`subscription-service.js`）已带 `durationDays` 与事务化到期结算，其注释明写
「到期惰性降级」「三个写必须在同一事务：防止『订阅已 expired + 快照仍为 pro』
的**永久权限泄漏**」——服务端把这类问题处理得很完整，本地这条把它整个绕开了。

产品口径本身也已明确（`license-access-control.js` 顶部）：
**「业务权益是服务端权威；本地 license 只在身份服务未启用的兼容模式生效」。**

**用户侧事实**：产品尚未上线，**没有真实用户** ⇒ 不存在需要维护的既有承诺，
可以直接做对，不必做降级妥协。

## 逃逸分析（QM-5 ②）

`license.test.js` 原有 8 条用例**全部测访问级别**（`getAccessLevel` 的分级逻辑），
`activate()` 本身**零覆盖**。覆盖率数字与缺陷是否被拦住是两件事。

## 修复（三层）

1. **IPC 层（根治）**：`license:activate` 在 `app.isPackaged !== false` 时拒收。
   口径与 `payment:simulate`（#3006）/ `payment:create-order`（#3075）完全一致：
   严格不等，**`undefined` 同样拒收**，环境变量不能覆盖打包事实。
2. **`license-manager.activate()` 最小止血**：拒绝空串/纯空白/null。
   `String(licenseKey).trim()` 后再判空。**这只是纵深防御**——客户端校验本质可绕过。
3. **UI 层**：`UpgradeModal` 正式构建不渲染激活码输入框，改为如实说明
   「激活码已迁移至账号核销，请登录后在会员中心使用」，不留必然失败的输入框。

**免费试用不受影响**：`activateTrial()` 有 `TRIAL_DAYS=7` 期限且带
`type === 'free'` 前置校验，是安全的，两侧都保留。

## 回归保护

`license.test.js` 新增 `describe('license:activate 打包态拒收（P0 权限泄漏）')` 4 条：

1. 正式构建拒收，且 **`licenseManager.activate` 未被调用**（不只看返回值）
2. `isPackaged=undefined` 同样拒收（严格不等性）
3. 开发构建才走到 `activate()`
4. 拦截**优先于 key 校验**：空白 key 也先被拒（锁定判断顺序）

## 验证

沙箱无 `apps/desktop` 的 node_modules（vitest 不可用），**两处都用 node 直驱真实模块**。

`license-manager.activate()` — 8 例全对（`""` / `"   "` / `"\t\n"` / `null` /
`undefined` / `false` / `0` 全拒，`a` 放行）：

| 变异 | 结果 |
|---|---|
| 还原成只有 `trim()`（漏洞原状） | ❌ `"   "` 与 `"\t\n"` 变 true，**漏洞复现被抓住** |
| 还原 | ✅ 8/8 |

IPC `license:activate` — 3 档全对：

| 变异 | 结果 |
|---|---|
| 摘掉 `isPackaged` 拒收 | ❌ 正式包与 undefined 档变成「激活成功」，**漏洞复现被抓住** |
| 还原 | ✅ 3/3 |

## 遗留

激活码的**服务端核销入口尚未接进桌面端 UI**（`/api/v1/redeem` 服务端已就绪）。
本次只把本地路径关掉并如实说明去向。接线属于后续功能项，需登录态打通后再做。

| 远程同步 | ✅ PR #3085 → squash `f5b18dab`，quality-gate 11/11 全绿，远端分支已删除 |---|

---

## 首轮 CI 失败与修复（2026-10-07）

首轮 4 个 job 红（`QG Static` / `QG Coverage` / `QG Desktop Shards 1/2、2/2`），
**全部同一根因**，不是 4 个独立问题。

### ① 我新增的 4 条测试全红：`TypeError: handler is not a function`

`license.js` 用 `ipcMain.handle(...)` 注册业务通道，只有 `auth:get-access-level`
走 `on(...)`。我的 `makeHandlers` 写的是 `{ handle: vi.fn(), on: ... }` ——
`handle` 是**空实现**，handler 从未进 `listeners`。

**这个坑我在 node 验证脚本 `.git/v4.js` 里已经踩过并当场修了，却没把修复带回测试文件** ——
验证脚本与被验证代码不一致，方向反了：改了脚本，忘了改测试。
⇒ **本地「验证通过」不能替代对测试文件本身的复核**。

修法：`{ handle: (ch, h) => { listeners[ch] = h }, on: (ch, h) => { listeners[ch] = h } }`。

### ② `check-locale-sync` 抓到我的硬编码中文

```
[locale-sync] FAIL：渲染端新增 1 处硬编码中文字符串
  UpgradeModal.vue:124  "激活码已迁移至账号核销，请登录后在会员中心使用"
```

新加的提示文案写成了**硬编码中文**。规范是用户可见文案必须走 locale：
补 `memberCenter.activationCodeMigrated`（zh/en 成对），组件改用 `t()`。

**值得注意的是：抓出这个问题的是 `check-locale-sync.test.js` 这个「门禁自测」** ——
我一直把它当成元测试（测门禁脚本本身的），这次它作为 `QG Static` 的一部分
在**真实门禁实跑**中报出了真缺陷。**门禁自测不只测门禁，也会挡住真实回归。**

修完本地立即复核：`node .github/scripts/check-locale-sync.js --cjk` →
`PASS（基线 1489 条，当前 1333 条，无新增硬编码）`；`node --test check-locale-sync.test.js` → 16/16。
**不必再送一轮 CI 才发现。**

### 方法教训

4 个 job 红时，我按 job 逐个下载日志。**失败用例数「4 条 / 1 个文件」已经指明同一根因** ——
应先看聚合数收敛假设，再定位文件，而不是逐 job 查。逐个查多花了 4 次日志拉取。
