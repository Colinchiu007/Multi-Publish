## 1. 调度机制模块

- [ ] 1.1 新增 model-call-scheduler.js：withModelBudget / resolveProviderBudget / mapWithModelBudget（并发上限 min(请求, maxConcurrent)，复用 governor）
- [ ] 1.2 单元测试 model-call-scheduler.test.js：预算解析优先级、并发上限、回退、排队语义
- [ ] 1.3 governor 扩展 5h 请求计数窗口（requests field）并测试

## 2. provider 配置与种子

- [ ] 2.1 model-provider-seeds.js 为知名 provider 补充 rate_per_minute/limit_per_5h（与 ops-center 种子一致）
- [ ] 2.2 ModelProviderManager：setGovernor + 初始化/更新时注入预算（setProviderLimits/setTokenWindows）+ 校验（正整数可空）
- [ ] 2.3 ModelProviders.vue 表单新增限流字段（可空 + 提示 + 校验）
- [ ] 2.4 manager 预算注入测试 + 前端 composable/表单测试

## 3. 视频创作联动

- [ ] 3.1 story2video-stages.js generate_assets：image/tts 走 mapWithModelBudget（provider 预算），未配置回退原并发
- [ ] 3.2 story2video generate_assets 预算联动测试（含回退路径）

## 4. 文档与归档

- [ ] 4.1 01-docs/PRD.md、CHANGELOG.md、learnings.md 更新（含数据校验/流程/交互/提示文案）
- [ ] 4.2 openspec validate + 归档（三同步）
