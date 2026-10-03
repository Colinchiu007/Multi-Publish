# 测试期「禁止真实出站」守卫的子进程面（#2783 的另一半）

对应 issue #2783（其 CI 侧触发条件已由 PR #2793 消掉，本面补的是**能力缺口**）。
记录载体 `openspec/records/fix-test-egress-child-plane.md`。

## 1. 缺的是什么

共享守卫 `packages/shared-utils/src/network-egress-guard.js` 只 patch
`net.Socket.prototype.connect` —— 那是 **realm 级**的补丁。测试一旦用 `spawnSync` /
`execFileSync` / `fork` 起另一个 node 进程，那个进程里没有守卫，于是"测试期零真实出站"
对这条路径**结构性无效**。

#2783 的事故就是这个形状：`require('electron')` 在测试 realm 里执行
`spawnSync(process.execPath, [<pkg>/install.js], { stdio: 'inherit' })`，子进程真去下载了
4 秒；`stdio:'inherit'` 让子进程 stdout 并进父进程，vitest 把这段下载记到"当时正在跑的
那条用例"名下 ⇒ 表现为**某条无关用例随机 15s 超时**（`Test timed out in 10000ms`）。

## 2. 三条实现口径（每条都对应一次实测）

| 口径 | 为什么 |
|------|--------|
| 只给 **node 系**子进程注入 `--require <setup>` | 非 node（git / python / electron.exe）注入不了守卫。给它们注入只会把命令行搞坏，而"看起来守住了"是假的。非 node 一律 **argv 一字不改**，进台账 + 每个命令名出声一次（`[TEST-NETWORK-CHILD-UNGUARDED]`） |
| `spawn` / `spawnSync` / `execFile` / `execFileSync` / `fork` **五个入口逐个 patch** | 实测：Node 的 `execFileSync` 走内部绑定，**只 patch `spawnSync` 对它无效** —— 子进程的 `process.execArgv` 里没有 `--require`。只 patch 一部分会得到一条恒绿的假锁 |
| `fork` 只能改 `options.execArgv` | `fork(modulePath, args, options)` 的 args 是脚本参数位；把 `--require` 塞进去会被子进程当成 `process.argv` 的一部分 |

装配仍然只有一份：`packages/shared-utils/network-egress-guard.setup.js` 同时装两个平面，
各测试面照旧引用这个 setup（Gate 20 的枚举判据不变）。因为 setup 用 `__filename` 作注入目标，
**孙进程**（子进程再 spawn 的 node）也会继续被注入，且安装幂等。

## 3. 锁的形状：一律由子进程自己报告，不用 mock

`network-egress-guard-child.test.js` 里每条"注入是否生效"的断言都是让子进程打印
`process.execArgv` / `net.Socket.prototype.connect` 的守卫标记 / 自己写盘（fork 那条）。
原因：本仓吃过两次「夹具只断言我调用过某个方法」的假绿。
另外还有一条**对照组**：显式走未包装的原始 `spawnSync`，证明"没有这一层时子进程确实没守卫" ——
装上之后 `cp.spawnSync` 本身已会注入，对照组若不走原始函数就测的是包装层的效果。

拦截证据用 `198.51.100.7`（RFC 5737 TEST-NET-2，不可路由、不需要 DNS）：守卫生效时拦在
connect 入口，连 SYN 都不发，所以"秒失败"本身就是判据（用例断言 < 6s）。

## 4. 门禁接线

`.github/scripts/check-test-egress-guard.js`（Gate 20）加一条：共享 setup 必须**同时**引用两个
installer，只装 socket 面即判问题。作用域按 `readFile` 是否读得到 setup 分档 —— 夹具仓库不建模
setup 是合法的，只有真实仓库模式才要求它存在（否则 4 条既有夹具测试被误拦，实测发生过）。

## 5. 已知边界（不假装已闭合）

- 非 node 子进程仍然能出网。本层做的是**让它可见**（台账 + 出声），不是拦住 —— 拦它需要在
  传输层做（代理/防火墙），那是 CI 基础设施改动，不在本 PR。
- 台账 `readExternalChildLedger()` 目前只有测试读，没有 CI 侧的"必须为空"断言：
  先观察一轮真实数据（哪些命令名会出现）再决定阈值，否则第一版就会把 python/electron 的
  合法子进程判红。
- Electron 宿主下 `process.execPath` 是 electron.exe ⇒ `isNodeCommand` 判 false（除非
  `ELECTRON_RUN_AS_NODE`），存活测试里的 electron 子进程不会被注入。这是有意的：给 electron
  注 `--require` 语义不确定，且 GUI 存活测试的目标本来就要网络。
- `spawn(cmd, opts)` 不带 args 数组的形态：注入会插入一个空 args 数组。这是 Node 合法签名，
  但若有代码依赖"第二个参数必须是 options"就会漂 —— 现有 26 个用 child_process 的测试文件
  在全量里无一变红（见记录里的跑量证据）。

## 6. 复跑

```bash
cd D:/Data/projects/mp-worktrees/mp-fix-test-egress-child-plane
node --test .github/scripts/check-test-egress-guard.test.js
node .github/scripts/check-test-egress-guard.js
cd packages/shared-utils && pnpm exec vitest run src/__tests__/network-egress-guard-child.test.js
cd apps/desktop && pnpm exec vitest run electron        # 全量回归（子进程注入的最大风险面）
```
