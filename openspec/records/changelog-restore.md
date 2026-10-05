---
record: changelog-restore
task: 回灌 CHANGELOG.md 被 PR #2884 截断掉的 1131 条历史条目（逐字节，不改写历史）
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；回填者＝下一个会话，回填后必须删除本段三个 sync_* 字段，否则门禁报「已回填却仍留登记字段」
sync_backfill_owner: 下一个会话（取 git log origin/main --grep='(#NNNN)$' 的 merge SHA 与时间）
---

## 本次执行记录：CHANGELOG.md 截断抢救（changelog-restore，2026-10-05）【docs-only】

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | 纯文档 | 文件面只有 `CHANGELOG.md` + 本记录载体；仍建了 worktree `D:/Data/projects/mp-worktrees/mp-changelog-restore`（分支 `changelog-restore`，base `06b161912`），原因是共享主工作区此刻有并发会话在改 `AGENTS.md`，就地 commit 会把别人的在制提交卷进我的分支。三连实证：`rev-parse --show-toplevel` = 该路径、`--abbrev-ref HEAD` = `changelog-restore`、`HEAD` = base |
| 判定 | docs-only=true | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` 见下方备注（两个文件均命中文档白名单：根级 `*.md`） |
| 第一性原因（QM-5 ①） | 已定位 | `b531bdfe7`（PR **#2884**「feat(ai-taste): 刀2——桌面端词库接线 + 运营中心管理页」，2026-10-04T16:42:41Z）把 `CHANGELOG.md` 从 `7,474,293` 字节写成 `9,155` 字节 —— 即**整份替换**而非顶插。取证：`git log --format=%H -25 origin/main -- CHANGELOG.md` 逐提交 `git cat-file -s <sha>:CHANGELOG.md` 量 blob 尺寸，唯一一次数量级下跌就是它。该提交的 `--name-status` 里**没有任何归档文件**（新增的都是 `rewrite-ai-taste-*` 代码/PRD），所以这不是"搬家"，是丢失 |
| 逃逸分析（QM-5 ②） | 逃逸链五层全空 | ①单元测试：没有任何测试读 `CHANGELOG.md` 的规模/条目数；②门禁层：`check-docs-sync.sh` 只判「diff 里有没有白名单文档」，一个把文档删空的 PR 照样满足；③`check-max-lines` 的 `SCAN_DIRS=['apps/desktop/src','apps/desktop/electron','packages','ops-center/backend']` + `SOURCE_EXTS` 不含 `.md` ⇒ 根级 CHANGELOG **不在扫描域**（本 PR 实跑该门禁：超限文件=98 挂账=98 ✅，与它无关）；④`check-gate-record-debt` 只看记录载体/账本，不看 CHANGELOG；⑤代码审查：blob 从 7.4MB→9KB 在 diff 里表现为"删了 6 万行"，但在一个 40+ 文件的功能 PR 里没被当回事。**共同点：这是一份 append-only 台账，却没有任何东西在守它的单调性** |
| 系统性漏洞（QM-5 ③） | 具体到文件 | 缺一个「CHANGELOG 只可增长」的判据。落点应是 `.github/workflows/quality-gate.yml` 的 `changes` job 且放在非-PR 早退之前 —— 依据 AGENTS.md 的「进白名单前提锁」：`CHANGELOG.md` 命中 `CI_IGNORED_PATHS` 的根级 `*.md`，若把校验放在被 `docs-only != 'true'` 门控的 `static-gates`，等于给自己关掉校验 |
| 修复 + 回归保护（QM-5 ④） | 本 PR = 修复；回归保护在下一个 PR | 回灌由 `restore-changelog.js` 生成，判据全在字节域、任一不成立即抛错不落盘：① `result[5854:]` 与 `b531bdfe7^:CHANGELOG.md` **逐字节相同**（历史一个字没改）；② H1 条目数 6 + 1133 − 2 = **1137**（`w3-closure` / `publish-throughput` 两条当前与 parent 都有，只保留 parent 那一份，不重复）；③ 当前 6 条标题与 parent 1,133 条标题**逐条都在结果里**；④ 顶插的新块恰好 4 条 H1；⑤ 无冲突标记、无 NUL。staged blob 复核：`git cat-file blob :CHANGELOG.md` = `7,480,147` 字节且与期望结果 `EQUAL=true`，blob 内 CR 计数 **0** |
| 防止再次发生（QM-5 ⑤） | 已排期，未在本 PR | 新增 `scripts/check-changelog-growth.js` + 单测并接进 `changes` job（任务 #32）。本 PR 刻意只做数据抢救：加门禁要动 `.github/workflows/` ⇒ 属混合 PR ⇒ 完整 CI（实测 25–30 分钟 ≥ main 前进间隔），而顶插型共享件在慢 PR 上会反复撞 re-sync（上一轮 axios 就是这个形态撞了三轮） |
| 行尾与 diff 对账 | ✅ | `git diff --cached --numstat` = `64368 0`，`--ignore-cr-at-eol --numstat` = `64368 0` —— **两口径逐字相等**，删除数 0（纯插入，没有改写任何历史行）。工作树保持 CRLF（`7,544,617` 字节）、blob 保持 LF（`7,480,147`），差异 = 64,470 个 CR，与行数一致；根因是 `.gitattributes` 的 `CHANGELOG.md: text auto` + `eol: unspecified` ⇒ checkout 用 native，`git add` 归一成 LF |
| 品牌残留 | ✅ | 回灌前先按 Gate 12 的**同一构造**（品牌词按码点拼、转 latin1 字节域、含第三方签名域名豁免）预扫 parent blob：**命中 0 处**，所以"恢复历史"不会把品牌词重新带进仓库。当前 6 条与结果同样 0 命中 |
| 接线棘轮 | N/A | 本 PR 不新增任何 `*.test.*`；回归锁在下一个 PR 与本 PR 的接线同一次落地（#2718 打通的快速通道不适用于"新增测试"） |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/`、未触 UI 文件 |
| QM-6 CCG 双模型外部评审 | 未执行 | 纯文档抢救按 AGENTS.md 不强制 QM-6；且本机 QM-6 通道本会话未验证（`gh` 在 Git Bash 下 rc=0 零输出、CC Switch :15721 存活未测）。**如实记「未执行」，不以自审冒充通过** |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin changelog-restore` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 差量与归属（别把别人的成果写成我的）
- 本 PR **只新增** 5,854 字节的顶插块（#2894 / #2884 / #2888 / #2848 四条 CHANGELOG 条目，作者分别是并发会话与我）之外**没有任何内容创作** —— 其余 `7,474,293` 字节是 `b531bdfe7^` 上既有历史的原样回灌。
- 因此本 PR 不声称"新增 CHANGELOG 条目"，它做的是**撤销一次误删**。

### 遗留（不假装已闭合）
- **CHANGELOG 内部重复**：回灌源本身带病 —— 1,137 条 H1 只有 **302 个不同标题**，267 种标题重复出现（最多 4 次）。这是截断之前的既有缺陷（记录在案，非本次引入），正解需要一次「按条目语义去重、保留最新一份」的独立改动，且必须先解决"同一标题的多个副本内容可能已各自被编辑"的归并判断；在抢救 PR 里顺手去重会把「撤销误删」和「改写 3.7MB 历史」两件事混进同一个 diff，出错无法二分。
- **回归保护尚未落地**：见 QM-5 ⑤，由任务 #32 承担。在它合并之前，同类截断仍然可以全绿通过。
- **`ops-center/frontend` 的 CHANGELOG 缺位**：`ops-center` 有自己的 `01-docs/CHANGELOG.md`（172,449 字节，另一条链），本次未动，也未判断两者关系。
- **共享根并发**：`AGENTS.md` 在本会话期间被另一会话改写（docs-only 模板的「远程同步」写法），我未参与也未回滚，仅避开该文件。
