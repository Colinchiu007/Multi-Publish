---
record: gate-record-presence-impl
task: 落地执行记录存在性判据（enforce-gate-record-presence 第一步：基础设施 + advisory 接线）
date: 2026-09-30
---

## 本次执行记录：执行记录存在性判据第一步——两源收口 + 新脚本 + advisory 接线（gate-record-presence-impl，2026-09-30）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 独立 worktree `mp-gate-record-presence-impl` + 裸分支 `gate-record-presence-impl`；`start-mp-task.ps1` 的 rc 本仓已知不可信，改用 `git worktree list` 产物确认创建；建好即 `fetch`(带 `-c http.proxy`)+`merge --ff-only`，基线经产物核对等于当时 `origin/main` `75ceb2f0`。本 PR 改了 `.github/workflows/` 与 `scripts/` ⇒ 属混合 PR，不走 docs-only 通道（`classify-docs-only` 实测） |
| 第一性原因（QM-5 ①） | PASS | 不是"没人写记录"，是**既有判据的定义域到不了这一形态**：`check-gate-record-debt.js` 的两条强制判据都以"记录存在"为前提，对"整篇缺席"免疫；#2570 自己在「遗留与已知漏洞」里写明了这条未闭合。实测窗口（`origin/main@2969b4ad`，`--since=2026-09-26`）first-parent 210 个落地提交里 **111 个未把记录落在可检查位置**，其中非 docs-only **72 个** |
| 逃逸分析（QM-5 ②） | PASS | 逐层为何没拦住：单测层只断言"已存在的行是否收口"；`check-docs-sync.sh` 只管代码↔文档是否同步，不管记录是否存在；`check-unwired-tests.js` 量测试接线；`Gate 2c` 对本次缺席如实判 PASS。另记一条**测量层逃逸**：我第一次用 `git rev-list --merges` 数 PR，几乎查不到——本仓 squash 落地是**单亲**提交，判据错了整批数字就会假报为 0 |
| 系统性漏洞（QM-5 ③） | PASS | 两类：① 存在性无判据（本 PR 补）；② 载体本身是共享写——`.quality-gates.md` 与 `gate-record-debt-ledger.json` 都是"新条目插顶部"，实测 #2570 第三轮 re-sync 的**唯一**冲突文件就是那份 JSON。第二条同时解释了为什么记录型 PR 一律落在快速通道之外：白名单无任何 `scripts/**` 条目 |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `openspec/records/`（`_TEMPLATE.md` + `_exempt/_TEMPLATE.md` + `_legacy-absent.md`）；`check-gate-record-debt.js` 收口判据扩为两源（登记随记录文件 frontmatter 走，聚合派生）；新增 `scripts/check-pr-exec-record.js`（存在性判据，forward-only）；`classify-docs-only.js` 把"本 PR 变更集"提为唯一取源 `changedFileStatuses`，本脚本结构锁禁止第二份 diff 口径。测试：debt 29 / exec-record 14 / classify 18 / workflow-contract 27 全 passed |
| 防止再次发生（QM-5 ⑤） | PASS | ①「非阻断状态自身可被检测」（D8）：advisory 模式必须打印 `MODE=advisory`，且有一条测试同时断言"advisory 恒退出 0"与"enforce 同输入必须红"——转阻断的动作就是删掉 CI 里的 `--mode=advisory`；② 新脚本必须 `require('./classify-docs-only.js')` 且自身不得出现 `['diff'` / `--name-status`（源码结构锁）；③ AGENTS.md 的载体口径留到第二步（tasks 7.2）与转阻断同 PR 改，避免文档先于能力 |
| 变异反证（实跑） | PASS | debt 侧 4 格：文件源枚举恒空 ⇒ fail=6、词表改未知即收口 ⇒ fail=8、目录缺席守卫改静默返空 ⇒ fail=1、登记字段校验恒通过 ⇒ fail=2。exec-record 侧 4 格：判据恒通过 ⇒ fail=8、只按路径不看状态 ⇒ fail=1、空变更集改判通过 ⇒ fail=2、阈值改成永不触发 ⇒ fail=1。两批均含 M0 控制轮 fail=0；每格 `try/finally` 用**内存字节**还原并核 sha256 全等（源文件未提交，禁用 `git checkout --`） |
| 反证过程中的两次自我纠正 | PASS | ① 多行锚点在本 worktree 恒 0 命中——文件是 `i/lf w/crlf`，锚点必须按文件自身行尾构造，否则"锁没抓住"会被误读（第一版就这么误判过 M1/M3）；② `-z` 的 `--name-status` 实测是「状态 NUL 路径」交替且重命名带相似度数字 `R100`，我按 `状态\tpath` 写的第一版会**静默返回空数组**，是靠转储实测与一条 `got.length >= 4` 断言才暴露的 |
| 行尾与 diff 对账 | PASS | 新增文件一律 LF；`git check-ignore -v` 逐个当场证明 `openspec/records/**` 未被忽略（新脚本因 `.gitignore` 第 106 行 `scripts/*.js` **确实被忽略**，已按既有惯例处理，未靠 `git add -f` 蒙混）；两口径 numstat 与删除数在提交前复核 |
| 接线棘轮 | PASS | `check-unwired-tests.js` rc=0（新测试已在 workflow 显式点名）、`check-step-failfast.js` rc=0；新步骤 `Gate 2c2` 用 `shell: bash`（PowerShell 不在中间命令非零时中止），`EXEC_BASE` 走 step 级 `env:` 声明，run 正文不内联 `${{ }}` |
| 存量处置 | PASS | `_legacy-absent.md` 由脚本从 git+gh 派生（禁止手抄），登记 70 条（其中 57 条三处皆无、13 条走了 #2553 式承载出口），并带正控 99 条 / 负控混入 0 的对照轮；文件写一次即冻结，forward-only 判据不读它 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触碰 `apps/desktop/electron/`、`packages/rpa-engine` 与任何 UI；改动面为 `scripts/`、`openspec/`、`.github/workflows/` |
| QM-6 CCG 双模型外部评审 | 未执行 | 本机无 `codeagent-wrapper`，按门禁口径如实登记，不以自审冒充通过 |
| 远程同步 | PASS | PR #2717 于 2026-09-29T22:55:15Z squash 合并，merge SHA `8dad3b150e55d28d97aec7312b79441bc0d82a28`；`git merge-base --is-ancestor <该 SHA> origin/main` rc=0 证已常驻 origin/main；`git ls-remote --heads origin gate-record-presence-impl` 返回 0 行证远端分支已删。第 6 组 runner 现场证据已取到：run `36636248036` attempt 1 / job `QG Static` 打印「本 PR 变更文件 13 个（A=6 M=7 D=0）」与「MODE=advisory（尚未接进判定…）」，同一步 14/14 passed —— 三点 diff 在真实 `actions/checkout` 下确实取得到非空变更集，转阻断的硬前置成立 |

### 遗留与已知边界（不假装已闭合）

- **本判据目前不拦截任何东西**：CI 以 `--mode=advisory` 接线，退出码恒 0。第 6 组要求的 runner 现场证据**已于 2026-10-01 取到**（run `36636248036` attempt 1 / job `QG Static`，见上表「远程同步」行），转阻断的技术前置成立；**经用户决定推迟**到在途 PR 排空后再做第 7 组，因为此刻 7 个在途 PR 全部不带新载体记录，立刻转阻断会把它们下次 push 判红。触发条件写成可机械核对的一句：`gh pr list -R Colinchiu007/mulpub --state open` 为空（或在途 PR 全部携带 `openspec/records/` 记录/豁免）。
- **上面那句"转阻断删掉参数就会被测试问住"只在脚本侧成立，CI 侧不成立**（本次回填时逐条读 `check-pr-exec-record.test.js` 的 14 条测试实测）：没有任何一条读 `.github/workflows/quality-gate.yml`，所以"CI 仍停在观察态"这一事实目前无人检测——workflow 注释里"该标记行被 test 钉住"的说法把**脚本能跑 advisory** 说成了**接线状态被钉住**。第 7 组转阻断时必须同时补一道读 workflow 的结构锁（断言该步不再出现 `--mode=advisory`），否则 D8 想防的"永远停在观察"依然没有收束物。本条同时是 `Gate 2c2` 注释需要改写的依据，留到第 7 组与删参数同 PR 做（那一步本来就要碰 workflow）。
- **远端分支清单取不到时，"已消费豁免"判定降级为 unknown**：脚本打印 `consumed=unknown` 但不判红。这是一处**有意的 fail-open**——网络抖动不该让必需检查变红——代价是"待清理豁免堆积"这条约束在 ls-remote 故障期间失灵。
- **同一 change 目录内仍与并发会话共享**：`tasks.md` 勾选是同行区域的竞争点，本次只改自己那 34 条，未碰他人 change。
- 阈值 3、豁免 `exempt_for` 是否需要 expires 字段，都要等第一步在 runner 上真跑一段时间后按分布回调，不现在拍数字。
