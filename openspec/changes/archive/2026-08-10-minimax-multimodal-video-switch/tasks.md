# Tasks

## 阶段 1：规格与基线
- [x] 基线审计：确认当前 `_multimodalProviderFor('video')` 仅看 capabilities.includes（无开关），videogen 真实失败证据（generateVideo Missing task_id / ~120ms）
- [x] 建 OpenSpec change + CCG task

## 阶段 2：TDD 实现
- [ ] 后端：model-provider-multimodal.test.js 新增用例（video 默认关/开/缺省；llm/tts/image 不受影响）→ 先红
- [ ] 后端：`_multimodalProviderFor` video 能力检查 `capability_enabled.video === true` → 绿
- [ ] 前端：useModelProviderCrud 新增 `multimodalVideoEnabled` 访问器 + 提交透传；ModelProviders.test.js 用例 → 先红
- [ ] 前端：ModelProviders.vue 多模态表单「支持生成视频」开关（默认关）→ 绿

## 阶段 3：验证
- [ ] 聚焦测试全绿（multimodal + ModelProviders + 相关套件）
- [ ] lint / node --check
- [ ] 外部审查（探子 403 降级：有界 Claude 审查）

## 阶段 4：文档与交付
- [ ] 01-docs/PRD.md 7.4.1 补充开关合同
- [ ] CHANGELOG 条目
- [ ] apply（规格合入）+ 三同步归档（OpenSpec archive + CCG + learnings）
- [ ] 分支提交 + push + PR + CI 后合并
