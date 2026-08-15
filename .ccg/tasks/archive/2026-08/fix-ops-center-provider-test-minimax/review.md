# Review: fix-ops-center-provider-test-minimax

## 变更类型
M 复杂度 / 中风险（API 契约行为：连通性探测回退语义）。涉及 OpenSpec change `fix-ops-center-provider-probe-400`。

## QM-5 根因溯源
- 引入 commit：`2ac164b5`（2026-08-12 "feat(ops-center): 模型密钥「测试连通」功能"）——新增探测功能时 chat 探测回退仅覆盖 404/405，未考虑 MiniMax 等图片模型对 chat/completions 返回 400（`invalid params, unknown model 'image-01'`）。
- 逃逸链：单测只覆盖 404/405 回退 + 401 失败，未覆盖 400（测试场景缺失）；无真实 provider 探测集成测试（外部验收项）；审查时未对照 provider 非 chat 模型的真实响应码（审查盲区）。
- 系统性漏洞分类：测试场景缺失（探测响应码矩阵不完整）+ 审查盲区（供应商契约未以官方行为为准）。

## 修复
`test_provider_connection()`：回退条件从 `(404, 405)` 扩展为「404/405 无条件；400 需错误体命中模型关键字（unknown model / invalid model / model not found / model not exist / model_not_found）」；`GET /models` 可达（<400）即成功，detail 注明「/models 可达」；双端点失败保留双状态码 + 真实生成验证提示。

## 回归保护
`tests/test_prompt_eval_services.py::test_provider_connection_probe` 追加：
- case 6：chat 400（unknown model）+ /models 200 → ok，调用数 == 2；
- case 7：chat 400 + /models 404 → ValueError 含「真实生成」；
- case 8：chat 400 非模型错误体 → ValueError 含 400，调用数 == 1（不回退）；
- case 2 加强：401 → 调用数 == 1（不触发回退）。

## 验证
- 目标套件 `tests/test_prompt_eval_api.py tests/test_prompt_eval_services.py`：28 passed。
- 全量 `pytest -q`：280 passed / 3 failed（test_scheduler_api 存量失败，主工作区基线同 commit 复现一致，与本变更无关）。
- `openspec validate --changes`：fix-ops-center-provider-probe-400 ✓。

## 审查
- antigravity：地区不可用（既有降级记录）→ 降级。
- Claude（codeagent-wrapper --lite --backend claude）：**有条件通过**，报告见 C:\tmp\minimax-claude-review.md：
  - W1 400 无条件回退误放行风险 → 已采纳：400 增加错误体关键字门控；
  - W2 401 关键路径无回归锁定 → 已采纳：case 2 增加调用数断言；
  - I1/I2 措辞与断言增强 → 已采纳（detail 已有「/models 可达」表述；case 6 增加 len(calls)==2）。
- 复审结论：0 Critical / 0 Warning / 0 Info（剩余建议已全部落地）。

## 预防
- 供应商契约类行为（探测响应码矩阵）应覆盖「非 chat 模型端点返回 400 + 错误体关键字」场景，沉淀到 learnings（待归档时追加）。
