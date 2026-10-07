---
record: changelog-dup-gate
task: CHANGELOG 置顶条目重复的检测与去重门禁（事故修复 + 防复发接线）
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由下一个会话回填 PASS 并删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话
---

## 本次执行记录：CHANGELOG 重复条目检测与去重门禁（changelog-dup-gate，2026-10-07）

> 分支：`changelog-dedup-v2`；worktree：`D:/Data/projects/mp-worktrees/mp-backfill-2773-sync`（基线 `origin/main`=`2ceceb1eb`）
> 范围：🛠 流程/工具变更 + ⚙️ CI 接线（`scripts/` 新门禁 + `.github/workflows/` 正文 + `.gitignore` 反选 + `CHANGELOG.md` 内容修复）⇒ 含 workflow 改动，属**混合 PR**，不走 docs-only 快速通道
> QM-6：按 AGENTS.md「纯文档/流程变更（openspec/、docs/、scripts/ 工具脚本）不强制 QM-6」；但本 PR 动了 `.github/workflows/` 正文，**未做双模型外部评审**，如实记为缺失而非"零发现"

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 含 `.github/workflows/` 与 `scripts/` 改动 ⇒ 混合 PR，按 AGENTS.md 分层规则走独立 worktree + PR。worktree 由 `git worktree add -b changelog-dedup-v2 origin/main`（PowerShell 原生 `D:\` 路径）建立，判据按产物：`rev-parse --abbrev-ref HEAD`=`changelog-dedup-v2`、`status --porcelain` 0 行、`verify-worktree-deps.js` OK（11 项解析指向本 worktree）。共享根 `D:/Data/projects/Mulpub` 当时有**另一会话已暂存的 4 个文件**（`.quality-gates.md`/`CHANGELOG.md`/`bilibili-bvid-extract`/账本）⇒ 未在共享根落笔 |
| 第一性原因（QM-5 ①） | PASS | 复制不是"手滑粘了两遍"，而是 re-sync 解冲突的算法：`myBlock = mine − oldBase` 里的 `oldBase` 滞后时，**上游自己新增的那一大段也被算进"我的块"**，再 prepend 到 theirs 全文 ⇒ 整份文件被复制。取证：`1dd05b12`（#2792）相对上一个动本文件的提交 `4647f21b` 是 277 条目/1.86MB → 1097 条目/7.37MB，同一标题最坏重复 16 次；#2844 去重到 278 之后，到 `2ceceb1eb` 又涨回 **1157 条目 / 828 份冗余 / 最坏 16x**——即"修过但没人守" |
| 逃逸分析（QM-5 ②） | PASS | 逃过了什么：① 没有任何门禁检测 CHANGELOG 内容重复（`.quality-gates.md` 的翻倍由 `check-gate-record-debt.js` 的标题计数守着，CHANGELOG **无对应判据**）；② `check-docs-sync` 只看"有没有动文档"，不看文档被写坏；③ `check-max-lines` 对 `CHANGELOG.md` 是挂账项，行数从 6.5 万涨到 6.6 万都在既有账内 ⇒ 三条门禁各自"合理地"没管这件事。属 AGENTS.md 五类里的「测试不执行/流程缺失」复合 |
| 系统性漏洞（QM-5 ③） | PASS | 「门禁缺失漏洞」：**置顶型共享文档的"内容级损坏"没有检测器**，只有"是否被改动"的检测。落点：`.github/workflows/quality-gate.yml` 的 `changes` job（唯一不会被 docs-only 短路的位置） |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `scripts/check-changelog-duplicate-entries.js`（条目=以 `# [未发布]` 标题行起始的整段原文；同题出现 >1 次即红；缺失/空/无条目一律 fail-closed 抛错）与 `--dedup [--apply]` 修复子命令（同题保留正文最长那份、按首次出现排序、幂等）。本次实跑去重：`entries=1157 -> 329 removed=828`，写盘后独立回读 `redundant=0`；对真实坏文件（`git show origin/main:CHANGELOG.md` 落临时目录）门禁 rc=**1**。回归锁 11 例（node:test + `os.tmpdir()` 真实临时文件，不 mock fs）：切块逐字节还原、CRLF 文本不改动字节、干净不误报、重复按份数报出、保留最长正文、**幂等**、不吃掉唯一条目、`analyze.kept` 与 `dedupe` 实际保留同一份、三种取数失败抛错、`main` 退出码契约、`--apply` 写盘后独立回读且第二跑不动字节 |
| 反证（防"装饰性锁"） | PASS | 六条变异逐条「先跑基线全绿 → 应用变异 → 跑同一测试文件」，各让预期锁变红，还原后与备份**逐字节相同**：M1 `analyze` 恒 ok ⇒ 11→2 failed；M2 `collect` 把"文件缺失"吞成正常返回 ⇒ 11→2 failed；M3 保留规则改"留首份" ⇒ 11→2 failed；M4 去重丢 preamble ⇒ 11→1 failed；M5 从 workflow 正文删掉门禁本体那行 ⇒ `workflow-contract.test.js` 33→1 failed；M6 删掉 `--test` 那行 ⇒ 同锁 33→1 failed。⚠️ M3 第一轮**没红**，暴露的是真缺陷：`analyze` 用 `pickKeeper`、`dedupe` 另写一份内联比较（同一规则两份实现，测试只钉住后者）——已收敛为单一实现并补交叉断言后重跑变红。驱动自身两条坑也被抓到：node:test 汇总行是 `ℹ pass/fail` 而非 `# pass`；以及"接线该由谁守"要先问对——`check-unwired-tests` 守的是测试文件，门禁脚本的接线只能由 workflow 结构契约守，所以补的是 `workflow-contract.test.js` 的断言 |
| 接线落点判据（进白名单前提锁） | PASS | `CHANGELOG.md` 命中 `CI_IGNORED_PATHS` 的根级 `*.md`（实测 `classify-docs-only.js` 导出 `*.md`，我一开始拿"源码里有没有 CHANGELOG 这个词"去判，得出**假阴性**——命中来自通配而非字面量）；而 `static-gates` 整个 job 被 `docs-only != 'true'` 门控 ⇒ 门禁必须放 `changes` job 且在非 PR 早退**之前**（与 `check-gate-record-debt` 同位，main push 那一档同样覆盖）。由 `workflow-contract.test.js` 新增断言钉住位置（M5/M6 已实测该锁会变红） |
| 行尾与 diff 对账 | PASS | main 上本文件是**纯 LF blob**（`CRLF=0 / bareLF=65652`），检出后的工作副本是 CRLF（`git add` 按 `* text=auto` 归一化回去）。实测索引 blob：`origin/main` 7589653 字节 / CRLF=0，暂存后 2064621 字节 / **CRLF=0** ⇒ 提交差异是纯内容差 `130/47900`，`--ignore-cr-at-eol --numstat` 同值 ⇒ 无行尾噪声。追加自己的 CHANGELOG 条目走字节前插脚本，断言「新文件 = 新块 + 原文件（后缀逐字节相等）」、条目数 +1、行尾档位不变（`CRLF 17861→17882`、`bareLF 0→0`） |
| 其他本地门禁 | PASS | `check-unwired-tests.js` OK（新测试文件已被 workflow 正文点名）；`check-step-failfast.js` OK；`check-max-lines.js` OK（无新增超大文件）；`check-gate-record-debt.js` OK；`workflow-contract.test.js` 33 passed；新门禁对本 PR 结果文件 rc=0 |
| QM-1 打包 | N/A | 未触 `apps/desktop/electron/` 或 `packages/rpa-engine/`——改动全是仓库工具脚本、workflow 正文与 CHANGELOG 文本，不产生运行时代码路径变化 |
| QM-4 视觉 | N/A | 未触任何 `.vue`/样式/布局 |
| 依赖与配置 | PASS | 本 worktree 原无 `node_modules`，`node --test .github/scripts/workflow-contract.test.js` 直接 `Cannot find module 'js-yaml'`（跑前未验依赖，是驱动侧假失败的成因之一）。按 AGENTS.md 补 `pnpm install --frozen-lockfile`（rc=0，lockfile 未变）+ `verify-worktree-deps.js` OK 后才采信测试结果 |
| 远程同步 | PENDING | 本 PR（未开）尚未合并，merge SHA 还不存在。合并后由下一个会话取证回填：`git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 取 merge SHA 与时间，`git ls-remote --heads origin changelog-dedup-v2` 返回 0 行证远端分支已删；回填成 PASS 后**必须整段删除文件头部三个 `sync_*` 字段**（留下即报「已回填却仍留登记字段」） |

### 遗留（不假装已闭合）

- 门禁只检测**同一标题重复**；"同一段内容换个标题重抄"仍是漏口，本次未覆盖。
- `01-docs/learnings.md`（尾部追加型）与 `.quality-gates.md`（顶部追加型）的内容级重复没有本判据——后者只有 `check-gate-record-debt.js` 的标题计数，前者暂无。
- **上游动作没被事前拦**：本门禁是事后检测（坏内容进 main 后该 job 变红），不阻止某条 re-sync 的写法。事前拦需要把聚合式判据（`git diff --numstat origin/main -- CHANGELOG.md` 必须等于「我的条目行数 / 0」）固化进 re-sync 工具本身，而 `.tools/mp-ci/` 不在仓库内，属另一次改动。
- 去重保留"正文最长那份"是启发式：若同题多份正文互有内容且长度相同，会保留首次出现那份，可能丢掉后一份里的增量。本次 828 份冗余全部是逐字节复制（长度相同），因此未触发该风险，但判据本身不保证。
