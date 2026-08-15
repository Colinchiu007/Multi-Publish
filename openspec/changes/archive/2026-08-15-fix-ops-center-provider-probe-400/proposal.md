## Why

运营后台「模型密钥」测试连通时，MiniMax 等图片/多模态 provider 对 `POST /chat/completions` 探测返回 **HTTP 400（invalid params, unknown model 'image-01'）**，而现有回退逻辑只认 404/405，导致密钥正确但被误报「测试失败」。

## What Changes

- `test_provider_connection()` 的 chat 探测回退条件由 `404/405` 扩展为 `400/404/405`：
  - chat 探测收到 400/404/405 时，再尝试 `GET {base}/models`；
  - `/models` 可达（<400）即判定连通成功，detail 注明「/models 可达」；
  - `/models` 也不可达时保留双状态码与「请用真实生成/评估验证」提示；
  - 401/403 等其他 4xx/5xx 行为不变（仍直接失败）。
- 更新函数 docstring 与回归测试（chat 400 + /models 200 → ok；chat 401 仍失败）。

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `ops-center-prompt-eval`: 模型密钥连通性探测契约——chat 探测 400/404/405 时回退 /models 判定连通，避免图片/多模态模型误报。

## Impact

- ops-center/backend/services/prompt_eval_service.py（test_provider_connection 一处）
- ops-center/backend/tests/test_prompt_eval_services.py（回归用例）
- 不涉及数据库、不涉及密钥存储格式、不产生真实生成费用。
