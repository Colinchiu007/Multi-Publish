## 1. 规格与实现

- [x] 1.1 `_resolveImageGenerator` / `_defaultImageGenerator` / `_imageModelFor`（story2video-project-service.js）
- [x] 1.2 `retrySegment(image)` 与 `generateSceneImage` 接入解析，无默认 fail closed
- [x] 1.3 回归测试 6 用例（关多模态改默认 / 开多模态保留 / 显式 image 保留 / 无默认报错 / 老项目空透传 / generateSceneImage 同逻辑）

## 2. 验证与交付

- [x] 2.1 定向测试 story2video-project-service.test.js 72 passed；asset-generator / model-provider-multimodal / ResultView 105 passed
- [x] 2.2 更广回归（story2video-stages / CreateView）+ node --check + git diff --check
- [x] 2.3 审查（antigravity 区域不可用降级，Claude reviewer 结论入 review.md）
- [ ] 2.4 推送 codex/ 分支 → PR → CI 全绿 → 合并回 main
- [ ] 2.5 三同步归档（openspec archive + CCG task 归档 + learnings/CHANGELOG/quality-gates）
- [ ] 2.6 真实生图验证（消耗用户额度，先确认意图）
