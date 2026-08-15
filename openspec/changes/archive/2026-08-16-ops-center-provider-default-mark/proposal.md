## Why

运营后台「模型密钥」支持保存/测试/删除多个 provider 密钥，但同用途组（如视觉的 minimax-vision 与 opencode-go-vision）同时配置时，LLM/视觉选择链路只能按「最新更新」隐式取一个，用户无法显式指定默认模型；多 provider 场景下行为不可预期。需要显式「设为默认」标记，并按 LLM/视觉/生图用途分组唯一（用户已确认语义）。

## What Changes

- 新增 `PromptEvalProviderKey.is_default` 列（存量库幂等补列迁移）。
- 新端点 `PUT /api/v1/prompt-eval/providers/{key_id}/default`（admin）：把目标密钥设为默认，同用途分组其他密钥清 0（同一事务内）。
- 用途分组唯一性作用域：LLM=`{minimax-llm}`；视觉=`{minimax-vision, opencode-go-vision}`；生图=`{minimax-image, flux, hunyuan}`。
- 列表接口返回 `is_default`；前端列表展示「默认」徽标并新增「设为默认」操作（已默认/禁用时置灰）。
- LLM（中英对照）与视觉评估选择链路优先默认键，无默认时回退现有「最新启用」逻辑。
- 新保存密钥：其分组尚无默认时自动成为默认；禁用/删除默认键时默认标记随之清空（不自动转移）。
- 仅启用中的密钥可被设为默认；禁用密钥请求设为默认返回 400 明确提示。

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `ops-center-prompt-eval`: 模型密钥默认标记——按 LLM/视觉/生图用途分组唯一、可设为默认、选择链路优先默认、禁用/删除清空语义。

## Impact

- ops-center/backend：`models.py`、`services/prompt_eval_migration.py`、`main.py`（lifespan 挂迁移）、`services/prompt_eval_service.py`、`routers/prompt_eval.py`。
- ops-center/backend/tests：`test_prompt_eval_api.py`、`test_prompt_eval_services.py`、`test_prompt_eval_migration.py`。
- ops-center/frontend：`src/api/promptEval.js`、`src/views/ModelKeys.vue`。
- 数据库：`prompt_eval_provider_keys` 表新增 `is_default` 列（幂等 ALTER，存量库零风险，不触碰已存密钥密文）。
