## 1. 载体地基

- [ ] 1.1 建 `openspec/records/` + `_TEMPLATE.md`：门禁表 + 一行 `| 远程同步 | PENDING | … |` + frontmatter（`status` / `reason` / `backfill_owner`），模板注释写明"未收口必须自带登记字段"
- [ ] 1.2 建 `openspec/records/_exempt/` 目录约定（按分支名一文件、必填原因），并在模板里给出豁免文件的最小形态
- [ ] 1.3 用 `git check-ignore -v` 当场证明 `openspec/records/**` 与新脚本不被 `.gitignore`（第 106 行 `scripts/*.js` 陷阱）静默排除；需要时按既有惯例补 `!` negation
- [ ] 1.4 键形态约定落地：新记录键 = 文件名，历史键 = 标题；先写测试断言两者互不重叠（红），再由 checker 实现

## 2. 收口检查扩为两源，登记改由记录文件派生（改既有 checker，TDD）

- [ ] 2.1 写测试：夹具含"历史单文件里一条未收口行"与"记录目录里一条未收口行（登记字段在文件内）"，断言两者出现在同一结果集、可分别销账 —— 实现前必须红
- [ ] 2.2 写测试：记录目录不存在 / 枚举中某目录读不动 / 一条行都读不到 ⇒ MUST 抛错，禁止"零条记录"当"零条违规"
- [ ] 2.3 写测试：记录文件未收口却缺登记字段（或 `backfill_owner` 为空）⇒ 判不合规并点名该文件
- [ ] 2.4 写测试：历史 `gate-record-debt-ledger.json` 的既有语义（shrink-only、键漂移双报、未知词表即未收口）一字不改 —— 作为防回归的对照轮
- [ ] 2.5 实现两源读取 + 由记录文件派生登记（词表与欠账语义 MUST 引用既有实现，不得复制第二份）
- [ ] 2.6 变异反证：新源读取改成恒空 → 必须红；词表改成"未知即收口" → 必须红；每格还原后按字节核对与改前一致

## 3. 存在性判据（新脚本，TDD）

- [ ] 3.1 先把"取本 PR 变更集"从 `scripts/classify-docs-only.js` 提为可复用导出（只增不改其判定语义），并为其加一条导出锁测试
- [ ] 3.2 写 `scripts/check-pr-exec-record.test.js`：变更集含一篇新增 `openspec/records/*.md` → 通过；不含且无豁免 → 红且输出两条出路
- [ ] 3.3 写测试：取不到 base / 三点 diff 失败 / 变更集为空 → fail-closed 红，并原样打印所用 git 命令与 stderr
- [ ] 3.4 写测试：历史缺记录条目存在时，本 PR 自带合规记录仍判通过（forward-only 的回归锁）
- [ ] 3.5 写测试：豁免以分支名标识；「分支在 origin 已不存在」的豁免计入待清理可见数；未达阈值退出码 0，达阈值（默认 3，可配）转红并点名文件
- [ ] 3.6 写测试：同一分支同时存在记录文件与豁免文件 → 判矛盾红
- [ ] 3.7 **结构锁**：断言新脚本内不出现第二份 `git diff … HEAD` 取源（grep 自身源码），违反即红 —— 防 D1 点名的"两份变更集口径漂移"
- [ ] 3.8 实现 `scripts/check-pr-exec-record.js`，使 3.2–3.7 全绿
- [ ] 3.9 变异反证：把存在性判据改成 no-op → 必须立刻变红（证明锁在跑，不只证明业务改动变红）

## 4. 存量一次性登记（禁止手抄）

- [ ] 4.1 写生成脚本，从 `git rev-list --first-parent --since=<窗口>` + `diff-tree` + `gh pr view --json body,comments` 派生 `_legacy-absent.md`，逐条带 PR 号、标题、所命中口径与原因
- [ ] 4.2 落盘前复核：正控 2 条（确实写了记录的 PR 必须判合规）、负控 2 条（三处皆无的必须判缺）；并把四档口径（严 1 / 指代 7 / 门禁内容 32 / 提及远程同步 2）写进文件表头，避免后来者把这个数当成"没干活"
- [ ] 4.3 生成后冻结该文件（不再由任何 PR 追加），并在 checker 里把它当作基线起点读取以便比较

## 5. 接线与非阻断落地

- [ ] 5.1 在 `.github/workflows/quality-gate.yml` 的 `Gate 2c` 显式点名两个新测试文件与判据脚本；与既有命令同 `run:` 块时 MUST 改 `shell: bash`
- [ ] 5.2 跑 `scripts/check-unwired-tests.js` 与 `scripts/check-step-failfast.js`，确认新测试已接线、多命令步骤 fail-fast
- [ ] 5.3 按 D8 落地"非阻断状态自身可被检测"：脚本打印 `MODE=advisory` 标记 + 一条会按期变红的测试；本 PR 自己的记录按口径写未收口并自带登记字段
- [ ] 5.4 开 PR、挂 auto-merge，等 runner 真实跑一轮

## 6. Runner 现场取证（第二步的硬前置）

- [ ] 6.1 从该 run 的 job 日志取三点 diff 在 `actions/checkout` 默认深度下**确实可用**的现场输出（变更集非空、base 解析成功）；取不到证据不得进入第 7 组
- [ ] 6.2 确认新判据在 runner 上被执行过（日志出现脚本名与其输出行），不接受"文件存在即算接线"

## 7. 转阻断与口径同步

- [ ] 7.1 删除 `MODE=advisory` 标记使 D8 的测试由红转绿，把存在性判据退出码接入判定
- [ ] 7.2 更新 AGENTS.md 质量节拍段：记录载体改为 `openspec/records/`，`.quality-gates.md` 标为只读历史；同步修订"执行记录里的待办状态必须有东西在检测"那条 MUST 的措辞使其覆盖新载体
- [ ] 7.3 修订 `openspec/changes/docs-only-ci-shortcircuit/design.md:45` 的载体表述（"判定证据必须写入 `.quality-gates.md` 记录" → 新载体），避免两份规格各指一个位置
- [ ] 7.4 若姊妹轴 `gate-coverage-ratchet` 已先落地，按其实装核对 D1/D5/D7 落点，确认没有第二份词表、第二份白名单或第二份变更集取源

## 8. 收口

- [ ] 8.1 合并后回填本 PR 记录的 `远程同步` 行并删除其登记字段（清单收敛实证），顺带清理待清理豁免
- [ ] 8.2 跑 `openspec validate` 与归档三同步（OpenSpec archive + 质量节拍复盘），把"存量数字是否下降、待清理豁免峰值"写进复盘
