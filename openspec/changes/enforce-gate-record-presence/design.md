## Context

动机与实测见 `proposal.md — Why`（132 个 PR 中 47 个非 docs-only 未把记录落在可检查位置；其中 32 个正文确有门禁内容、只有 2 个提到 `远程同步`）。本文件只写约束与决策。

现状（逐条核实，非推断）：

- `scripts/check-gate-record-debt.js` 的输入是**一个仓库内容快照**（`.quality-gates.md` + `scripts/gate-record-debt-ledger.json`），它不读 git diff、不知道"本 PR"是谁。#2570 的强制面因此只能锚在"最顶部那篇记录"——巨型单文件里没有可寻址的稳定标识，标题是唯一可用键（#2561 实测 slug 抽取只覆盖 160/319 且碰撞 4 次，故弃用）。
- 存在性判据需要的是**另一个域**：本 PR 相对 base 的变更集。本仓已有同域先例 `scripts/classify-docs-only.js --base=<ref> --head=<ref>`，导出 `CI_IGNORED_PATHS` / `isDocsOnly` / `matchesPattern`，与 CI 的 changes job 同源。
- **共享清单本身就是新的撞车面**：#2570 第三轮 re-sync 的唯一冲突文件是 `scripts/gate-record-debt-ledger.json`，而两个 md 被 git 自动合上了。这条实测直接否决"记录拆文件、登记仍写共享 JSON"的半途方案。
- squash 合并下 `(#NNNN)` 只在合并那一刻进标题 ⇒ 判据运行时 PR 号不存在；每次 re-sync/rebase 后 commit sha 变化 ⇒ sha 不能当跨推送稳定的键。
- 机器态约束：`.gitignore` 第 106 行 `scripts/*.js` 默认忽略新建脚本（既有惯例是补 `!` negation 并用 `git check-ignore -v` 当场证明）；`quality-gate.yml` 含 ≥2 条测试命令的 `run:` 块 MUST `shell: bash`（PowerShell 不在中间命令非零时中止，本仓实测把"前 5 个门禁红"报成步骤通过）。
- 姊妹轴：`openspec/changes/gate-coverage-ratchet/` 由另一会话在 AGENTS.md 预告，`ls` 核实 main 与本地均不存在，尚未落地。
- "advisory 永不转正"在本仓有先例：`scripts/release-gate.mjs` 至今不把视觉回归纳入硬门禁；Visual Tests 的 `Full visual suites` 曾长期 `continue-on-error: true`。任何"先非阻断、后阻断"的两步计划都必须自带把第二步逼出来的东西。

## Goals / Non-Goals

**Goals:**

- 让"记录做在检不到的位置"从**不可见**变为**默认变红**，红的时候给出两条可执行出路。
- 在不动历史的前提下，把收口检查覆盖面从"最顶部一篇"扩到**每一篇**。
- 新增记录之间**零同行竞争**，且登记/豁免同样零共享写。

**Non-Goals:**

- 不迁移、不改写 `.quality-gates.md` 既有记录；不为存量 PR 补写记录。
- 不做覆盖率增量棘轮（姊妹轴，判据不同，见 D8）。
- 不改动运行时代码路径 ⇒ QM-1 / QM-4 不适用。

## Decisions

### D1 存在性判据落在新脚本；两源收口落在既有 checker；取变更集必须复用既有实现

**决定**：新建 `scripts/check-pr-exec-record.js`（输入 = 本 PR 变更集 + 记录/豁免目录）；`check-gate-record-debt.js` 只改**读取源**。取"本 PR 变更集" MUST 通过 `classify-docs-only.js` 提供的同一实现（必要时把它内部取 diff 的那段提为导出函数，只增不改其判定语义），新脚本 MUST NOT 自行拼一份 `git diff base...HEAD`。

**理由**：① 输入域不同（内容快照 vs git diff），失败模式不同（内容漂移 vs 取不到 diff），合并会让 git 侧故障污染一份纯内容判据；② 更重要的是**第三份同族实现是本仓点名的病**——AGENTS.md 里"同一个三态映射被抄成三份（account-manager / ipc-handlers / login-status-monitor）"就是同一形状，出现两份"本 PR 改了哪些文件"的口径后，两者对 base 的取法一旦漂移，就会出现"同一个 PR 在 A 判 docs-only、在 B 判缺记录"的不可归因红。

**备选**：(a) 全并入 `check-gate-record-debt.js`——省一次接线，代价是两类 fail-closed 语义纠缠、单文件继续长；(b) 做成 pre-commit 钩子——否决，`--no-verify` 可绕，且钩子看不到 PR 变更集。

### D2 清单键用「文件名」而非「记录标题」

**决定**：新记录的标识键 = `openspec/records/<name>.md` 的 `<name>`；历史记录键形态不变（标题）。checker MUST 断言两种形态互不重叠。

**理由**：#2561 用标题当键是单文件下的无奈之举，并因此背上"改标题 → 未登记与陈旧双报"的键漂移债。独立文件自带唯一标识，改用文件名后"改标题"不再是键变更，只有"重命名文件"才是——那是显式动作且被 git 当重命名看见。这一条也是 D5（登记随文件走）的前提。

### D3 取本 PR 变更集：三点 diff，不引入 API 调用

**决定**：沿用 D1 指定的既有取源（三点 diff）；取不到 base、浅克隆导致失败、或变更集为空 ⇒ **fail-closed 判红**并原样打印命令与 stderr。

**理由**：再引一次 `GET /pulls/N/files` 会新增 token 与网络故障面；本仓已有同源判据证明三点 diff 够用。取不到证据不得放行，与 #2570「空遍历不等于零欠账」同条纪律。
**备选**：GitHub API（多一次往返与限流面）；pull_request event payload 的 files（不保证完整，存在条数截断）。

### D4 豁免按 PR 独立成文件；"消费后待清理"用可见计数 + 阈值，而不是同 PR 删除

**决定**：豁免写进 `openspec/records/_exempt/<branch>.md`，以**分支名**标识。checker 对「所指向分支在 `origin` 已不存在」的豁免：MUST 输出为待清理可见计数；仅当计数 ≥ 阈值（默认 3，可配置）才拦截。

**理由（这条推翻了我先前的设计）**：先前的写法是"分支查不到即判陈旧并红"。它与 squash 生命周期直接冲突——合并即删分支，于是**每一条被合法使用完的豁免都会在合并后变红，且红在一个已结束的分支上、无人认领**。这是 AGENTS.md 点名的"长期不可自愈的假红灯"形状。改为可见 + 阈值后：正常节奏下由后续任意 PR 顺手删掉那个文件（删除是独立文件、零冲突），而阈值保证它不会无限堆积。

**键为什么是分支名**：PR 号在判据运行时还不存在（D3 同段），commit sha 每轮 re-sync 都变，`GITHUB_HEAD_REF` 是 CI 上稳定可取且跨 rebase 不变的唯一项。分支复用风险由"分支不存在即进入待清理"这条覆盖。

### D5 登记信息随记录文件走；聚合清单降为派生产物

**决定**：未收口记录的「状态 / 原因 / 回填者」写在记录文件自身的 frontmatter 里。`check-gate-record-debt.js` 对新源不再读任何共享 JSON 清单，而是**枚举记录目录派生**出欠账集合；历史源仍读 `.quality-gates.md` + 既有 `gate-record-debt-ledger.json`（只读、只允许缩小，不改其语义）。

**理由**：本 change 要修的是"检查不到的位置"，若把登记搬进一份新的共享 JSON，等于把 #2570 第三轮实测到的那个**唯一冲突文件**复制成判据的日常依赖——共享写归零才是载体迁移的全部意义。派生聚合还顺带消掉"回填一条必须记得删登记项"这条人工耦合：登记字段就在被回填的那篇文件里，改状态即删字段，不可能漂移。

**代价（如实）**：聚合从"一份可直接读的文件"变成"要扫目录才能得到"。缓解：checker 输出分源计数与清单打印，历史趋势数不因迁移而失真（见 spec「分源计数可比」）。

### D6 存量 47 条（其中 40 条三处皆无）一次性写入独立文件，不进任何共享清单

**决定**：生成 `openspec/records/_legacy-absent.md`，一次性列全并带逐条原因；MUST 由脚本从 `git log --first-parent --since=…` + `gh pr view --json body,comments` 派生（正控/负控各 2 条复核后落盘），禁止手抄。该文件写一次即冻结，后续 PR 不追加。

**理由**：① 与 D5 一致，避免制造最大一次共享写；② forward-only 由存在性判据自身保证，不需要把历史放进任何会被判据读取的路径；③ 写一次冻结后，它同时充当"起点基线"，让"这个数字有没有变小"可比。

### D7 与姊妹轴共存

**决定**：本 change 只声明"存在性"与"两源收口"，不定义覆盖率目标值，也不实现按 PR 的比例棘轮。若 `gate-coverage-ratchet` 先落地并改动了 `check-gate-record-debt.js` 的词表常量或读取函数，实施时 MUST 以其实装为准调整 D1/D5 落点，MUST NOT 复制词表。

### D8 两步走（先非阻断）自身必须有东西检测，否则就是它要修的那个病

**决定**：第一步落地时把「判据尚未接入判定」这件事本身写成一条**会被检查的欠账**：新脚本在非阻断模式下必须打印固定标记行（`MODE=advisory`），并有一条测试断言"仓库里存在该标记 ⇒ 本 change 的转阻断任务未完成 ⇒ 该测试在计划日期之后必须变红"。第二步接入后删除该标记，测试随之转绿。

**理由**：本仓有实测先例——视觉回归在 `release-gate` 里长期是"人工核查项"、Visual Tests 的步骤长期 `continue-on-error: true`。"先观察再接判定"若无自带收束物，就会永远停在观察。这与 AGENTS.md「执行记录里的『待办状态』必须有东西在检测」是同一条纪律的自我适用。

## Risks / Trade-offs

- **[登记从"一份可直接读的 JSON"变成"扫目录派生"，人读成本上升]** → checker 保留清单打印与分源计数；历史 JSON 不删，只停止增长。
- **[阈值式收束会让待清理豁免堆到 3 条才红，期间形同无约束]** → 阈值可配且默认取小值（3）；计数每次打印；堆到阈值的那次红点名全部文件、删除动作零冲突，修复成本低于一次误拦。
- **[小改动 PR 被存在性判据逼去写记录，制造噪声]** → 豁免文件是合法出路且逐条带原因；判据 forward-only 不牵连历史。
- **[CI 上三点 diff 因浅克隆取不到 → 判据恒红，变成阻塞事故]** → 第一步只打印不拦截（由 D8 的检测物保证第二步必然发生），并 MUST 先从 runner 日志取到"变更集非空、base 解析成功"的现场证据才允许转阻断。
- **[记录分散到 N 个文件，`grep` 成本]** → 实测弱化：`grep -r` 在 N 个小文件上比在 6 千行单文件上更便宜；本条风险小于先前评估。
- **[`.quality-gates.md` 仍在长（回填历史记录的 `远程同步` 行时仍会碰它）]** → 显式接受：这是 #2553/#2604 已验证的可控成本，新载体不消除它，只将新增记录从其中移走。
- **[分支名当豁免键，分支删除后无法证明它曾被合法消费]** → 不试图证明：分支不存在即视为"已消费或已废弃"，进入待清理计数（D4），语义上不要求区分。

## Migration Plan

1. **第一步（建基础设施，判据非阻断）**：新增 `openspec/records/` + `_TEMPLATE.md` + `_exempt/`；`check-gate-record-debt.js` 两源读取（登记由记录文件派生）；`check-pr-exec-record.js` 实现存在性 + 豁免阈值 + `MODE=advisory` 标记与 D8 的检测物；`_legacy-absent.md` 生成；接线 `Gate 2c`（`shell: bash`）。
2. **第二步（转阻断）**：删除 `MODE=advisory` 标记（D8 的测试随之由红转绿），退出码接入判定；同步更新 AGENTS.md 记录载体口径与 `docs-only-ci-shortcircuit` design.md:45 的载体措辞。
3. **回退**：判据以独立脚本 + workflow 单行接线存在，回退 = 删接线行并 revert 该 PR；两步分属两个 PR，回退第二步不影响两源收口与历史文件。

## Open Questions

- `openspec/records/` 是否需要按 `<yyyy-mm>/` 分目录（记录数到几百篇才影响列举，可后置）。
- `_legacy-absent.md` 是否附作者归属字段（可由 `git log --author` 事后补，不影响判据）。
- 待清理豁免阈值取 3 是否合适——需第一步在 runner 上真实跑一段后按分布回调（属实现期参数，不改规格）。
