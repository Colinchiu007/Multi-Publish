# Tasks: story2video-options-consolidation

## 1. 前端死字段移除

- [x] CreateView.vue s2vConfig 默认值删除 voicePitch/creativeLevel/splitBaseWordsPerSecond；更新注释
- [x] 提交构造移除 voice.pitch / optimize.creativeLevel（保留 split.baseWordsPerSecond 语言表显式下发）
- **测试目标**：CreateView.test.js 断言字段不存在 + 提交不携带死字段 + baseWordsPerSecond 同源锁定

## 2. 契约默认兜底测试

- [x] story2video-text-config.test.js 补缺省 → 默认值（pitch 0 / creativeLevel 5）断言
- **测试目标**：normalizer 兜底路径

## 3. UE 契约

- [x] story2video-ue-contract.test.js 升级为 s2vConfig 默认对象声明块精确匹配（字段不声明）
- **测试目标**：UE 契约快照

## 4. 文档

- [x] PRD 7.1.19 参数治理与隐藏工程默认值合同（系统管理参数完整矩阵/UI 边界/双源结构/后续清理候选）
- [x] CHANGELOG、learnings
- **测试目标**：无（文档核对）

## 5. 门禁与交付

- [ ] 受影响套件 + 全量 vitest 通过
- [ ] 双模型审查（claude；antigravity 降级记录）Critical/Warning 清零
- [ ] PR + 合并 origin/main；归档三同步；记忆更新
