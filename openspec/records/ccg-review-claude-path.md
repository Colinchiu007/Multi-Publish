---
record: ccg-review-claude-path
task: 修复 CCG 深度双模型审查（QM-6）后端解析：claude 在本机报「不在 PATH」，引擎静默降级成单后端
date: 2026-10-07
---

## 本次执行记录：CCG 双模型评审后端按绝对路径解析（ccg-review-claude-path，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | `scripts/` 工具脚本 + 文档 + 测试，属纯流程变更；改动全在隔离 worktree `D:/Data/projects/mp-worktrees/mp-ccg-review-claude-path`（裸分支 `ccg-review-claude-path`，由 `scripts/start-mp-task.ps1 -TaskName ccg-review-claude-path -NoDeps` 建区）；共享根 `D:/Data/projects/mulpub` 始终停在 `main` 且未被写入（`scripts/pre-code-edit-guard.ps1` 在共享根 rc=1 拦截、在 worktree 内 rc=0 放行，实测两次） |
| 第一性原因（QM-5 追因） | PASS | 被动告警 `command -v claude … \|\| say "⚠ 找不到 claude…"` 由 `d98f54db`（PR #2955，2026-10-06 01:09:40）**一次引入**，`git blame` 确认自出生即存在，**不是从可用态退化**。环境层根因：进程 PATH 里 C: 盘条目被剥掉盘符（`C:\Users\<user>\.local\bin` → `\Users\<user>\.local\bin`），Windows 按 cwd 所在盘符解析它 ⇒ 实测 cwd 在 D: 时 `claude` 找不到而 `opencode`/`codex` 正常，cwd 在 C: 时相反，**两组条目没有任何一条同时有效** |
| 逃逸链（QM-5 五层） | PASS | ① 单测：`deep-review.sh` **从无任何测试**（本次新增 11 例）② 集成：深度审查**明确不进 CI**（脚本头注释：单次 >15 分钟，挂 required check 会锁死仓库）③ E2E：有 QM-6 人工环节，但人眼看的是评审结论、不是「几路后端参与了」④ 评审：`d98f54db` 的评审重点在 wrapper 缺失要 exit 2，两条 `\|\| say` 看着像合理降级提示，**且评审者当时环境里 claude 恰好可解析** ⇒ 缺陷不可见 ⑤ 流程：`.quality-gates.md` 允许降级「如实登记」，降级由异常变成可接受常态 |
| 系统性漏洞（QM-5 四类） | PASS | ① **告警不改行为**（发现但不补 PATH、不改退出码、不阻断）② **依赖继承的 PATH 而非绝对路径**——同文件第 1 步已为 `node` 写过同类兜底（fnm），说明问题在本仓被认知过一次但只修了 `node` ③ **缺诊断入口**：真降级时没有一条命令能问「为什么少了一路」④ **降级被流程合法化**（掩盖层） |
| 修复 + 回归保护（QM-5 支撑） | PASS（动态演进，见下） | ①新增 `posix_dir`/`candidate_dirs`/`resolve_backend`/`report_backends`/`self_check_backends`，**总是**把找到后端的绝对目录 prepend 到 PATH 最前（不是只在解析失败时）②新增 `--check-deps` 纯诊断入口，放在定位 node/驱动/判定记录**之前** ③`ROOT` 计算从 `dirname` 改参数展开（`dirname` 曾先把 `--check-deps` 打死）④测试 `scripts/deep-review-deps.test.js` **11 例**，假 HOME + 最小 PATH 精确复现，含 3 条防回潮结构锁。**TDD 红→绿**：首版 5 例在修复前实测 5/5 全红；最终 8 例 → 11 例，修复后 11/11 绿 |
| 禁止顺手做（QM-5 边界） | PASS | 未改 `.github/workflows/` 的**分支保护规则**、未改 `CI_IGNORED_PATHS` 白名单。workflow 只增一行测试接线。机器层符号链接在仓库外、不进版本控制 |
| 最小化 diff 套路 | PASS | 只动 `scripts/deep-review.sh`（+ 新增测试 + 复盘文档 + QM-6 评审产物入库）。无无关重命名、无顺手重构 |
| 测试接线 | PASS | `deep-review-deps.test.js` 接入 `quality-gate.yml` Gate 2b；`check-unwired-tests.js` 实跑 rc=0（检查域内 **59 份**测试全部接线或按欠账登记） |
| QM-1 打包 / QM-4 视觉 | N/A | 未触碰 `apps/desktop/electron/` 与 `packages/rpa-engine/`，无产物与 UI 变化；Gate 11 ESLint 范围仅 `apps/desktop/electron/ src/`，不含 `scripts/` |
| QM-6 CCG 双模型外部评审 | PASS（四轮，双通道均真跑通） | 四轮全部由修复后的通道执行，引擎每轮自报 `跨家族校验: proposer=opencode critic=claude 通过`。①第 2 轮 7 条（1 Critical + 2 Warning + 4 Info）②第 3 轮 6 条，**i1 Critical 指出第一版修复是假绿灯**（`PATH` 修复写在 `$(resolve_backend)` 子 shell 里，报告说补好了、引擎仍按原 PATH spawn）③第 4 轮 7 条 2 Critical。另有 **3 个评审未命中、被本 PR 自己的新测试当场抓出**的缺陷（`CCG_BACKEND_BIN_DIRS` 按 `:` 切劈掉盘符、候选列表末行被静默丢弃、`set -u` 下 `[ -n "$APPDATA" ]` 直接中止 `candidate_dirs`）。评审产物入库 `.adversarial/ccg-deep-c689da94/`、`ccg-deep-1091b4e4`、`ccg-deep-da0eb2f3` |
| QM-6 附带发现（真因） | PASS | 第 4 轮定位到**真正病根是 Go 的 `ErrDot`**：wrapper 是 Go 原生进程，`exec.LookPath` 遇到无盘符的 PATH 条目会拿到**相对**路径并拒绝执行（`Failed to start opencode: … cannot run executable found relative to current directory`），而同一份 PATH 下 bash 的 `command -v` **照样成功** ⇒ 「裸名能解析」推不出「wrapper 能起」。对照实验：原始继承 rc=1 / 注入 `D:\Program Files\npm-global` rc=0 / 注入 `/d/Program Files/npm-global` rc=0。**同时纠正了我自己的错误推论**：先前用 .NET `Process.Start` 测出「raw CreateProcess 起不了 `.cmd`」并推广成「wrapper 也起不了」，错——wrapper 是 Go，Go 能跑 `.cmd`/`.bat` |
| 端到端取证（不只看报告） | PASS | 用脚本产出的 PATH 真去 spawn wrapper：`claude rc=0`、`opencode rc=0`，均返回正常内容。另有坏 PATH（`/usr/bin:/bin`）下 `claude rc=0` 的独立验收 |
| 跨平台回归 | PASS | `Gate 2b - Desktop dev scripts (node --test)` 在 **ubuntu CI 实跑 success**（job 112477662300，step 单独 `success`）——测试桩已改为「按平台命名 + `chmod 0755`」，两种平台夹具语义都成立 |
| docs-only 判定 | PASS | `node scripts/classify-docs-only.js --base=origin/main --head=HEAD` ⇒ `docs-only=false`（4 个文件含 `.github/workflows/` 与 `scripts/`）⇒ 走完整门禁，全量 job 正常执行。`release` job 的 `skipped` 与本判定无关：其条件是 `startsWith(github.ref, 'refs/tags/v')`，只在版本 tag 触发 |
| 计数/对账类门禁 | PASS | 行尾对账：`Compare-Object` 两口径零差异（`deep-review.sh` 保持 LF 0/400，测试与文档保持 CRLF 316/0、457/0）；`check-no-brand-residue` 6994 tracked 文件 0 残留；`check-gate-record-debt` / `check-debt-budget` / `check-step-failfast` / `check-changelog-growth` / `check-unwired-tests` 全 rc=0；`workflow-contract.test.js` 32/32；`bash -n` rc=0；`check-docs-sync` rc=0 |
| 远程同步 | PASS | 已合并：#3005 = `2955482d1`（committer 2026-10-06T21:52:20Z）；取证 `gh pr view --json mergeCommit,mergedAt` + `git merge-base --is-ancestor <sha> origin/main`；远端分支 `git ls-remote --heads origin ccg-review-claude-path` 返回 0 行。上方三个 sync_* 字段已在本条转 PASS 的同一次提交删除 |

### 意图偏离登记（如实登记）

- **机器层修复不在版本控制内**：`C:\hermes-home\bin\claude.exe` 符号链接指向真身（`C:\hermes-home` 是 junction，真实路径 `C:\Users\<user>\bin`）。**换机需重做**，步骤见 `docs/ccg-review-backend-path-2026-10-07.md` §4.1。仓库层修复不依赖它。
- **修了三轮才摸到真因**：前三轮我在修「让报告好看且自洽」，第四轮才读出 `ErrDot` 那一行。其中「修完测试就绿」出现过**两次假绿灯**（子 shell 丢 PATH；机理搞错）。已把两个错误推论与教训写进复盘文档 §7。
- **未审其他脚本对继承 PATH 的依赖**：本次只审了 `deep-review.sh` 一条路径。已登记为后续项，不假装已闭合。
- **`.quality-gates.md` 流程待办**：建议补一条「QM-6 降级登记必须附 `--check-deps` 输出」，否则「登记」会退化成「免责」。不在本 PR 范围。
- **第四轮有 1 次 critic 调用超时**（`spawnSync … ETIMEDOUT`），无结论，重试后正常出报告。根因是 diff 269 行、模型耗时超过 `model-call.js` 的 `DEFAULT_TIMEOUT_MS=120000`；属引擎限制，不是本仓问题。
