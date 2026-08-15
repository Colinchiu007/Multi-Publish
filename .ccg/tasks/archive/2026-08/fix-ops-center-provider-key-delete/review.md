# Review: fix-ops-center-provider-key-delete

## 变更类型
M 复杂度 / 中风险（新增删除 API，涉及管理员凭据管理）。OpenSpec change `ops-center-provider-key-delete`。

## 实现
- 后端：`DELETE /api/v1/prompt-eval/providers/{key_id}`（require_admin；不存在 → 404；非 admin → 403；物理删除）；`list_provider_keys` / `upsert_provider_key` 返回增加 `id`。
- 前端：`ModelKeys.vue` 操作列「删除」按钮 + `ElMessageBox.confirm` 二次确认 + 行级 loading；`api/promptEval.js` 新增 `deletePromptEvalProvider`。
- 删除语义：物理删除；`get_llm_key` / `get_vision_key` 回退查找立即失效；同 provider+model 可重建。

## 验证
- 目标套件 `test_prompt_eval_api.py`：22 passed（新增删除成功+回退失效+重建、403/401/404+数据不变、视觉回退失效）。
- 全量 pytest：281 passed / 4 failed（3 个 scheduler 存量顺序污染 + engine_dual 顺序/timing flaky）。**flaky 归属核实**：本次全量失败 `test_dual_summary_paired_stats` 单独运行 23 passed；两次相同命令运行结果不同（某次 45 passed 全过）；基线主工作区（无本改动，同 commit 167433ff）全量同样轮换失败 `test_optimize_empty_prompt_fail_closed` 等 → 确认 engine_dual flaky 为基线存量（DB env 顺序共享 + 假引擎时序），与本改动零交集。
- 前端：`npm run build` exit 0；vitest 16 passed。

## 审查
- antigravity：地区不可用（既有降级记录）→ 降级。
- Claude（codeagent-wrapper --lite --backend claude）：**批准合并（带 Warning 跟进）**，报告 C:\tmp\key-delete-claude-review.md：
  - 0 Critical。
  - W1 视觉回退失效未测 → 已采纳：补 `get_vision_key` 删除后 None 断言。
  - W2 物理删除无审计 → 与项目现状一致（delete_announcement 等均为物理删除无审计），保持 scope 不引入，记录待办。
  - W3 前端 load 失败误报「删除失败」 → 已采纳：load() 移出 try，刷新失败单独 warning。
  - Info-3 row.id 缺失防护 → 已采纳：删除按钮 `v-if="row.id"`。
  - Info-4/5/7/8 非整型 id 422、并发重复删除、DB 异常 500、无 FK 引用 → 均为低风险约定问题，记录不修改。

## 预防
- 删除类 API 回归应覆盖「删除后回退查找失效」与「权限/存在性」；前端删除需二次确认 + 删除成功后独立刷新。
