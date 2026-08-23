# 审查记录：fix-ops-center-eval-think

## 根因（QM-5 第一性原因）
- 引入点：`prompt_eval_evaluation_service.parse_and_validate` 最初假设 LLM 输出为纯 JSON 或以 ``` 开头的围栏；测试仅 mock 纯 JSON。
- 逃逸链：单测 mock 纯 JSON（未覆盖真实响应形状）→ 集成/E2E 用 fake evaluate → 审查未覆盖真实 provider 响应。系统性漏洞：测试场景缺失（真实响应形状未固化）。
- 真实触发：MiniMax-M3 推理模型返回 `<think>…</think>` + ```json 围栏，json.loads 遇 `<think>` 前缀失败（报错与用户完全一致，已用真实密钥复现）。

## 修复
- `_strip_think` 剥离闭合/未闭合 `<think>` 块；`_extract_json_text` 支持围栏（含不在开头）+ 兜底 `{…}` 提取；仍 fail closed。

## 回归保护
- `tests/test_prompt_eval_services.py::test_parse_eval_think_and_fence` 覆盖真实形状四场景。

## 审查结论
- 主代理自审：0 Critical / 0 Warning / 0 Info（变更 <30 行、解析契约，低风险；S 级豁免双模型审查，与 s2v-history-visibility 先例一致）。
