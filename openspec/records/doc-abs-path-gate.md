---
record: doc-abs-path-gate
task: 新增文档绝对路径有效性门禁 + 删除 python-backend 死脚本
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；`git log origin/main --grep` 取不到证据。
sync_backfill_owner: 合并后的下一个 docs-only 回填 PR（与 ledger 销账同一次提交）
---

## 本次执行记录：文档绝对路径有效性门禁 + 死脚本清理（doc-abs-path-gate，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | **混合 PR**（`scripts/` + `.github/workflows/` + `packages/`）→ 走完整质量节拍，不用 docs-only 通道。隔离 worktree `D:\Data\projects\mp-worktrees\mp-doc-abs-path-gate`（分支 `doc-abs-path-gate`，基线 `a697ef49`）；`pre-code-edit-guard.ps1` 在 worktree 内 exit=0 放行，全程未在共享根落盘 |
| 第一性原因（QM-5 ①） | ✅ | 两件事各有一个根因。<br>① **门禁缺失**：仓库根 2026-10-06 改名后，文档里的绝对路径不跟着改，于是静默失效（PR #3000 修了 3 处，但**没有任何门禁**防止再犯——`check-no-brand-residue.js` 只管品牌词，不管路径有效性）。<br>② **死代码**：`update_account_isolation.py` 是给 `douyin.py` 注入 `_get_browser_data_dir` 的一次性补丁脚本，而该方法早已正式落在 `publishers/base.py:405`（`douyin.py:567,774` 已在调用）——脚本硬编码云端沙箱路径，本机根本跑不起来 |
| 逃逸分析（QM-5 ②） | ✅ | ① `check-docs-sync.sh` 只判「有没有改文档」，不判「文档内容对不对」；`check-no-brand-residue.js` 判品牌词；两者都不做路径有效性判定，于是这一类别**在 CI 上是空白**。② python 侧没有任何「未引用文件」检测；`scripts/` 下的孤儿脚本不会被 `check-unwired-tests.js` 抓到（它只管 `*.test.*` 的**接线**，不管实现文件有没有人用） |
| 修复 + 回归保护（QM-5 ④） | ✅ | 新增 `scripts/check-doc-abs-paths.js` + 13 个用例的 `.test.js`。**承重已用变异反证证明**（见下节）：判定逻辑短路 → 4 个用例变红；恢复 → 13/13 绿。死脚本删除后跑 python-backend 全量 **2797 passed / 5 failed**，5 个失败逐一在 `origin/main` 基线复跑归因：3 个基线同样失败（既有）、2 个单独跑通过（全量并发下的顺序污染），**与本次改动无关** |
| 防止再次发生（QM-5 ⑤） | ⚠️ 部分 | 已落地：① 门禁接入 `changes` job「Gate 12b」，并在 `.gitignore:106` 的 `scripts/*.js` 白名单里显式放行（否则新脚本**进不了版本库**——这是本轮第二个实测发现）。② 死脚本无自动防线：仍缺「未引用文件检测」，本 PR 不做 |
| 行尾与 diff 对账 | ✅ | 两口径 numstat 逐行一致（详见提交时取证）。本轮新增文件均按仓库既有 CRLF 约定落盘 |
| 接线棘轮 | ✅ | `node scripts/check-unwired-tests.js` → `检查域内测试文件 59 个 → OK: 全部测试均已接线或按欠账登记`。门禁本体与自测同在 Gate 12b 一步内：`node --test …test.js` 紧跟 `node …js` |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 `apps/desktop/electron/` 或 `packages/rpa-engine/`；删除的是 `packages/python-backend/scripts/` 下的一次性脚本，不进打包产物 |
| QM-6 CCG 双模型外部评审 | ❌ **未执行（如实登记）** | 本机 `codeagent-wrapper` 通道此前实测不干净。**不以自审冒充通过**。本轮机械反证能证明「门禁有承重、接线成立」，**不能替代**对判定口径是否过宽/过窄的多视角复核 |
| 远程同步 | PENDING | 本 PR 未合并；已在 `scripts/gate-record-debt-ledger.json` 按 `.quality-gates.md` 记录标题登记。合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin doc-abs-path-gate` 返回 0 行证远端分支已删；回填与**删除 ledger 登记项、删除本文 frontmatter 的三个 sync_* 字段**必须同一次提交 |

### 变异反证（本轮唯一有分量的机械证据）

把 `firstMissingSegment` 的入口短路（`if (true) return null;`，判定彻底废掉）后：

| 状态 | pass | fail | 变红的用例 |
|---|---|---|---|
| 正确实现 | 13 | 0 | — |
| 判定短路 | 9 | **4** | 用例 1「检出指向不存在目录的本机绝对路径」、用例 10「改动集口径」、用例 11「当前仓库全量审计」、用例 13「`--root` 两种形式」 |

**这 4 个用例对判定逻辑承重**，其中用例 1 是最关键的正向检出。

### 本轮三个实测踩坑（都写进了代码注释，改这块前必读）

1. **盘符根必须写 `'D:' + path.sep`**，不能写 `'D:'.replace(/:$/, path.sep)`。后者产出**两字符** `D\`（`replace` 把冒号一起吃掉了），后续 `path.join` 拼出 `\Data\...` 这类无盘符相对路径，`existsSync` 恒为 false → 全量扫描 260 处**全量误报**，且错误信息谎报「磁盘上不存在：D:」。
2. **路径段不能贪心吞标点**。早期用宽松的 `[^\\/:*?"<>|\r\n]+` 收段，会把 `D:\...\ops-center`。截。整句吞成一个路径。段字符集必须排除中文句读。
3. **`[System.IO.File]` 的相对路径基于进程启动目录，不是 PowerShell 的 `Set-Location`**。本轮因此把实现误写进共享主工作区、并多次出现「写进去又变回去」的假象，一度误判为写保护回滚。**所有文件操作一律用绝对路径。**

### 扫描口径：为什么只查改动集而不是全仓

初版扫全仓，实测检出 100+ 处"失效"。逐条核对后**绝大多数不是缺陷**：

- 历史文档引用**已删除**的临时 worktree / `D:\Temp\` 临时产物
- CI runner 路径（`C:\Users\RUNNER`）
- 归档快照记录的当时事实

要求把它们逐条"修好"等于**篡改历史**。真正的缺陷类别只有一个：**有人改了这个文档，而文档里的路径是陈的**——这正是 `--base..--head` 改动集能精确覆盖的形态，也与同族门禁 `check-docs-sync.sh` 保持同一口径。`--all` 保留全量审计模式供人工使用。

### CI 落点与接线依据

落 `quality-gate.yml` 的 **`changes` job**，不落 `static-gates`：本门禁的输入是文档（`01-docs/**`、`*.md` 全在 `CI_IGNORED_PATHS` 白名单），而 `static-gates` 整个 job 被 `if: needs.changes.outputs.docs-only != 'true'` 门控（`quality-gate.yml:160`）——放那里等于**给自己关掉校验**（AGENTS.md「进白名单前提锁」）。

base 取 **merge-base**（不是 PR base sha，也不是 `origin/main`），与同族 Gate 2c3 一致：问的是「本 PR 相对自己的起点改了哪些文档、里面有没有失效路径」。`gate-result` 的 rollup 含 `needs.changes.result` 且 Gate Result 是必需检查 ⇒ 本条真能拦，不是探测器。

**未修改 `CI_IGNORED_PATHS`**：新脚本与新测试落在 `scripts/`，按 `classify-docs-only.test.js:148` 的约束本就不得进白名单，无需改动即可保持 `docs-only=false`。

### 遗留（不假装已闭合）

1. **文档绝对路径的历史存量未清**。全量审计仍报 379 处，绝大多数是历史文档对已删除临时目录的引用，属归档事实，本 PR 有意不动。若将来要清，需逐条人工判定「是历史事实还是活文档」，**不能批量替换**。
2. **`scripts/*.js` 的 gitignore 白名单是逐个放行的**。本轮已加两条，但这类"新写一个 `scripts/*.js` 就必须记得加白名单"的模式本身是脆弱的——漏加的后果是**文件静默不入库**（本轮实测踩到）。根治方案是把 `scripts/` 下的门禁脚本按前缀批量放行（如 `!scripts/check-*.js`），但那会连带放行临时脚本，与该规则的原始意图冲突，**本 PR 不做**。
3. **死脚本无自动防线**。缺「未引用文件检测」：孤儿脚本既不会被测试抓到，也不会被任何门禁点名。本 PR 只删了已知的那一个。
4. **QM-6 未执行**（见门禁表）。