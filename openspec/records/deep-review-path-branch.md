---
record: deep-review-path-branch
task: deep-review.sh PATH 分支 fail-closed 三分判定，废除「已按原样使用」静默计可用
date: 2026-10-08
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 回填 PR 的会话
---

## 本次执行记录：deep-review.sh PATH 分支 fail-closed（deep-review-path-branch，2026-10-08）

> 分支：`deep-review-path-branch`；worktree：`D:\Data\projects\mp-worktrees\mp-deep-review-path-branch`
> 范围：🔧 工具脚本 —— 改 `scripts/deep-review.sh`（PATH 分支重写为 fail-closed 三分判定）+ `scripts/deep-review-deps.test.js`（新增⑩⑪两条锁）
> 判定：`classify-docs-only` ⇒ **docs-only=false** ⇒ 混合 PR，完整质量节拍

### 动因（问题定位）

PR #3148 的 QM-6 评审 i1（Critical）查到移植源头同病：`deep-review.sh:285` 的 `resolve_backend` 存在与 plan-review.sh 修前完全相同的 PATH 分支——裸名命中但候选目录未命中时，`_RB_CODE=PATH` +「已按原样使用」**直接计入可用**。该后端正来自本脚本文档盖章要防的坏环境（无盘符条目按 cwd 解析 / Go wrapper ErrDot），「command -v 成功」推不出「wrapper 能起」，静默计入可用 = wrapper 起不来仍当双后端用。且 deep-review-deps.test.js 12 条锁无一覆盖该分支。

### 第一性原因（QM-5 ①）

「裸名能解析」被当成了「后端可用」的充分条件。它只必要：MSYS 的 exe 补全、cwd 盘符回退、函数/别名/内建都能让 `command -v` 返回一个"看起来对"的字符串，而 wrapper（Go，exec.LookPath 严格语义）起不起得来是另一回事。两个判定域混用即成静默降级。

### 逃逸分析（QM-5 ②）

- **测试层**：deep-review-deps.test.js ①-⑨ 全部从「候选目录命中」或「全缺」两端夹逼，**中间态**（命中但来源不可信）零覆盖——恰好是缺陷所在。
- **评审盲区**：#3148 评审查的是 plan 侧新代码，i1 顺带点名 deep-review.sh:285 同病但属"源头"未在当次修——**评审发现跨文件同病时没有强制同 PR 处置的机制**，靠执行记录"登记遗留"传递，本次隔了一天才接手。

### 修复 + 回归保护（QM-5 ④）

PATH 分支重写为 **fail-closed 三分判定**（嵌套 case）：

| 命中形态 | 判定 | 理由 |
|---|---|---|
| 绝对路径（`/*`） | ABS（**不再全局 prepend**，只上报） | 可信，但来历不明目录 prepend 会重排 git/node 等解析顺序（二轮 i3 security） |
| 相对路径（`*/*` 非绝对） | MISS + 点名 ErrDot | 相对条目 prepend 后解析不变、ErrDot 依旧（二轮 i1，实测 `stray/zz`） |
| 无斜杠裸名 | MISS + 说明 | 函数/别名/内建（二轮 i5，实测 `command -v cd` → `cd`） |

新增锁：⑩ 行为锁（绝对命中 rc=0 + ABS 文案 + 旧文案「已按原样使用」回潮检测）；⑪ 结构锁（嵌套 case 三分支形态钉死）。

### TDD 与二轮评审

- 首版（反推 prepend）：红灯输出清晰展示缺陷（`[PATH] 已按原样使用` + 体检通过）→ 实现 → 12/12 绿。
- **二轮 QM-6**（critic=claude，141.7s，scores correctness 5 / security 6 / performance 8 / maintainability 6）：5 findings（1C/3W/1I），i1 实测实证成立（相对条目反推失效）、i3 采纳更激进修法（不全局 prepend）、i5 实测实证成立（内建无斜杠）、i2 拆行为锁、i4 全仓 grep 核清。详见提交 b1d4b983。

### 行为级复现受挫的如实记录

相对 PATH 条目场景**在脚本真实运行形态下不可达**：shebang `#!/bin/sh` 使 MSYS 把 bash 直接执行 re-exec 成 sh.exe，过程中相对 PATH 条目与 HOME 被环境转换剥离（实测同一 spawn 环境 bash 内 `command -v` 命中返回 `relDir/tool`，脚本内报「均未命中」、HOME 成 POSIX 形态 `/tmp/...`）。故相对/无斜杠分支**退化为结构锁**，绝对路径分支保持行为锁。

### 门禁证据

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 测试 | PASS | `deep-review-deps.test.js` **13 pass / 0 fail**（⑩ 行为锁 + ⑪ 结构锁；⑩ 实现前红，红灯即缺陷实证） |
| 接线棘轮 | PASS | `check-unwired-tests.js` rc=0 |
| 编码完整性 | PASS | `check-text-encoding-integrity.js` rc=0 |
| 品牌残留 | PASS | `check-no-brand-residue.js` rc=0 |
| 行尾对账 | PASS | 两口径 numstat 逐行一致（73+/23-） |
| QM-1 打包 / QM-4 视觉 | ➖ N/A | 未触 electron；无 UI |
| QM-6 双模型外部评审 | **PASS** | 两轮 critic=claude（首轮 + 二轮 5 findings 处置），opencode 侧由 pre-commit 决策层判定衔接；非自审 |
| 远程同步 | PENDING | 合并后回填 merge SHA 与时间，同一次提交删 sync_* 三字段 |

### 遗留（不假装已闭合）

- **三个测试文件探测链重复**（#3148 i6）：可抽共享 helper，跨任务重构未做。
- **相对条目场景的 MSYS re-exec 环境转换**是本机特有的深坑（连 HOME 都会被转换），行为级测试需要绕开 MSYS 层（如 WSL 或纯 Linux 环境），成本超出本任务。
- **评审发现跨文件同病时无强制同 PR 处置机制**：靠执行记录登记传递，本次隔一天才接手。已在 #3148/#3153 记录，未设门禁。
- 引擎 `timeoutMs` 写死 + `model-call.js` 假绿灯（技能目录，非本仓）：继承未触碰。