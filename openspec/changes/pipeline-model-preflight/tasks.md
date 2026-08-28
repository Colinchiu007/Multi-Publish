## 1. 规格基座

- [x] 1.1 完成 proposal/specs/design 工件（openspec status 全 done）；openspec apply 不可用 → 按 openspec-sync-specs 手工合入 specs/（pipeline-model-preflight 新增 + story2video-video-carousel-blend 修改），openspec validate --specs 102/102 通过

## 2. 主进程前置校验（TDD）

- [x] 2.1 新增 services/pipeline-model-preflight.js：静态映射（含 localization-dub 显式 voiceProvider +tts、podcast transcript 判定、film-engineering llmEnabled）+ story2video 动态解析 + getDefault/explicit-provider 校验（pipeline-model-preflight.test.js 28/28）
- [x] 2.2 pipeline-engine.js startOrchestrated 接入闸口（normalize 后、start() 前）+ phase1-context 注入 manager + 批量队列 item.errorCode/errorParams 透传（pipeline-engine.test.js 68/68、story2video-batch-queue.test.js 16/16）

## 3. Renderer 提示与文案

- [x] 3.1 story2video-notifications.js 新增 MODELS_REQUIRED 键与 errorCode=PIPELINE_MODEL_REQUIREMENTS_MISSING 直连、missing 能力标签本地化（story2video-notifications.test.js 46/46）
- [x] 3.2 locales zh.js/en.js 成对新增 models_required 与 modelCapabilityLabels（diff 核验成对 +9 行，无新增硬编码中文）
- [x] 3.3 CreateView.vue 弹窗「去模型设置」按钮（/model-providers）+ 批量轮询失败项弹窗（CreateView.test.js 新增 3 用例通过）

## 4. 规格与文档同步

- [x] 4.1 PRD（01-docs/PRD-S2V-PIPELINE-PAGE-UX.md §2.1.1）新增启动前模型能力前置校验章节（映射表 + 动态规则 + 错误契约 + 验收条目）
- [x] 4.2 规格 story2video-video-carousel-blend 修改视频生成器前置校验扩展到启动前；openspec validate --specs 通过

## 5. 审查与交付

- [ ] 5.1 双模型审查（opencode + Claude）diff，Critical 修复后复审（外部模型此前两次超时，本次尝试 --lite 短任务）
- [ ] 5.2 全量相关测试（vitest focused + 涉及套件）与 locale 门禁通过；.quality-gates.md 自检
- [ ] 5.3 提交推送分支并创建 PR；合并后 openspec archive + CCG task 归档三同步
