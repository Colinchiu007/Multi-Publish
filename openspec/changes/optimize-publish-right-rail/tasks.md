## 1. 显隐记忆 composable（TDD 先行）

- [x] 1.1 新增 `apps/desktop/src/composables/usePanelVisibilityPrefs.test.js`：读默认值、写入后读回、localStorage 抛异常时降级默认值、未知键忽略
- [x] 1.2 实现 `apps/desktop/src/composables/usePanelVisibilityPrefs.js`（key `publish.panelVisibility.v1`，try/catch 包裹，导出 read/write）

## 2. TagSuggester 平台联动与点击填入（TDD）

- [x] 2.1 `TagSuggester.test.js` 补用例：传入 `platforms` prop 时请求只携带所选平台；空数组回退全量目录；点击建议标签 emit `apply-tag`；错误态渲染为一行提示（可展开）而非整卡
- [x] 2.2 `TagSuggester.vue`：新增 `platforms` prop（string[]），与 content 共用防抖重新请求；建议标签绑定点击 `apply-tag`；错误态收敛为一行可展开提示
- [x] 2.3 `locales/zh.js` + `en.js` 成对新增 `tagSuggest.retry` / `tagSuggest.applyTagHint`（避开 `intelligence.*` 键）

## 3. OptimalTimeTip 空态收敛（TDD）

- [x] 3.1 `OptimalTimeTip.test.js` 补用例：数据不足时渲染单行提示（含展开控件）而非完整结果卡；展开后可见详情说明
- [x] 3.2 `OptimalTimeTip.vue`：`notEnoughData` 分支降级为一行可展开提示；其余分支不动

## 4. Publish.vue 布局重排（TDD）

- [x] 4.1 `Publish.test.js` 补用例：`flex-side` 第一块为 publish-action-card；TagSuggester/OptimalTimeTip/TitleAssistantPanel 不在 `flex-side` 内；标签建议位于标签/话题输入区之后、最佳发布时间位于定时发布字段之后、标题助手入口位于标题输入之后；显隐状态经 usePanelVisibilityPrefs 初始化与持久化
- [x] 4.2 `Publish.vue` 模板重排：publish-action-card 移至 `flex-side` 首位（sticky 保留）；三个智能面板迁至 `flex-main` 对应 form-item 之后；右栏保留 progress/草稿箱/result
- [x] 4.3 `Publish.vue` 接线：`showTagPanel`/`showTitlePanel` 经 composable 读写 localStorage；TagSuggester 传 `:platforms="selectedPlatforms"`；监听 `apply-tag` 去重追加进 `article.tags`

## 5. 质量与交付

- [x] 5.1 相关套件回归全绿：`Publish.test.js`（59）、`TagSuggester.test.js`（23）、`OptimalTimeTip.test.js`（9）、`views-deep2.test.js`、`views-coverage.test.js`、`icon-usage.test.js`（35）、`usePanelVisibilityPrefs.test.js`（7）——合计 88/88
- [x] 5.2 eslint 对全部改动文件 0 error 0 warning
- [x] 5.3 `node .github/scripts/check-locale-sync.js --keys` 通过（1233 keys 成对）
- [x] 5.4 视觉回归：`PIXEL_ONLY=publish-form` 像素门禁 1/1 通过（空表单态新旧布局渲染一致，基线无需重截）；布局差异态由真实浏览器验证 `verify-publish-rail-layout.js` 13/13 全绿覆盖
- [x] 5.5 全量 `vitest run` 回归通过（12236 通过 / 4 失败均为存量问题：story2video-manual-assets、feedback、network-egress-guard×2 已全部在干净基线 f8033fbf 复现同样失败，与本分支无关）
- [ ] 5.6 分支提交、推送、PR、CI 全绿、合并回 main；openspec archive + CCG task 归档 + 质量节拍复盘三同步
