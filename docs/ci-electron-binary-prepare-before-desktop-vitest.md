---
title: 跑桌面测试的 CI 作业必须先备好 Electron 二进制，否则随机用例超时会伪装成被测缺陷（#2783）
date: 2026-10-03
status: 已实现，待 PR 合并
issue: https://github.com/Colinchiu007/mulpub/issues/2783
---

# 1. 症状

main 上偶发一条红（run `37021470435`，main @ `ae6512d1`）：

```
× electron/services/story2video-stages.test.js > story2video 资源索引契约
  > 任一 scene 的图片或音频失败时默认阻断，不能生成错位清单  15700ms
  → Test timed out in 10000ms.
```

三条特征都指向"不是被测逻辑"：

1. 同一次运行里同文件的邻居用例全在 **3–14ms**，只有它跑到 15700ms；
2. 它的 15.7s 窗口内（14:42:27 与 14:42:32），**它名下的 stdout** 打出两次 `Downloading Electron binary...`；
3. 本机重跑该文件 3 次全绿，之后三次 main 的同一门禁也全绿 ⇒ 单发、不可稳定复现。

## 1b. 本地将 A/B 跑成了对照（不是推断）

把本 worktree 的 `node_modules/electron/{dist,path.txt}` 改名（等价于 CI 里 `pnpm install` 之后的状态），
再跑同一个文件，然后恢复：

| 状态 | `Downloading Electron binary...` 条数 | 该用例归属 | 该用例耗时 | 文件总耗时 |
|------|-------------------------------------------|--------------|------------|------------|
| dist 在位（对照） | **0** | —— | **15ms** | 12.55s |
| dist 摘掉（复现） | 1 | `stdout | …story2video-stages.test.js > story2video 资源索引契约 > 任一 scene 的图片或音频失败时默认阻断…` | **1476ms** | 18.20s |
| CI 冷缓存（原事故） | 2 | 同一条用例名下 | **15700ms** | —— |

下载被归到**同一条用例**名下，这件事在本地可重复地发生 —— 于是"只是时间邻近"这条反论被排除了。
本机 1476ms 与 CI 15700ms 的差就是 `@electron/get` 本地缓存的有无；两者之间没有第二种机制需要引入。
仍未下钻的一点：为什么恰好是这一条用例（它是该文件里第一个把媒体根目录校验走满的？未证），
以及 CI 上为何是**两条**下载日志而本机只有 1 条（疑与第二次触发或另一进程有关，未定位）。
这两点不影响修复的正确性，但意味着"谁付账"仍是偶然事件 —— 所以本 PR 修的是**作业装配**，不是那条用例。

# 2. 根因：作业装配缺口 + 一处**惰性** require

`electron@43` 没有 `postinstall`，`pnpm install --frozen-lockfile` 之后 `node_modules/electron` 只有 npm 壳、没有 `dist`。
此时 `require('electron')` 会执行 `node_modules/electron/index.js`：

```js
function downloadElectron() {
  console.log('Downloading Electron binary...');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'install.js')], { stdio: 'inherit' });
```

- **同步**：它阻塞在 `require` 里，谁触发谁付时间；
- **`stdio:'inherit'`**：子进程输出并进父进程 stdout，而 vitest 按"当前正在跑的用例"归属 stdout ⇒ 下载看起来是**那条用例**干的。

触发点不是猜的，本仓有确切的惰性调用：
`apps/desktop/electron/services/story2video-paths.js:38` 在 `getElectronMediaRoots()` **函数体内**
`require('electron')`（外层还包着 `try { … } catch { /* 纯 Node 测试 */ }`），
由同文件 `getAllowedMediaRoots()`（`:54`）无注入调用 —— 而 `story2video-stages` 的资源生成/校验路径正是它的使用者。
所以这笔下载发生在**用例执行期内**，不是文件导入期；`test-setup.js` 的 electron mock 是 **opt-in**
（`__enableElectronMock()` 才拦 `Module._load`），没开 mock 的调用点就落到真实模块上。

`quality-gate.yml` 里会跑桌面测试入口的三个作业都没有准备步骤：

| 作业 | 真正要二进制的步骤 |
|------|--------------------|
| `coverage` | Gate 5 `pnpm --filter @multi-publish/desktop test:coverage` |
| `desktop-shards` | `Desktop tests shard …`（`--shard=`） |
| `unit-tests` | **Gate 4b `test:startup`**（Gate 4 本体 `--exclude=@multi-publish/desktop`，不含桌面） |

同仓另两条工作流早就为同一个坑各付过一次钱：`build.yml:134` 的 `Ensure Electron binary`，
`electron-ci.yml:118` 的 `node node_modules/electron/install.js`。只是从未接到 quality-gate 上。

# 3. 修法

| 位置 | 做了什么 |
|------|----------|
| `.github/workflows/quality-gate.yml` | 三个作业在 `Install deps` 之后各插一步 `Ensure Electron binary`（`node scripts/ensure-electron.js`，复用既有脚本，不新写下载逻辑） |
| `.github/scripts/workflow-contract.test.js` | 末尾加一条结构锁，三条口径由 QM-6 外部评审的 Critical 逼出来：① 准备步骤必须**整条命令就是**该脚本；② 该步不得带 `if:` / `continue-on-error` / `ELECTRON_SKIP_BINARY_DOWNLOAD`（`ensure-electron.js:35` 见后者直接 `exit 0`）；③ "哪些作业算跑桌面测试"由**步骤内容**自动收集，再与预期清单 `deepEqual` |

`scripts/ensure-electron.js` 本身 fail closed：`dist/<exe>`、`dist/version`、`path.txt` 齐备才跳过，
`install.js` 非零退出或跑完仍不完整 ⇒ 非零退出码。所以"备失败"红在**这一步**，而不是变成下一条随机用例的超时。

# 4. 每条判据的独占红出口（6 个变异全部实跑）

结构锁最容易写成"源码里出现过某个字符串"。判据 = `rc≠0 ∧ ℹ fail N>0 ∧ 失败的测试名命中 ∧ 断言消息命中`
（十条变异打的都是同一条用例，只匹配名字的话，"红错了原因"会被读成反证成功）；每轮还原后 sha256 与原件逐字节相同。

| 变异 | 打的是哪一条判据 | 结果 |
|------|------------------|------|
| M-1 摘掉 `coverage` 的准备步骤 | 必须**恰好有一步** | 红 ✓ |
| M-2 把 `unit-tests` 的准备步骤挪到它的测试步骤之后 | 必须排在首个桌面测试步骤之前 | 红 ✓ |
| M-3 `desktop-shards` 作业改名 | 清单由**内容**收集 + `deepEqual` | 红 ✓ |
| M-4 准备步骤换成 `run: echo "see node_modules/electron/install.js"` | **整条命令**匹配（首版按"正文出现过字样"匹配，这条会**假绿**） | 红 ✓ |
| M-5 准备步骤加 `continue-on-error: true` | 准备步骤不得容错 | 红 ✓ |
| M-6 准备步骤塞**步骤级** `ELECTRON_SKIP_BINARY_DOWNLOAD=1` | 步骤级 env 不得设 SKIP | 红 ✓ |
| M-7 把同一个 SKIP 变量挪到**作业级** `env:` | 判据必须查步骤/作业/workflow 三层（首版只查步骤级 ⇒ 这条今天能绕过） | 红 ✓ |
| M-8 给 `Install deps` 加 `continue-on-error: true` | 依赖链不得容错（装失败还往下跑 = dist 与 npm 壳同时缺失） | 红 ✓ |
| M-9 把 `scripts/ensure-electron.js` 掏成 `process.exit(0)` | 锁必须验脚本本体，否则只是在验"调用过一个 no-op" | 红 ✓ |
| M-10 往 `apps/desktop/tests/e2e` 里引入 `require('electron')` | 豁免必须是**可判定前提**，不是注释 | 红 ✓ |

M-4 与 M-7 否证的都是**我第一版锁自己**：前者被一个 echo 步骤糊住，后者被一个作业级 env 糊住 ——
两条都由 QM-6 外部评审各自命中（评审原文见执行记录），锁在、保护为零。
M-9/M-10 是同一思路的延伸：一条结构锁如果只验"调用过某脚本 / 某作业在豁免名单里"，
那它验的就不是效果，而是意图。

# 5. 边界与遗留（不假装已闭合）

- **因果链证明到了哪一步**：机制（`electron/index.js` 源码）、归属（vitest 按运行中用例归 stdout）、
  触发点（`story2video-paths.js:38` 的函数内 require）都是读源码得到的；
  但**没有** fix 前后同一用例的 A/B 对照（合并前拿不到），而且那窗口里出现的是**两条**下载日志、
  不是我以为会是一次 —— 这一点本 PR 没有解释（`getElectronPath()` 每次 require 都可能触发，
  但模块缓存本该让第二次不再执行；两次说明还有第二个进程或第二次触发路径，未定位）。
  合并后的取证动作：对下一次 main 的 Gate 5 日志跑
  `gh run view <id> --log | grep -c "Downloading Electron binary"`，期望 0；若非 0，本 PR 的因果叙事即被否证，须重开。
- 本 PR 把"测试执行期内被动下载"换成"准备步骤主动下载"，**没有**给"测试期零真实出站"补哨兵：
  现有 `network-egress-guard` 拦的是 `net.Socket.prototype.connect`，而这里是 `spawnSync` 起**另一个 node 进程**，
  根本不走那条路。这是同一失效面的另一半，留作独立事项（QM-6 评审判为 Critical，处置见执行记录）。
- 三个作业各多一次二进制就绪检查：已就绪时是三次 `existsSync`；CI 上是每作业一次下载。
  这是把"随机超时"换成"确定性成本"的自觉交易，代价如实写出。
- 被测的 story2video 逻辑一行未改，本 PR 不声称"修好了 story2video"。

# 6. 怎么重跑这条取证

```bash
node scripts/ensure-electron.js                    # 本地已就绪 ⇒ "electron dist 已就绪，跳过"
node --test .github/scripts/workflow-contract.test.js
unset HTTPS_PROXY; gh run view 37021470435 --repo Colinchiu007/mulpub --log-failed   # 一手症状
```
