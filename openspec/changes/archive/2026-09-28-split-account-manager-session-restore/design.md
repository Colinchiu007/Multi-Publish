# Design: split-account-manager-session-restore

## 决策 1：为什么切「会话凭证恢复」簇，而不是别的簇

不靠直觉，用静态测量决定。对 `account-manager.js` 全部 40 个顶层函数统计了三个量：是否导出、**文件内部调用次数**（越高越难切，牵一发动全身）、**测试提及次数**（越高越危险，因为本仓存在「require 期解构 → `vi.spyOn` 拦不到」的假绿陷阱）。

候选簇对比（测量脚本输出）：

| 簇 | 函数体行数 | 内部依赖 | 簇外调用点 | 真实跨模块消费方 |
|---|---|---|---|---|
| **会话凭证恢复**（选中） | **82** | 仅 `log`、`path`、`isSafePathSegment` | 6 处 | **无**（`rpa-engine/browser-data.js`、`auth-view-session.js` 里的同名 `restoreCookies`/`restoreLocalStorage` 是各自独立实现，不是消费方） |
| 账号资料刷新（放弃） | 53 | `log`、`profileUtils`、`pythonBridge`、`isSafePathSegment` | 6 处 | **有**：`publishers/http-login-checker.js` 使用 `refreshProfileFromHttpApi`；`tests/account-manager-extract-info.test.js` 直接 `require('../publishers/account-manager')` 解构 `extractAccountInfo` |

选前者的三条理由：外部调用面最小、依赖最少、**没有跨模块消费者**——因此「移动」不会改变任何其它模块的 import 路径，回归半径只落在 `account-manager` 自己身上。后者留下一作第二步（它需要同步改两处消费方，属另一个 PR 的粒度）。

## 决策 2：循环依赖与依赖注入

`getAccountPartitionCookies` 需要 `isSafePathSegment`（`account-manager.js:59` 的私有校验，16 处内部调用，不能搬走）。若新模块 `require('./account-manager')` 取它 → **循环 require**，在 CJS 下会拿到半初始化的导出对象（表现为偶发 `isSafePathSegment is not a function`，且只在加载顺序变化时出现）。

正解沿用既有先例 `account-name-write.js`：调用方把依赖**绑定在调用处**，被拆模块只接受注入——

- `account-manager.js`：`const getAccountPartitionCookies = (platform, accountId) => sessionRestore.getAccountPartitionCookies(platform, accountId, { isSafePathSegment })`（公开签名保持两参，IPC 合同面不变）。
- 新模块内部只 `require` 无环依赖：`../services/logger`（**模块对象**，因此 `vi.spyOn(require('./logger'), 'warn')` 仍能拦住）、`@multi-publish/shared-utils/src/platform-definitions`（`isPlatformCookieDomain`）。

刻意不把 `log` 做成必填 deps：先例文件对 `pythonBridge` 注入的理由是「它要被测试替换」，而 logger 本身就是模块对象、可被 spy，注入反而多一层。

## 决策 3：先钉行为，再动代码

纯平移最容易翻车的地方是「搬完以后测试仍绿，但绿的是一组从没真正跑到这些分支的测试」。所以顺序是：

1. 先在**未改动**的实现上写特征测试（characterization tests），把这 6 个函数当前的真实行为钉死：`restoreCookies` 的逐条 `session.cookies.set` 参数默认值与「部分失败计数 + warn」；`restoreLocalStorage` 对非对象/空对象短路；`buildLocalStorageRestoreScript` 的 JSON 整体序列化（安全修复：不得回退到字符串拼接）；`_electronSession` 在无 electron 时降级 null；`getAccountPartitionCookies` 的 `isSafePathSegment` **fail-closed**（非法 accountId 直接返回 `[]`）与按平台域过滤、异常时 warn + `[]`；`mergeCookies` 的 name+domain 去重与**前者优先**。
2. 断言这些测试**在当前实现上全绿**（这是特征测试的前提，不是结果）。
3. 才做移动；移动后同一套测试必须仍然全绿，且新增的模块级测试文件与旧的 `account-manager` 侧调用测试一起跑。
4. 对「行为不变」做一次反证：临时把 `mergeCookies` 的优先级改成后者优先、或让 `getAccountPartitionCookies` 跳过 `isSafePathSegment`，测试必须变红——否则说明这层锁是装饰性的。

## 决策 4：门禁与结构合同

- 行数门禁：移动后跑 `node .github/scripts/check-max-lines.js`，要求 rc=0 且**不**通过手改基线数字来「还债」（登记值下调属接受现状漂移，须显式说明；本 PR 预期不需要动基线，因为文件仍 >500 行）。
- 新增结构合同（进 `specs/desktop/spec.md`）：`account-session-restore.js` 不得 require `account-manager`；`account-manager.js` 不得再定义这 6 个函数。用一条读源码的接线守卫锁住（本仓对「读源码断言」的教训是：它不能替代真跑一遍流程，所以它只作为**边界合同**的补充，行为证据仍由特征测试承担）。

## 不做的事

- 不改任何用户可见行为、错误码、日志前缀。
- 不顺手修 `loadSavedCredentials` / `checkLoginStatus` 的既有逻辑（与本 change 无关，且会污染「纯平移可回滚」的性质）。
- 不动资料刷新簇（需要改外部消费方，另开 change）。
