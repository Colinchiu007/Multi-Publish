# 设计：账号资料刷新簇的模块边界

## 候选方案

| 方案 | 做法 | 结论 |
| --- | --- | --- |
| A | 拆到 `apps/desktop/electron/services/account-profile-refresh.js` | ✗ 与同目录 `account-name-write.js` / `account-session-restore.js` 的先例不一致；这一簇的消费方全在 `publishers/` |
| B | **拆到 `publishers/account-profile-refresh.js`，`account-manager` 保留同名委托** | ✓ 采用：公开导出面零变化，IPC/调用方不需要改；关注点独立；依赖单向 |
| C | 只删结构锁、代码原地不动 | ✗ 那是把锁拆掉换绿灯，且没解决 1167 行的真实债务 |

## 边界与依赖方向

新模块回答一句话：「**采到的账号资料怎么回填进唯一真源**」。它允许依赖：

- `../services/logger`、`../services/python-bridge`
- `@multi-publish/shared-utils/src/account-profile`（采集实现单一来源）
- `./http-login-checker`（`fetchAccountInfoViaHttpApi`，HTTP 快速路径的资料来源）
- `./account-name-write`（`guardProfilePatchBySource`，昵称按 `name_source` 保护）

MUST NOT 依赖 `./account-manager`。实测这三个方向都不成环（`http-login-checker.js`、`account-name-write.js`、`shared-utils/account-profile.js` 均不 require `account-manager`）。需要 `account-manager` 侧私有的 `isSafePathSegment` 时，**由调用处在调用点注入**——沿用第一刀 `account-session-restore.js:83` 的写法，因为 `require` 期把依赖解构成本地绑定会让测试里的 `vi.spyOn` 拦不到（本仓已为此踩过两次）。

## 行为保持的四条纪律（逐字不变）

1. 只在「有 DOM 且判定有效」的路径做 DOM 回填；HTTP 快速路径没有 DOM，不采。
2. 只下发命中且与真源不同的字段（`buildProfilePatch`），未命中 = 键缺席 = 不修改。
3. 任何失败只 `warn` 并返回 `false`——资料是增强信息，**不得**成为登录有效性证据。
4. 用户显式命名（`name_source=manual`）一律不被采集结果覆盖。

## 结构锁加固（本刀的一部分：实测后措辞按事实收敛）

`account-manager-profile.test.js:276` 现状：

```js
const body = src.slice(src.indexOf('async function checkLoginStatus'), src.indexOf('async function extractAccountInfo'))
```

`extractAccountInfo` 一旦移出该文件，第二个 `indexOf` 返回 `-1`，而 `String.prototype.slice` 把负数当「从末尾倒数」——区间静默变成「`checkLoginStatus` 起至文件尾前 1 字符」。守卫照样数到 ≥2 次调用、照样绿，但它已经不再测量它声称的那段代码。这是「装饰性门禁」的生成机制，不是理论风险。

改锚口径：**两个锚点都必须先断言存在**（缺失即 `throw`/红），区间终点取「下一个顶层函数声明」这种与簇成员位置无关的判据；并补一条**反向锁**：`account-manager.js` 里不得再出现 `profileUtils.collectWith*` 与 `requestBackend('PATCH', '/api/accounts/'` 的直接组合（即回填必须经新模块）。

## 债务登记

`.github/scripts/max-lines-baseline.json` 中 `account-manager.js` 登记 **1061**，容差 200 ⇒ 上限 1261；拆分前实测 1167 行，拆分后实测 1096 行。**登记值保持不变**：它已经低于现状（1061 < 1096），把它「改成实测值」等于把它**抬高**、把上限放宽到 1296 —— 那是反向操作。留在 1061 才是当前能保住的紧棘轮；本刀的真实效果是把余量从 94 行恢复到 165 行，不需要也不应该动登记数字。
