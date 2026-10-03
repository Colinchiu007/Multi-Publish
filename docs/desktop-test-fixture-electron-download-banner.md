# 桌面单测里那条 `Downloading Electron binary...` 不是二进制缺失，是夹具在对第三方模块撒谎

关联：**#2794**（归因）、**#2783**（同一串日志的真下载形状）、PR #2793（把 `ensure-electron.js` 接进三个桌面测试作业）。
分支：`fix-electron-dist-banner-attribution`。

## 1. 症状

PR #2793 合并后按执行记录里登记的判据复核 main push run `37053268768`：四个跑桌面 Vitest 的作业
（`QG Unit Tests`、`QG Desktop Shards 1/2`、`2/2`、`QG Coverage`）**每个作业的日志里都还有 1 条**
`Downloading Electron binary...`，且 vitest 每次都把它归到同一个用例名下：

```
stdout | electron/services/asset-generator.test.js > AssetGenerator P0-1: command injection prevention > spawn must use shell: false
Downloading Electron binary...
```

但它与 #2783 那条**不是同一量级**：CI 上它距下一条日志只有 **11ms**，而准备步骤
`[ensure-electron] dist 缺失，执行 install.js` → `已就绪 v43.1.1` 的**真实下载是 4.1s**。
本机复现后是 **1.8 秒整文件跑完、banner 照打** —— 一次网络取用都没有。

## 2. 根因（三件事叠加，缺一不发生）

1. `apps/desktop/test-setup.js` 的 `__registerMock(...)` 通过替换 `Module._load` 拦截 require，
   注册键 `'fs'` 命中的是该 realm 里**每一个** `require('fs')`（`test-setup.js:250-281`，
   内置模块只按精确名匹配 —— 这恰是"刻意 mock 内置模块"能全局生效的原因）。
2. `apps/desktop/vitest.config.js:17` 写着 `deps: { inline: ['electron', 'axios'] }`，
   于是 `node_modules/electron/index.js` 被**内联进同一个 realm**，而不是走 Node 原样 require。
3. `electron/services/asset-generator.test.js` 顶部为了测"文件不存在时的降级"，把
   `existsSync` 注册成 `vi.fn(() => false)` —— 一律 false，不分路径。

三者相遇：`AssetGenerator` 构造时 `this.log = opts.log || require('./logger')`（`asset-generator.js:495`），
第一条 `log.warn` 触发 `logger.js:35` 的 `require('electron')`；此时 `electron/index.js` 里的
`fs.existsSync(pathFile)` 被夹具回答成 `false` ⇒ 走进 `getElectronPath()` 的 `else` 分支 ⇒
`downloadElectron()` 先 `console.log('Downloading Electron binary...')` 再 `spawnSync(... install.js)`。
`child_process` 同样被这个文件 mock 掉了，所以那次 spawn 根本不成立 —— **banner 打了，下载没发生**。
最后 `index.js` 抛出 `Electron failed to install correctly...`，被 `logger.js` 的 `catch` 吞掉，
降级到 `os.tmpdir()/multi-publish-logs`。于是：日志里多一条误导性的"正在下载 Electron"，
而该用例的日志落点也与常态不同 —— 全程没有任何失败信号。

### 实测对照（本机，electron dist 已就绪）

| 跑法 | banner | 说明 |
|---|---|---|
| `node -e "require('./apps/desktop/electron/services/logger.js')"` | 0 次 | 真实 realm，`path.txt`/`dist/electron.exe` 都在 |
| `vitest run electron/services/zz-realm-probe.test.js`（探针，无夹具） | 0 次，`PROBE_SPAWN=[]`，返回值是存在的 exe 路径 | 证明"内联后的 `__dirname` 与 `dist` 都在位" |
| `vitest run electron/services/asset-generator.test.js`（带夹具） | **1 次** | 唯一变量就是那个一律 false 的 `existsSync` |
| 探针 2：只把 `fs.existsSync` 临时改成恒 false，再 `require('electron')` | **1 次** + `spawnSync` 参数指向真实 `install.js` + 抛 `Electron failed to install correctly` | 单变量复现，排除"第二个 electron 副本""Defender 锁文件"等假设 |

## 3. 修复（采纳 QM-6 两路外部评审后定稿）

只做两件事，都不动被测代码：

| 编号 | 落点 | 内容 | 由谁点名 |
|---|---|---|---|
| B1 | `asset-generator.test.js` 夹具 | `fs` 夹具改为**按路径委托**：沙箱前缀改成 `os.tmpdir()` 下带 pid 的独立目录
（原来是硬编码 `/tmp/test`），13 处 `outputDir` 字面量全部引用该常量；判定**按路径段**比；
委托只覆盖 `existsSync` / `readFileSync` 两个读动词（`electron/index.js` 只需要这两个），
`statSync` 保持原固定返回值（换成真读会让"不存在的沙箱外路径"从 `{size:1024}` 变成抛 ENOENT，属额外的语义漂移），
写类动词继续全部空转 | FA W-1/W-2/W-3 + BP Critical#1 |
| B2 | `test-setup.js` | 测试期禁止创建指向 `node_modules/electron/install.js` 的子进程：
`spawnSync/spawn/execFileSync/execSync/fork` 五个动词各包一层，命中即当场抛错并点名 `ensure-electron.js`。
理由：`require('electron')` 的"未备好"分支打的这一行，与"夹具谎报导致的空转"**完全同字**，
靠日志形状区分不了"有日志无下载"和"真下载数秒"，只能锁 spawn 面本身 | BP Critical#2 |

B2 覆盖面如实声明：**只锁 `install.js` 这一条 spawn**，不声称覆盖测试期全部真实出站 ——
那是 #2783 登记、至今未闭合的另一半。

## 4. 反证（9 档全部实跑，判据 = 汇总行 `Tests N failed`，不看退出码）

| 变异 | 落点 | 预期 | 实测 |
|---|---|---|---|
| M-1 `existsSync` 退回 `() => false` | 夹具 | 红 + banner 复现 | 红 3 例（22 通过），banner 复现 |
| M-2 沙箱判据恒真（什么都不委托） | 夹具 | 红 + banner | 红 3 例（22 通过），banner 复现 |
| M-3 沙箱判据恒假（一律委托） | 夹具 | 红（"沙箱内仍须谎报"被抓住） | 红 1 例（24 通过）—— 抓住"沙箱内仍须谎报"那条自证断言 |
| M-4 `writeFileSync` 改为委托真实 fs | 夹具 | 红（写入不落盘断言抓住） | 红 6 例（19 通过）—— 写入不落盘 + 既有降级例一起失守 |
| M-5 前置探针指向不存在的 exe | 锁 3 | 红（证明前置条件不恒真） | 红 1 例（24 通过）—— 前置条件不是恒真 |
| M-6 段界丢失（裸 `startsWith`） | 夹具 | 红（近名目录 `<沙箱>-evil` 被判进沙箱） | 红 1 例（24 通过）—— `<沙箱>-evil` 被误判进沙箱 |
| M-7 前缀未归一化（win32 反斜杠） | 夹具 | 红（沙箱目录本身判不进去） | 红 1 例（24 通过）—— win32 反斜杠前缀判不进沙箱 |
| M-8 守卫正则永不命中 | B2 | 红（守卫变装饰） | 红 2 例（23 通过）—— 守卫变成装饰 |
| M-9 装配循环空转（`if (true) continue`） | B2 | 红（五个动词一个都没包上） | 红 4 例（21 通过）—— 五个动词一个都没包上 |

驱动与被写判据自身的三次真实事故，都记在这里，因为它们各自伪装成过一次"结论"：

① **驱动 v1 一次都没跑起来却报了五档结论**：它用 `execFileSync('pnpm', …)`，本机 spawn 直接 ENOENT，
于是五档全部报 `failed=0` —— 读起来像"变异没被抓住"，实际是"测试根本没执行"。
v2 起改为 `node <abs>/vitest.mjs`，并在解析不到汇总行时抛 `PROBE_UNPARSED`，不允许探针故障冒充结论。

② **判据抄错落在了产品代码里**：`test-setup.js` 的守卫正则被我写成 `install\\.js`（两个反斜杠 = 匹配一个字面
反斜杠），永不匹配 `install.js`。抓住它的正是新写的守卫用例自己（2 例红：`expected [Function] to throw an error`）。
口径：**判据本身要先在本机 node 里单独跑一遍**（拿 win/posix 两种真实路径 + 两条"不得误伤"的反例喂进去），
再交给测试；本项目这条已固化为 `node D:/tmp/...` 之外的一次性自证脚本，写进了驱动的 needle 取法——
v4 起所有"整行 needle"一律从实测文件里取（`lineOf()`），不再手抄反斜杠。

③ **反证驱动不得与全量测试并发，且被强杀后必须回读文件**：驱动按档改写夹具与 `test-setup.js`，
本轮它与一轮 423 文件的全量测试撞在一起 —— 那一轮出现的 3 个红全部落在驱动窗口内（含两个与本改动无关的文件），
整轮作废重跑。更要命的是驱动被强杀时 `finally` 没执行，M-2 的 `return true` 残留在了夹具里，
是"再跑一次那两个文件"（25/25 绿）把它暴露出来的。所以杀掉任何会改文件的驱动后，
**必须先按指纹回读文件（查残留标记），再跑测试**。

## 5. 边界（不假装已闭合）

- 本次只修**被实测点名的那一个文件**的夹具。全仓另有若干处以同样"一律 false"口径 mock `fs` 的测试文件，
  同理都会对同 realm 的第三方模块撒谎；把它们收敛成 `test-setup.js` 的通用夹具契约是全局变更，另案处理。
- **没有**新增"CI 日志里不得出现 `Downloading Electron binary`"这种按字符串的门禁：这条串现在已知可由
  *任何* blanket `fs` 夹具触发，做成硬门禁会把"测试夹具在撒谎"伪装成"装配没备好二进制"，
  与 #2793 那条锁的语义相反。正确判据仍是「按 `##[group]` 步骤段归因，测试段内命中数为 0」，
  见 `docs/ci-electron-binary-prepare-before-desktop-vitest.md` §5-§6。
- **测试期零真实出站的通用哨兵仍未做**（#2783 的另一半，两轮评审判 Critical）。
  B2 只把 `electron/install.js` 这一条 spawn 变成响亮失败，不是通用 egress 守卫。
- `logger.js` 的 `catch` 仍然静默（评审 A3 建议加一行 warn）。同意拆开：那是运行时代码，
  会把一个测试夹具 PR 拖进 QM-1 打包验证面。
## 6. 重跑取证

```bash
node scripts/ensure-electron.js                      # 先确保 dist 就绪，否则下面第 2 行读起来像"缺二进制"
cd apps/desktop
pnpm exec vitest run electron/services/asset-generator.test.js 2>&1 | grep -c "Downloading Electron binary"   # 期望 0
# 单变量复现：临时把 fs.existsSync 改成恒 false 再 require('electron')，banner 必然出现（本机 1.8s 一轮）
```
