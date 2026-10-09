# Tasks — hot-topics-publish-handoff

## 1. 复现与根因（QM-5 ①）

- [x] CDP E2E 复现：运行中的应用（CDP 9531）勾选 5 条选题 → 一键发布 → 直接发图文 → 5/5 改写成功、5 条草稿落库
- [x] 点「去发布」实证发布页表单为空（标题 0 字、正文 0/10000 字、所有 input 值为空）
- [x] 根因定位到 `HotTopics.goToDestination()` 的 `router.push('/publish')` 与 `Publish.vue onMounted` 的 `if (!draftId) return` 组合

## 2. 实现（Phase 2）

- [x] `HotTopics.vue`：图文去向按成功条目数选择 `?draft=` / `?drafts=`
- [x] `useBatchPublish.js`：抽出 `createArticleItem()` 工厂（字段面唯一真源）
- [x] `useBatchPublish.js`：`seedArticlesFromDrafts(draftList)`（过滤非法条目、标签话题归一、返回条数）
- [x] `useBatchPublish.js`：`applyTargetsToAll({ platforms, accounts })`（平台+默认账号、无账号平台不写空数组）
- [x] `Publish.vue`：`parseHandoffDraftIds` / `applyDraftHandoff` / 幂等键 / 三处触发点（onMounted、onActivated、watch）
- [x] `Publish.vue`：批量模式「批量设置发布目标」工具条 + 应用到全部条目
- [x] `locales/zh.js` + `locales/en.js`：8 条成对文案

## 3. 回归保护（QM-5 ④）

- [x] `HotTopics.test.js`：多条 → `?drafts=` 全部 id；单条 → `?draft=`
- [x] `Publish.test.js`：装载 3 条并预置平台、部分缺失、全缺失、keep-alive 幂等、id 解析、工具条应用
- [x] `useBatchPublish.test.js`：装载字段面、非法条目过滤、空入参不动现有条目、与 `addArticle` 键集一致、目标应用含账号、空输入返回 0、重复应用覆盖
- [x] 三处变异反证（M1 HotTopics / M2 Publish / M3 useBatchPublish）均变红

## 4. 文档

- [x] `01-docs/PRD-HOT-TOPICS-PUBLISH-HANDOFF-2026-10-09.md`（数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字、参考产品对照、验收标准、遗留）
- [x] `openspec/changes/hot-topics-publish-handoff/`（proposal / tasks / design / spec delta）
- [x] `openspec/records/hot-topics-publish-handoff.md`（门禁证据表）
- [x] `CHANGELOG.md` 未发布段

## 5. 端到端验收（Phase 3）

- [x] 本轮实例（worktree `mp-hot-topics-publish`，vite 7595 / CDP 11643，共享 `shared-user-data`）走完整链路
- [x] 交接后发布页自动进入批量模式并装载全部草稿（修复验证点）
- [x] 预置平台与默认账号，提交批量发布，记录各平台回执
- [ ] 多平台真实发文结果的最终核对（以平台侧回执/发布历史为准）

## 6. 交付（Phase 3）

- [ ] `gh pr create` → CI 全绿 → squash 自动合并 → 回填 merge SHA 并销账
