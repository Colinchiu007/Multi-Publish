## 1. 聚合器

- [x] 1.1 新建 `apps/desktop/tests/visual-testing/scripts/run-all-visual.js`：四套注册表单点聚合、逐套隔离、`[VISUAL-SUMMARY]` / `[VISUAL-ALL-SUMMARY]` 汇总、`aborted` 与 `failed` 分列
- [x] 1.2 `apps/desktop/package.json`：`test:all:visual` 改指向聚合器（CRLF 原样保留，改后 JSON.parse + 锚点残留校验）

## 2. CI 接线

- [x] 2.1 `visual-test.yml` 新增「Full visual suites (baseline capture, non-blocking)」步骤：`if: always()` + `continue-on-error: true`
- [x] 2.2 确认像素门禁步骤未被降级、artifact 上传仍覆盖 `tests/visual-testing/screenshots`（由契约测试锁住，不靠肉眼）
- [x] 2.4 `visual-test.yml` job env 补 `VITE_MP_DEV_FLAG_OVERRIDE: "1"`（与 QG Visual 同一渲染态，否则 flag 开启态用例的基线又不同源），并由渲染参数一致性契约锁住（反证：删掉该行 ⇒ workflow-contract 红）
- [x] 2.3 CI 首跑后按 `[VISUAL-SUMMARY] elapsed_ms` 复核 `timeout-minutes: 20` 是否够用（run `36504531944` 实测四套 `21793 / 18137 / 22713 / 6761` ms，合计约 69.4s ⇒ 预算 20 分钟余量充足，不改）

## 3. 回归锁与反证

- [x] 3.1 `visual-ci.test.js`：注册表引用相等 / 第一套红不中止 / 汇总行逐字 `toEqual` / `aborted` 不混同 `failed`
- [x] 3.2 `condition-waiting.test.js`：脚本字符串锁改为「指向聚合器 + 103 条」
- [x] 3.3 `workflow-contract.test.js`：采集步骤存在且刻意非阻断、`if: always()`、像素门禁未降级、artifact 覆盖截图目录
- [x] 3.4 反证①：把聚合器改回「首套失败即中止」→ `visual-ci.test.js` 红 1 条（已实测，恢复后 25 全绿）
- [x] 3.5 反证②：摘掉 yml 的 `continue-on-error` → `workflow-contract.test.js` 红 1 条（已实测）
- [x] 3.6 真跑一次聚合器（本机 vite + 四套真实用例）：`[VISUAL-ALL-SUMMARY] suites=4 total=103 passed=102 failed=1 aborted=0`，rc=1；唯一红是已登记的 `dashboard-benchmark-title-reset`（10.88%）。逐套 elapsed_ms=24263 / 22912 / 27022 / 6559（合计 80.8s）

## 4. 文档

- [x] 4.1 AGENTS.md QM-4：`test:all:visual` 语义变化、基线来源改为 Visual Tests workflow 的 artifact、升级门禁的两个前提
- [x] 4.2 `apps/desktop/tests/visual-testing/README.md` / `USAGE.md` 命令表同步（94→103 条口径 + 两条流水线分工）
- [ ] 4.3 CHANGELOG / `.quality-gates.md` 执行记录 / 账本登记 **移出本 PR**，改由合并后的单篇 docs PR 一次性回填
  - 原因（实测 3 轮 CI 作废换来的）：本 PR 同时改 `CHANGELOG.md` / `.quality-gates.md` / `gate-record-debt-ledger.json` 三份**置顶插入型**文件时，main 每前进一次本 PR 就变 DIRTY，每次解冲突都要重烧一整轮全量 CI（约 20 分钟）。把置顶文档改动全部推迟到"合并之后"的那篇 docs PR：代码 PR 不再与 main 抢那三份文件，docs PR 又能以 PASS 直写（不需要 PENDING 与账本登记项），于是既没有乒乓、也没有需要事后销账的欠账。
  - 回填内容清单（供下一个会话照抄，全部可离线取证）：① `CHANGELOG.md` 本 PR 条目；② `.quality-gates.md` 执行记录（其 `远程同步` 行直接写 PASS：`git log origin/main` 尾锚 `(#2589)` 取 merge SHA 与时间、`git ls-remote --heads origin visual-all-ci` 返回 0 行）；③ 若该 docs PR 自己也写 PENDING 行，才需要往账本加登记项（本条设计下应当不需要）

## 4b. QM-6 外部评审处理（claude 前端模型 + codex 后端模型）

- [x] 4b.1 **Critical**：采集步骤没有 Vite（像素步骤已在 finally 里 taskkill，复用即 103 条连接失败且被 continue-on-error 染黄）→ 采集步骤改为自带 Start-Process/就绪轮询/taskkill 与独立端口 5175；此缺陷在评审返回前已由自查命中并修复，评审读的是修复前 diff
- [x] 4b.2 **Warning**：`all-workflows` 从不抛错，启动失败会被算成「整套全红」而非 `aborted` → 该套件补 `runnerLaunchFailed` 信号，聚合器据此判 aborted
- [x] 4b.3 **Warning**：`normalizeOutcome` 对不认识的结果形状默认「全通过」（fail-open）→ 改为 aborted，并补用例覆盖
- [x] 4b.4 **Warning**：workflows 分支用 `results.length` 当 total → total 一律取注册表长度（results 多条目不得反向定义总数）
- [x] 4b.5 **Info**：套件结论只在 stdout → CLI 另写 `reports/visual-all-summary.json`，与 `ci-pixel-results.json` 同处，artifact 内可直接判定
- [x] 4b.6 **Info**：`vi.useFakeTimers()` 使 `elapsed_ms=0` 只验格式不验算术 → 聚合器开 `now` 注入缝，测试用固定时钟验 `3500-1000=2500`
- [x] 4b.7 反证四条各自实测变红后还原：未知形状默认全通过 / 忽略 runnerLaunchFailed / total 用 results.length / 不写报告文件；另三条服务生命周期反证（复用 5174 / 漏 taskkill / env 指回 5174）

## 4c. QM-6 后端模型（codex）评审处理

- [x] 4c.1 **Critical #1（Vite 被像素步骤的 finally 杀掉，采集对着不存在的端口跑）** — 不成立于交付态：两位评审读的都是修复前 diff，该缺陷在评审返回前已由自查命中并按「采集步骤自带服务生命周期」修掉，并有 3 条反证（复用 5174 / 漏 taskkill / env 指回 5174 各红一次）
- [x] 4c.2 **Critical #2（正文以 Write-Host 收尾 ⇒ PowerShell 恒退 0 ⇒ 采集整批失败显示成绿色通过）** — 成立，已修：`$captureExit` 初值 1、捕获聚合器 rc、末尾 `exit $captureExit`，让 continue-on-error 把它显示为**可见警告**；反证 N1 摘掉 exit 行即红
- [x] 4c.3 **Critical #3（未知/对不上账的成功返回被算成全通过，实测 `{results: [], failed: 0}` 假绿）** — 成立，已修：`results.length` 与注册表条数不等、或自报 total 与注册表不等 ⇒ 一律 `aborted`；反证见 4b 的 M-A/M-C 与新增断言
- [x] 4c.4 **Critical #4（抛错但 `failures: []` 被算成全通过）** — 成立，已修：`failed === 0` 的抛错同样记 `aborted`；补断言「抛错但一条都没归因，同样不是全通过」
- [x] 4c.5 **Warning #1（契约只匹配字符串，没锁服务生命周期 / 顺序 / 退出码 / 上传 always）** — 成立，已补：YAML 解析后逐步断言采集步骤在 Playwright 安装与前端构建之后（且先确认这两个前置步骤存在，防 findIndex=-1 把顺序锁降级成永真）、`exit $captureExit` 存在、`upload.if === always()`；反证 N2（改名前置步骤）/N3b（摘掉上传的 if）各红一次
- [x] 4c.6 **Warning #2（workflows 分支信任 `results.length` 当 total）** — 成立，total 一律取注册表长度，条数不等即 aborted
- [x] 4c.8 **自我补锁（生产侧信号字段不能只被 mock 证明）**：`runnerLaunchFailed` 此前只在聚合器测试里手搓，等于替对方改签名那类假绿；现补 `visual-workflow-runner.test.js` 一条跑**真 runWorkflowSuite**（launch 恒 reject）断言 `runnerLaunchFailed=true` + 回填条数与用例数相等（23 passed）；反证：删掉置位那行 ⇒ 该条变红
- [ ] 4c.7 **Warning #3（无逐套/逐步超时，挂死会吃满 job 超时并阻断上传）** — 未修，如实登记：聚合器无法从外部安全中断一次挂死的 Playwright 调用（强行 kill 会留下未清理的浏览器进程）；现状缓解是 main push 实测四套合计约 81 秒 vs job 预算 20 分钟，且步骤退出码现在会如实变警告（4c.2）。若将来出现挂死证据，再按证据加带清理的硬超时

## 4d. 自我损坏的收口：同一条记录被写了两遍（合并 main 时才发现）

- [x] 4d.1 现象：本 PR 的 `.quality-gates.md` 记录与 `CHANGELOG.md` 条目各有**两份逐字节相同**的副本（自 030f1d89 起）。合并校验器抓不到——它的判据是「两边的每一行都至少保留原次数」，属**单向包含**，对"多出一份"天生失明
- [x] 4d.2 机制化：`scripts/check-gate-record-debt.js` 新增「同一 `## ` 记录标题出现 >1 次即判红」；历史那条（error-message-fix，2026-08-19）进 `DUPLICATE_HEADINGS_ALLOWED`，并由用例断言"清单里的条目必须仍能在文件里找到"（清单只能缩小，不许变成无人认领的死条目）
- [x] 4d.3 清理用逐字节切除：在 latin1 域取偏移（utf8 字符下标与 `Buffer.subarray` 字节偏移混用，在含 CJK 的文件上会切错位置——差点踩中）；断言「切除点前后两侧逐字节相同 + NUL/loneCR/bareLF 计数不变」
- [x] 4d.4 第一次尝试的副作用被抓到：去重脚本把 21 个既有裸 LF 统一成 CRLF（正是 AGENTS.md 禁止的整文件行尾改写），EOL 审计当场显示 `bareLF 21→0`；改用字节切除后 `bareLF=21` 保持不变
- [x] 4d.5 三层反证（全部实跑）：`duplicates` 恒空 ⇒ 单测红 2 条；允许清单清空 ⇒ 真实仓库用例红；**运行器层**把首个 `## ` 标题追加到文件末尾 ⇒ `node scripts/check-gate-record-debt.js` rc=1 并打印 `x2 …`，按字节还原后 rc=0 —— 这层必要，因为把 `main()` 里的 `|| r.duplicates.length` 摘掉时 12 条单测仍全绿（退出码接线不在单测覆盖面上）
- [x] 4d.6 变异脚本自身的坑记档：对 CRLF 源文件用 `'\n'` 拼锚点 ⇒ 零命中（零命中 ≠ 锁没抓住，必须先归一到 LF 域）；`.replace` 只换第一处 ⇒ 曾把变异打在像素门禁步骤上而误报"锁没抓住"

## 5. 后续（本 change 明确不做）



- [x] 5.1 用 CI artifact 重建 views/workflows 同源基线（人工审核 diff 图，QM-4 规则 4）—— 取 run `36504531944` 的 `visual-test-reports` artifact，按「基线 vs CI默认视图 / CI默认视图 vs CI末态 / 基线 vs CI末态」三列差链把 10 条红分成两类：9 条为基线非同源（1.119% / 2.160%），1 条为工作流截图绕过确定性收口（由 #2614 修，合并后该条转绿，残差逐条等于第一列 ⇒ 分类被独立复证）。据此重建 13 条漂移 ≥0.1% 的基线，自证「新基线 vs 同一次 CI 渲染 = 0 px」全部成立；4 条当时测得 709 px 者保持未动（该 709 px 后被证明**不是噪声地板**，见 5.3）；剩余欠账纠正：本条首版写「5 条 CI 无同名渲染」是**测错了**——我只核对了视图套件产出的 `<name>.png`，漏了像素门禁产出的 `<name>-current.png`。按两类文件名重测：`home-baseline` 其实有 CI 渲染且漂移 **1.454%**（被 views 侧 6% 阈值遮住），已一并重建（第 14 条，自证 0 px）；`create-story2video-detail` 有渲染且只差 0.034%（709 px 噪声地板），保持未动；真正无 CI 渲染的是 **3 条**：`settings-general` / `login-form` / `analytics-overview` —— 它们只被 autonomous-loop 管线引用（`autonomous-*.js` 与 `packages/ai-autonomous-tester`），四套视觉与 QG Visual 的 pixelTests 都不产它们的图，故本 change 无法使其同源。
- [x] 5.2 基线同源后，把采集步骤升级为阻断门禁并反转契约断言—— 同 PR 内摘掉 `continue-on-error: true`、步骤改名 `Full visual suites (blocking gate)`，并把 `workflow-contract.test.js` 的 `assert.equal(..., true)` 反为 `assert.notEqual(..., true)`；27 条合同测试全绿，反证「加回 continue-on-error」→ 红 1 条。

- [x] 5.3 加「基线新鲜度门禁」`scripts/check-baseline-freshness.js`：断言每张被跟踪基线逐像素等于**同一次 run** 的 CI 渲染，接在 Visual Tests 采集步骤之后（`shell: bash` 阻断形态 + 同步跑自身单测 7 条）。动因：5.1 建立的 0 px 不变量在不到一天内被 #2685 的本机重捕打破（9 张漂 0.008%–1.573%，CI 全绿），说明一次性重建不解决问题，缺的是持续检测。同时否证 5.1 留下的「709 px = 顶部标签栏动态元素、正解加 mask」结论：三次不同时间 CI 渲染两两 0 px ⇒ 无动态元素，709 只是当时那张陈旧基线的漂移量。本 PR 一并把被漂掉的 9 张重建回 0 px（自证逐张 Buffer.equals + pixelmatch 0 px，检查器 rc 由 1 转 0）。
- [x] 5.4 门禁首次套到 origin/main 的实测收口（合并 main 后）：把脚本指向 main 基线 × main tip 自身 CI 渲染（run 36646007705）报出 8 张违规，同一次 run 的 blocking gate 却是 success——collection 32614 px/1.573%、create-editor/history/pipeline/intelligence 各精确 4013 px/0.194%（同一条带 y422-878，即同一共享元素在四页各渲染一次；漂移量完全相等本身就不是噪声的形状）、create-result 6175 px、dashboard 175 px、keyword-monitor-dark 127 px。前 7 张由本 PR 已重建的基线取代（合并后自动为 0 px，无需额外动作），第 8 张是真动态：同一视图的暗色孪生，登记进 KNOWN_DYNAMIC（预算 200 px，实测 127 px）。同时纠正 5.3 与本文档里「46 个视图跨 run 只有 keyword-monitor 不稳定」这句过度推广——那次测量的域只有浅色，#2709 扩到浅+暗后同一视图出现第二个不稳定条目；结论的适用范围必须与测量域一起写。