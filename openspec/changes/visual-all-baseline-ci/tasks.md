## 1. 聚合器

- [x] 1.1 新建 `apps/desktop/tests/visual-testing/scripts/run-all-visual.js`：四套注册表单点聚合、逐套隔离、`[VISUAL-SUMMARY]` / `[VISUAL-ALL-SUMMARY]` 汇总、`aborted` 与 `failed` 分列
- [x] 1.2 `apps/desktop/package.json`：`test:all:visual` 改指向聚合器（CRLF 原样保留，改后 JSON.parse + 锚点残留校验）

## 2. CI 接线

- [x] 2.1 `visual-test.yml` 新增「Full visual suites (baseline capture, non-blocking)」步骤：`if: always()` + `continue-on-error: true`
- [x] 2.2 确认像素门禁步骤未被降级、artifact 上传仍覆盖 `tests/visual-testing/screenshots`（由契约测试锁住，不靠肉眼）
- [x] 2.4 `visual-test.yml` job env 补 `VITE_MP_DEV_FLAG_OVERRIDE: "1"`（与 QG Visual 同一渲染态，否则 flag 开启态用例的基线又不同源），并由渲染参数一致性契约锁住（反证：删掉该行 ⇒ workflow-contract 红）
- [ ] 2.3 CI 首跑后按 `[VISUAL-SUMMARY] elapsed_ms` 复核 `timeout-minutes: 20` 是否够用（本机实测四套合计约 86s，暂不改）

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
- [x] 4.3 CHANGELOG / `.quality-gates.md` 记录（字节级前插：原字节为新文件逐字节后缀、NUL 数不变、CR 计数守恒；`git diff --numstat` 为 42/0 与 48/0 的纯新增）+ 账本登记本条 PENDING 欠账（`check-gate-record-debt.js` rc=0，欠账 30 条）

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
- [ ] 4c.7 **Warning #3（无逐套/逐步超时，挂死会吃满 job 超时并阻断上传）** — 未修，如实登记：聚合器无法从外部安全中断一次挂死的 Playwright 调用（强行 kill 会留下未清理的浏览器进程）；现状缓解是 main push 实测四套合计约 81 秒 vs job 预算 20 分钟，且步骤退出码现在会如实变警告（4c.2）。若将来出现挂死证据，再按证据加带清理的硬超时

## 5. 后续（本 change 明确不做）

- [ ] 5.1 用 CI artifact 重建 views/workflows 同源基线（人工审核 diff 图，QM-4 规则 4）
- [ ] 5.2 基线同源后，把采集步骤升级为阻断门禁并反转契约断言
