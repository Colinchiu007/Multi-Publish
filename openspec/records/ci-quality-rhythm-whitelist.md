---
record: ci-quality-rhythm-whitelist
task: 把 .quality-rhythm/** 纳入 docs-only 白名单，并按对账表收掉镜像漂移锁的第二处接线
date: 2026-10-09
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个动这些文档的会话（PR 号待 `gh pr list --repo Colinchiu007/Multi-Publish --head ci-quality-rhythm-whitelist --json number,state,headRefOid` 回读取入，不得凭印象；合并后按 git log origin/main --grep='(#NNNN)$' --format=%H|%cI 取 merge SHA，回填本行并整段删除 frontmatter 的三个 sync_* 字段）
---

## 本次执行记录：`.quality-rhythm/**` 进白名单 + 镜像锁收一处真源（ci-quality-rhythm-whitelist，2026-10-09）

- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD`（**提交后**复跑）→ 结果见下表；本 PR 含 `.github/workflows/**` 与 `scripts/**` ⇒ 必然 `docs-only=false`，走完整质量节拍，不借道
- 变更类型与分层：CI 配置 + 门禁数据 ⇒ 运行时代码级 ⇒ 隔离 worktree `mp-ci-quality-rhythm-whitelist`（分支 `ci-quality-rhythm-whitelist`，起点 `646acc81f`）
- 授权：改 `CI_IGNORED_PATHS` 白名单属 AGENTS.md「谁在改守门」类，**用户已于 2026-10-08 明确人工过目并授权推进**（原话「这三项你来推进。应用质量节拍」）

### 本 PR 的真实差量比 PRD 初设想的窄（如实记账）

写 PRD 前我判断「镜像漂移锁住在会被 docs-only 短路的 `static-gates`」，因此本 PR 的计划动作是「先搬锁、再放名单」。**该前提在我勘察时已过期**：另一会话的 `e32210e6a`（2026-10-08 13:37「接线『住在哪个 job』升级为机械登记表」）已把这条锁接进 `changes` job（Gate 2b2），并**刻意保留** `static-gates` 那份（其注释自述「两处跑同一条锁只构成 docs-only PR 也拦得住」）。

我最初把这条前提写成 `quality-gate.yml:252`，那个行号来自**共享主工作区的过期检出**（共享根停在 `cbce32541`，落后 origin/main 108 个提交）。教训同族于「0 命中先证明我的坐标坏了」：**行号也是坐标**，从 stale checkout 读来的行号会把我引向一个已经不存在的代码形状。现正文一律按 worktree 实测行号写。

所以本 PR 的三条动作是：
1. `CI_IGNORED_PATHS` 增 `.quality-rhythm/**`；
2. `(白名单路径 → 门禁去向)` 对账表登记同行（`commands: ['node --test scripts/quality-rhythm-spec-mirror.test.js']`）；
3. **删除 `static-gates` 里那份重复接线**，使登记表「整份 workflow 只出现一次」的判据成立。

### 第 3 条撤销了他人会话的显式取舍，覆盖性论证如下（不得只说"顺手清理"）

| job | job 级 `if:` | 执行域 |
| --- | --- | --- |
| `changes`（保留） | 无 | 每种事件、每个 PR 都跑（含 `docs-only=true`） |
| `static-gates`（删除） | `needs.changes.outputs.docs-only != 'true'` | 只在**非** docs-only 时跑 |

`changes` 的执行域**真包含** `static-gates` ⇒ 删除不减少任何一次判定，只消除「同一条门禁两处接线、改一处另一处静默留着」的真源分裂。`e32210e6a` 保留冗余的当时理由（登记表还不认识这条锁）已被它自己引入的 `strictEqual(hits, 1)` 判据取代。

### 反证（三条变异各自必须红，均已实测）

| 变异 | 期望 | 实测 |
| --- | --- | --- |
| M1 从 `CI_IGNORED_PATHS` 摘掉 `.quality-rhythm/**` 而不摘表行 | 对账表双向 deepEqual 红 | `rc=1`，`AssertionError: (白名单路径 → 门禁去向) 对账表与 CI_IGNORED_PATHS 不再一一对应` |
| M2 把 `static-gates` 那份重复接线加回去 | 「恰好一次」红 | `rc=1`，`… 在 workflow 正文出现 2 次` |
| M3 摘掉 `changes` 里 Gate 2b2 的唯一接线 | 必须红 | `rc=1 pass=26 fail=1`，`… 在 workflow 正文出现 0 次：接线位置必须只有一处真源` |

**探针自伤登记（两条，都是"我的读数方式坏了"而不是"结论坏了"）**：① 第一次跑变异时我用 `grep -E "^# (pass|fail)"` 提取结果，而本机 Node 24 的 TAP 汇总行是 `ℹ pass 27`（前缀非 `#`）⇒ 五个套件全部输出空串，症状与"测试没跑"一字不差；改成 `sed 's/^.\{0,3\}pass \([0-9]*\)/\1/p'` 并让解析不出时报 `PARSING_FAILED` 才恢复可读。② M3 首轮被记成 `NOT_RED`，因为它 `startsWith('not ok')` 匹配失败行，而 TAP 的缩进使其永不成立；单跑取 `fail` 计数 + `AssertionError` 原文后确认**确实是红的**。另：变异脚本自报 `restored_byte_identical=false`，而独立 `cmp` 与 `git diff` 证明文件与变异前**逐字节相同** ⇒ 自报判据不可信时以独立回读为准（本仓既有口径的同族再现）。

### 决策层跨家族对抗评审未跑成（降级，如实记录）

`scripts/ccg-review-decider.js --input 01-docs/PRD-CI-BLINDSPOT-SEAL-2026-10-09.md` 判 `DUAL`（敏感内容 1 处命中）。随后 `sh scripts/plan-review.sh` 在 `轮 1/3` 即失败：`spawnSync C:/Users/邱领/.claude/bin/codeagent-wrapper.exe ENOENT`。

根因**已定位到具体行**：用户级技能 `C:/Users/to_co/.qoder-cn/skills/adversarial-review-loop/scripts/model-call.js:11` 把 `DEFAULT_WRAPPER` 写死成**他人机器的用户名路径**，且 `ccg-deep-review.js` 三处（`:575 / :652 / :924`）直接取 `mc.DEFAULT_WRAPPER`，**没有任何 env / config 覆盖入口**；本机真实存在的正解是 `C:/Users/to_co/.claude/bin/codeagent-wrapper.exe`（已实测在位）。我没有去改用户全局技能的源码（那是仓库外的工具链，且属"改别人的守门工具"，应另行决定）。

**因此本 PR 的 QM-6 走既有替代通道**（直调 `opencode run` 双轴评审，绑定提交 SHA），决策层跨家族对抗评审降级为「自审 + 三条实测变异」，缺口如实留在此处，不写成"已评审"。

### 证据表

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 白名单钉死 + 双向对账 | `node --test scripts/classify-docs-only.test.js` | 27 pass / 0 fail |
| workflow 契约（含 paths-ignore 与名单同源） | `node --test .github/scripts/workflow-contract.test.js` | 33 pass / 0 fail |
| 镜像漂移锁自身 | `node --test scripts/quality-rhythm-spec-mirror.test.js` | 8 pass / 0 fail |
| Purpose 结构锁（同 job 邻接） | `node --test scripts/check-spec-purpose.test.js` | 23 pass / 0 fail |
| 测试接线棘轮 | `node --test scripts/check-unwired-tests.test.js` + `node scripts/check-unwired-tests.js` | 30 pass / 0 fail；OK 全部已接线 |
| 品牌残留（硬红线） | `node scripts/check-no-brand-residue.js` | PASS（7378 tracked 文件） |
| 行尾两口径对账 | `git diff --numstat` vs `--ignore-cr-at-eol --numstat` | 逐文件相等 |
| 远程同步 | PENDING（本条自己的欠账） | — |

### QM-6 替代通道结果（后端轴，逐字读自该模型自己的 stdout）

后端轴 `opencode/nemotron-3-ultra-free`（绑定 head `722c0cc42`）：**0 Critical / 1 Warning**，四条判据结论均为 Info 级"成立"。

| 它审的点 | 它的结论（原文摘要） |
| --- | --- |
| 删除 static-gates 是否减少判定 | 成立：`changes` 无 job 级 `if:`、全事件执行；`static-gates` 受 `docs-only != 'true'` 门控。极端情况（changes 提前失败/超时）在旧逻辑下同等会导致两处都不跑，非本 PR 引入退化 |
| 注释行剥离 + `hits==1` | 正确：测试按行过滤 `^\s*#` 再计数，被删处留的是注释行会被剥离；`changes` 的 Gate 2b2 是唯一真实调用点 |
| `.quality-rhythm/**` 整目录进白名单 | **Warning**：可接受，但建议把「VENDORED_MIRROR 已排除该树、CI 不执行其任何脚本」这条证据**写进对账表的 `why` 字段**，给后人一个可检索锚点 |
| 有无「松门禁」伪装成搬家 | 无：实为修复盲区（旧逻辑下纯文档 PR 会让该锁一次不跑，PR #3114 实测） |

Warning **已按建议在同一个 `why` 里补齐证据锚点**（`scripts/classify-docs-only.test.js`）。它另提的「行内注释不被剥离属反模式，不予保护」我记录为已知边界，不在本 PR 扩面。

一处诚实标注：我给两个评审模型的指令都要求把结论**写成 JSON 文件**，后端轴没有产出 `findings-backend.json`，结论只落在它自己的 stdout 里。上表内容是**逐字读该 stdout 段**得到的，不是按关键字命中推断的；同族纪律见「外部评审归属不得错标」。

### QM-6 双轴结论（两轴都落地，含一次重试的如实经过）

前端轴第一次尝试（`ling-3.1-flash-free`，宽任务书）**没有产出**：进程存活但日志 45 s 内 0 字节增长、要求的 findings 文件始终不存在。按 AGENTS.md QM-6「前端模型失败最多重试 2 次，3 次全败才跳过」，我做了**第二次收窄任务书**的尝试（只问三个问题、限 300 字），这次出结论。

| 轴 | 模型 | 结果 | 处置 |
| --- | --- | --- | --- |
| 后端（逻辑/边界/安全/规格） | `nemotron-3-ultra-free` | 0 Critical / 1 Warning | Warning：要求把「VENDORED_MIRROR 已排除该树」的证据锚点写进 `why` ⇒ 已照改 |
| 前端（模式/可维护性/文档同步） | `ling-3.1-flash-free`（第 2 次） | 0 Critical / 1 精度建议 | 建议：`why` 里「唯一被消费」会被误读成整棵树只有一处引用（实际 `check-unwired-tests.js` 还把它当**排除集**引用）⇒ 已改写为「被判定 / 被排除 / 被 glob 引用」三类分开 |

两处评审结论都是**逐字读各自 stdout 段**得来的（两个模型都没按指令落 JSON 文件）。前端轴顺带声称「『先搬锁再放名单』实为同一次提交 `2697d86fa`」——**我没有核实这个 sha，因此不写进任何入库文档**；本 PRD 与记录里关于先后顺序的表述依据是 `e32210e6a` 的实测 diff 与本 PR 自身提交，不引外部断言。

### 归因更新：那 8 张暗档漂移不是"漏刷"，是"基线早于自身 CSS 生效"

原写「8 张暗档漂移待归因」。实测把它否证：`a43287ac7` 重建的 29 张基线里**这 8 张全在**；而严格逐像素比对显示，渲染色逐字命中该提交新增的 CSS 行（如 `#23232a → #232329` 占 20236 像素，`#232329` 就在新增行里），基线侧是旧值 ⇒ 基线是在那次 CSS **生效之前**抓的。完整定位表与颜色对取证见 `01-docs/PRD-CI-BLINDSPOT-SEAL-2026-10-09.md` §3.4/§3.5。这条归因**加强**门禁②的理由：这类"基线与自身代码不一致"只有同 sha 的渲染能暴露，而 PR 侧是唯一能在合入前做这件事的位置。

### 不在本 PR 范围（已登记，不静默修）

- 暗色基线在 PR 侧不可判（门禁②）：其前置条件经实测**已破坏** —— main tip `a43287ac7` 的 Visual Tests 红在 `Baseline freshness gate`，8 张暗档漂移无人认领。门禁②必须排在那 8 张归零之后，另 PR 推进。
- `adversarial-review-loop` 技能里写死的他人路径：属用户级工具链，未在此改。
