# Tasks: story2video-options-consolidation-r2

## 1. 前端死字段移除

- [x] CreateView.vue s2vConfig 删除 splitSpeechRate/concurrency/autoAdvance；提交构造删除 split.speechRate/concurrency（params 保留 autoAdvance: true 字面量）
- **测试目标**：CreateView.test.js 字段不存在 + 提交不携带

## 2. UE 契约

- [x] story2video-ue-contract.test.js s2vConfig 声明块断言追加三字段不声明
- **测试目标**：UE 契约快照

## 3. 文档

- [x] PRD 7.1.19 §2/§5 更新三字段为 R2 已移除；CHANGELOG、learnings
- **测试目标**：无（文档核对）

## 4. 门禁与交付

- [x] 受影响套件 + 全量 vitest 通过
- [x] 双模型审查（claude；antigravity 降级记录）
- [x] PR + 合并 origin/main；归档三同步；记忆更新
