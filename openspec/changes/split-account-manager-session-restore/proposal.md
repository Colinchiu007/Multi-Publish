# Proposal: split-account-manager-session-restore（把「会话凭证恢复」簇从超大文件 account-manager.js 拆出）

## Why

`apps/desktop/electron/publishers/account-manager.js` 的行数债务已耗尽增长容差，任何后续改动都会立刻撞门禁：

- 实测（`origin/main` = `c57fcb10`）：文件 **1260 行**；`.github/scripts/max-lines-baseline.json` 登记 1061 + `growthAllowance` 200 = **上限 1261**，即**只剩 1 行**。上一个 PR（#2454）合入时该文件净增 9 行就已经是「压注释换空间」的结果。
- 这是**结构性阻塞**而非美观问题：该文件同时承载登录凭证采集、账号增删、登录态检测、资料刷新、会话恢复、登录态写回六类职责，任何一类的新增能力都会被门禁拦下（历史误判见 `01-docs/learnings.md` 的 `LEDGER_GREW` 条目——那次真因是分支落后，但这次的余量是真的）。
- 仓库已有同源先例并写明了理由：`apps/desktop/electron/publishers/account-name-write.js` 头部注释「从 publishers/account-manager.js 拆出，两条理由：关注点不同 / 门禁挂账」。本 change 沿用同一手法与同一依赖注入约定。

## What Changes

**MODIFIED（行为不变）**：把「会话凭证恢复」这一簇 6 个函数从 `account-manager.js` 平移到新模块 `apps/desktop/electron/publishers/account-session-restore.js`。

移入的函数（合计 82 个函数体行，实测数据见 design.md）：

| 函数 | 原行号 | 原导出 | 内部调用次数 | 测试提及次数 |
|---|---|---|---|---|
| `restoreCookies` | 768 | 是 | 1 | 0 |
| `restoreLocalStorage` | 801 | 是 | 1 | 0 |
| `buildLocalStorageRestoreScript` | 814 | 否 | 2 | 0 |
| `_electronSession` | 1000 | 否 | 1 | 0 |
| `getAccountPartitionCookies` | 1017 | 是 | 1 | 4 |
| `mergeCookies` | 1036 | 是 | 1 | 2 |

- `account-manager.js` 改为从新模块引入上述实现；`_electronSession` **完全移出**（它唯一的调用点 `getAccountPartitionCookies` 一起搬走）。
- `getAccountPartitionCookies` 需要的 `isSafePathSegment` 由 `account-manager` 在调用处**注入**（照 `account-name-write.js` 的做法），新模块**不得** `require('./account-manager')`，以免循环依赖。
- `module.exports` 的公开面保持不变（4 个原本导出的名字仍从 `account-manager` 导出），IPC 合同面与 `bootstrap/phase*.js`、`core/container.js` 的引用方式零改动。
- 不新增行为、不改错误语义、不改日志前缀（仍为 `AccountManager`），因此本 change **不含** ADDED/MODIFIED 的行为需求；它新增的是一条**模块边界结构合同**（见 `specs/desktop/spec.md`）。

## Impact

- **Affected specs**: `desktop`（新增「账号会话凭证恢复模块边界」结构合同）。
- **Affected code**: `apps/desktop/electron/publishers/account-manager.js`（−82 行函数体 + 引入/绑定若干行）、新增 `account-session-restore.js`、新增同目录特征测试 `account-session-restore.test.js`。
- **门禁**：`account-manager.js` 预期降到 ~1180 行（余量从 1 行回到 ~80 行）；基线登记值不动（文件仍 >500 行，属继续挂账，非还完债）。
- **风险**：中。涉及登录凭证恢复路径（`openSavedAccount` / `checkLoginStatus` / `loginSilent` 链路），但为纯代码平移；风险主要落在「测试 spy 语义」上——本仓已证明 `require` 期解构会让 `vi.spyOn` 拦不到（`AGENTS.md` 与 `account-name-write.js` 双重记载），故接线一律走模块对象 / deps 注入，并先落特征测试再动手。
- **回滚**：单提交代码平移，`git revert` 即可整体回退，无数据迁移、无外部接口变化。
