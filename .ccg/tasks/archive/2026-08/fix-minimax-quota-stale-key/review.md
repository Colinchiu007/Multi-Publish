# 审查结论（诊断复核）

- 结论：根因成立，无代码改动。
- 复核点：
  1. 桌面 Key 更新链路（updateProvider → _invalidateAdapterCache）确认不会把新 Key 带给 prompt-engine；
  2. prompt-engine 凭据来源（项目根 .env / MINIMAX_API_KEY）与桌面 DB 完全独立；
  3. 时间线反证：换 Key 后桌面 MiniMax 生图成功，同一时段 optimize 仍 402 → 凭据非同一来源。
- 分级：无 CRITICAL；产品级建议（注入/同步 Key）为增强项，未实施。
