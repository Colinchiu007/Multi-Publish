---
title: 暂存的 remotion 运行时闭包不得把同名不同版本摊平进同一目录（#2778）
date: 2026-10-02
status: 已实现，待 PR 合并
issue: https://github.com/Colinchiu007/mulpub/issues/2778
---

# 1. 现象

打包应用里任何走 `remotion` CLI 的动作（Story2Video 出片）在 **require 期**即崩：

```
win-unpacked\resources\packages\remotion-composer\node_modules\react-dom\cjs\react-dom.development.js:994
var ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher;
TypeError: Cannot read properties of undefined (reading 'ReactCurrentDispatcher')
```

# 2. 根因：暂存器把"同名不同版本"摊平到同一个目标目录

`apps/desktop/scripts/stage-remotion-runtime.js` 递归收集 `packages/remotion-composer` 的运行时依赖闭包，
然后**逐包** `cpSync(该包目录, outputDir/<包名>, { recursive: true, dereference: true })`。

问题在于闭包里有**同名不同版本**的包（真实 pnpm 布局靠嵌套区分，摊平后就撞在同一个目录）：
修复前实测 224 条记录里有 9 个 name 出现多次 —— `react` 19.3.0/18.3.1、`react-dom` 19.3.0/18.3.1、
`scheduler`、`source-map`、`semver`、`estraverse`、`@jridgewell/sourcemap-codec` 等。

两次 `cpSync` 写同一个目录的后果是**两层**，都要看见：

1. `package.json` 与同名文件互相覆盖 ⇒ 顶层 `react-dom` 的 `package.json` 是 18.3.1，
   但 `cjs/*` 可能是另一版本写进来的；
2. 每次拷贝**连带该包自有的 `node_modules/` 一起进去** ⇒ 留下
   `node_modules/react-dom/node_modules/react = 19.3.0` 这份**优先命中**的嵌套副本，
   于是 `react-dom@18` 拿到 `react@19` 的导出（React 19 已改掉 `__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED`）。

# 3. 修法

| 位置 | 做了什么 |
|------|----------|
| `collectRuntimePackages()` | 两阶段：先照常收全（**依赖照常展开**），再筛掉"落在任一被拷贝包目录之内"的记录 —— 那份已由父包整目录携带，不该再占一个顶层落点 |
| `isInsideDirectory()` | 按 `path.relative` 判包含，不按字符串前缀（否则 `pkg` 会误判包含 `pkg-evil`，那个包会**从闭包里凭空消失**） |
| `stageRemotionRuntime()` | 拷贝前先证"**一个目标目录只有一个源**"，两个源抢同一个目录直接抛错并点名两边；不再"后拷静默覆盖前拷"。**claim key 按大小写折叠**：打包机是 Windows，`Foo` 与 `foo` 是两个字符串 key 却指向同一个物理目录，只按字符串比会让本次缺陷换个马甲通过自己的抛错（QM-6 外部评审 Q2） |
| `verifyStagedClosure()` | 拷完自证三条：① 每个落点的 `package.json` 必须与源逐字节相同；② 落点里 `node_modules/` 的直接子项集合必须等于源里的（多出不来 ⇒ 红，少了也 ⇒ 红）；③ 每个被拷贝包的每条**非 optional** 运行时依赖边，都必须能在暂存树内解析到（解析域严格限制在 `outputDir` 之内，不得往上摸宿主仓库的 `node_modules`）。`beforePack` 因此会在**打包时**炸，而不是留给用户点一次合成 |

两条容易做错的取舍，写在代码注释里也写在这里：

- **判据必须是"是否在任一被拷贝包目录内"，不是"是否是父包的直接嵌套"。** 实测本仓 `estraverse` 会以
  `node_modules/webpack/node_modules/estraverse` 的身份被记成顶层包 —— 那是**祖父级**的嵌套，
  只比父包目录会漏，漏下来就是两个版本抢同一个顶层目录。
- **"跳过记录"绝不等于"跳过展开依赖"。** 被携带的包仍可能把只能从根解析的依赖带出来；
  跳过展开会让产物**少包**，症状是运行期 `MODULE_NOT_FOUND` —— 比错版本更难查，所以先筛记录、后照常展开。

# 4. 实测（改前 / 改后，同一台机器、同一条命令）

| 口径 | 改前 | 改后 |
|------|------|------|
| 顶层包记录 | 224（9 个 name 重复） | **188（name 全唯一）** |
| `react-dom/node_modules/react` | **19.3.0（优先命中）** | 不存在（该目录下只剩它自己的 `scheduler`） |
| `remotion/node_modules/react-dom` | 被顶层摊平抢掉 | **19.3.0 带自己的嵌套 react**（与仓库布局一致） |
| 打包态 `remotion bundle src/index.tsx` | `rc=1`，崩在 `react-dom.development.js:994` | **`rc=0`**，产物落 `build/`，无需任何手工干预 |
| 打包态真实出片（3 帧 `Explainer`，捆绑 ffmpeg + 捆绑 ffprobe 解码） | 无法进行（崩在 require 期） | **`rc=0`，43.3 kB mp4，ffprobe 解出 duration=0.149333 / format=mov,mp4,m4a**（浏览器宿主用本机 Edge，非打包内置） |
| 松散树文件数 | 13531 | 12053（少掉的是重复顶层拷贝） |
| 对**最终产物**重放 `verifyStagedClosure` | 无从重放（改前没有该判据） | **暂存目录与 `win-unpacked` 产物双双通过：包=188、依赖边=297、重名=0** |
| `#2765` 两维产物门禁 | 0 / 0 | **0 / 0**（未回退；asar 14754 条目、松散 12053 文件） |

出片命令（可重跑）：

```bash
cd apps/desktop && pnpm run build:dir
cd dist-electron/win-unpacked/resources/packages/remotion-composer
node node_modules/@remotion/cli/remotion-cli.js render src/index.tsx Explainer D:/tmp/out.mp4 \
  --frames=0-2 --browser-executable="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" \
  --ffmpeg=../../media-tools/ffmpeg.exe --concurrency=1
../../media-tools/ffprobe.exe -show_entries format=duration,format_name out.mp4
```

# 5. 回归锁与反证

`apps/desktop/scripts/stage-remotion-runtime.test.js` 5 例 → **19 例**（Gate 2b 已点名该文件，无需新接线）：

- 嵌套覆盖不得再占顶层落点，但其依赖仍要被展开（跳过记录≠跳过展开）
- composer 自己 `node_modules/` 里的包必须照常记录（它不是"被拷贝的父包"）
- 两个源抢同一目标目录 ⇒ 抛错且点名两边
- `verifyStagedClosure` 三个方向都红：多出源里没有的 nested / 少了源里有的 nested / **①② 恒成立时逐边判据必须自己响**
- `isInsideDirectory` 的 `pkg` vs `pkg-evil` 负控
- 解析起点落在 `outputDir` 之外 ⇒ 一步都不许往上走（`exists` 由注入提供，不依赖"这台机器装没装 react"）
- 剪枝判据命中**目录**时必须抛错 —— 剪掉一个目录等于连带删掉整棵子树，而判据② 只比 `node_modules` 的直接子项，
  看不见深度 ≥2 的丢失（QM-6 外部评审 Q1）；**stat 失败也一律抛错**，不得默认"是文件"剪掉 ——
  `ENOTDIR` 恰恰是"这一层是目录"最真实的报错（自审在采纳评审 Q1 时的补强）
- 落点唯一性的 claim key 必须按**大小写折叠**比 —— Windows 打包机上 `Foo`/`foo` 是两个字符串 key、同一个物理目录，
  只按字符串比，本次缺陷换个马甲就能绕过自己的抛错（QM-6 外部评审 Q2）
- 判据② 的 nested 列举必须尊重注入的 `exists`，否则这条只剩"真磁盘"一种测法，注入接缝是装饰（QM-6 附带发现）
- **真实闭包不变量**（不拷贝、只解析）：name 唯一、**按大小写折叠后仍唯一**（Windows 上 `Foo`/`foo` 是同一个物理目录）、
  两两不互相包含、顶层 `react-dom` 必须等于仓库解析命中的那份，
  并带"记录数 > 100"的规模下界 —— 解析退化成空集合时不许报"没有重复"

反证 11 条全部实跑变红（F-1…F-11，判据 = `rc≠0 ∧ ℹ fail N>0 ∧ 失败的测试名命中预期`，还原后按 sha256 校验与原字节逐字节相同）。
三条夹具自纠都记在这里，因为它们错在**探针**而不是锁：

- harness 第一版五条全部 `ANCHOR_MISS` —— 检出后工作区是 CRLF 而锚点写的是 `\n`，即**探针没打中目标变量**，
  不是锁抓不住；改为按文件实际行尾构造锚点后全红。
- F-6（摘掉判据③的调用点）第一版报 `NOT_RED`，原因不是"③无效"而是**没有任何用例能从 ③ 出口红**：
  唯一的删除型夹具里 ②（"少了源里有的 nested"）恒先于 ③ 触发，而我当时把断言放宽成了 `/a → b/`，
  两条判据共用一个出口 ⇒ ③ 是装饰。补了一条"①② 在该夹具里恒成立、只有 ③ 能拦"的专用用例后 F-6 变红。
  同一轮又发现 F-7（摘掉边界守卫）在原夹具下同样不可见 —— 起点在树内时循环本就会在 `dir === boundary` 处收口，
  于是补了"起点在树外 + 注入的 `exists` 只在宿主路径命中"这一格。**判据：一条新判据必须有一个只属于它的红出口。**
- F-8 第一版报 `WRONG_CAUSE`：红的正是我预期的那条用例，但 `expectFail` 写的是**错误文案**（`命中了一个目录`），
  而 harness 匹配的是**测试名**（`剪枝判据命中目录时必须抛错…`）。反证的期望必须与它的匹配对象同域。

同一次评审还带来两条已被采纳的最小判据（不是重构）：**剪枝 filter 命中目录即抛错**（Q1 的现实形状 ——
`cpSync` 的 filter 对目录同样调用，静默剪掉一个目录会让整棵子树消失，而判据② 只看 `node_modules` 直接子项，
深度 ≥2 的丢失对自证不可见），以及 **`readNestedNames` 尊重注入的 `exists`**（附带发现：注入接缝原本对 ② 是装饰）。
评审 Q2（`Foo`/`foo` 在大小写不敏感 FS 上撞同一个物理目录）落成一条**按实测的锁**而不是运行期平台嗅探 ——
真实闭包 188 条里按大小写折叠后仍唯一，出现即红。评审 Q3（抛错留下半棵树）经核实**前提不成立**：
`.remotion-runtime/node_modules` 的唯一消费者是 `apps/desktop/package.json:192` 的 `extraResources`，
它在 `beforePack` 抛错时根本不会被读到（打包 `rc≠0` ⇒ 无产物），全仓也没有任何 `existsSync(outputDir)` 型读者。

# 6. 边界与遗留

- 本修法**只保证"落点与源逐目录一致"**，不重新设计暂存布局。产物里仍带 `webpack/node_modules/**` 这类嵌套副本
  —— 这与仓库 dev 布局一致，也正是运行期能按 Node 语义解析的原因。
- 打包态真实出片这次跑通了，但它**只覆盖 `Explainer` 这一条 composition 与 3 帧**。
  其余 composition、音频链路、以及"CI 上真出片"仍无人验过（CI 的 `package-relevant` 步骤不跑 render）。
- 与 #2765 同源的风险仍在：`extraResources` 的另一条通道（`../../packages/remotion-composer`、`../../config`）
  由 `#2779` 的 filter + `--resources` 实证维度守住，两者互不覆盖。
