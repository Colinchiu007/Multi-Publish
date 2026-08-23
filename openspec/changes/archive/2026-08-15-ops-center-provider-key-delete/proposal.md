## Why

运营后台「模型密钥」目前只有新增/编辑/测试连通，没有删除功能：配错的密钥（如 provider/model 填错、密钥失效）无法移除，只能改 model 绕过或留脏数据。管理员需要能删除无用密钥条目。

## What Changes

- 后端新增 `DELETE /api/v1/prompt-eval/providers/{key_id}`（admin 权限）：
  - 按 `prompt_eval_provider_keys.id` 删除；
  - 不存在返回 404；非 admin 返回 403；
  - 删除后 `get_llm_key` / `get_vision_key` 的已保存密钥回退自动不可用（不返回已删行）。
- 前端 `ModelKeys.vue` 操作列新增「删除」按钮：`ElMessageBox.confirm` 二次确认后调用删除接口并刷新列表。
- 前端 `api/promptEval.js` 新增 `deletePromptEvalProvider(keyId)`。

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `ops-center-prompt-eval`: 模型密钥管理 CRUD 补齐删除——密钥条目可被管理员删除，删除后立即从列表与回退查找中消失。

## Impact

- ops-center/backend/services/prompt_eval_service.py（新增 delete_provider_key）
- ops-center/backend/routers/prompt_eval.py（新增 DELETE /providers/{key_id}）
- ops-center/backend/tests/test_prompt_eval_api.py（删除 API 测试）
- ops-center/frontend/src/api/promptEval.js、views/ModelKeys.vue
- 不涉及数据库结构变更（复用现有 id 主键）
