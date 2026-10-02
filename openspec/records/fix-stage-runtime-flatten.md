---
record: fix-stage-runtime-flatten
task: 暂存的 remotion 运行时闭包不再把同名不同版本摊平进同一目录（#2778：打包态 CLI 在 require 期崩）
date: 2026-10-02
sync_status: PENDING
sync_reason: 本 PR 自身尚未合并，merge SHA 与远端分支删除状态此刻不存在（这正是 PENDING 的语义）
sync_backfill_owner: 下一个会话（回填后删除本段三个 sync_* 字段）
---

## 本次执行记录：remotion 运行时闭包摊平缺陷（fix-stage-runtime-flatten，2026-10-02）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码走隔离 worktree `D:/Data/projects/mp-worktrees/mp-fix-stage-runtime-flatten`（裸分支 `fix-stage-runtime-flatten`，由 `bash scripts/session-init.sh` 创建）；基线 `fce43087` == `origin/main`（`git rev-list --count HEAD..origin/main` = 0）；`verify-worktree-deps.js` OK、`ensure-electron.js` 报"dist 已就绪"。共享根停在 `main` 且 clean。 |
| 第一性原因（QM-5 ①） | PASS | 引入点是 `5093a330 fix(desktop): harden startup and bundle Remotion runtime` 写出的暂存器：`collectRuntimePackages()` 返回"按包名摊平"的清单，`stageRemotionRuntime()` 逐条 `cpSync(包目录, outputDir/<包名>)`。真实 pnpm 布局靠**嵌套**区分同名不同版本，摊平后两个版本抢同一个目录；且每次拷贝连带该包自有的 `node_modules/`，于是留下 `react-dom/node_modules/react = 19.3.0` 这份优先命中的副本 ⇒ `react-dom@18` 拿到 React 19 的导出（`__SECRET_INTERNALS_…` 已被改掉）。git 追溯：`git log origin/main -- apps/desktop/scripts/stage-remotion-runtime.js` 只有 `5093a330` 与本次前置的 `ae6512d1`（#2765/#2779 只加了测试文件剪枝，未触及布局）。 |
| 逃逸分析（QM-5 ②） | PASS | 单元层：暂存器原有 4 例只测"清单收集 + 目录映射"，夹具里**没有任何同名不同版本**，摊平缺陷在夹具层面不可表示。集成层：无任何测试读真实闭包（`collectRuntimePackages` 从未在真仓库上跑过），所以"224 条里 9 个 name 重复"这件事从来没被打印过。打包/E2E 层：CI 的打包步骤只跑 `--dir` 产物两维扫描，不跑 `remotion bundle/render`；`film-engineering` 真出片只在 **tag** 上触发（release-only），main 与 PR 上都不跑 ⇒ 崩溃只在"用户装的是发布包且真去点视频合成"时暴露。归类：**测试场景缺失 + 判据域缺口**（没有任何东西看过"落点目录与源是否同一份"）。 |
| 修复 + 回归保护（QM-5 ④） | PASS | ① `collectRuntimePackages()` 两阶段：先收全并**照常展开依赖**，再筛掉"落在任一被拷贝包目录之内"的记录（它已随父包整目录携带）；② `isInsideDirectory()` 按 `path.relative` 判包含（不是字符串前缀）；③ `stageRemotionRuntime()` 拷贝前证"一个目标目录只有一个源"，两个源即抛错点名两边；④ 新增 `verifyStagedClosure()` 三条：落点 `package.json` 与源逐字节相同 + 落点 `node_modules/` 子项集合等于源（多/少都红）+ 每条**非 optional** 运行时依赖边必须在 `outputDir` 之内解析得到，由 `beforePack` 在打包时执行 ⇒ 不再留给用户点一次合成。测试 5 例 → **19 例**，含**真实闭包不变量**（name 唯一 / 大小写折叠后仍唯一 / 两两不互相包含 / 顶层 `react-dom` 必须等于仓库解析命中的那份 / 规模下界防空解析）。 |
| 反证（判据 = `rc≠0 ∧ ℹ fail N>0 ∧ 失败的测试名命中预期`） | PASS | 11 条全部实跑 RED_OK 且还原后 sha256 与原件一致：F-1 关掉两阶段过滤 ⇒ 真实闭包那条 + nested 那条红；F-2 `isInsideDirectory` 退回字符串前缀 ⇒ `pkg-evil` 负控红；F-3 `verifyStagedClosure` 退化成恒过 ⇒ 多包/少包/逐边三条红；F-4 摘掉"两源抢同一目录"的抛错 ⇒ 该条红；F-5 把"被携带即不展开依赖"实现出来 ⇒ `only-by-nested` 丢失那条红；F-6 摘掉判据③的调用点 ⇒ "①② 恒成立、只有 ③ 能拦"那条专用用例红；F-7 摘掉解析的 `outputDir` 边界守卫 ⇒ "起点在树外一步都不许往上走"红；F-8 摘掉"剪枝命中目录即抛错"⇒ 该条红；F-9 让 `readNestedNames` 退回硬用 `fs.existsSync` ⇒ "注入必须被尊重"那条红；F-10 把 claim key 退回按字符串比 ⇒ "只差大小写的两源"那条红；F-11 把 stat 失败退回"当作文件剪掉" ⇒ "无法 stat 必须抛错"那条红。**四条探针侧自纠**（错在探针、不是锁）：harness 首版五条全 `ANCHOR_MISS`，因检出后工作区是 CRLF 而锚点按 `\n` 构造；F-1 第一次手工试跑时 `ℹ fail 3` 里混着一条与本变异无关的红，因此判据补成"必须命中预期测试名"；**F-6 首版报 `NOT_RED`** —— 不是③无效，而是当时**没有任何用例能从③出口红**（唯一的删除型夹具里②恒先触发，我又把断言放宽成 `/a → b/` 让两条判据共用出口，③当场沦为装饰），补了独占红出口的夹具后 F-6 变红，同一轮又发现 F-7 在原夹具下同样不可见（起点在树内时循环本就在 `dir === boundary` 收口），于是补"起点在树外 + 注入 `exists` 只在宿主路径命中"这一格；**F-8 首版报 `WRONG_CAUSE`** —— 红的正是预期那条用例，但 `expectFail` 我按**错误文案**写（`命中了一个目录`）而 harness 匹配的是**测试名**（`剪枝判据命中目录时必须抛错…`），反证的期望必须与它的匹配对象同域。教训写成一条口径：**每加一条判据，必须同时指出它的独占红出口在哪条用例里**，否则"三条判据"会退化成"一条判据 + 两条装饰"。 |
| 真实产物 A/B | PASS | 同机同命令：打包顶层包 `224（9 个 name 重复）` → `188（全唯一）`；`react-dom/node_modules/react` 由 `19.3.0` → 不存在（该目录下只剩它自己的 `scheduler`）；`remotion/node_modules/react-dom` 保持 `19.3.0` 并带着它自己的嵌套 react（与仓库布局一致）。打包态 `remotion bundle src/index.tsx`：改前 `rc=1`（栈顶 `react-dom.development.js:994`，且**三个其他会话的改前产物同样 rc=1**）→ 改后 **`rc=0`，零手工干预**。 |
| 打包态真实出片（本次新跑通的一项） | PASS | `Explainer` 3 帧，`--browser-executable` 指本机 ms-playwright chromium、`--ffmpeg=../../media-tools/ffmpeg.exe` 指**捆绑** ffmpeg：`rc=0`、45 kB mp4；再用**捆绑 ffprobe** 解码：`format_name=mov,mp4,m4a,3gp,3g2,mj2`、`duration=0.149333`。这同时补上了 #2765 当初没跑成的那一条（见 `openspec/records/asar-loose-resources-tests.md`「遗留」）。**边界如实写出**：只覆盖 `Explainer` 一条 composition 与 3 帧；其余 composition、音频链路、以及"CI 上真出片"仍未验（CI 的打包步骤不跑 render）。 |
| QM-1 打包 / QM-4 视觉 | PASS / N/A | `pnpm run build:dir` 真实打包 `BUILD_RC=0`（日志仅 `dist/fonts`、`.playwright-browsers` 报 `file source doesn't exist` —— 本 worktree 未装 Playwright 浏览器，属既有打包噪声）；松散树 13531 → 12012 文件（最终那次构建；上一轮构建报 12053，差额来自渲染端 chunk 集合随构建变化，与被审改动无关），`#2765` 的两维产物门禁复跑均 `0 个单元测试文件`（未回退）。未触碰渲染端视图 ⇒ 视觉 N/A。 |
| 行尾与 diff 对账 | PASS | 故意**不写行数合计**（这条证据写在被统计对象里，写数字必然自我过期）。只锁两条不漂移判据：① 每个改动文件 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐行相同；② `CHANGELOG.md` 全程按 Buffer 原字节前插（新块逐行 `\r\n`、其余字节不动），并以"原字节必须是结果的完整后缀"为强判据，CR 增量恰等于新块自身 CR 数。 |
| 真实产物重放（改后最终码，同机同命令） | PASS | 加判据③后**重新整包**（`pnpm run build:dir` rc=0），再用 `verifyStagedClosure` 对**两个域**各重放一次：暂存目录 `.remotion-runtime/node_modules` 与最终产物 `win-unpacked/resources/packages/remotion-composer/node_modules` 双双通过，**包=188、依赖边=297、重名=0**；顶层 `react=18.3.1`/`react-dom=18.3.1`，`react-dom/node_modules/react` 不存在，`remotion/node_modules/react-dom=19.3.0`。打包态 `remotion bundle src/index.tsx` **rc=0**；打包态真实出片 `Explainer` 3 帧 **rc=0**（43.3 kB），捆绑 ffprobe 解出 `duration=0.149333`。 |
| 接线棘轮 | PASS | 未新增测试**文件**（新 10 例并入已被 `quality-gate.yml` Gate 2b 点名的 `stage-remotion-runtime.test.js`），故无新接线项；`scripts/check-unwired-tests.js` rc=0、`scripts/check-step-failfast.js` rc=0 作为既有锁复跑。 |
| QM-6 CCG 双模型外部评审 | **部分执行（1 个模型实质评审）** | 规定通道 `codeagent-wrapper --backend codex` 一手报错 `unexpected status 502 Bad Gateway … http://127.0.0.1:15721/v1/responses`（CC Switch 属用户机器级路由，未经授权不修）；`--backend claude` 最小探针挂满 150 s 无输出（rc=124）；`--backend gemini` 的 `gemini` CLI 本机不存在。降级通道 `opencode run --agent plan`：`big-pickle` 一条完整评审（rc=0，任务书四问逐条作答并另附一条接缝发现），`nemotron`/`longcat`/`mimo`/`fledge` 四个模型共 6 次尝试全部零产出或流中断。**双模型并行未达成，不冒充 PASS**；发现项与逐条处置见「QM-6 实跑补记」。 |
| 远程同步 | PENDING | 合并后由下一个会话按既有口径回填：merge SHA 与时间取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI`，远端分支删除取 `git ls-remote --heads origin fix-stage-runtime-flatten` 返回 0 行；回填后**删除本文件 frontmatter 的三个 `sync_*` 字段**。 |

### QM-6 实跑补记

**通道实况（一手报错原样登记，不以自审冒充外部评审）**

- 规定通道 `codeagent-wrapper --backend codex`（`~/.claude/.ccg/config.toml` 的 `[routing.backend].primary`）：rc=1，
  一手报错 `ERROR: unexpected status 502 Bad Gateway: Unknown error, url: http://127.0.0.1:15721/v1/responses`（重试 5 次全 502）。
  本机 `curl http://127.0.0.1:15721/` 返回 `000`。**未修**：CC Switch 的监听/上游属用户的机器级路由配置，未经授权不动（同 #2772 的处置口径）。
- 规定通道 `--backend claude`：rc=1；单条最小探针 `claude -p "reply OK"` 挂满 150 s 无任何输出（rc=124），非瞬时错误。
- `--backend gemini`：`gemini` CLI 本机未安装（wrapper 直接失败），不作为可用通道。
- 降级通道 `opencode run --agent plan`（只读）：**big-pickle 一条完整产出**（rc=0，5 问全答）；
  `nemotron-3.5-lightning-free` 两次失败（`OpenAI Chat stream ended without finish_reason` ×2 + 对 worktree 绝对路径的
  `external_directory` 自动拒读）；`longcat-2.5-preview-free`、`mimo-v2.6-flash-free`、`fledge-alpha-free` **stdout 全空、零结论**
  （三者的 stderr 里都只有工具转录：`fledge` 用 `cat` 读到了实现与测试全文却始终找不到 diff，
  `mimo` 用 `Read` 读到了两个源文件后在收口前流中断，`longcat` 反复撞同一个 auto-reject）。
  核查方式：`grep -c "Critical\|Warning\|结论" <findings>` 并直接看 stdout 段的字节数 —— **只有 `mp2778-findings-FB1.md` 里有模型署名的判断**；
  其余三份里出现的"大小写 / toLowerCase / 独占"等字样，逐条回查全部是它 `cat` 回来的**我的源码原文**，不是评审意见。
  另记一条装配事实：把工件复制进 spawnSync 的 `cwd` 并没有让 opencode 的 bash 工具在该目录里找到它们（转录里它一直在 `D:/Data/projects` 下 find），
  所以"拒读"与"找不到"这两个失败面都不能用"复制进 cwd"一并解决 —— 别再照这个思路重试。
- **偏差声明**：QM-6 要求的双模型并行只达成 **1 个模型实质评审**。本 PR 不以此冒充 PASS；
  下面逐条处置全部来自 `D:/tmp/mp2778-findings-FB1.md`（big-pickle），未把任何一条自审结论记到它名下。

**逐条处置（评审 → 判定 → 落地）**

| # | 评审意见（严重度） | 我的判定 | 处置 |
|---|---|---|---|
| Q1-a | 判据①（筛掉被携带记录）会不会误杀（Info：不能） | 同意其论证：被筛者的 `packageJson` 必由某条被保留记录的 `ownDir` 解析而来，Node 上溯链在暂存树里同构保留 | 不改；并由判据③在真实闭包上实测 297 条边全部可解析作为现场证据 |
| Q1-b | ③ 只遍历筛后的 records、② 只比 `node_modules` 直接子项 ⇒ 深度 ≥2 的子树丢失对自证不可见（Warning） | **成立**。源与落点之间唯一能让内容无声消失的机制就是剪枝 filter —— 它同样作用于**目录**，剪掉一个目录即连带删掉整棵子树，而 ② 看不见 | **已修**：`testArtifactFilter` 命中目录一律抛错（`剪枝判据命中了…目录`），真实闭包实跑剪 186 个**文件**、0 个目录 ⇒ 不误伤；反证 F-8 |
| Q2 | Windows 上 `Foo`/`foo` 是两个 Map key、同一个物理目录 ⇒ 绕过落点唯一性；建议 ② 再比每个子项的 manifest 字节（Warning） | 风险**真实**（打包机与 CI runner 都是 windows-latest，大小写不敏感）；子项字节比对会付出打包期 188×N 次读盘，收益与 ① 重叠 | **两条都做，但各归其位**：落点唯一性的 claim key 改为按 `toLowerCase()` 折叠（折叠只会更严不会误杀 —— npm 包名实测全小写，真实闭包 188 条折叠后仍唯一），加一条"只差大小写的两源必须抛错"的用例 + 反证 F-10；同时在真实闭包不变量里加 case-fold 唯一性断言当**外部预警**（出现只差大小写的合法名字即红，届时再谈消歧）。manifest 逐子项字节比对**未采纳**：那是把 ① 的判据在深度 1 重跑一遍，代价换不到新的失效面 |
| 自审补强（**非评审产出**，接 Q1 的机制收口） | 剪枝 filter 里 `statSync` 失败被 `catch { isDirectory = false }` 吞掉 ⇒ 判不出目录时默认按"文件"剪，而 `ENOTDIR` 恰恰最常见的就是"这层是目录" | 成立：这条与评审 Q1 是**同一个失效面的另一半** —— 一个是"知道是目录却静默剪"，一个是"不知道是不是目录就剪" | **已修**：stat 失败一律抛错并带上原始 `error.message`；用例夹具用 `package.json/sub/x.test.js`（真 ENOTDIR）而非编造路径，反证 F-11 |
| Q3 | 抛错留下半棵树 ⇒ 下一次打包行为不同；建议 tmp+rename（Warning） | **前提不成立**：`.remotion-runtime/node_modules` 的唯一消费者是 `apps/desktop/package.json:192` 的 `extraResources`，beforePack 抛错时它不会被读；全仓 `grep -rn remotion-runtime` 无任何 `existsSync(outputDir)` 型读者；抛错 ⇒ 打包 rc≠0 ⇒ 无产物 | 不改（tmp+rename 会把 34 s 的整树拷贝变成双份磁盘占用，为不存在的读者加健壮性）；证据写进文档 §5 |
| Q4 | `resolvesInsideStagedTree` 的出树分支在唯一调用路径不可达，属防御性冗余（Info） | 事实同意；但它不是装饰 —— F-7 证明摘掉它有一条用例红 | 不删、不外加断言（不给内部函数补不可能发生的校验）；64 步 guard 同理保留 |
| 附带 | `readNestedNames` 硬用 `fs.existsSync`，忽略注入的 `exists` ⇒ 判据② 无法纯内存驱动（Info） | **成立**：注入接缝对 ② 是装饰 | **已修**：`exists` 一路传进 `readNestedNames`；反证 F-9 |
| 测试质量（**自审，非评审产出**） | 逐边/包含类断言在依赖升级时可能"假红"，而"真实闭包"那条同时承担症状锁与规模锁 | 自审发现，FB1 那轮的四问里没有这一问（旧任务书写过，但那次没跑成） | 保留用例并在文案里写明"这条红意味着什么、该怎么复核"，以规模下界防"解析退化成空集合"型假绿 |

**归因自纠（写在这里因为它差点变成假的第二路评审）**：中途我把 `fledge`/`mimo` 两份文件里出现的"大小写 / toLowerCase / 单独占一个顶层落点"等词
当成"它们也产出了结论"，据此在源码注释与文档里写了「QM-6 两路外部评审各自命中」。回查方式与真相：那两份文件的 **stdout 段是 0 字节**
（`===STDERR===` 之前什么都没有），那些词全部来自它们 `cat` 回来的我的源码原文与 diff 本身。已全部改为单路署名（Q2 归 `big-pickle`），
并把"stat 失败不得默认按文件剪掉"从"第二路评审 Q3"改标为**自审补强**。口径：引用外部评审的唯一证据是**那段署名判断文本**，
关键字计数只能定位不能判定 —— 与 AGENTS.md「不得把发现项归给产出为零的模型」是同一条纪律的又一次触发。

净结果：落到运行代码 3 条（Q1-b 的目录剪枝抛错、附带的注入接缝、Q2 的 claim key 大小写折叠 —— 后一条从"只加测试锁"升级为"折叠 + 测试锁"，因为它否证的是我自己的抛错），自审补强 1 条（stat 失败不得默认按文件剪），以证据否证 1 条（Q3），同意并保持 2 条（Q1-a、Q4）。

### 防止再次发生（QM-5 ⑤）

- **"多实例同名"的摊平必须有落点唯一性证明。** 结构上凡"按 name 往一个目录写"的收集器，都必须在**动手写之前**证"一个落点一个源"；写完之后再看结构是看不见的（本次症状就是 `package.json` 与 `cjs/*` 来自不同次拷贝）。已落进 `stageRemotionRuntime()` 的 `claimed` Map + 抛错。
- **打包期自证优于事后人工复现。** `verifyStagedClosure()` 挂在 `beforePack`，所以 CI 每次打包都会重测"落点 == 源"；这把"只有真去点一次视频合成才会暴露"的缺陷，变成"打包当场红"。文档里的每个数字也因此有可重跑的采集路径（不靠"量过一次"）。
- **判据要按"包含关系"的语义写，不按字符串前缀写。** `pkg` vs `pkg-evil` 这一类负控已进测试表；新写同类判据时先补负控再上判据。
- **"跳过记录"和"跳过展开"是两件事**：闭包收集里凡是"某条边我不管了"的优化，都必须单独证它不减少被展开的节点，否则产物少包的症状（`MODULE_NOT_FOUND`）比它要修的 bug 更难查。已写成一条独立用例 + 反证 F-5。
- 夹具侧：反证 harness 的锚点必须按**检出后的实际行尾**构造（本仓 `core.autocrlf=true`），且判据必须是"命中预期测试名"，否则 `ANCHOR_MISS` / `no-op 变异` / `无关红` 三种情况都会被读成"锁有效"。

### 遗留（不假装已闭合）

- 打包态真实出片只验了 `Explainer` 3 帧；其余 composition / 音频链路 / CI 上真出片仍未验。
- `verifyStagedClosure` 只比"落点与源是否同一份"，不判断"这个闭包该不该含这些包"（依赖剪枝是另一件事，本次不混做）。
- #2765 记录里那条"因 #2778 没能跑成真实合成"的遗留，随本 PR 已被实际跑通取代（在 PR 评论与文档里注明，不回改已合并的历史记录正文）。
