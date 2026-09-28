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

- [ ] 4.1 AGENTS.md QM-4：`test:all:visual` 语义变化、基线来源改为 Visual Tests workflow 的 artifact、升级门禁的两个前提
- [ ] 4.2 `apps/desktop/tests/visual-testing/README.md` / `USAGE.md` 命令表同步
- [ ] 4.3 CHANGELOG / `.quality-gates.md` 记录（置顶插入，逐行保留原行尾）

## 5. 后续（本 change 明确不做）

- [ ] 5.1 用 CI artifact 重建 views/workflows 同源基线（人工审核 diff 图，QM-4 规则 4）
- [ ] 5.2 基线同源后，把采集步骤升级为阻断门禁并反转契约断言
