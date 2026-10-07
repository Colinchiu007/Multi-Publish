---
record: changelog-dup-gate
task: CHANGELOG 副本数棘轮门禁（拦 re-sync 乘法型复制；与 growth 多重集判据的冲突收敛）
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由下一个会话回填 PASS 并删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话
---

## 本次执行记录：CHANGELOG 副本数棘轮门禁（changelog-dup-gate，2026-10-07）

> 分支：`changelog-dedup-v2`；worktree：`D:/Data/projects/mp-worktrees/mp-backfill-2773-sync`（基线 `origin/main`=`2ceceb1eb`）
> 范围：🛠 仓库工具 + ⚙️ CI 接线（新门禁与单测、`quality-gate.yml` 正文、`.gitignore` 反选、`CHANGELOG.md` 加本 PR 一条）⇒ 含 workflow 改动，属**混合 PR**，不走 docs-only 快速通道
> QM-6：按 AGENTS.md，`scripts/` 工具脚本类变更不强制双模型评审；但本 PR 动了 `.github/workflows/` 正文，**未做外部评审**，此处记为缺失而非"零发现"

### ⚠️ 本 PR 的判据被一次实测改写过（先记下，免得下一个会话以为一开始就是这么设计的）

第一版判据是「**存在重复条目即红**」，并已实跑去重 main 的 1157 → 329 条。CI 跑完 `QG Changes` 红，但红的不是我接的那一步——日志显示红在 main 上另一把并发会话新加的 `scripts/check-changelog-growth.js`（`base 1183 条 -> head 344 条`）。读它的实现后确认这是**设计层面的互斥**，不是 bug：

- growth 的判据刻意是**标题多重集包含**（动因是 #2884 把 1133 条整份删空），并在注释里明说"用多重集而不是集合，是为了不把『把 4 份副本删到 3 份』读成通过"；
- 而 main 的历史里本就有数百份重复副本（实测冗余 828 份）；
- ⇒ 「必须删副本」与「每份副本都不许少」在现有文件上不可能同时满足。绝对判据等于**把污染钉死**：谁都别想清理。

因此本 PR 收敛为：只守自己那份不与他人重叠的不变量——**一次 PR 不得把任何标题的副本数变大**（base 已有的标题一份都不许多；base 没有的新标题允许出现 1 次＝正常加条目的形状）。它允许"变好"，所以不挡未来清理；同时精确拦住乘法型污染。历史副本的清理另案（需同时给 growth 加窄例外：允许把同题副本削到 1 份，且保留那份必须逐字节等于 base 里该标题的某一份）。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 含 `.github/workflows/` ⇒ 混合 PR，走独立 worktree。`git worktree add -b changelog-dedup-v2 origin/main`（PowerShell 原生 `D:\` 路径），判据按产物：`rev-parse --abbrev-ref HEAD`、`status --porcelain` 0 行、`verify-worktree-deps.js` OK（11 项解析指向本 worktree）。共享根当时有**另一会话已暂存的 4 个文件** ⇒ 未在共享根落笔。依赖：首轮 `node --test .github/scripts/workflow-contract.test.js` 直接 `Cannot find module 'js-yaml'`（本 worktree 未装依赖，我把"跑不了"错当成"结果"过一轮）⇒ 补 `pnpm install --frozen-lockfile`（rc=0，lockfile 未变）后才采信测试 |
| 第一性原因（QM-5 ①） | PASS | re-sync 解冲突用 `myBlock = mine − oldBase`，`oldBase` 滞后时把上游新增段也算成"我的块"，再 prepend 到 theirs 全文 ⇒ 整份文件被复制。取证：`4647f21b`→`1dd05b12`（#2792）277 条/1.86MB → 1097 条/7.37MB，最坏同一标题 16 次；#2844 去重到 278 后到 `2ceceb1eb` 又涨回 1157 条/828 份冗余 ⇒ "修过但没人守" |
| 逃逸分析（QM-5 ②） | PASS | 逃过了：① 没有任何判据看"副本数是否变多"（growth 只管不许变少）；② `check-docs-sync` 只看 diff 里有没有白名单文档；③ `check-max-lines` 的 SCAN_DIRS 不含根级 `.md`，且 CHANGELOG 挂账；④ `check-gate-record-debt` 看执行记录不看台账。⇒ 属"流程缺失"，不是运气 |
| 系统性漏洞（QM-5 ③） | PASS | 「门禁缺失漏洞」：**append-only 台账只守下界、不守上界**。落点：`quality-gate.yml` 的 `changes` job Gate 2c3（与 growth 同步进步骤） |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `scripts/check-changelog-duplicate-entries.js`：条目=以 `# [未发布]` 标题行起始的整段原文（逐字节搬运，不改行尾）；CI 判据 `compareByTitle(base,head)`＝每标题副本数不得变多（新标题上限 1）；`文件缺失/空/无条目` 一律 fail-closed 抛错；`--dedup [--apply]` 保留为修复工具（同题留正文最长那份、首次出现排序、幂等）。回归锁 14 例（node:test + `os.tmpdir()` 真实临时文件，不 mock fs）：切块逐字节还原、CRLF 不动字节、干净不误报、重复按份数报出、保留最长正文、幂等、不吃掉唯一条目、`analyze.kept` 与 `dedupe` 同一份、**棘轮四形状**（旧标题+1 红 / 副本变少绿 / 新标题 1 份绿 / 新标题 2 份红）、三种取数失败抛错、`main --base` 走真 git 且 ref 取不到判红 |
| 反证（防"装饰性锁"） | PASS | 七条变异逐条「基线全绿 → 变异 → 同一测试文件变红 → 逐字节还原」：M1 `analyze` 恒 ok ⇒2 failed；M2 `collect` 吞掉文件缺失 ⇒2 failed；M3 保留规则改"留首份" ⇒2 failed；M4 去重丢 preamble ⇒1 failed；M5 从 workflow 删棘轮行 ⇒`workflow-contract` 1 failed；M6 删 `--test` 行 ⇒1 failed；M7 把并集遍历退回"只遍历 base 标题" ⇒1 failed。两条**驱动侧才是错**的情况也记下来：① 首轮 M3 **没红**，挖出的不是驱动问题而是真缺陷——`analyze` 与 `dedupe` 各写了一份"保留哪份"的规则、测试只钉住后者 ⇒ 已收敛为单一实现并补交叉断言；② 我第一版断言写成 `/--base=\$\{MB/`，漏了实际文本里的引号 ⇒ 契约测试当场红（`actual: '--base="${MB:-$BASE_REF}"'`），是断言错不是内容错，按实测改正则而非放宽 |
| 接线落点判据（进白名单前提锁） | PASS | `CHANGELOG.md` 命中 docs-only 白名单（实测 `CI_IGNORED_PATHS` 含根级 `*.md`；⚠️ 我一开始用"源码里有没有 CHANGELOG 这个词"判，得出**假阴性**——命中来自通配而非字面量）。`static-gates` 被 `docs-only != 'true'` 门控 ⇒ 必须放 `changes` job，且与 growth 同一步骤、复用同一步骤算出的 merge-base（不在第二处重算）。由 `workflow-contract.test.js` 新断言钉住位置与顺序（M5/M6 实测该锁会变红） |
| 两把锁同时为绿的现场证据 | PASS | `node scripts/check-changelog-duplicate-entries.js --base=origin/main --head=HEAD` ⇒ `冗余份数 828 -> 828；本 PR 新增副本=0` rc=0；`node scripts/check-changelog-growth.js --base=origin/main --head=HEAD` ⇒ `PASS：base 1183 条（342 种标题）全部在 head 1184 条（343 种）里` rc=0。两把锁各守一侧、不再互相要求对方变红 |
| 行尾与 diff 对账 | PASS | 本文件在 main 上是**纯 LF blob**（`CRLF=0 / bareLF=65652`），检出工作副本是 CRLF；`git add` 按 `* text=auto` 归一化回去。本 PR 对 CHANGELOG 的净改动 `git diff --numstat origin/main` = **29 / 0**（纯前插、零删除），`--ignore-cr-at-eol --numstat` 同值 ⇒ 无行尾噪声。前插走脚本并断言「新文件 = 新块 + 原文件（后缀逐字节相等）」、条目数 +1、我这条标题恰好 1 次、行尾档位不变（工作副本 `CRLF 65652→65681`、`bareLF 0→0`） |
| 其他本地门禁 | PASS | 新门禁单测 14 passed；`workflow-contract.test.js` 33 passed；`check-gate-record-debt.js` OK + 其 29 例；`check-unwired-tests.js` OK；`check-step-failfast.js` OK；`check-max-lines.js` OK；`verify-worktree-deps.js` OK |
| QM-1 打包 | N/A | 未触 `apps/desktop/electron/` 与 `packages/rpa-engine/`，改动是仓库工具脚本、workflow 正文与台账文本，不产生运行时代码路径变化 |
| QM-4 视觉 | N/A | 未触任何 `.vue`/样式/布局 |
| CI 流水线 | PENDING | 本 PR 首轮（head `0826f2883`，判据为绝对重复 + 实跑去重）**红**：`QG Changes` 失败、`Gate Result` 连带失败；取 `actions/jobs/<id>/logs` 定责到 growth 那一步（`base 1183 -> head 344`），而非我接的行（同日志里我的门禁 `条目=330 冗余=0 OK`、11 例 pass）。按上表收敛后重推，结论以本 PR 最终 head 的运行为准 |
| 依赖与配置 | PASS | 未新增第三方依赖、未改 lockfile（`pnpm install --frozen-lockfile` 仅补装本 worktree 的 node_modules） |
| 远程同步 | PENDING | 本 PR 尚未合并，merge SHA 还不存在。合并后由下一个会话取证回填：`git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 取 merge SHA 与时间，`git ls-remote --heads origin changelog-dedup-v2` 返回 0 行证远端分支已删；回填成 PASS 后**必须整段删除文件头部三个 `sync_*` 字段**（留下即报「已回填却仍留登记字段」） |

### 遗留（不假装已闭合）

- **main 上那 828 份历史副本没有被清理**，本 PR 只保证"不再变多"。清理需要一次同时修改 growth 口径的 PR（窄例外：允许削到每标题 1 份，且保留那份必须逐字节等于 base 中该标题的某一份），我已把冲突与方案写成 issue 交给决策，不在本 PR 里擅自改别人的门禁判据。
- 棘轮**拦乘法不拦重抄**：换个标题把同一段内容再抄一遍仍是漏口；副本"减到比 base 少"本判据也不管（那是 growth 的地盘）。
- 事前拦未做：把「本 PR 对 CHANGELOG 必须是纯前插」这条聚合式判据固化进 re-sync 工具（`.tools/mp-ci/` 不在仓库内）。
- `01-docs/learnings.md`（尾部追加型台账）没有同类上界判据。
