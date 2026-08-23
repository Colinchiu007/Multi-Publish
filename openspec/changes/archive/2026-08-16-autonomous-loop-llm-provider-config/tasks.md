## 1. 规格工件

- [x] 1.1 proposal.md（Why/What/Capabilities/Impact）
- [x] 1.2 design.md（inputs+secrets 双通道选型、降级收紧）
- [x] 1.3 specs/ci-autonomous-loop/spec.md（供应商可配置 + 双 key 降级 Requirement）

## 2. 实现

- [x] 2.1 workflow_dispatch 新增 llm_provider / llm_base_url / llm_model 输入
- [x] 2.2 env 接线 LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL / ANTHROPIC_API_KEY
- [x] 2.3 Report final status 降级条件收紧为双 key 为空
- [x] 2.4 契约测试新增 inputs/env 断言 + ANTHROPIC key 不降级用例

## 3. 验证与交付

- [x] 3.1 `node --test` 契约测试 9/9 全绿
- [x] 3.2 `openspec validate` 通过
- [x] 3.3 双模型审查（antigravity 本区不可用降级记录，Claude 审查 0C/2W/5I 已全部落实）
- [ ] 3.4 推送 codex/autonomous-loop-llm-config → PR → CI 全绿 → 合并回 main
- [ ] 3.5 三同步归档（openspec archive + CCG task + .quality-gates.md）
