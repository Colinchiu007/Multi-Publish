## 1. 静态资源

- [x] 1.1 用免费 Pollinations(flux) 预生成 15 张背景图（1024x576 JPEG，统一风格提示词 + 主题意象 + 固定 seed），校验 magic/尺寸/数量，落到 `apps/desktop/src/assets/pipeline-card-bg/`（#776 `73ea5ff9` 已合并；实测 15 文件 293,094 B，门禁记录「静态资源 PASS：JPEG magic/尺寸/数量校验」）
- [x] 1.2 新增 `apps/desktop/src/story2video/pipeline-card-bg-assets.js` 静态导入映射（#776；文件在位：15 张静态 import + `Object.freeze` 导出 `PIPELINE_BG_IMAGES`）

## 2. 前端切换静态资源

- [x] 2.1 `PipelineSelector.vue`：删除运行时获取逻辑与提示，改用静态映射渲染背景层（#776；静态版实测：`hasBg/bgUrl` 查静态映射，无 fetch/bgLoading/bgHint；后续 #1811 骨架屏与 rewrite 入口 textOnly 两次演进均保留本契约）
- [x] 2.2 `pipeline-selector.css`：删除 shimmer/生成中/失败提示样式，保留背景层/遮罩/动效/reduced-motion（#776；grep 无 shimmer/bg-generating/bg-hint 选择器；card-bg/scrim/hover 与 reduced-motion 在位。残留 :222「shimmer」为纯注释，并入未来 UI change 处理）
- [x] 2.3 重写 `PipelineSelector.test.js`（静态映射、渐变兜底、ARIA/键盘、无 API 调用）（#776；:22-55 含「无 IPC/无 API 也可渲染」+ :57-65；后续追加 textOnly 3 例）

## 3. 移除运行时生成链路

- [x] 3.1 删除 `electron/services/pipeline-card-backgrounds.js`(+test) 与 `electron/ipc-handlers/pipeline-card-backgrounds.js`(+test)（#776；两文件 Test-Path=False，commit 删除 515+235+56+108 行）
- [x] 3.2 回退接线：ipc-handlers/index、preload publish/access-control、license-access-control、src/api/publisher、preload.test.js 计数、access-control.test.js、CreateView.test.js mock（#776；全仓 grep `pipelineCardBackgrounds|pipeline-card:backgrounds` 零命中；门禁记录「计数还原 84/274/76」）
- [x] 3.3 locales zh/en 删除 `pipelines.selector.*`；i18n-glossary 删除「卡片背景」行（#776；locales/glossary grep 零命中）
- [x] 3.4 `check-locale-sync --cjk` 基线重锚（行位移）并验证 PASS（#776；门禁记录「--cjk 重锚后无新增硬编码」；check-locale-sync.js:25 已知边界注释即本次实践沉淀）

## 4. 质量与交付

- [x] 4.1 相关套件回归（PipelineSelector/CreateView/preload/i18n）+ vite build + eslint（#776 门禁记录：598 全绿；node --check 0 error；eslint 0 error；vite build 通过；PR CI 绿）
- [x] 4.2 文档：PRD-video-creation §3.1.24 改写、CHANGELOG、learnings、.quality-gates.md（#776；PRD:173 修订记录 + §3.1.24；CHANGELOG:5280；learnings +8；.quality-gates.md:2327 执行记录）
- [x] 4.3 桌面可见窗口验证（静态背景渲染）（#776；commit 记录「create-editor 基线 26.7% 差异 + 人工核验：多列响应式、统一柔和背景、文字可读，符合方案 B 预期」）
- [x] 4.4 分支提交、推送、PR、CI 全绿、合并回 main；三同步归档（openspec archive + CCG task 归档 + learnings）（前半：PR #776 已合并（`73ea5ff9`，2026-08-14，main 祖先已验证）；后半三同步：openspec archive 由本收口 PR（2026-09-28）执行，CCG task.json 已由 `15c18ae8` 批量清理（结果等效），learnings 在档；.quality-gates.md 远程同步 PENDING 行由本收口 PR 补记）
