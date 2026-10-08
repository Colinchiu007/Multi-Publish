---
record: plan-review-deps
task: plan-review.sh 后端体检移植 ABS-prepend 体系，消灭被动告警照跑
date: 2026-10-08
---

## 本次执行记录：plan-review.sh 后端体检 ABS-prepend 移植（plan-review-deps，2026-10-08）

> 分支：`plan-review-deps`；worktree：`D:\Data\projects\mp-worktrees\mp-plan-review-deps`
> 范围：🔧 工具脚本 + CI 接线 —— 改 `scripts/plan-review.sh`（删除被动告警、移植体检体系），新增 `scripts/plan-review-deps.test.js`（4 条），改 `.github/workflows/quality-gate.yml` 接线
> 判定：`classify-docs-only` ⇒ **docs-only=false** ⇒ 混合 PR，完整质量节拍

### 动因（问题定位）

前一任务（PR #3107，记录 `ccg-git-bash-entry`）执行记录登记的**本仓遗留项**：`plan-review.sh` 的依赖体检段至今是旧形态——

```sh
command -v claude   >/dev/null 2>&1 || say "⚠ 找不到 claude —— …"
command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— …"
```

只 say 一句被动告警然后**照跑**。同一问题在 `deep-review.sh` 已于更早的 PR 修好（候选目录扫描 + 绝对目录 prepend 到 PATH 最前并导出），决策层入口一直没有跟上。

### 第一性原因（QM-5 ①）

「告警后照跑」的病根是**把「告知」当成了「处置」**：告警不改变行为 ⇒ 告警沦为装饰。deep-review-deps.test.js ⑧ 已在 code 层把这一形态钉成禁止项，但 plan 层没有任何锁，两个入口长期不同步。

决策层（plan）比验证层（code）**更**不能容忍静默降级：它是质量节拍的第一道闸——「先对抗评审再动手写码」的承诺就在这一步兑现。在这里少一路跨家族，整个承诺名存实亡，且用户完全无感（评审照跑、结论照出）。

### 逃逸分析（QM-5 ②）

1. **单元测试层**：`deep-review-deps.test.js` 的结构锁 ⑧（「不得 `command -v X || say`」）只检查 `deep-review.sh` 一个文件——锁本身正确，覆盖面漏了同构的另一个入口。
2. **审查盲区**：历次 QM-6 评审关注「引擎输出对不对」，没人比对「两个入口的体检段是否同构」。**同构文件不同步**这一类缺陷需要专门的成对比较，现有门禁没有这一格。
3. **流程层**：#3107 的执行记录把这一项登记进了「遗留」，但登记≠排期——它之所以现在被修，是因为本次会话主动翻旧账。缺口：遗留项没有「必须何时接手」的机制约束（本仓现无此门禁，见「遗留」）。

### 修复 + 回归保护（QM-5 ④）

移植 deep-review.sh 全套体检（`posix_dir` / `candidate_dirs` / `_resolve_hit` / `resolve_backend` / `report_backends`），含既有教训全套：`set -u` 下 `${VAR:-}` 防候选列表静默截短、here-doc 消费防丢末行、结果写全局变量不走 `$(...)` 收集（防子 shell 假绿灯）、按**计数**分档（防 2/2 与 1/2 长得一样）。

新锁 `scripts/plan-review-deps.test.js`（4 条，TDD 实证 3 红）：

| # | 判据 | 类型 |
|---|---|---|
| ① | 候选目录命中必须打印「已把绝对目录 … 补到 PATH 最前」（ABS 分支），装在候选目录的后端不得被判「找不到」 | 行为 |
| ② | 结构锁：不得出现「command -v claude/opencode … \|\| say」形态；必须存在 `PATH="$…:$PATH"` prepend 动作与 `export PATH` | 结构 |
| ③ | 零后端必须 rc=2 早退并给可操作修法（npm i -g / 系统 PATH / CCG_BACKEND_BIN_DIRS） | 行为 |
| ④ | 只剩单后端必须点名「跨家族交叉验证缺失」，不得静默放行 | 行为 |

**TDD 红灯即缺陷实证**：实现前 ① 输出原样打印「⚠ 找不到 claude…开始跨家族对抗评审」（被动告警+照跑同框）；③ 证明零后端时 **rc=0 照样放行引擎**。实现后 4/4 绿。

### 防止再次发生（QM-5 ⑤）

- 行为锁 ①③④ 挂进 `quality-gate.yml` Gate 2b，`check-unwired-tests` 棘轮生效；
- 结构锁 ② 与 deep-review-deps.test.js ⑧ 形成双入口成对覆盖——再往任何一个 `.sh` 入口写回被动告警形态，CI 当场红。

### 门禁证据

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 新增测试 | PASS | `node --test scripts/plan-review-deps.test.js` → **4 pass / 0 fail**（实现前 3 红） |
| 既有 CCG 锁回归 | PASS | `deep-review-deps.test.js` 11 pass；`ccg-bash-entry.test.js` 8 pass，均无回归 |
| 接线棘轮 | PASS | `check-unwired-tests.js` rc=0（新测试已挂 Gate 2b）；其自测 30 pass |
| 欠账门禁 | PASS | `check-gate-record-debt.js` rc=0 |
| 编码完整性 | PASS | `check-text-encoding-integrity.js` rc=0；本记录 U+FFFD=0 |
| 品牌残留 | PASS | `check-no-brand-residue.js` rc=0 |
| 行尾对账 | PASS | `plan-review.sh` CR=0/LF=161、`plan-review-deps.test.js` CR=0/LF=184，纯 LF |
| QM-1 打包 / QM-4 视觉 | ➖ N/A | 未触 `apps/desktop/electron/**`；无 UI 变更 |
| QM-6 双模型外部评审 | **PASS** | 已执行，proposer=opencode + critic=claude 跨家族，7 findings 逐条处置（1 Critical 已修），见下 |

### QM-6 CCG 双模型外部评审（**已执行**，非自审）

**跨家族组合**：`proposer=opencode`（17.8KB 方案落盘）+ `critic=claude`（2374 字符 critique 落盘 `.adversarial/ccg-deep-5236889e/`），dimensionScores：correctness 5 / security 9 / performance 9 / maintainability 4。

**执行障碍（同 #3107）**：引擎写死 `timeoutMs: 600000`，ETIMEDOUT 后按已验证绕过直调同引擎 `mc.callCritic`（同 prompt/schema/后端，仅放大超时；30 分钟预算实测 256.2s 返回）。

**评审结论：7 条 findings（1 Critical / 3 Warning / 3 Info）**。逐条处置：

| # | severity | 处置 |
|---|----------|------|
| i1 | **Critical** | **成立，已修**。指出移植源代码自带的缺陷：`resolve_backend` 的 **PATH 分支**（裸名命中但候选目录未命中）直接计为可用并打印「已按原样使用」——而这恰是本脚本文档盖章要防的坏环境（无盘符条目 / Go wrapper ErrDot），wrapper 起不来仍被当双后端用，**无告警无修法静默照跑**；且行为锁 ①③④ 均未覆盖该分支。修法：非候选目录的裸名命中改为**反推其所在目录并 prepend**（升级 ABS），推不出则按 MISS 处理；取目录用 `${var%/*}` 参数展开（零外部依赖）。新增行为锁⑤钉死，并断言旧文案「已按原样使用」不得再出现。**⚠ 同病确认**：`deep-review.sh:285` 有同一分支（本 PR 移植的源头），deep-review-deps.test.js 亦未覆盖——超出本任务范围，登记遗留。 |
| i2 | Warning | **成立，已修**。④原断言只看文案不看 rc，锁不住「降级可跑但点名」语义；新增⑥断言双后端齐备时**继续主流程**（不得 rc=2 早退），与③（零后端 rc=2）形成对照，两头钉住早退/照跑分界。 |
| i3 | Warning | **部分采纳**。含空格目录/分号多目录场景 deep-review-deps.test.js ④ 已有覆盖，plan 侧不重复造：两脚本体检段逐行同源，一边锁住即可；本锁的增量价值在 plan 特有的早退语义（③⑥）。 |
| i4 | Warning | **不采纳（附理由）**。改 `--dry-run` 会让行为锁失真：dry-run 走不到完整主流程，钉不住「降级后继续跑」。桩后端 `exit 0` 立即返回、无输入等待，120s 超时实测余量充足（6 条测试共 2.7s）。 |
| i5 | Info | **成立，已修**。临时目录清理改统一 `cleanup()` helper，断言抛异常不再泄漏 temp。 |
| i6 | Info | **部分采纳**。「结构锁只证存在不证位置」接受现状——切片断言会让锁更脆（重构即红），权衡后保留整文件断言；「三测试文件探测链重复」属实，抽共享 helper 属跨任务重构，登记遗留。 |
| i7 | Info | **成立，已修**：`_RB_RC` 死代码已删。**不采纳** DUAL 阈值动态读取：makeDualProposal 的 220 行远超阈值 200；读脚本常量会让测试与被测脚本循环依赖。 |

**评审后复测**：6 pass / 0 fail（新增⑤⑥两条锁）；行尾纯 LF；U+FFFD=0。

| 远程同步 | PASS | PR #3148 squash 合并为 `origin/main` `ad1cd311512ec438fae2a354da7d75fbc8900ad7`（2026-10-08T17:02:48+08:00，squash merge，CI 全绿）；`git ls-remote --heads origin plan-review-deps` 返回 0 行证远端分支已删。回填与销账在同一次提交内完成：删 frontmatter sync_* 三字段。⚠ 文件源载体（openspec/records/）登记走 frontmatter，不进 gate-record-debt-ledger.json（后者键须匹配 .quality-gates.md 的 ## 标题，给文件源登记会被判「陈旧登记」恒红） |

### 遗留（不假装已闭合）

- **`deep-review.sh:285` 与 plan-review.sh 修前同病（QM-6 i1 源头）**：PATH 分支「裸名命中但候选目录未命中 → 已按原样使用」仍计可用。plan 侧已修，deep-review 侧**本 PR 未动**（任务边界：本次动因是 plan 层反模式）。deep-review-deps.test.js 也没有该分支的覆盖。**下一条 PR 必须接手**：把同样的「反推目录 prepend / MISS」修法移植回 deep-review.sh 并补测试。
- **三个测试文件（deep-review-deps / plan-review-deps / ccg-bash-entry）各自复制了 resolveGitBash 探测链**（QM-6 i6）：改名即漂移。可抽 `scripts/lib/test-helpers.js` 共享，属跨任务重构，未做。
- **执行记录的「遗留」段没有接手时限机制**：#3107 登记的本项隔了一天才被接手。登记≠排期。可考虑在 `check-gate-record-debt.js` 加一层：执行记录「遗留」段点名的问题在新代码中再现时判红。未做——需先明确判据。
- **引擎 `timeoutMs: 600000` 写死**（技能目录，非本仓）与 **`model-call.js` 假绿灯风险**：继承自 #3107 记录，本次未触碰。