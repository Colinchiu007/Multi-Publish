## 1. 载体地基

- [x] 1.1 建 `openspec/records/` + `_TEMPLATE.md`：门禁表 + 一行 `| 远程同步 | PENDING | … |` + frontmatter（`status` / `reason` / `backfill_owner`），模板注释写明"未收口必须自带登记字段"
- [x] 1.2 建 `openspec/records/_exempt/` 目录约定（按分支名一文件、必填原因），并在模板里给出豁免文件的最小形态
- [x] 1.3 用 `git check-ignore -v` 当场证明 `openspec/records/**` 与新脚本不被 `.gitignore`（第 106 行 `scripts/*.js` 陷阱）静默排除；需要时按既有惯例补 `!` negation
- [x] 1.4 键形态约定落地：新记录键 = 文件名，历史键 = 标题；先写测试断言两者互不重叠（红），再由 checker 实现

## 2. 收口检查扩为两源，登记改由记录文件派生（改既有 checker，TDD）

- [x] 2.1 写测试：夹具含"历史单文件里一条未收口行"与"记录目录里一条未收口行（登记字段在文件内）"，断言两者出现在同一结果集、可分别销账 —— 实现前必须红
- [x] 2.2 写测试：记录目录不存在 / 枚举中某目录读不动 / 一条行都读不到 ⇒ MUST 抛错，禁止"零条记录"当"零条违规"
- [x] 2.3 写测试：记录文件未收口却缺登记字段（或 `backfill_owner` 为空）⇒ 判不合规并点名该文件
- [x] 2.4 写测试：历史 `gate-record-debt-ledger.json` 的既有语义（shrink-only、键漂移双报、未知词表即未收口）一字不改 —— 作为防回归的对照轮
- [x] 2.5 实现两源读取 + 由记录文件派生登记（词表与欠账语义 MUST 引用既有实现，不得复制第二份）
- [x] 2.6 变异反证：新源读取改成恒空 → 必须红；词表改成"未知即收口" → 必须红；每格还原后按字节核对与改前一致

## 3. 存在性判据（新脚本，TDD）

- [x] 3.1 先把"取本 PR 变更集"从 `scripts/classify-docs-only.js` 提为可复用导出（只增不改其判定语义），并为其加一条导出锁测试
- [x] 3.2 写 `scripts/check-pr-exec-record.test.js`：变更集含一篇新增 `openspec/records/*.md` → 通过；不含且无豁免 → 红且输出两条出路
- [x] 3.3 写测试：取不到 base / 三点 diff 失败 / 变更集为空 → fail-closed 红，并原样打印所用 git 命令与 stderr
- [x] 3.4 写测试：历史缺记录条目存在时，本 PR 自带合规记录仍判通过（forward-only 的回归锁）
- [x] 3.5 写测试：豁免以分支名标识；「分支在 origin 已不存在」的豁免计入待清理可见数；未达阈值退出码 0，达阈值（默认 3，可配）转红并点名文件
- [x] 3.6 写测试：同一分支同时存在记录文件与豁免文件 → 判矛盾红
- [x] 3.7 **结构锁**：断言新脚本内不出现第二份 `git diff … HEAD` 取源（grep 自身源码），违反即红 —— 防 D1 点名的"两份变更集口径漂移"
- [x] 3.8 实现 `scripts/check-pr-exec-record.js`，使 3.2–3.7 全绿
- [x] 3.9 变异反证：把存在性判据改成 no-op → 必须立刻变红（证明锁在跑，不只证明业务改动变红）

## 4. 存量一次性登记（禁止手抄）

- [x] 4.1 写生成脚本，从 `git rev-list --first-parent --since=<窗口>` + `diff-tree` + `gh pr view --json body,comments` 派生 `_legacy-absent.md`，逐条带 PR 号、标题、所命中口径与原因
- [x] 4.2 落盘前复核：正控 2 条（确实写了记录的 PR 必须判合规）、负控 2 条（三处皆无的必须判缺）；并把四档口径（严 1 / 指代 7 / 门禁内容 32 / 提及远程同步 2）写进文件表头，避免后来者把这个数当成"没干活"
- [x] 4.3 生成后冻结该文件（不再由任何 PR 追加），并在 checker 里把它当作基线起点读取以便比较

## 5. 接线与非阻断落地

- [x] 5.1 在 `.github/workflows/quality-gate.yml` 的 `Gate 2c` 显式点名两个新测试文件与判据脚本；与既有命令同 `run:` 块时 MUST 改 `shell: bash`
- [x] 5.2 跑 `scripts/check-unwired-tests.js` 与 `scripts/check-step-failfast.js`，确认新测试已接线、多命令步骤 fail-fast
- [x] 5.3 按 D8 落地"非阻断状态自身可被检测"：脚本打印 `MODE=advisory` 标记 + 一条会按期变红的测试；本 PR 自己的记录按口径写未收口并自带登记字段
- [x] 5.4 开 PR、挂 auto-merge，等 runner 真实跑一轮 —— PR #2717 于 2026-09-29T22:55:15Z squash 合并（merge SHA `8dad3b15`），run `36636248036` attempt 1 全绿

## 6. Runner 现场取证（第二步的硬前置）

- [x] 6.1 从该 run 的 job 日志取三点 diff 在 `actions/checkout` 默认深度下**确实可用**的现场输出（变更集非空、base 解析成功）；取不到证据不得进入第 7 组 —— 现场行：`本 PR 变更文件 13 个（A=6 M=7 D=0） ｜ 新增记录 1 篇 / 新增豁免 0 篇 ｜ 待清理豁免 0 条`（job `QG Static`，2026-09-29T22:13:25Z）。这条同时证两件事：base 解析成功、`-z --name-status` 的**状态**在 runner 上被正确解析（A/M 计数非零，不是第一版那个静默返回空数组的实现）
- [x] 6.2 确认新判据在 runner 上被执行过（日志出现脚本名与其输出行），不接受"文件存在即算接线" —— 现场行：`MODE=advisory（尚未接进判定；转阻断 = 删掉 CI 里的 --mode=advisory…）` 由真实 CLI 调用打印，紧随 `OK: 本 PR 携带执行记录或带原因的豁免`；同一步 `node --test scripts/check-pr-exec-record.test.js` 输出 `# pass 14 / # fail 0`，之后步骤继续执行 ⇒ 退出码确实未参与判定

## 7. 转阻断与口径同步

- [ ] 7.1 删除 `Gate 2c2` 里的 `--mode=advisory` 参数、把存在性判据退出码接入判定。**原措辞"使 D8 的测试由红转绿"经实测不成立**：现有 14 条测试全部只驱动 CLI 自身（`--mode=advisory` 显式传参），没有一条读 workflow 文件，所以删参数不会让任何东西先变红，而"CI 停在观察态"目前无人检测 —— 这正是 D8 要防的形态，必须用结构锁补上。**触发条件（可机械核对）**：`gh pr list -R Colinchiu007/mulpub --state open` 为空，或在途 PR 全部携带 `openspec/records/` 记录/豁免；2026-10-01 实测在途 7 个 PR 的新载体携带数为 0，经用户决定推迟。
- [ ] 7.1a **搬家先于删参数，否则得到一个恒不触发的阻断门禁**（2026-10-02 实测，本条是 7.1 的硬前置）：`Gate 2c2` 现在住在 `quality-gate.yml` 的 `static-gates`（job `name: QG Static`，L70 `if: needs.changes.outputs.docs-only != 'true'`），而纯文档 PR 上这个 job 整体 **skipping** —— 现场证据就是本 change 自己的第二个 PR #2757（`openspec/**` 三个文件 ⇒ `docs-only=true`，check 名单里 `QG Static skipping`、`QG Changes pass`、`Gate Result pass`）。被短路的正是最容易漏记录的那类 PR，所以判据留在原处转阻断只会"看着在守、实际对目标人群永不执行"。
  **落地位置（2026-10-02 二次实测纠正，本条上一版写反了）**：判据应留在 `quality-gate.yml` 的 **`changes` job**（`QG Changes`），失败由 **`Gate Result` 聚合拦住**——依据三段实测：① required 检查有**两层**，并集 9 个 context：ruleset `main-ci-gate` 6 个（`QG Static`/`QG Unit Tests`/`electron-tests`/`文档同步检查`/`债务熔断检查`/`单元测试 + Lint`）+ classic protection 4 个（`Gate Result`/`build`/`QG Unit Tests`/`QG Coverage`，端点 `branches/main/protection`；别名端点 `branch-protection` 恒 404，把它当"protection 不存在"是坐标错误）；② `gate-result`（context 名 `Gate Result`，**在** required 并集里）`needs: [changes, static-gates, …]` 且 `if: always()`，判定表把 `changes` 逐条列入，`$allowed = @('success','skipped')`、其余 `exit 1`（L1073-1111 实读）；③ `changes` 本身不被短路、带 `fetch-depth: 0`、base sha 已在作用域内。**上一版那句"`QG Changes` 不在 required 清单 ⇒ 红也不拦"是错的**：它漏看了聚合边——不在清单里的 job 失败，会经在清单里的 `Gate Result` 拦下合并。这正是 #2718 为账本 JSON 采用的同一形制（判据住 `changes`、早退之前），也是 AGENTS.md「进白名单的数据文件，它的校验必须先待在不会被短路的 job」那条的既有实现路径。备选（可用但次选）：`doc-gate.yml` 的 `doc-gate` job（context `文档同步检查` 自身 required、`on: pull_request` 无 `paths-ignore`、`fetch-depth: 0`），代价是把本 change 的门禁挂到兄弟 workflow 上，归属直觉失效。
- [ ] 7.1b 与搬家同 PR 补两道结构锁：① 断言该 CLI 调用出现在 `quality-gate.yml` 的 **`changes` job 正文内、非 PR 早退之前**，且**不带** `--mode=advisory`；另加一条"聚合边不得被摘"的锁——`gate-result` 的 `needs` 与判定表必须仍含 `changes`（摘掉就等于把 required 通路剪断）。② 沿用 #2718 为 `check-gate-record-debt` 立的那条形制："判据转阻断 ⇒ 它的接线命令必须在不被 docs-only 短路的 job 正文内"，把位置本身钉住，防止后来者"顺手挪回 static-gates"。
- [ ] 7.1c 搬家后的取证要在新 job 上重取一次：第 6 组证据取自 `windows-latest` 的 `QG Static`，而 `changes` 跑在 ubuntu；`check-pr-exec-record.js` 在 `--base` 取不到时会 fail-closed 判红，若新位置的 checkout 形态与预期不符，后果是**每条 PR 都被判红**而不是静默失效——所以必须先在 advisory 下于新位置跑一轮，看到「本 PR 变更文件 N 个」的 N 非零，再执行 7.1 删参数。另需一条现场证据：故意让 `changes` 红一次（或读一次真实红 run），确认 `Gate Result` 随之红且 PR 合不动——"聚合边有效"目前是读代码得出的，没跑过反证。
- [ ] 7.2 更新 AGENTS.md 质量节拍段：记录载体改为 `openspec/records/`，`.quality-gates.md` 标为只读历史；同步修订"执行记录里的待办状态必须有东西在检测"那条 MUST 的措辞使其覆盖新载体
- [ ] 7.3 修订 `openspec/changes/docs-only-ci-shortcircuit/design.md:45` 的载体表述（"判定证据必须写入 `.quality-gates.md` 记录" → 新载体），避免两份规格各指一个位置
- [ ] 7.4 若姊妹轴 `gate-coverage-ratchet` 已先落地，按其实装核对 D1/D5/D7 落点，确认没有第二份词表、第二份白名单或第二份变更集取源（2026-10-01 实测 `git ls-tree origin/main openspec/changes/` 全清单**无** `gate-coverage-ratchet`，本项当前 N/A；执行 7.1 那天必须重查一次再决定）

## 8. 收口

- [x] 8.1 合并后回填本 PR 记录的 `远程同步` 行并删除其登记字段（清单收敛实证），顺带清理待清理豁免 —— 回填动作在本次 PR 内完成：`openspec/records/gate-record-presence-impl.md` 的 `远程同步` 改 PASS（merge SHA `8dad3b15`、时间、`merge-base --is-ancestor` rc=0、`ls-remote` 0 行），三个 `sync_*` 字段整段删除；待清理豁免实测 0 条（`check-pr-exec-record.js` 现场输出「待清理豁免 0 条」），无物可清。本 PR 自己的记录按同一口径写 PENDING，其收口留给下一个会话
- [ ] 8.2 跑 `openspec validate` 与归档三同步（OpenSpec archive + 质量节拍复盘），把"存量数字是否下降、待清理豁免峰值"写进复盘
