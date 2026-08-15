## 1. 规格与实现

- [x] 1.1 后端数据与迁移：`models.py` 加 `is_default`；`prompt_eval_migration.py` 加 `ensure_provider_default_column` 并在 `main.py` lifespan 挂载
- [x] 1.2 后端服务：`USAGE_GROUP_PROVIDERS` 分组映射、`set_default_provider_key`（同组清 0/禁用拒绝/404）、`upsert_provider_key` 自动默认与禁用清空、`list_provider_keys` 返回 `is_default`、`get_llm_key`/`get_vision_key` 优先默认
- [x] 1.3 后端路由：`PUT /api/v1/prompt-eval/providers/{key_id}/default`（require_admin）
- [x] 1.4 后端测试：分组唯一/跨组不影响/404/403/禁用 400/选择优先默认/新键自动默认/迁移幂等（test_prompt_eval_api.py、test_prompt_eval_migration.py 新增用例）
- [x] 1.5 前端：`api/promptEval.js` 加 `setDefaultPromptEvalProvider`；`ModelKeys.vue` 默认徽标 + 设为默认按钮（互斥置灰）

## 2. 验证与交付

- [x] 2.1 pytest（prompt-eval 目标套件）通过；前端 `npm run build` 通过
- [x] 2.2 openspec validate + 双模型审查（antigravity/claude 降级则记录）
- [x] 2.3 推送 codex/ 分支 → PR → CI 通过 → 合并回 main
- [x] 2.4 同步主工作区 → 重启 ops-center 后端 → 真实复验（登录→设默认→列表含默认标记→选择链路优先默认）
- [x] 2.5 三同步归档（openspec archive + CCG task 归档 + 质量门禁记录）
