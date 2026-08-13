## 1. 静态资源

- [ ] 1.1 用免费 Pollinations(flux) 预生成 15 张背景图（1024x576 JPEG，统一风格提示词 + 主题意象 + 固定 seed），校验 magic/尺寸/数量，落到 `apps/desktop/src/assets/pipeline-card-bg/`
- [ ] 1.2 新增 `apps/desktop/src/story2video/pipeline-card-bg-assets.js` 静态导入映射

## 2. 前端切换静态资源

- [ ] 2.1 `PipelineSelector.vue`：删除运行时获取逻辑与提示，改用静态映射渲染背景层
- [ ] 2.2 `pipeline-selector.css`：删除 shimmer/生成中/失败提示样式，保留背景层/遮罩/动效/reduced-motion
- [ ] 2.3 重写 `PipelineSelector.test.js`（静态映射、渐变兜底、ARIA/键盘、无 API 调用）

## 3. 移除运行时生成链路

- [ ] 3.1 删除 `electron/services/pipeline-card-backgrounds.js`(+test) 与 `electron/ipc-handlers/pipeline-card-backgrounds.js`(+test)
- [ ] 3.2 回退接线：ipc-handlers/index、preload publish/access-control、license-access-control、src/api/publisher、preload.test.js 计数、access-control.test.js、CreateView.test.js mock
- [ ] 3.3 locales zh/en 删除 `pipelines.selector.*`；i18n-glossary 删除「卡片背景」行
- [ ] 3.4 `check-locale-sync --cjk` 基线重锚（行位移）并验证 PASS

## 4. 质量与交付

- [ ] 4.1 相关套件回归（PipelineSelector/CreateView/preload/i18n）+ vite build + eslint
- [ ] 4.2 文档：PRD-video-creation §3.1.24 改写、CHANGELOG、learnings、.quality-gates.md
- [ ] 4.3 桌面可见窗口验证（静态背景渲染）
- [ ] 4.4 分支提交、推送、PR、CI 全绿、合并回 main；三同步归档（openspec archive + CCG task 归档 + learnings）
