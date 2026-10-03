# Tasks: compact-tag-suggester-tabs

## 1. 测试先行（TDD 红）

- [x] 1.1 `TagSuggester.test.js` 新增「Tab 化」describe：默认汇总选中 / Tab 行含全部平台 / 点击平台 Tab 显示完整分组（内容+流量+热度）/ 切换不重发请求 / 平台消失回落汇总 / 汇总行 +N 截断 / 汇总行复制仍复制全量 / aria-selected。（10 例，红态 10 failed / 21 passed 实证）
- [x] 1.2 适配既有用例：「各平台标签」标题断言改为 Tab 行断言；热度角标断言迁入平台 Tab；错误态断言补「不出现汇总」。行为覆盖未删。

## 2. 实现（绿）

- [x] 2.1 `TagSuggester.vue`：新增 `activeTab` 状态、`SUMMARY_TAG_LIMIT`、汇总摘要 computed、Tab 行模板（role=tablist/tab + aria-selected）、汇总行与平台 Tab 双分支渲染。
- [x] 2.2 `watch(platformGroups)` 回落规则 + `normalizedActiveTab` computed 归一化。
- [x] 2.3 样式：Tab 行、汇总行（行高、+N 徽标）、平台 Tab 兜底 max-height 260px；常显区边距压缩至 357px@5平台×7标签。

## 3. i18n

- [x] 3.1 `locales/zh.js` + `locales/en.js` 成对新增 `tagSuggest.tabAll` / `tagSuggest.moreTags`；locale pair + CJK 双检查 PASS。

## 4. 视觉与门禁

- [x] 4.1 定向测试全绿（TagSuggester 31/31；Publish+Prefs 97/97；全仓 4400 passed / 2 skipped）+ eslint 0 error。
- [x] 4.2 publish-form 基线验证：0.627% PASSED ×2 轮（结果态在基线折叠线下，无需重建基线）；collection 失败为 #2792 既有欠账（已归因，本分支未触及）；真机取证截图 `tests/visual-testing/reports/tag-tabs-proof.png`（357px，-55%）。
- [x] 4.3 真机取证脚本 `capture-tag-tabs-proof.js`（Playwright 拦截 IPC，可复现）；手动验证项（Tab 切换/点击填入/复制/显隐记忆）由组件级单测 + Publish 集成用例覆盖。
- [x] 4.4 `.quality-gates.md` 执行记录 + CHANGELOG 前插。

## 5. 文档与交付

- [x] 5.1 PRD 专项文档（数据校验/流程/交互/显示项/提示文字/验收标准/风险回滚）。
- [x] 5.2 openspec validate 通过；PR 创建；CI 通过后 squash 合并；销账 change 归档。
- [ ] 5.3 记忆三路沉淀（内置记忆 / learnings / EverOS）+ 回读验证。（合并后执行）
