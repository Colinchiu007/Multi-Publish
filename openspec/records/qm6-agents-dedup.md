---
record: qm6-agents-dedup
task: 处置 #2772 的 QM-6 外部评审发现（替代通道）——AGENTS.md 去重复枚举 + 复测脚本补 PROVENANCE_MISSING / PARTIAL 两条出口
date: 2026-10-02
---

## 本次执行记录：QM-6 发现项处置与复测出口补强（qm6-agents-dedup，2026-10-02）

> 分支：`qm6-agents-dedup`；worktree：`D:/Data/projects/mp-worktrees/mp-qm6-agents-dedup`（基线 `origin/main` = `8e90984b`，`rev-list --left-right --count` = `0/0`）
> 范围：🔧 测试基建 —— `scripts/lock-timing-audit.js`、`apps/desktop/electron/services/windows-file-lock.test.js`、`AGENTS.md`
> 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → **docs-only=false**（含脚本与测试文件）⇒ 完整质量节拍

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 独立 worktree + 裸分支（`git worktree add`，PowerShell 原生 `D:` 路径；建完三连实证 toplevel / 分支名 / `0 0`）。依赖 `pnpm install --frozen-lockfile` 后跑测试。共享根 `main` 全程 clean、0 删除项、锚点 `shared-user-data` 完好 |
| 第一性原因（QM-5 ①） | PASS | 三条都由 #2772 的外部评审指向同一根因：**"检查接线的判据"只读源码文本，不执行被检物** —— ① AGENTS.md 与 docs 各存一份五坑清单（两处独立维护必然漂移，且没有任何东西在看它们一致）；② 结构锁比的是"字段名在不在"，脚本默认倍率从 2 改成 3 无人知；③ `provenance` 取不到时脚本回退成**自己硬编码的第二份 source 文案**，"取值来源"当场变成两个版本 |
| 逃逸分析（QM-5 ②） | PASS | 三条都逃过了 #2772 的 10 项反证：反证锁的是**断言与被断言的常量**之间，而这三处是"锁自己不测的东西"（两份清单的一致性、倍率的跨文件一致、source 的唯一性）。另外本轮实测到同一族的第四形态：**那条结构锁把复测脚本当纯文本读**，我把 `const manual = argOf(...)` 整行吞掉之后 `node --check` 通过、21 条测试全绿 —— 只有**真跑一次脚本**才暴露 `ReferenceError: manual is not defined` |
| 修复 + 回归保护（QM-5 ④） | PASS | TDD：三条新断言先写先红（`1 failed / 20 passed`，红因正是 `expected ... to match /PROVENANCE_MISSING/`）再实现。① AGENTS.md 只留判据 + 指向 docs 单点（两口径 numstat `2 2`）；② 断言脚本默认倍率 `=== provenance.safetyMultiplier`；③ `PROVENANCE_MISSING` → rc=5、`source` 只剩单一真源；④ `PARTIAL: 只覆盖 X/--runs` 独立出口 |
| 防止再次发生（QM-5 ⑤） | PASS | 两条新出口都进了结构锁（`PROVENANCE_MISSING` / `PARTIAL` 字样缺失即红），不再依赖"下次有人想起来跑一次"；AGENTS.md 与 docs 的重复面由本次删除收敛为单点，判据留在 AGENTS.md、清单留在 docs §4 |
| 出口实跑验证（含负控与变异） | PASS | 正向：`MP_AUDIT_REPO=<不存在> --runs=200` → 打印 `PARTIAL: 只覆盖 0/200 个 main push run` 且 rc=3；变异：临时摘掉夹具的 `LOCK_BUDGET_PROVENANCE,` 导出行 → rc=5 且点名 `PROVENANCE_MISSING`，**按改前字节快照逐字节还原=true**（不用 `git checkout`，那些文件带未提交改动）。负控取自 22:37 那次真实采集：`pages=1 runs=2 jobs=4 samples=44 … OK: 预算余量成立（headroom=3.43×）`，其中**没有** PARTIAL —— 否则这条 warn 是恒真，正向断言无意义 |
| 行尾与 diff 对账 | PASS | 三个文件改前 `loneCR=0 / bareLF=0 / NUL=0`，改后逐项相等；AGENTS.md 两口径 `git diff --numstat` 均 `2 2`；补丁脚本一律"被检域 == 替换域"（CRLF 域），并对每处替换做后置断言（锚点命中数、`loneCR` 未增、新标记已落盘、旧写法已消失） |
| 接线棘轮 | PASS | 未新增测试文件，断言加在已收编的 `windows-file-lock.test.js`（vitest workspace）；`check-unwired-tests` rc=0 |
| 本地门禁 | PASS | `check-gate-record-debt` / `.github/scripts/check-max-lines` / `check-unwired-tests` / `check-step-failfast` / `check-debt-budget` / `check-no-brand-residue`（6620 个 tracked 文件）六条 rc=0 逐条打印 |
| QM-1 打包 / QM-4 视觉 | ➖ N/A | 未触 `apps/desktop/electron/**` 生产代码与 UI 面 |
| QM-6 CCG 双模型外部评审 | PASS（替代通道，声明偏差） | **偏差**：本仓规定通道是 `codeagent-wrapper --backend <config.toml primary>`，而 2026-10-02 实测两条 primary 的底层代理 `127.0.0.1:15721` 端口**未监听**（`Test-NetConnection -Port 15721 -Quiet` = False），且 `修用户的路由代理`属机器级配置、不在任务授权内 ⇒ 改走同机另一 harness：`opencode run --model opencode/nemotron-3.5-lightning-free`（正确性轴）与 `opencode/longcat-2.5-preview-free`（模式/可维护性轴），任务书限定文件清单与输出行数（`-free` 对长生成不稳，先例见记忆「QM-6 替代评审通道」）。评审对象 = 已合并的 `31958ce1`（#2772），在**独立只读 worktree** 里跑。**判据是 findings 文件真落盘，不是 CLI 退出码**（后端首跑 rc=0 却没产出，原因是模型在 Git Bash 里用了反斜杠路径 ⇒ 补路径纪律重跑）。逐条处置见下 |
| 远程同步 | PASS | 已合并：squash 落地 `302b3147550639c5cac480ef42787dd6f048945a`（committer 2026-10-02T15:34:16Z，PR mergedAt 2026-10-02T15:34:16Z）。取证三条：① `git log origin/main --grep='(#2784)$' --format=%H|%cI` 唯一命中该 SHA 与时间；② `gh pr view 2784 --json mergeCommit` 的 oid **与上面同一个 SHA**（两源互证，不靠单侧）；③ `git ls-remote --heads origin qm6-agents-dedup` 返回 **0 行**证远端分支已删。归属判据：分支名 == 记录文件名（`qm6-agents-dedup`），且该 head 分支只命中这 1 个 PR（多 PR 复用会整条排除而不是取第一个）。本行改写与 frontmatter 三个 `sync_*` 字段的删除发生在**同一次提交**

### QM-6 发现项逐条处置（#2772 的两轴评审）

前端轴（`longcat-2.5-preview-free`，1 Warning / 5 Info，PASS）：

- **W1（已修）**：AGENTS.md 新子款与 `docs/windows-lock-budget-provenance.md` §4 逐条重述同一份五坑清单 ⇒ 两处独立维护必然口径分裂。修法：AGENTS.md 只留判据（"跑通≠读到它声称的那个集合" + 三条硬约束），清单收敛到 docs 单点。**接受评审的判断，但纠正它的一处事实**：它说 docs 缺"脚本没报错、也报了数"那句判据 —— 实测在 `docs/…provenance.md:71` 就有，AGENTS.md 里那句是刻意保留的判据而非副本。
- I2/I4/I5/I6（登记不修，已核）：台账与 provenance 归属恰当（单向 require，无第二份真相）；`console.log` 喂 CI 日志、`LOCK_TIMINGS` 喂进程内断言，消费者不同；"不进 CI"在 docs 与脚本头注释表述一致。

后端轴（`nemotron-3.5-lightning-free`，1 Critical / 2 Warning / 1 Info，PASS）：

- **C1（部分采纳，已修）**：它称"结构锁只查字段名在场，不校验数值一致"。核过：`预算 ≥ max × safetyMultiplier` 与样本量下限**本来就有**数值断言，所以"数值完全不校验"不成立；但它指到的真洞是**跨文件数值一致性**——脚本默认 `argOf('multiplier', 2)` 与 provenance 的 `safetyMultiplier` 可以各说各话 ⇒ 已加一条数值奇偶锁（改脚本默认值即红）。
- **W1（前提已过期，仍补了它没提到的那一半）**：它担心"单页让 `--runs=26` 静默缩水到个位数"——那是 #2772 修之前的形态，现实现已客户端过滤 + 翻页（`MAX_PAGES=12`）。但"翻页触顶仍凑不满"这一档过去只进 `errors` 计数 ⇒ 新增 `PARTIAL: 只覆盖 X/--runs` 独立出口。
- **W2（拒绝，附理由）**：它要求给 `recordLockTiming` 再加一层"别把假 readyMs 记进台账"的守卫。**不加**：若在写入端丢弃 `readyMs=0` 的样本，那么"mock 假样本混入台账"这条反证变异（P6）就不再变红，活体检查失去它唯一的可见性；现在的形状（照记 + 读取端断言 `readyMs>0` 且样本数增长）才让"退化"这件事显形。它假设的另一条注入路径（不设 `spawnImpl` 却产出假握手）在夹具里不存在——除 `spawnImpl` 外唯一出口是真 `child_process.spawn`。
- **I3（已修）**：`source` 的双版本（provenance 缺省时回退硬编码文案）正是"取值来源有两个版本"，改成 `loadBudget` 直接 `PROVENANCE_MISSING` + rc=5 拦停，`source` 只取单一真源。

### 三笔 QM-6 欠账的真实状态（不拿一次补跑冒充三笔）

- **#2772**（本记录所属 PR 评审的对象）：**已补跑**，两轴 findings 全数处置如上；本 PR 即其产物。
- **#2731**（测试层出站守卫全仓化）、**#2719**（视觉门禁环境缺失单独成码）：**仍未补跑**。二者记录落在 legacy `.quality-gates.md`（不是 `openspec/records/`），且它们的评审要各自的工作区与 diff，不能借用本轮针对 `31958ce1` 的结论。欠账继续在 #2772 记录「遗留」里挂账（`openspec/records/lock-budget-provenance.md`）。

### 遗留（不假装已闭合）

- 替代通道的两个 `-free` 模型与 config.toml 的两个 primary 不是同一批底模，且本机两个 primary 的 `*_MODEL_NAME` 实测指向同一底模 —— 引用"双模型评审"时不得把它说成跨家族独立评审。
- `lock-timing-audit.js` 单次真实采集的墙钟时间**不可预测**（本轮 `--runs=2` 从 ~35s 变成 >300s，被调用方超时杀掉）：它是人工事后工具，任何"把它接进 CI / 写进脚本化验证"的想法都要先解决时长上界，否则又是一颗无界等待。
