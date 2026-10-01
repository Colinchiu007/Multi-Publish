# visual-regression Specification

## Purpose
定义本仓**全量视觉回归**在 CI 上的执行形态与证据口径：四套用例由单一聚合器逐套隔离执行（一套红不得中止后续套件，"这套截图有没有进产物"不能取决于前一套的成败），每套输出一行可解析的 `[VISUAL-SUMMARY]` 作为"这套真的在 CI 上跑过"的唯一现场；并且 CI 必须有一个全量视觉的产物来源，使基线能按 QM-4 第 7 条与比对环境**同源**（基线只能取自同一次 run 的 CI 渲染，本机 `test:visual:update-baseline` 的产物不得入库）。本规格只约束采集与判定链，不约束被测 UI 本身。
## Requirements
### Requirement: 全量视觉回归由单一聚合器执行并逐套留下可解析汇总

`test:all:visual` SHALL 指向唯一聚合脚本（`apps/desktop/tests/visual-testing/scripts/run-all-visual.js`），MUST NOT 用 `&&` 串联四套套件文件。聚合器 SHALL 从四套用例模块取注册表（与模块导出的数组引用相等，禁止复制第二份清单），并 SHALL 逐套隔离执行：**任一套件失败或抛错都不得中止后续套件**——「CI 产物里有没有这套用例的截图」不得取决于前一套的成败。

每套 SHALL 输出一行 `[VISUAL-SUMMARY] suite=<id> total=<n> passed=<n> failed=<n> elapsed_ms=<n>`，全部通过时不得省略；末尾 SHALL 输出 `[VISUAL-ALL-SUMMARY] suites=<n> total=<n> passed=<n> failed=<n> aborted=<n>`。运行器起不来、返回形状不认识等「一条结论都没有」的情形 SHALL 记 `aborted=1` 且 `failed=0`，MUST NOT 把未知谎报成失败数，也 MUST NOT 默认成「全通过」（fail-closed：「没拿到结论」不是「没有失败」）。
用例总数 SHALL 只取注册表长度，MUST NOT 由套件返回的条数反推（否则套件加条目就能改动总数口径）。
套件若以「不抛错、把每条回填 FAILED」的形态表达**启动失败**（`all-workflows` 的既有契约），SHALL 由该套件显式标 `runnerLaunchFailed` 供聚合器判 `aborted`，MUST NOT 让同一根因在不同套件被分类成 `failed=全部` 与 `aborted=1` 两种结论。
CLI 退出码 SHALL 在存在 `failed>0` 或 `aborted>0` 时为 `1`（人工「全绿才算过」的合同不变）；CLI SHALL 另把同一份汇总写入 `reports/visual-all-summary.json`，使 artifact 内可不扒日志就判定逐套结论。

套件返回的**结论条数必须与注册表条数相等**；不等（少产出一条、或用多余条目反推总数）SHALL 判 `aborted`，MUST NOT「就近取一个数」当作结果。抛出错误但 `failures` 为空（一条都没归因）同样 SHALL 判 `aborted`。

#### Scenario: 第一套红仍跑完四套

- **WHEN** 第一套用例抛出带 `failures` 的错误
- **THEN** 其余三套依次被执行（调用顺序完整），汇总行仍逐套输出

#### Scenario: 汇总行逐字格式

- **WHEN** 某套 `total=2 / passed=1 / failed=1`，耗时 5ms
- **THEN** 输出恰为 `[VISUAL-SUMMARY] suite=views total=2 passed=1 failed=1 elapsed_ms=5`（不得只有 emoji 或人读的「N/M 通过」）

#### Scenario: 无结论不得算成失败

- **WHEN** 某套的运行器在启动阶段抛错且没有逐条结论
- **THEN** 该套输出 `passed=0 failed=0 aborted=1`，`[VISUAL-ALL-SUMMARY]` 的 `aborted` 计数 +1

#### Scenario: 注册表漂移即红

- **WHEN** 聚合器改为自带清单，或某套注册表整批未加载
- **THEN** 契约测试（引用相等 + 总数）失败

### Requirement: CI 必须有全量视觉的产物来源，且在基线同源重建前不得升级为门禁

`visual-test.yml`（main push / workflow_dispatch）SHALL 含一个执行全量聚合器的步骤，该步骤 SHALL 同时声明 `if: always()`（像素门禁红时也必须采集）与 `continue-on-error: true`（**当前刻意非阻断**）；
它 SHALL 自带 dev server 生命周期（自己 `Start-Process`、自己等就绪、自己 `taskkill`，端口与像素门禁分离），并 SHALL 把聚合器退出码带到步骤末尾 `exit`——`continue-on-error` 只有在步骤**非零退出**时才把它显示为可见警告，正文以日志语句收尾会让整批采集失败染成绿色通过。上传步骤 SHALL 亦 `if: always()`。；像素门禁步骤 SHALL NOT 被降级为非阻断；同一 workflow SHALL 继续上传覆盖 `apps/desktop/tests/visual-testing/screenshots` 的 artifact，该 artifact 是 views/workflows 两套注册表基线的唯一同源来源（QM-4 第 7 条：禁止把本机截图提交为基线）。

将其升级为阻断门禁 MUST 满足两个前提并在同一 PR 内完成：① 提交按该 artifact 重建的同源基线（经人工审核 diff 图）；② 同步反转契约测试中「采集步骤必须 `continue-on-error: true`」的断言。缺少任一前提即视为把不可判据的基线挂成 main 上的长期假红。

#### Scenario: 像素门禁红时采集照跑

- **WHEN** `test:visual:pixel` 步骤以非零退出
- **THEN** 全量采集步骤仍执行，artifact 内含四套截图

#### Scenario: 提前升级为门禁即红

- **WHEN** 未提交同源基线就摘掉采集步骤的 `continue-on-error`
- **THEN** `workflow-contract.test.js` 失败（断言要求该标记存在，反转它必须与同源基线同 PR）

#### Scenario: 采集步骤自带服务生命周期

- **WHEN** 采集步骤复用像素门禁那台 Vite（像素步骤已在自己的 `finally` 里 `taskkill`）
- **THEN** 视为不可用——GitHub 每个步骤是独立进程树，四套用例会对着不存在的端口跑成 103 条连接失败，而 `continue-on-error` 会把这种"整批空跑"染成黄色而非红色
- **THEN** 契约测试要求采集步骤自己 `Start-Process` 起服务、自己等就绪、自己 `taskkill`，且 `TEST_URL` 端口与像素门禁分离

#### Scenario: 两条流水线渲染同一个应用状态

- **WHEN** `visual-test.yml` 的渲染参数（`TEST_URL` / `HEADLESS` / `PIXEL_THRESHOLD` / `VITE_MP_DEV_FLAG_OVERRIDE`）与 QG Visual 的 Gate 7 不一致
- **THEN** 契约测试失败——从 Visual Tests artifact 取来的基线与 QG 的比对环境不同源，等于重新制造「仓库基线 vs CI 渲染差 3.82%」那类不可判据

#### Scenario: 像素门禁不得被反向降级

- **WHEN** 有人为了让 CI 变绿而给像素门禁步骤加 `continue-on-error`
- **THEN** 契约测试失败（真实门禁不得降级为采集）

