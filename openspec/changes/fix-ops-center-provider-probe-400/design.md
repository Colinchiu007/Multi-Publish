## 设计

### 现状
`test_provider_connection()`（services/prompt_eval_service.py:304）探测策略：
1. `POST {base}/chat/completions`（max_tokens=1，Bearer 密钥）；
2. 仅当 `404/405` 回退 `GET {base}/models`；
3. 其余 4xx/5xx 直接 `ValueError(f"HTTP {code}: {text}")`。

问题：MiniMax 等图片/多模态 provider 对 chat 探测返回 **400**（`invalid params, unknown model 'image-01'`）——密钥有效、base_url 正确，但被误判失败。

### 修复
回退条件从 `(404, 405)` 扩展为「404/405 无条件；400 需错误体命中模型关键字」：
- `chat/completions` 返回 404/405，或 400 且错误体含 `unknown model` / `invalid model` / `model not found` / `model not exist` / `model_not_found`（大小写不敏感）→ 发起 `GET {base}/models`；
- `/models` <400 → `{"ok": True, "detail": "连接成功（/models 可达）"}`；
- `/models` 也失败 → 报双状态码 + 「请用真实生成/评估验证」；
- 400 但错误体非模型类（参数非法等）、401/403/429/5xx 等保持原行为（直接失败，不回退）。

理由：400 且语义为「模型不适用 chat 端点」（MiniMax 图片模型返回 `invalid params, unknown model 'image-01'`）时密钥与端点已通过鉴权验证，/models 可达即证明密钥连通；对 400 做错误体门控，避免非模型类 400 被 /models 200 掩盖。不做「模型名必须在 /models 列表内」的强校验，避免网关类 provider 列表不完整导致新的误报。

### 测试
`tests/test_prompt_eval_services.py::test_provider_connection_probe` 追加：
- chat 400（含 unknown model 文案）+ /models 200 → ok，detail 含 `/models`，调用数 == 2；
- chat 400 非模型类错误体（invalid request body）→ ValueError 含 400，调用数 == 1（不回退）；
- chat 401 → 仍 ValueError 含 401 且调用数 == 1（既有用例 2 加强断言）。
