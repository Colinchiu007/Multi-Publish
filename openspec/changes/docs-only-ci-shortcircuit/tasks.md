## 1. 判定脚本（TDD）

- [x] 1.1 写 `scripts/classify-docs-only.test.js`（先红：模块不存在）：覆盖全部命中白名单→true、混入任一代码/依赖/CI 文件→false、空清单→false（fail-closed）、白名单与 CI_IGNORED_PATHS 同源、CLI 输出判定+文件清单证据
- [x] 1.2 实现 `scripts/classify-docs-only.js`（导出 `CI_IGNORED_PATHS` 常量 + `isDocsOnly(files)` 函数 + CLI merge-base diff 判定），测试转绿
- [x] 1.3 接线：把新测试文件登记进 `quality-gate.yml` Gate 2c（或 2b）并过 `scripts/check-unwired-tests.js` 棘轮

## 2. quality-gate 短路

- [x] 2.1 新增轻量 `changes` job（ubuntu-latest，merge-base diff 调 classify-docs-only CLI，输出 `docs-only`），纳入 gate-result 的 needs 与判定表（failure 即拦）
- [x] 2.2 8 个重型 job（static-gates / unit-tests / desktop-shards / coverage / business-api-postgres / visual / e2e / autonomous）加 `needs: [changes]` + `if: needs.changes.outputs.docs-only != 'true'`；gate-result 保持 `if: always()` 与 skipped 放行不动
- [x] 2.3 验证 YAML 语法与 job 依赖图（本地 `node --test .github/scripts/workflow-contract.test.js` 全绿）

## 3. electron-ci / build / doc-gate

- [x] 3.1 `electron-ci.yml`：electron-tests job 加 changes 检测 + docs-only 条件跳过（同模式）
- [x] 3.2 `build.yml`：build job 加 changes 检测 + docs-only 条件跳过；既有 `package-relevant` 步骤级检测保留不动
- [x] 3.3 `doc-gate.yml`：doc-sync job 换 ubuntu-latest（触发与门禁语义不变）

## 4. 契约防再犯锁

- [x] 4.1 `workflow-contract.test.js`：`CI_IGNORED_PATHS` 改为从 `scripts/classify-docs-only.js` import（真源迁移），既有断言全绿
- [x] 4.2 新增短路接线断言：三个全量 workflow 必须存在 changes job + 重型 job 的 docs-only 条件（摘任一处即红）
- [x] 4.3 变异反证：①摘 changes job → 契约红；②摘任一重型 job 条件 → 契约红；③判定恒 false → 行为不变（现状等价）；④白名单混入代码路径 → 混合 PR 判定仍 false 的单测红；每条以字节还原并核对哈希

## 5. 质量节拍 docs-only 通道

- [x] 5.1 AGENTS.md 新增「docs-only 快速通道」：判定走 `node scripts/classify-docs-only.js`（同一真源）；保留门禁（行尾对账 / 品牌残留 Gate 12 / 文档同步 / 远程同步）；跳过 QM-1/QM-2/QM-4/TDD/QM-6；附 `.quality-gates.md` 精简记录模板（4–5 行）
- [x] 5.2 本 PR 自身即用该通道记录 `.quality-gates.md`（本 PR 改 .github/ 与 scripts/，属混合 PR——记录里如实写「本 PR 不适用 docs-only 通道，按完整口径」并走完整门禁）

## 6. 收口

- [x] 6.1 `.quality-gates.md` 执行记录 + CHANGELOG 条目 + 行尾对账（numstat 两口径一致）
- [x] 6.2 提交（pre-commit 分支守卫自动声明）、推分支、开 PR、CI 全绿
- [ ] 6.3 合并后第一个纯文档 PR 实证 skipped required check 语义（mergeStateStatus 不 BLOCK）。远程同步行已回填（PR #2581 squash 合并 `a48820a0`，2026-09-28T15:15:35Z，远端分支已删，runner 留痕见 `.quality-gates.md`）；skipped 实证留给下一个自然纯文档 PR，届时勾选本项
