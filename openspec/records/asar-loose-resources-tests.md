---
record: asar-loose-resources-tests
task: app.asar 之外的 extraResources 松散文件树不再随包发单元测试，并把门禁判据域从 asar 扩到松散树
date: 2026-10-02
sync_status: PENDING
sync_reason: 本 PR 自身尚未合并，merge SHA 与远端分支删除状态此刻不存在（这正是 PENDING 的语义）
sync_backfill_owner: 下一个会话（回填后删除本段三个 sync_* 字段）
---

## 本次执行记录：extraResources 松散文件树剪枝 + 门禁扩 --resources 维度（asar-loose-resources-tests，2026-10-02）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码走隔离 worktree `D:/Data/projects/mp-worktrees/mp-asar-loose-resources-tests`（裸分支 `asar-loose-resources-tests`），基线经 `fetch` + `merge --ff-only origin/main` 抬到 `8ff3ae52`；`node scripts/verify-worktree-deps.js` → OK（11 项解析通过）。共享根全程停在 `main`。 |
| 第一性原因（QM-5 ①） | PASS | #2736 只把排除加在 `build.files`（app.asar 那条通道）。`build.extraResources` 是**第二条"整目录往外拷"**的通道，有两个来源：① 两条 `from` 以 `../` 开头的仓库树条目（`../../packages/remotion-composer`、`../../config`）；② `.remotion-runtime/node_modules` —— 由 `stage-remotion-runtime.js` 在 beforePack 里递归摊平出的运行时依赖闭包。本仓约定"单测与被测同目录"，于是 workspace 包的 `tests/*.test.ts` 随闭包整坨进包。第一性引入点是**暂存器把包目录原样 `cpSync`、没有任何命名过滤**，不是 #2736 写漏（它的标题与 #2702 都限定在 app.asar）。 |
| 逃逸分析（QM-5 ②） | PASS | 单元层：`check-asar-test-files.test.js` 原 23 例全部围绕 `build.files` 与 asar 清单，判据域里没有第二棵文件树 ⇒ 对本缺陷结构性失明。CI 层：`build.yml` 只跑 `--asar`，日志打的「14753 个条目中 0 个单元测试文件」是真的 0，但它测的是另一个集合。审查层：#2736 的自查按"声明是否还在 + asar 清单"两维收口，两维都看不见 asar 之外的字节。归类：**判据域缺口**（不是断言不精确、不是 mock 过度）。 |
| 修复 + 回归保护（QM-5 ④） | PASS | ① 判据收成一份 `packages/shared-utils/src/artifact-test-pattern.js`，门禁与暂存器共用，并由锁断言**两侧拿到同一个函数对象**（不是字面量相同）；② 剪枝点落在暂存器（同时服务 CI 与本地 `build:dir`，且那条 extraResources 本无 filter），返回值带 `prunedTestFiles` 出声；③ 两条 `../` 来源条目各加 5 条 `!**/*.test.*`；④ 门禁新增 `checkExtraResourcesConfig`（声明维度）与 `--resources`（实证维度；空清单 / 目录不存在 / 不是目录一律不判通过）；⑤ `checkWiring` 从"数相邻三行的正则"重写为"按 YAML 列表项切步骤块 + 丢弃注释行 + 逐字比对 `if:` + 要求显式 `shell: bash`"，覆盖 `--asar` 与 `--resources` 两维。测试：`check-asar-test-files.test.js` 23→36 例，新增 `stage-remotion-runtime.test.js` 5 例。 |
| 反证（QM-5 ④ 续；判据 = rc≠0 ∧ `ℹ fail N`>0 ∧ 失败测试名命中预期） | PASS | 12 条变异逐个实跑 RED_OK：CP-A 摘"按 `from` 归类" / CP-B filter 覆盖判据恒真 / CP-C 松散扫描退化成不递归 / CP-D 空清单当通过 / CP-E 目录不存在当干净 / CP-F 注释行也算接线 / CP-G 删 package.json 一条 filter（`--config` rc=1 点名 config）/ CP-H 从 build.yml 摘 `--resources`（接线 rc=1）/ CP-I 暂存 filter 恒 true / CP-J 共享判据改窄成只认 `.js` ⇒ 门禁与暂存**两侧同时**红（这才证明判据真的只有一份）/ CP-K 把"判据链不得被 .gitignore 吞掉"那条锁的探针改成恒 false ⇒ 负控当场红（证明"0 命中"来自探针真在跑，不是探针坏了）/ CP-L 把松散扫描退回"符号链接整条跳过" ⇒ 符号链接那条锁红（这条判据形状由 QM-6 外部评审提出，见下方 QM-6 小节 d 项）。每条还原后按 sha256 校验与原字节逐字节相同。**两条自己的夹具被反证抓回**：CP-F 首轮报 RED_OK 实为 `packagingStepWhy is not defined` 的 ReferenceError（新锁忘了进解构清单）；CP-H 首轮 NOT_RED 因把 `--resources` 改成 `--resources-MUTATED`、字面仍含 needle ⇒ no-op 变异。二者都是**探针没测自己要测的变量**，不是锁失效，已按实测改写夹具与判据。 |
| 真实字节 A/B（不是合成夹具） | PASS | 同一条 `--resources` 判据打在**三个由其他会话独立打出的改前真实产物**上：179/13710、189/13720、189/13720 ⇒ rc=1 红；本改动产物 13531 个松散文件 ⇒ rc=0 且 0 个测试文件；同产物 `--asar` 维度 14754 条目 0 个（证明没把 #2736 的效果改坏）。暂存器侧 `stageRemotionRuntime()` 实测 `prunedTestFiles=186`。 |
| 运行期不消费测试文件：证据与边界 | PASS（附边界） | ① 在产物内的**临时副本**跑真实 `remotion bundle src/index.tsx`（webpack 全图，不需要浏览器 ⇒ 可离线）：`rc=0`，39 个产物文件中名字含 `.test.` 的 0 个、产物 JS 里指向 `.test.` 模块的路径串 0 个；② 对 `win-unpacked/resources` 全树 11631 个可读源文件静态扫描 `require('…test.js')` / `from '…test.ts'` 形态：0 处命中；③ QM-1 冒烟：起 12 秒仍存活、stderr 无禁用特征。④ **没有过排**：`packages/remotion-composer/src` 仓库侧 40 个文件 / 产物侧 37 个，差的正好是 `src/__tests__/` 那 3 个 `.test.ts`；产物 `src/` 直接子项 13 文件 + 2 目录、`config/*.yaml` 均在位，`story2video-engine/tests/` 只剩 `fixtures`。 **边界**：没有跑成一次真实 mp4 合成，被 #2778 挡在 require 期（见「遗留」）；全图证明的是"模块图里没有测试文件"，不覆盖运行期动态拼出的 require 路径，故补第 ② 条。 |
| QM-1 打包 | PASS | `pnpm run build:dir` 真实打包 rc=0（electron-builder 25.1.8 + electron 43.1.1）产出 `win-unpacked` 供两维扫描。日志里 `dist/fonts`、`.playwright-browsers` 报 `file source doesn't exist` —— 本 worktree 未装 Playwright 浏览器，属既有打包噪声，与本改动无关。 |
| 行尾与 diff 对账 | PASS | 每个改动文件的 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐行数值相同；`CHANGELOG.md` 走**按 Buffer 原字节前插**（新块逐行 `\r\n`，其余字节不动）：18 插 / 0 删，CR 计数 15843→15861 增量恰为新块自身 CR 数。第一版脚本用 `Buffer.from(字符串)` 往返被"原字节必须是结果的完整后缀"这条强判据当场拦住、未落盘 —— 该 blob 含非 UTF-8 字节，字符串往返会吃掉它们。 |
| 接线棘轮 | PASS | 新增 `apps/desktop/scripts/stage-remotion-runtime.test.js` 同 PR 点名进 `quality-gate.yml` Gate 2b（vitest workspace 不收该目录）；`scripts/check-unwired-tests.js` rc=0、`scripts/check-step-failfast.js` rc=0（新 run 块用 `shell: bash` 正是该棘轮的要求）。既有锁复跑 rc=0：`.github/scripts/check-ps1-bom.js`（50 个 .ps1）、`.github/scripts/check-max-lines.js`、`scripts/check-debt-budget.js`、`scripts/check-no-brand-residue.js`（6617 tracked 文件）、`.github/scripts/workflow-contract.test.js` 28/28。 |
| QM-4 视觉 | N/A | 未触碰渲染端视图；改动面是打包脚本 + CI 门禁 + 构建声明。 |
| QM-6 CCG 双模型外部评审 | 见「QM-6 实跑补记」 | 两 lane 的实跑结果与失败原因按现场登记，不以自审冒充通过。 |
| 远程同步 | PENDING | 合并后由下一个会话按既有口径回填：merge SHA 与时间取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI`，远端分支删除取 `git ls-remote --heads origin asar-loose-resources-tests` 返回 0 行；回填后**删除本文件 frontmatter 的三个 `sync_*` 字段**。 |

### QM-6 实跑补记（含偏差声明）

**规定通道没跑成，两条都留了现场：**
- `codeagent-wrapper --backend codex` ⇒ `codex exited with status 1`；直跑 codex 复现到 `ERROR: unexpected status 502 Bad Gateway: Unknown error, url: http://127.0.0.1:15721/v1/responses`（本机 CC Switch 代理在监听，但对 `/v1/responses` 返 502）。
- `codeagent-wrapper --backend claude` ⇒ `claude exited with status 1`（wrapper 退出时删掉自己的日志，取不到更细原因）。
- **没有**去改本机路由/代理配置把它"跑通" —— 那属机器级改动，需单独授权。

**改用替代通道跑外部评审，偏差先声明：**模型名**不是** `~/.claude/.ccg/config.toml` 的两个 primary，而是 `opencode run --model opencode/<…>-free`（零凭证、不经 `:15721`）。同场实测印证"`-free` 对长生成不稳"：L1 整轮超时 `rc=124` 无产出；L2/L3 都先撞上 `Error: OpenAI Chat stream ended without finish_reason` 再靠 harness 内部重试续跑。任务书已按既有教训收窄（限定附件、只答三问、≤25 行、唯一可写文件）。

| lane | 模型 | 结果 |
|------|------|------|
| L1 | `opencode/longcat-2.5-preview-free` | rc=124 超时，无 findings（不算数，只算尝试） |
| L2 | `opencode/nemotron-3.5-lightning-free` | 两次流式中断后产出完整报告（a/b/c/d 四条）：Critical 0、Warning 2 |
| L3 | `opencode/mimo-v2.6-flash-free` | 见本节末尾「L3 补记」 |

**L2 四条逐条处置（不合并、不替它改写判断）：**
- a「判据是否真只有一份」⇒ **未被推翻**。评审独立确认门禁与暂存器 import 同一份 `TEST_FILE_RE`。这条恰是我自己最容易自证的地方，由外部读一遍才算数。
- b「`--resources` 有无假绿路径：非 ASCII 文件名 / 超深嵌套 / 名字含 `#`」⇒ **采纳**。真 tmpdir 夹具补三种形状并改成**精确清单**断言（`config/深层嵌套/a/b/c/d/检查.test.ts`、`config/we#ird.test.js`、`config/emoji-🎬.json`）。选真 tmpdir 而不是纯表驱动，是因为判据要防的正是"真实 fs 返回的 dirent 形状"。
- c「`checkWiring` 块级判定能否被绕过」⇒ **确认抗绕过**（注释掉、条件改窄、拆成两步、改步骤名都会被抓）。它指出的残留死角"把整条调用从 workflow 里摘掉"与本仓所有自证接线锁同款，源码注释里已明写不以本锁冒充已消除。
- d「符号链接被 skip ⇒ 真测试文件可能仍进产物」⇒ **采纳**，且这是本次唯一改变**判据行为**的一条：`walkLooseFiles` 从"整条跳过链接"改为"按名字计入清单、但绝不对链接路径调 readdir"。跟随=把树外内容算成产物；整条跳过=一个叫 `x.test.js` 的链接从判据里消失（假绿）。锁：「符号链接『按名字计入但绝不跟随』」；反证 CP-L 实跑变红。
- d 的另一半「调用方 filter 会被顶掉，应当叠加」⇒ **不采纳，附否证**：`stage-remotion-runtime.js` 里 `copy` 只有一个调用点，传的是 `{ recursive, dereference }`，从不带 filter ⇒ 该分支不可达。为一条没有调用方、没有覆盖的分支写组合逻辑，正是本仓反对的"给不会发生的情况加兜底"；结论留在代码注释里，便于下一个会话复核。

**L3 结果**：L3（mimo）没有产出 findings —— 它把上下文花在翻 `node_modules/app-builder-lib/out/fileMatcher.js` 的 filter 实现上，直到超时 `rc=124`。没有产出的 lane 不算评审，只算尝试。

**但 L3 翻的那段代码引出一条该问的问题，由我自己问完**：L2 的 d 项称「`**/*` 与 `!**/*.test.*` 的先后语义、以及 `!node_modules/**` 先排除后再加 pattern 的交互，可能让声明失效」。
这条**不靠读上游源码下结论**，用真实产物判：
- 改后 `win-unpacked/resources` 共 13531 个文件，`.test.*` 为 0（改前三份独立产物分别是 179 / 189 / 189）；
- **过排同样被实测否证，而且是按"少掉的文件恰好等于测试文件"来判的**：`packages/remotion-composer/src` 仓库侧 40 个文件、产物侧 37 个，差的正好是 `src/__tests__/` 那 3 个 `.test.ts`；
  运行期真正需要的文件逐项在位 —— `src/index.tsx`(507B)、`src/Root.tsx`(11386B)、`src/` 直接子项 13 个文件 + 2 个目录（`cinematic`、`components`）、`config/config.yaml`、`config/platforms.yaml` 全部存在，
  `@multi-publish/story2video-engine/tests/` 只剩 `fixtures` 目录（不是整目录消失）。
⇒ 至少在本仓这一组具体 pattern 下，声明确实生效、且没有过排。"换一种 pattern 写法是否仍生效"不在本次断言范围内 —— 它由 `--config`（声明）与 `--resources`（字节）两维在每次打包时重测，而不是靠这份文档。

### 防止再次发生（QM-5 ⑤）

- **判据域必须与"产物的物理形态"一一对应，而不是与"某个声明字段"对应**：`build.files` 与 `build.extraResources` 是两条独立拷贝通道，只锁一条等于没锁。已落进机制本身 —— `readDesktopBuild()` 读整个 `build` 段而不是 `build.files`，`checkWiring` 要求两个产物维度各自成步且各自核对 `if:`。
- **文档里的数字必须配一条可重跑的采集路径**：`docs/asar-loose-resources-test-files.md` 每个实测数字都注明"由 `build.yml` 的 `Verify packaged resources contain no unit tests` 步骤每次打包重打"，避免"量过一次之后没人再量"（AGENTS.md 2026-10-02 新增的预算出处那条同族纪律）。
- **"基线滞后 ⇒ 整任务与已合并实现重复"是本会话第二次踩**（第一次 #2702/#2736）。这次动手前做了 `fetch` + `merge --ff-only` 并用 `git worktree list` 查同模块活跃 worktree；真正兜住的是"先真实打包再测量产物"而不是"读 issue 文本就开写"，所以把这一点固化成 `--resources` 维度本身 —— 它同时是一个"改前产物必红"的可重跑探针。
- **夹具的"更快写法"必须先回答"它还测着那个东西吗"**：CP-H 的 `--resources-MUTATED`（no-op 变异）与 CP-F 的漏解构（ReferenceError 伪装成红）都属此类。harness 判据已固定为 `rc≠0 ∧ fail>0 ∧ 失败测试名命中预期`，并在还原后按 sha256 校验字节相同。

- **`.gitignore` 的前缀型规则会吞掉源文件，而且"本地全绿"是最坏的伪装**：本仓 `test-*.js` 未锚定目录，凡是名字以 `test-` 开头的**非测试**源文件（本次是判据模块原名 `test-artifact-pattern.js`）都会静默不进 git ⇒ CI 上 MODULE_NOT_FOUND，而本地因为文件真实存在一切正常。既有锁的域只有 `**/*.test.js`。已把判据改名 `artifact-test-pattern.js`，并新增一条按"判据链"划域的锁（含"探针必须能认出真实被忽略路径"的负控）—— 下一份落进这条规则的文件会当场红，不必等到 CI。

### 遗留（不假装已闭合）

- **#2778（先于本改动存在，本 PR 刻意不含其任何一半修法）**：`stage-remotion-runtime.js` 把"同名不同版本"的包摊平进同一目标目录（实测 224 个包里有 9 个重名：`react` 19.3.0/18.3.1、`react-dom` 19.3.0/18.3.1、`scheduler`、`source-map`、`semver`、`estraverse` 等），产物里留下 `node_modules/react-dom/node_modules/react = 19.3.0` 这份**优先命中**的嵌套副本 ⇒ 打包态 `remotion` CLI 在 require 期抛 `TypeError: Cannot read properties of undefined (reading 'ReactCurrentDispatcher')`。归属证据：三个改前真实产物同样带该嵌套副本、同一条命令同样 rc=1；在临时副本里**只删那一个嵌套目录**、不碰任何测试文件相关物，`bundle` 立刻 rc=0。后果未证实的部分也如实写出：因此没能用一次真实 mp4 合成收口本 PR 的运行期证据；同时这意味着打包应用的 Story2Video 出片可能长期起不来（本地开发走仓库 `node_modules` 不受影响，单测与本地手测都看不见它），严重度按"可能导致功能不可用"登记在 #2778，不当已证实结论用。
- 产物里第三方包自带的 `test/` 目录（实测 142 个，如 `minimist/test/*.js`）**不在本次收口范围**：它们不是本仓单元测试，且某些 npm 包的 `main`/`bin` 会指向自己 `test/` 下的文件，按目录整排排除等于赌"没有一个上游包这么写"。要收这个口径需单独量。
- `*.node-test.cjs` 这类变体命名：实测**产物中 0 个**（该命名只出现在 `apps/desktop/electron/tests/`，已由 #2736 的按目录排除覆盖），故本 PR 不为它新增形态规则；若将来出现，`checkNamingCensus` 会在"仓库里有、白名单没盖住"的那一天变红。
