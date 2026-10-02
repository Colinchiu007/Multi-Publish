---
title: app.asar 之外的松散文件树不再随包发单元测试（#2765）
date: 2026-10-02
status: 已实现，待 PR 合并
issue: https://github.com/Colinchiu007/mulpub/issues/2765
---

# 1. 现象

#2736 关闭 #2702 时把 `apps/desktop/package.json` 的 `build.files` 排除补齐，`app.asar` 内的单元测试条目实测归零。
但同一份打包产物里还有**第二棵 `app.asar` 之外的松散文件树**，当时没有任何判据看过它。

`build.extraResources` 里有两类"整目录往外拷"的通道：

| 通道 | 条目 | 内容来源 |
|------|------|----------|
| A 仓库树直拷 | `{ from: "../../packages/remotion-composer", to: "packages/remotion-composer" }` | 源码目录本身 |
| A 仓库树直拷 | `{ from: "../../config", to: "config" }` | 配置目录本身 |
| B 暂存目录 | `{ from: ".remotion-runtime/node_modules", to: "packages/remotion-composer/node_modules" }` | `scripts/stage-remotion-runtime.js` 在 beforePack 里递归收集的运行时依赖闭包 |

通道 B 的收集器按"包名 + 版本"把依赖闭包逐个 `cpSync` 进暂存目录，**测试文件与被测文件同目录**是本仓约定，
于是 workspace 包（`@multi-publish/story2video-engine` 等）的 `tests/*.test.ts` 被原样带进产物。

## 实测（同一判据、同一台机器、三个**改动之前**由其他会话打出的真实产物）

| 产物 | 松散文件总数 | 其中 `*.test.{js,mjs,cjs,ts,tsx}` |
|------|-------------|--------------------------------|
| `mp-fix-auth-partition-content-select` | 13720 | **189** |
| `mp-publish-frequency-control` | 13720 | **189** |
| `mp-governor-quota-reserve` | 13710 | **179** |
| 本改动后的产物 | 13531 | **0** |

样例（改前）：

```
packages/remotion-composer/node_modules/@multi-publish/story2video-engine/tests/effects-and-degradation.test.ts
packages/remotion-composer/node_modules/@multi-publish/story2video-engine/tests/subtitle-aligner-parity.test.ts
```

# 2. 为什么这是"发出去"而不是"留在仓库里"

这些 `.ts` 测试文件里含引擎内部接口形状、mock 出来的平台/服务端口与错误码字符串。
以松散文件形态进安装包，用户侧**连解包都不需要**就能读到。体积（约 1.3 MB）是次要的。

# 3. 修法（四处，缺一不可）

## 3.1 判据只留一份

`packages/shared-utils/src/artifact-test-pattern.js`（新建）导出
`TEST_FILE_RE` / `TEST_EXCLUSION_PATTERNS` / `isTestArtifactPath` / `normalizePathSeparators`。

> 命名踩坑记录：这份文件最初叫 `test-artifact-pattern.js`，被 `.gitignore` 的 `test-*.js`（未锚定目录）
> 静默排除 ⇒ 本地全绿、git 里根本没有它。判据与补锁见 §7 第一条。
门禁（`.github/scripts/check-asar-test-files.js`）与暂存器（`apps/desktop/scripts/stage-remotion-runtime.js`）
都从这里取，并由 `check-asar-test-files.test.js` 的一条锁断言**两侧拿到的是同一个函数对象**
（不是"两处字面量恰好相同" —— 字面量相同会在下一次单边改动时静默漂移）。

`normalizePathSeparators` 存在的原因是实测：`@electron/asar` 的 `listPackage()` 在 Windows 上返回
`\electron\a.test.js` 这种反斜杠形状，而 `cpSync` 的 filter 收到的是原生路径。

## 3.2 通道 B 在暂存点剪枝（唯一的结构性收口）

`stageRemotionRuntime()` 给 `cpSync` 挂了 `filter: testArtifactFilter`，被剪掉的数量随返回值一起出来
（`prunedTestFiles`，本 worktree 实测 **186**）。
剪枝点选在暂存器而不是 electron-builder 的 `filter`：后者那条 extraResources 条目**本来就没有 filter**，
且暂存器还服务本地打包（`before-pack.js` 同时被 CI 与 `pnpm run build:dir` 调用）。

注入点保持原契约 —— 调用方传进来的 `copy` 一样会收到 `filter`，否则回归锁测的是"包装层"而不是真行为
（该用例见 `apps/desktop/scripts/stage-remotion-runtime.test.js` 的"过滤判据只作用于源"）。

## 3.3 通道 A 在声明里加 filter

两条 `from` 以 `../` 开头的 extraResources 条目各加 5 条 `!**/*.test.{js,mjs,cjs,ts,tsx}`。

## 3.4 门禁扩一个 `--resources` 模式，并把接线锁从 1 个产物维度扩到 2 个

- `checkLooseResources(dir)` → `walkLooseFiles(dir)` 递归扫松散树（不跟符号链接），复用同一条判据。
- 松散树扫描对**符号链接**的口径是"按名字计入清单、但绝不对链接路径调 readdir"：
  跟随会把树外的内容算成产物（越界），而整条跳过会让一个名叫 `x.test.js` 的链接**从判据里消失**（假绿）。
  两侧都不是我们要的，所以取"计入不展开"。该形状由 QM-6 外部评审提出，锁在
  `check-asar-test-files.test.js` 的「符号链接『按名字计入但绝不跟随』」，反证为 CP-L。
- 判据域内还实测过非 ASCII 路径、超深嵌套与文件名含 `#` 三种形状（真 tmpdir 自建夹具精确断言，
  见「真目录实证」那条），因为剥注释的那套判据与 `#` 出现在文件名里是天然冲突点。
- 空清单 / 目录不存在 / 不是目录 ⇒ 一律不判通过（`unverifiable` 或抛错）。
  "读不到产物"不等于"产物干净"，这条与 `--asar` 模式同口径。
- `checkWiring` 现在要求 `build.yml` 里**同时**存在跑了 `--asar` 与 `--resources` 的两个步骤，
  且各自所在步骤的 `if:` 必须与打包步骤逐字相同、`shell: bash` 必须显式声明（同一个 run 块里多条命令
  在 PowerShell 下不 fail-fast，见 `scripts/check-step-failfast.js`）。
  判据按 YAML 列表项切步骤块，**注释行直接丢弃** —— "把调用注释掉、字面留在文件里"这类假接线在
  `packagingStepWhy` 这一层就被挡住，不只依赖上游剥注释。
- 命令行本身也是一条假绿路径，所以 `parseCliArgs` 严格化：未知开关 / 缺取值 / 多余位置参数 / 同一开关重复 —— 四种漂移一律 rc=1。
  旧写法 `arg('--resources')` 在漏填写值时返回 `undefined`，于是**静默退回 config 模式并打印 OK**；
  而 `if (asarPath) { …; return }` 在前置短路，会把"有人把两条命令并成一条调用"变成"第二维根本没跑还返回 0"。
  现在两维各自成函数、同时给了就都跑，返回值取"任一维失败即失败"。
  锁：「parseCliArgs：四种漂移一律当场红」「main：--resources 漏填写值时不得退回 config 模式报 OK」「main：同时给 --asar 与 --resources 时两维都必须跑」；
  反证 CP-M（退回前置短路）与 CP-N（缺值当成没给）。

# 4. 运行期不消费测试文件：证据与它的边界

issue 建议"跑一次真实短视频合成"。实际做到的是**比单次合成覆盖面更大**的一层：

1. **webpack 全图**。在产物内部（`win-unpacked/resources/packages/remotion-composer`）用临时副本跑
   真实的 `remotion bundle src/index.tsx`（Remotion 打包渲染端整条 import 图，不需要浏览器 ⇒ 可离线）：
   `rc=0`，产物 39 个文件，**文件名含 `.test.` 的 0 个，产物 JS 里指向 `.test.` 模块的路径串 0 个**。
   单次合成只走它那一帧那条路径，全图反而更强；但全图**不覆盖** Node 侧 `require` 的动态路径，
   所以补第 2 条。
2. **静态引用扫描**。对 `win-unpacked/resources` 全树 11631 个可读的 `.js/.cjs/.mjs/.json/.ts/.tsx` 文件
   扫 `require('…test.js')` / `from '…test.ts'` 形态：**0 处命中**。
3. **QM-1 冒烟**。打包产物起 12 秒仍存活，`stderr` 无 AGENTS.md 列出的禁用特征
   （`Failed to load platform config` / `ENOTDIR.*app.asar` / `Cannot find module` / `Uncaught Exception` /
   渲染进程崩溃）。隔离 userData 目录（空档案 ⇒ stderr 出现"许可证权限不足"属预期，与本改动无关）。
4. **没有过排（与"排掉了"对称的另一半证据）**。只证明"测试文件没了"不够 —— 还得证明"该留下的留下了"：
   `packages/remotion-composer/src` 仓库侧 40 个文件、产物侧 37 个，**差的正好是 `src/__tests__/` 那 3 个 `.test.ts`**；
   产物 `src/` 直接子项 13 个文件 + 2 个目录（`cinematic`、`components`）全部在位，`config/config.yaml`、`config/platforms.yaml` 在位，
   `@multi-publish/story2video-engine/tests/` 只剩 `fixtures` 目录（不是整目录消失）。

**没有做**的一次真实 mp4 合成：被一个**先于本改动存在**的缺陷挡住了，见 §5。

# 5. 途中撞到的既存缺陷（不属于本 PR，已另开单 #2778）

暂存器把"同名不同版本"的包**摊平到同一个目标目录**：
`collectRuntimePackages()` 返回 224 个包，其中 9 个名字出现多次
（`react` 19.3.0 / 18.3.1、`react-dom` 19.3.0 / 18.3.1、`scheduler`、`source-map`、`semver`、`estraverse` 等）。
`cpSync` 把每个包的**整个目录**（含其自有 `node_modules/`）拷进 `outputDir/<name>`，于是留下

```
resources/packages/remotion-composer/node_modules/react-dom/node_modules/react  = 19.3.0
resources/packages/remotion-composer/node_modules/react                          = 18.3.1
```

Node 解析时嵌套那份**优先命中**，`react-dom@18` 拿到 `react@19` 的导出（无 `__SECRET_INTERNALS_…`）
⇒ 打包态 `remotion bundle` 在 `react-dom.development.js:994` 抛
`TypeError: Cannot read properties of undefined (reading 'ReactCurrentDispatcher')`。

归属判据（不是"看着像既有问题"）：
- 三个**改动之前**由其他会话打出的产物同样带 `react-dom/node_modules/react = 19.3.0`，
  同一条 bundle 命令在其中同样 `rc=1`、同一个错误行；
- 在**临时副本**里只删掉那一个嵌套目录、不碰任何测试文件相关物，`bundle` 立刻 `rc=0`。
  （删除动作只发生在自有副本，真实产物目录全程只读。）

⇒ 该崩溃与本改动**无因果关系**，但它意味着打包应用的 Story2Video 渲染链路可能长期起不来，
严重度高于本 PR 所修的问题，故单独开 issue 并给出复现命令。

# 6. 刻意不做的范围

- **第三方包自带的 `test/` 目录**（产物里实测 142 个，如 `minimist/test/*.js`）。
  它们不是本仓的单元测试，且某些 npm 包的 `main`/`bin` 会指向自己 `test/` 下的文件，
  按目录整排排除等于赌"没有一个上游包这么写"。要收这个口径得单独量，别夹在本 PR 里。
- **`*.node-test.cjs` 这类变体命名**：判据域里实测**产物中 0 个**（该命名只出现在
  `apps/desktop/electron/tests/`，已由 #2736 的按目录排除覆盖），所以本 PR 不为它新增形态规则。
  若将来出现，`checkNamingCensus` 的"命名反查"会在**出现当天**变红（它拿仓库真实文件集合反推白名单是否够用）。
- **`--resources` 不判 `app.asar` 内部**：asar 由 `--asar` 那条负责，两维互相看不见对方是设计而非漏洞
  （`checkWiring` 因此要求两步都在）。

# 7. 维护 SOP

- **判据文件名不得以 `test-` 开头**：`.gitignore` 里 `test-*.js`（"Test artifacts" 段）**没有锚定目录**，
  会静默吞掉任何目录下叫 `test-*.js` 的文件。本判据最初命名成 `test-artifact-pattern.js` 就中了这一枪 ——
  症状是**本地全绿、CI 上 `MODULE_NOT_FOUND`**（本地文件真实存在，git 里却根本没有它）。
  既有锁 `apps/desktop/electron/tests/e2e-quality-infrastructure.test.js`「源代码测试文件不得被 .gitignore 静默排除」
  的域只有 `**/*.test.js`，对**非测试**源文件失明。因此本 PR 补了一道按"判据链"划域的锁
  （`check-asar-test-files.test.js` 的「判据链上的源文件不得被 .gitignore 静默吞掉」），
  并带一条**负控**（两个真实被忽略的路径必须仍被探针认出）—— 否则"0 命中"可能只是探针坏了。
  反证 CP-K 实测：把探针改成恒 `false` ⇒ 该锁当场红。
- 新增**任何** `extraResources` 条目，如果它的 `from` 以 `../` 开头（=从仓库树拷），必须带上
  全部 5 条 `!**/*.test.*` filter，否则 `node .github/scripts/check-asar-test-files.js`（`--config` 模式）当场红。
  判据**不维护"哪些条目需要 filter"的手工清单** —— 手工清单正是本仓反复踩的"只能缩小却没人缩"的形态。
- 新增第六族测试命名（如 `.test.vue`）：只改 `packages/shared-utils/src/artifact-test-pattern.js` 的
  `TEST_FILE_RE` 与 `TEST_EXCLUSION_PATTERNS` 两处，其余全部派生；`checkNamingCensus` 会先在
  "仓库里有、白名单没盖住"的那一刻变红。
- 本文件的数字全部来自一次性实测，**可重跑的采集路径**就是 CI：`build.yml` 的
  `Verify packaged resources contain no unit tests` 步骤每次打包都会把两维的计数打在日志里
  （`OK（asar 维度）：N 个条目中 0 个单元测试文件` / `OK（松散树维度）：M 个松散文件中 0 个单元测试文件`）。
  下一次有人把排除摘掉，那一步红，而不是这份文档过期。
