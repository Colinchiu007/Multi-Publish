# 拆出账号资料刷新簇（account-manager 第二刀）

## Why

`apps/desktop/electron/publishers/account-manager.js` 现为 **1167 行**（`wc -l` 口径），在 `.github/scripts/max-lines-baseline.json` 挂账（登记 1061 + 容差 200 ⇒ 上限 1261），是仓库里最大的主进程服务之一。第一刀（`account-session-restore.js`，提交 `e2223ef8`）实测把该文件从 **1260 行降到 1167 行**（净减 93 行），新模块 132 行；剩余的最大同族簇是**账号资料刷新**：

- `extractAccountInfo`（第 690 行）
- `extractAccountInfoFromWebContents`（第 700 行）
- `refreshProfileFromPage`（第 717 行）
- `refreshProfileFromHttpApi`（第 747 行）

这四件事回答的是「**采到的昵称/头像/粉丝怎么回填进真源**」，与 `account-manager` 回答的「怎么登录、怎么检测、怎么发布」不是同一个关注点；它们的共同依赖是 `shared-utils/account-profile` + `python-bridge` + `account-name-write` 的昵称保护，与登录态判定只通过「检测有效之后顺手回填」这一条边相连。

这里有一把**会随时间失效**的守卫：`account-manager-profile.test.js` 第 276 行的接线守卫用
`src.slice(src.indexOf('async function checkLoginStatus'), src.indexOf('async function extractAccountInfo'))`
在同一个文件内切区间。本次搬家保留了同名委托，所以 `indexOf` 仍然命中、区间仍然可用（**这点与我最初的预测不同，是实测出来的**）；
但只要以后有人把委托删掉，第二个 `indexOf` 就会返回 -1，而 `slice(start, -1)` 把负数当「从末尾倒数」——区间静默变成「起点到文件末尾前 1 字符」，守卫继续绿却不再测量它声称的那段代码。
用四种变异做了旧/新守卫对照模拟（实测，见 design.md 的对照表）：删掉 4 个委托 ⇒ 两者都绿（内部调用点没变，守卫测的是调用点而不是实现位置）；
摘掉两处 HTTP 出口回填 ⇒ **旧守卫绿、新守卫红**，这是本次真正新增的抓得住的回归；只留 1 处 DOM 回填 ⇒ 两者都红。
结论必须按实测写：改锚是**预防性加固**（把区间钉在函数体本身，不随文件增长漂移），新增的 HTTP 出口计数才是**当下就有效**的那一条。

## What Changes

- **新增** `apps/desktop/electron/publishers/account-profile-refresh.js`：承载上述 4 个函数，依赖注入约定沿用第一刀（`isSafePathSegment` 由调用点在调用处注入；本模块 MUST NOT `require` `account-manager`）。
- **修改** `account-manager.js`：这 4 个函数改为对新模块的单行委托，**对外导出名与签名零变化**（IPC 合同面不动）；预计净减 80–100 行。
- **修改** `account-manager-profile.test.js`：把上述结构守卫改成**不依赖被搬走函数是否同文件存在**的锚点，并让「锚点找不到」当场变红（不允许 `indexOf` 返回 -1 时静默扩大区间）。
- **新增** `account-profile-refresh.test.js`：新模块的直接特征测试 + 接线守卫（`account-manager` 内不得再自行采集/回填，必须经该模块）。
- **不改** 行为语义：昵称保护（`name_source`）、只下发命中且变化的字段、失败只 warn 返回 `false`、HTTP 快速路径不做 DOM 采集等四条纪律逐字保持。

## Impact

- Affected specs: `desktop`（新增 1 条 Requirement：账号资料刷新模块边界）
- Affected code: `apps/desktop/electron/publishers/account-manager.js`、新模块、2 个测试文件
- **非破坏性**：无导出删除、无签名变化、无 IPC 面变化；回归以「既有 5 个测试文件在拆分前后都必须全绿」为硬判据
- 关联既有纪律：AGENTS.md「门禁断言随实现迁移同步（MUST）」「任何用户输入落盘的写入口必须先证明它写的是被读取的那份真源」「测试断言不得反向固化错误行为」
