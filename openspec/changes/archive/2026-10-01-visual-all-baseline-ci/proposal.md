# Proposal: 全量视觉回归接入 CI，使 views/workflows 基线可按 QM-4 第 7 条同源

## Why

QM-4 第 7 条要求「基线必须与比对环境同源，只能取自 CI 产物」。但 CI 里从来没有全量视觉（views + workflows 四套注册表）的产物来源：

- `quality-gate.yml` 的 `QG Visual`（Gate 7）只执行 `run-pixel-tests.js` 的 `pixelTests`（17 条）；
- `visual-test.yml`（main push / dispatch）同样只跑 `test:visual:pixel`；
- `test:all:visual`（103 条）此前只写在 AGENTS.md 的「发版前人工核查」里，**在 CI 上一次都没跑过**。

后果在 `fix-all-workflows-selector-drift`（2026-09-28）里被量化过：`dashboard-benchmark-title-reset` 报差 10.89%，但同屏「未操作 vs 操作后」只差 0.16%、仓库基线 vs CI 渲染差 3.82% —— 差值主要来自基线与环境不同源，不是回归；`create-quick-text-reset` 三次运行 2 绿 1 红。结论是**这套工作流基线整体不可判据**，而当时的登记项写明正解是「给 `test:all:visual` 加 CI job」，没有靠调大阈值蒙混。

还有一个会静默吃掉采集的形态问题：`test:all:visual` 是 `a && b && c && d` 串联，第一套红时后面三套**一次都不跑**，「CI 产物里有没有这套用例的截图」取决于前一套的成败。

## What Changes

1. 新增唯一聚合器 `apps/desktop/tests/visual-testing/scripts/run-all-visual.js`：逐套隔离执行四套注册表，每套输出一行机器可解析的 `[VISUAL-SUMMARY]`（含 `elapsed_ms`），末尾输出 `[VISUAL-ALL-SUMMARY]`；运行器起不来这类「无任何结论」的套件记 `aborted=1`，不得谎报成失败数。
2. `apps/desktop/package.json` 的 `test:all:visual` 改指向聚合器（不再用 `&&` 串联）。
3. `.github/workflows/visual-test.yml` 新增步骤「Full visual suites (baseline capture, non-blocking)」：`if: always()` + `continue-on-error: true`，产物沿用既有 artifact 上传（含 `tests/visual-testing/screenshots`）。
4. 契约与回归锁：
   - `.github/scripts/workflow-contract.test.js`：锁「采集步骤存在 + 刻意非阻断 + `if: always()` + 像素门禁未被降级 + artifact 覆盖截图目录」。
   - `apps/desktop/tests/visual-ci.test.js`：锁「四套注册表引用相等（不得抄第二份清单）+ 第一套红不得中止后面三套 + 汇总行逐字格式 + aborted 与 failed 不混同」。
   - `apps/desktop/tests/visual-testing/condition-waiting.test.js`：原有的「脚本字符串含四个路径」锁改为锁「指向聚合器 + 聚合器覆盖 103 条」。

## 明确不做（以及为什么）

- **不升级为阻断门禁**：全量套件此刻仍有红（`all-workflows` 实测 rc=1），在基线按同源重建之前把它接进判定，等于给 main 挂一条长期假红——这正是 AGENTS.md「门禁断言随迁移同步」条目里 2026-09-17~18 事故的形态。升级动作被写进契约测试的注释与 tasks，要求「先提交同源基线，再反断言」。
- **不动 `timeout-minutes: 20`**：聚合器真跑（本机 vite，103 条）逐套 `elapsed_ms` = 24263 / 22912 / 27022 / 6559，合计 80.8s；`build:vue` 24s 另计，预算充足；聚合器每套输出 `elapsed_ms`，CI 首跑后如需调整以日志为准。
- **不重跑基线**：本 change 只建立产物来源；基线重建是后续独立 PR（需人工审核 diff 图，QM-4 强制规则 4）。

## Impact

- Affected specs: `visual-regression`（新增能力契约）
- Affected code: `apps/desktop/tests/visual-testing/scripts/run-all-visual.js`（新）、`apps/desktop/package.json`、`.github/workflows/visual-test.yml`、`.github/scripts/workflow-contract.test.js`、`apps/desktop/tests/visual-ci.test.js`、`apps/desktop/tests/visual-testing/condition-waiting.test.js`
- 文档：AGENTS.md QM-4 段（命令语义变化 + 基线来源）、`apps/desktop/tests/visual-testing/README.md` / `USAGE.md`
