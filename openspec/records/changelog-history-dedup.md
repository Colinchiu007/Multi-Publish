---
record: changelog-history-dedup
task: 清理 CHANGELOG 的 841 份历史副本 + 给 growth 增加默认不生效的一次性授权通路 + 条目模型收敛为单一实现
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由后续回填把本行改成 PASS 并删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（或本会话的收尾轮）
---

## 本次执行记录：CHANGELOG 历史副本清理（changelog-history-dedup，2026-10-07）

> 分支：`changelog-history-dedup`；worktree：`D:/Data/projects/mp-worktrees/mp-changelog-history-dedup`
> 坐标系：开分支时 `origin/main`=`24d4c0a76` → re-merge 后 merge-base=`cbce3254158`（授权文件里的 `applies_to_base` 就是这个 sha，**由当场 `git merge-base` 打印，不是手抄**）
> 范围：🔧 门禁工具（`scripts/` 三件 + 两个测试）+ 🗄️ 台账数据（`CHANGELOG.md` 净删 47,824 行）+ 📝 OpenSpec change ⇒ 含 `scripts/` 工具脚本自身 = **混合 PR，不走 docs-only 快速通道**
> OpenSpec：`openspec/changes/dedup-changelog-history/`（`openspec validate --strict` 通过），capability 新增 `changelog-ledger-integrity`

### 为什么这件事不能靠"改宽默认判据"完成（本 PR 的判据前提）

上一轮（PR #3034）我先把结论写在 issue #3037 里说过一次「窄例外是纯增量的，owner 的两条断言原样为绿」——**那句是错的**，
错在我读了实现和测试名却没读测试体。本轮把它测实了：

| 探针 | 做法 | 实测 |
|------|------|------|
| 自动例外的后果 | 在 worktree 里把 `compareMultisets` 临时改成「允许 `m===1 && n>=2`」，跑 `node --test scripts/check-changelog-growth.test.js` | `tests 11 / pass 10 / **fail 1**`，唯一变红的就是 `真仓库四档…副本删一份=红`（其第 4 档构造的正是 `base B×2 → head B×1` 且保留份逐字节同源） |
| 还原 | `cp` 备份回写 + `a.equals(b)` 断言 + `git status --porcelain` 空 + 重跑基线 | `byte_identical_to_backup=true`、工作区 clean、基线回到 `11 pass / 0 fail` |

⇒ 「削到 1 份」与「削到 3 份」在 owner 语义里是同一类操作，区别只在数量，而数量是那条门禁**唯一**能区分的信号。
所以本 PR 不动默认判据，改为要求**书面、一次性、默认关闭**的授权（判据见下），并已在 #3037 追加评论撤回原说法。

### 门禁判据（最终实现的四条，全部要同时成立）

1. head 相对 base **新增** `scripts/changelog-dedup-authorization.json`（base 里已存在 ⇒ 例外不生效，防后续 PR 白蹭）；
2. `applies_to_base` 必须等于本次实际使用的 base 的 **sha**（`git rev-parse` 解析后比对，不等即 fatal，**不得**退化成"当作没授权"再按普通红混过去）；
3. 清理形状：每个被减少的标题在 head **恰好剩 1 份** ∧ 那一份与 base 中同标题的某一块**逐字节相同** ∧ **一个标题都不许消失**（`got=0` 一律红，这是 #2884 整份删空的兜底）；
4. 授权文件里声明的 `expected_titles_reduced` / `expected_entries_after` 必须与实测算出的数一致（数字不是注释，是判据）；且例外生效时**必须出声**打印减少量。

### 变更类型与隔离声明

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | `start-mp-task.ps1 -TaskName changelog-history-dedup` rc=0 **且按产物复核**：`git worktree list` 出现该路径、`rev-parse --abbrev-ref HEAD`=`changelog-history-dedup`、`status --porcelain` 0 行、`verify-worktree-deps.js` OK（11 项解析指向本 worktree）。pre-flight `pre-code-edit-guard.ps1` 在共享根返回 rc=1（拒绝），故全程不在共享根落笔 |
| 单一实现（口径分裂的根因） | PASS | 实测同一份 `origin/main` blob：growth `headingsOf`=**1,184/1,185**，副本棘轮 `analyze.entries`=**1,158** ⇒ 两把锁各写了一遍"什么是一条条目"。新增 `scripts/changelog-entries.js` 为唯一实现（`HEADING_RE / splitEntries / titleOf / pickKeeper / groupByTitle / analyze / dedupe / countByTitle`），两侧改为 require 它；由测试 `条目模型只有一份实现…条目总数必须相等` 钉住（RED 阶段实测该条先红，接完线后转绿） |
| TDD（红→绿全过程留痕） | PASS | 先写 10 条新用例，**RED 实测** `tests 21 / pass 15 / fail 6`（6 条全是我新增的，owner 原 11 条此时已全绿 ⇒ 我加的测试没有动他的不变量）；实现后 `21 / 21 / 0`，再补「例外必须出声」那条行为锁后为 **`22 / 22 / 0`**（终态，反证七轮跑完复测仍 22/22）。副本棘轮 **`14 / 14 / 0`** 全程未红。；实现后 `21 / 21 / 0`。中途一次断言写错（我按「lost 只有一条」断言，实际默认多重集判据在授权核对前会同时报出 A 消失与 B 削份两条 ⇒ `2 !== 1`），**改正断言的表达而不是放宽判据**：改为断言 A 必在 lost 中且 `got===0`、并要求 `authorizationError` 点名「标题消失」 |
| 测试接线 | PASS | 未新建测试文件（新用例落在两个**已被 CI 点名**的 `.test.js` 里），因此不触发 `check-unwired-tests.js`；`node --check` 三个改动脚本全过 |
| QM-1 打包 | N/A | 未触 `apps/desktop/electron/` 与 `packages/rpa-engine/`；改动是仓库门禁脚本 + 台账文本，不产生运行时代码路径变化 |
| QM-4 视觉 | N/A | 未触任何 `.vue` / 样式 / 布局 |
| 行尾与编码对账 | PASS | 全程在 **blob 域**（纯 LF）操作：`git cat-file blob <base>:CHANGELOG.md` 取底 → 前置我的条目 → `dedupe` → 写出。staged blob 实测 `CRLF=0 / bareLF=17,916 / loneCR=0 / NUL=0`；`git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` **同为 `131 47929`** ⇒ 无行尾噪声。git 提示的 `LF will be replaced by CRLF` 是本仓 `* text=auto` 的常态（blob 是 LF），不是事故 |

### 清理的无损对账（独立回读，不复用去重脚本自己的结论）

| 判据 | 实测 |
|------|------|
| base（`cbce32541`）规模 | 65,715 行 / 7,596,728 字节；**1,185 条 / 344 种标题 / 冗余 841 份 / 最坏 16 份** |
| 加我这条条目后 | 1,186 条 / 345 种 |
| 去重后 | **345 条 / 17,917 行 / 2,070,569 字节**；净删 **47,824 行 / 5,529,983 字节**，diff 新增 131 行（=我的条目）删除 47,929 行 |
| 每个保留块与 base 同源 | `all_blocks_byte_sourced_from_base=true`（以 `Set(blocks)` 逐字节比对，不是文本抽样） |
| 标题集合 | `distinct_before=345 == distinct_after=345`，脚本对「标题消失」与「集合不相等」都抛错 |
| 幂等 | 对结果再跑一次 `dedupe` ⇒ `removed=0` |
| 削减明细 | `removed=841 == redundant=841`；`titles_reduced=269`（写进授权文件的 `expected_titles_reduced`，门禁侧再独立核对一次） |

### 反证（新加的守卫必须被"拆掉它"证伪过）

驱动脚本每条都跑四步：**从 pristine 快照还原 → 基线必须全绿 → 应用变异（断言锚点命中恰好 1 次）→ 目标用例必须变红 → 逐字节还原并断言与备份 `equals`**。
基线 = `22 tests / 22 pass`（`scripts/check-changelog-growth.test.js`）。七条全部 PASS。

| 变异 | 拆掉的是什么 | 结果 |
|------|-------------|------|
| M1 `ho.length === 0` 分支改成 `continue` | 「标题消失」兜底（#2884 那一档） | `fail_after=1`，红的是 `授权例外负控一：distinct 标题少一个…` ⇒ PASS |
| M2 摘掉 `bo.some(o => bBlocks[o.index] === kept)` | 「保留份逐字节等于 base 某一份」 | `fail_after=1`，红的是 `…负控二：保留份被改写过…` ⇒ PASS |
| M3 `authBaseText = readBlobOrNullText(…)` 改成恒 `null` | 「相对 base 新增」⇒ 变成"存在即生效"，后续 PR 可白蹭通行证 | `fail_after=1`，红的是 `授权不可被后续 PR 白蹭…` ⇒ PASS |
| M4 `applies_to_base !== baseSha` 比对改成 `if (false)` | 坐标系核对 | `fail_after=1`，红的是 `…负控四：applies_to_base 与本次 merge-base 不等…` ⇒ PASS |
| M5 `if (r.authorization)` 改成 `if (false)` | 「例外生效必须出声」 | `fail_after=1`，红的是 `例外生效必须出声…` ⇒ PASS |
| M6 `if (complaints.length > 0)` 改成 `if (false)` | 授权声明数字与实测的核对 | `fail_after=4`（一批授权用例同时失去 fail-closed 保护）⇒ PASS |
| M7 `HEADING_RE` 退回窄的 `/^# \[/` | 条目模型的 canonical 口径（无括号形条目重新变失明） | `fail_after=3`，含 `无括号形条目也必须算…` 与 `条目模型只有一份实现…` ⇒ PASS |

七轮跑完后 `git status --porcelain` = 2 行，且正是本 PR 有意保留的两处后续修改（`stdio` 那条 + 新增的"必须出声"用例），
**没有任何变异残留进工作区**。

### ⚠️ 反证驱动自己先错过一次（记下来，免得下一个人以为"反证没红＝锁坏了"）

第一版驱动用 `^✖ ([^ (]+)` 取失败用例名 —— 本仓用例标题里带空格（`授权例外负控一：distinct 标题少一个…`），
于是只截到 `授权例外负控一：distinct`，而我拿 `'distinct 标题少一个'`（含空格）去 `includes` 匹配 ⇒
**M1/M3/M4 被报成 `expect_hit=false`，看起来像"变异没打中"**，实际 `fail_after=1` 且红的就是预期的那三条。
口径：① 取失败用例名必须按「到耗时括号为止」整段取（`^✖ (.+?) \([\d.]+ms\)`）并滤掉 `failing tests:` 表头；
② 期望串一律取**不含空格的短词**（`负控一` / `白蹭` / `必须出声`）；
③ 「反证报未红」先怀疑驱动的取数，再怀疑锁 —— 与 [[feedback-mismeasured-falsification]] 同源。
改正后重跑，七条全部 PASS（上表是重跑结果，不是首跑）。

### 两处运行期发现并当场修掉的缺陷

| 缺陷 | 修法 |
|------|------|
| 授权探测把 git 的 `fatal: path '…authorization.json' exists on disk, but not in '<ref>'` 泄漏进判据输出 —— 那本来是"base 里没有授权文件"这条**正常信号**，但读起来像出错 | `execFileSync` 默认 `stdio` 把 stderr 继承给父进程 ⇒ 默认 runner 显式设 `stdio: ['ignore','pipe','pipe']`；顺带让 `e.stderr` 真的可读（原来错误文案只能落到裸 `e.message`） |
| 「例外生效必须出声」当时只写在实现里，没有任何东西在判 | 补一条行为锁：捕获 `main()` 的 stdout/stderr，断言出现 `例外由授权触发`、`共减少 2 份副本`、`条目 4 -> 2` 与授权路径名（由 M5 实测确认该锁可被打红） |

### CI 流水线

| 门禁 | 状态 | 证据 |
|------|------|------|
| CI 流水线 | PENDING | 本 PR 尚未推送；推送后按 `QG Changes` 日志逐字取 growth 的「例外由授权触发」那一行与棘轮的 `828/841 -> 0` 输出 |
| QM-6 双模型外部评审 | PENDING | 判定器定档 `dual`（>200 行）；若沿用替代通道需在此声明 harness 偏差 |
| 远程同步 | PENDING | 本 PR 尚未合并，merge SHA 还不存在。合并后取证回填：`git log origin/main --grep='(#NNNN)$' --format=%H\|%cI`、`git ls-remote --heads origin changelog-history-dedup` 返回 0 行；回填成 PASS 后必须整段删除本文件头部三个 `sync_*` 字段 |

### 遗留（不假装已闭合）

- 授权文件里的 `owner_pr` 现在写的是 `branch:changelog-history-dedup (issue #3037)` 而不是 PR 号 —— 因为 PR 号在文件落盘时还不存在，而我拒绝"提交后再改一次授权文件"这种会把同一个文件改两遍、逼 CI 重跑一轮的写法。归属可由分支名与提交信息回查。
- `--dedup` 的保留规则是「同题留正文最长那份、按首次出现排序」，因此清理会**重排**幸存块的位置（不是纯原位删除）。逐字节同源与标题守恒都成立，但 reviewer 看到的 diff 里含位置移动；这是 #3034 那轮就定下并被交叉断言钉住的行为，本 PR 不改。
- `01-docs/learnings.md` 这类尾部追加型台账仍没有同类上界判据（沿袭 #3034 的遗留）。
