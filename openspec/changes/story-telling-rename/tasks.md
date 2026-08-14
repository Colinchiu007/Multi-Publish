# Tasks

## T1 更名实现（显示层 + 测试）

- [x] locales：`apps/desktop/src/locales/zh.js` 7 处、`en.js` 6 处更新（configurationTitle/素材模式两项/access_denied/selectVideoScenesOff/pipelines.names/pipelines.descriptions）
- [x] `apps/desktop/src/views/CreateView.vue` 2 处 fallback 文案（全能创作配置 / Omni Creation Configuration）
- [x] 测试断言与 fixture：`i18n.test.js`(3)、`glossary.test.js`(1)、`PipelineBrowser.test.js`(1)、`story2video-notifications.test.js`(4)、`route-functional-suite.js`(正则+注释 2)、注释类 `videogen-stages.js`/`story2video-segmentation-parity.test.js`/`ipc-mock.js`/`story2video-manual-selection.js`
- [x] 测试门禁：受影响套件全绿（i18n/glossary/PipelineBrowser/story2video-notifications/segmentation-parity/e2e helpers）+ `check-locale-sync` zh/en 成对

## T2 文档同步

- [x] `01-docs/i18n-glossary.md`（术语行 + 旁白式外显名）
- [x] `01-docs/i18n-sync-mechanism.md`（术语表行）
- [x] `01-docs/product-manual.md`（使用步骤流水线名）
- [x] `01-docs/PRD.md` 23 处（§7.1 标题/§7.1.3 契约段×3/提示文字表×3 副本/2026-08-12 更名笔记×3/术语词典示例/7.1.35 交叉引用）
- [x] `CHANGELOG.md` 与 `01-docs/CHANGELOG.md` 顶部新增 2026-08-14 条目；`.quality-gates.md` 顶部追加本任务记录
- [ ] `openspec archive` 后直接编辑 live specs 的 Purpose 段更新当前态

## T3 双模型审查 + 三同步归档

- [ ] 双模型审查 git diff（antigravity 区域不可用 → Claude + 主代理补位，降级记录写入 .quality-gates）
- [ ] `openspec validate story-telling-rename` + `openspec archive story-telling-rename`（PR 合并后）
- [ ] CCG task 归档 `.ccg/tasks/archive/2026-08/`；`scripts/openspec-sync-check.js` 通过（PR 合并后）
