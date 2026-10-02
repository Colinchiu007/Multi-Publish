---
record: fix-auth-partition-content-select
task: 修复 auth 分区兜底「只按字典序末位定位」——一次失败/取消的登录留下的空壳分区会永久遮断该平台凭证兜底；定位改为按内容择新，并与回收保留窗口同源
date: 2026-10-02
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；且 QM-6 双模型外部评审因本机 CC Switch 代理（127.0.0.1:15721）未运行而无法执行，须在代理恢复后补做再合并
sync_backfill_owner: 下一个会话（代理恢复后先补 QM-6，再按 git log origin/main --grep='(#NNNN)$' 回填）
---

## 本次执行记录：auth 分区兜底按内容择新——失败/取消的登录不再遮断该平台凭证（fix-auth-partition-content-select，2026-10-02）

> 分支：`fix-auth-partition-content-select`；worktree：`D:/Data/projects/mp-worktrees/mp-fix-auth-partition-content-select`（基线 `origin/main` = `341e48fc`，推送前已 re-sync 到当时的 main 头部）
> 范围：🐛 运行时缺陷修复（issue #2734）——`apps/desktop/electron/services/auth-partition.js`（选址规则重写）、`auth-partition-reclaim.js`（保留窗口与探测窗口同源）、`rpa-view-session.js`（消费方）+ 两份回归测试 + `01-docs/BUGFIX-AUTH-PARTITION-CONTENT-SELECT-2026-10-01.md` + AGENTS.md QM-2 + CHANGELOG
> 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → **docs-only=false**（含 `apps/desktop/electron/` 运行时代码）⇒ 走完整质量节拍

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 独立 worktree + 裸分支（PowerShell 原生 `D:` 路径 `git worktree add`，建完三连实证 `--show-toplevel` / 分支名 / `rev-list --left-right --count origin/main...HEAD = 0/0`）；依赖就绪 `pnpm install --frozen-lockfile` rc=0 + `ensure-electron.js`（v43.1.1）+ `verify-worktree-deps.js` OK。共享根 `main` 全程未触碰。`--no-verify` 未使用 |
| 第一性原因（QM-5 ①） | PASS | 选址规则把「时间上最新」当成「有登录态」：`openLogin` 每次新建带 `Date.now()` 的分区，失败/取消的登录同样新建，而 `close()` 又把刚关闭的分区名当 `activePartitionNames` 传给回收端 ⇒ 空壳既不被清也不被删，且它就是字典序末位。末位口径由 kuaishou-w3-live-fix 从 `rpa-view-session` 早期实现抄入，当时分区名带账号 id（一账号一份），「最新即有效」恰好成立；会话化改造后前提失效而规则未跟进 |
| 逃逸分析（QM-5 ②） | PASS | **单元层是主逃逸点**：`auth-partition.test.js` 的 `mockPartitionCookies(cookies)` 对所有分区返回**同一份** cookie，「新旧两份内容不同」这个形状在夹具里不可表示；集成层走同一接缝；E2E/视觉层需要「先失败登录再成功登录」的跨会话时序，场景集里没有；审查层 QM-2 有登录态**状态**规则，无「按名字择新 ≠ 按内容择新」这条**选址**规则。#2701 自己的「回收前后返回同一分区名」锁在旧规则下**恒真**，对新规则零防御力 |
| 系统性漏洞（QM-5 ③） | PASS | 测试场景缺失（夹具对「按输入区分」结构性免疫）+ 一条无名的跨模块耦合：**回收保留数**与**定位探测窗口**是同一个决策的两端，却分别写死在两个文件里 |
| 修复 + 回归保护（QM-5 ④） | PASS | 三条判据：① 同组**从新到旧按内容**探（判据复用共享实现 `isPlatformCookieDomain`，命中即停）；② 探测上限 `PROBE_LIMIT=5` 单一真源在 reclaim 模块、由 auth-partition 再导出，**回收端每组保留数取同一个值**（原来只留末位——新规则下那等于删掉兜底唯一可读的一份）；③ 日志三分 `no-candidate` / `all-empty`（列出探过哪几份）/ `probe-failed`。`findAuthPartitionDir` 删除（无生产调用方，留著即第二份口径），API 轨与 RPA 轨共用 `selectAuthPartition`。测试：定位 18 passed（含 9 条新）、回收 26 passed，两文件 44 passed；消费方 4 文件 62 passed。TDD 顺序可查：新块先跑为 **8 failed / 9 passed**，落实现后 18/18 |
| 反证（锁必须在跑） | PASS | 5 条变异逐条实测变红、跑完逐字节还原（断言 `Buffer.compare` 与备份相同）：M1 定位退回「无脑取最新」⇒ 4 failed；M2 摘掉探测上限 ⇒ 1 failed；**M3 回收退回「每组只留末位」⇒ 11 failed**（这条证的就是本次耦合）；M4 探测失败谎报 all-empty ⇒ 1 failed；M5 「无候选」与「探过都空」合并成一条日志 ⇒ 1 failed |
| 行尾与 diff 对账 | PASS | 五个目标文件实测**全 CRLF**；改动一律逐行 `split('\n')` + 剥 `\r` 比较 + 写回保留各行原结尾（新行补 `\r`），每个锚点断言恰好命中 1 次。改后 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径完全相等；`.quality-gates.md` 之外的 CHANGELOG 混行尾基线保持原样（裸 LF 218→218、双 CR 27→27）；AGENTS.md 插入用「摘掉我这段必须逐字节还原」做强判据而非 `endsWith` |
| re-sync（2026-10-02，本轮第二次） | PASS | 推送前 `gh pr view` 实测 `mergeable=CONFLICTING / mergeStateStatus=DIRTY`，`git merge-tree --write-tree origin/main HEAD` 定位到**唯一冲突文件 `CHANGELOG.md`**（main 这轮进了 #2764 / #2768 / #2769 三笔，其中 #2764 也在顶部前插）。解法走**参照解**而非 union：脚本先断言「我方块 = HEAD 相对 merge-base 的纯前插」（`ol.slice(k).join('\n') === base` 成立，k=9）且**每行都以 `\r` 结尾**，再写成「我方 9 行 + `git show origin/main:CHANGELOG.md` 全文」，逐行字节核对（9 行 + main 全文每一行都等值）；解后 `git diff --numstat origin/main HEAD` 与 `--ignore-cr-at-eol --numstat` 两口径**完全相等**，CHANGELOG 净 `9/0`。合并后静态门禁在新基线上重跑全 rc=0：`check-gate-record-debt`（`已登记欠账 16 条 / 记录文件 8 篇`，比上次多的 3 篇是并发会话的 #2764/#2768/#2769 记录）、`check-no-brand-residue`（6613 个 tracked 文件）、`check-max-lines`、`check-unwired-tests`（53 个测试文件全接线）、`check-docs-sync.sh`。测试在新基线重跑：`auth-partition.test.js` 等 4 文件 **93 passed**，`packages/shared-utils` 的 `platform-definitions.test.js` **47 passed**；`verify-worktree-deps.js` OK。 |
| QM-1 打包 | PASS | `pnpm run build:dir` 实测 **PACK_RC=0**（判据取日志里的 rc 行，不信后台通知）。产物侧另跑独立验证：`app.asar` 14,745 条目、`*.test.*` **0** 条、`electron/tests/` **0** 条，且 6 项**内容**判据真读为真（含 `selectAuthPartition` 在包内、`findAuthPartitionDir` 已从包内消失、回收端 `bucket.slice(-PROBE_LIMIT)`）。此处补一条方法教训：`Asar.listPackage` 返回 `\electron\…`，而 `extractFile` 要**无前导的平台分隔**形态——用归一化路径读会全部 not found，空读会让「不含旧 API」这类反向断言**空转成立**；验证脚本已改成「内容 < 500 字节即抛错」 |
| QM-4 视觉 | N/A | 未触任何渲染面（改动全在主进程服务 + 单测 + 文档） |
| 接线棘轮 | N/A | 未新增测试**文件**（两个既有 `*.test.js` 同目录扩展，由 vitest workspace 收集；`check-unwired-tests.js` 的域是 `scripts/`、`.github/scripts/` 与全仓减去排除，本次文件本就在被收集域内） |
| Gate 11 eslint | PASS | `eslint electron/services/{auth-partition,auth-partition-reclaim,rpa-view-session,auth-partition.test,auth-partition-reclaim.test}.js --quiet` → rc=0、零输出（判据取重定向后的 `ESLINT_RC`，管道 `| tail` 会吃掉真 rc，本仓实测踩过） |
| QM-6 CCG 双模型外部评审 | **未执行（本机外部模型通道当前不可用）** | 如实记录，不以自审冒充通过。第一手证据：`codeagent-wrapper --backend codex` 两次 rc=1（长/短提示词各一次，先否证了「stdin 模式导致失败」这个猜测），直跑 `codex exec` 抓到 `ERROR: unexpected status 502 Bad Gateway: url http://127.0.0.1:15721/v1/responses`（重连 5/5 后放弃）；`--backend claude` 同样 rc=1 且无 findings 文件，直跑 `claude -p` 挂起 >2 分钟未产出；决定性判据 `Test-NetConnection 127.0.0.1 -Port 15721 -Quiet` = **False** ⇒ 本地 CC Switch 代理未在运行。wrapper 会在退出时删除自身日志，所以取证一律走「直跑 + 让评审把结论写进工作区文件」两条，本次两条都没产出 ⇒ 结论是**没跑成**，不是「跑了没问题」。任务书已备好 `.ccg-review-brief.md`，代理恢复后直接重放两路。**2026-10-02 再探针一次，结论未变**：`Test-NetConnection 127.0.0.1 -Port 15721 -Quiet` 仍 **False**；两条 primary 都硬绑该代理（`~/.codex/config.toml` 的 `model_providers.custom.base_url = http://127.0.0.1:15721/v1`、`~/.claude/settings.json` 的 `env.ANTHROPIC_BASE_URL = http://127.0.0.1:15721`），代理不下两条通道就都不存在。**第三条替代通道实试过并排除**：`dsh headless "reply with exactly: OK"` → rc=1、`dsh: QUOTA: Insufficient Balance (request_id: 7d892c11-e948-4637-ac50-b573a5e6fae5)`，即该账号无余额，不能用来出评审结论。**顺带记一条口径问题**：`config.toml` 里 frontend/backend 两条 primary 名字是 `claude`/`codex`，但两侧的 `*_MODEL_NAME` 实际都指向 `deepseek-v4-flash`——所以所谓「双模型」在本机配置下是**两个 harness、同一个底模**。这不改变"必须外部执行"的要求，但意味着"跨家族对抗"这一层收益比 AGENTS.md 字面承诺的弱，值得在治理侧单独说清（不属本 PR 范围） |
| 依赖漏洞审计 | N/A（本 PR 未触依赖） | 未改任何 manifest/lockfile。该门禁当前的 12 条新 axios 公告红已由 `d62187dd` 按其自身口径登记挂账（`scripts/dep-audit-baseline.json`，`decision=upgrade-tracked`），与本 PR 无关 |
| 远程同步 | PENDING | 合并前无法取证（PENDING 的既有语义）。回填者＝下一个会话：`git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 取 merge SHA 与时间、`git ls-remote --heads origin fix-auth-partition-content-select` 返回 0 行证远端分支已删；回填时须**同时删除**本文件 frontmatter 的 `sync_status` / `sync_reason` / `sync_backfill_owner` 三个字段（留着不删 = 门禁报「已回填却仍留登记字段」）。另记一次现场：本行**首次撰写时被漏掉**，是 `check-gate-record-debt.js` 以「记录文件整块缺 远程同步 行」当场判红抓到的——新载体把欠账登记从外部清单搬进了文件自身，但字段漏写同样只由门禁而非记忆兜住 |

### 遗留（不假装已闭合）

1. **QM-6 必须补做才能合并**（本条是 PR 的硬前提，不是可选步骤）。
2. 空壳分区本身仍不会被主动删除：本 PR 修的是**读**不是**清**。按内容删除需要「该分区确实没有可用凭证」的可靠判据，而 `isPlatformCookieDomain` 对个别平台偏窄——误判即等于抹掉不可恢复的凭证。故选择「窗口内保留 + 按内容择新」的保守折中（每组最多 5 份，仍是硬上限，不会回到 #2701 立项时的无界增长）。留痕见 `01-docs/BUGFIX-AUTH-PARTITION-CONTENT-SELECT-2026-10-01.md` §8。
3. 探测窗口内每份都会实例化一个 `persist:` Session，而这类 Session 在浏览器进程内**永不销毁**（#2701 根因之一）。当前靠「命中即停 + 上限 5」把代价压成常数，但这是**取舍不是消除**；若评审认为需要，替代形态是按磁盘只读探测（`node:sqlite`）选型、仅对中选分区实例化 Session——该形态在 Electron 内嵌 Node 上的可用性未实测，故本次没做。
4. 回收端 `close()` 仍把刚关闭的分区名标为 active（因此空壳当场不删）——这是 2 里保守策略的一部分，等 QM-6 结论再决定是否收紧。
