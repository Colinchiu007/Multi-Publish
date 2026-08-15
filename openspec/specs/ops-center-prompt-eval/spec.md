# Ops Center Prompt Evaluation Specification

## Purpose
Define the security and error-handling contract for prompt-evaluation provider keys in the Ops Center backend.
## Requirements
### Requirement: Provider-key encryption uses the loaded Ops Center configuration
The prompt-evaluation provider-key API SHALL obtain its encryption secret from the loaded Ops Center settings instance. It SHALL NOT depend on the dotenv value being copied into the process environment, and it SHALL NOT create or replace the configured secret while saving a provider key.

#### Scenario: dotenv-loaded secret is not exported to process environment
- **WHEN** OPS_SECRET_KEY is loaded from the backend .env file but is absent from os.environ
- **THEN** an administrator can save a valid prompt-evaluation provider key and receives HTTP 200

### Requirement: Invalid provider-key encryption configuration returns an actionable client error
The provider-key API SHALL preserve fail-closed encryption validation. A missing or insecure OPS_SECRET_KEY SHALL return HTTP 400 with a non-secret error that identifies the configuration requirement; unexpected persistence failures SHALL remain server errors.

#### Scenario: missing encryption secret
- **WHEN** an administrator saves a provider key while the loaded OPS_SECRET_KEY is missing or insecure
- **THEN** the API returns HTTP 400 and its detail identifies OPS_SECRET_KEY

### Requirement: 连通性探测回退覆盖 image/多模态 provider
provider 密钥连通性探测 SHALL 先 `POST {base}/chat/completions`（max_tokens=1）；当返回 404/405，或返回 400 且错误体命中模型关键字（unknown model / invalid model 等）时，SHALL 回退 `GET {base}/models`，`/models` 可达（<400）即判定连通成功并注明「/models 可达」。400 但错误体非模型类（参数非法等）、401/403/429 及其他 5xx SHALL 保持直接失败不回退；两个端点均不可达时 SHALL 返回双状态码并提示改用真实生成/评估验证。

#### Scenario: 图片模型 chat 探测 400 回退成功
- **WHEN** 保存 MiniMax 图片模型密钥（如 image-01），`chat/completions` 返回 400（unknown model）而 `GET /models` 返回 200
- **THEN** 测试连通返回成功，detail 含「/models 可达」

#### Scenario: 鉴权失败不因回退而放行
- **WHEN** `chat/completions` 返回 401（密钥无效）
- **THEN** 测试连通直接失败并携带 401 状态码，不尝试 /models 回退

#### Scenario: 双端点均不可达
- **WHEN** `chat/completions` 400 且 `GET /models` 也失败（如 404）
- **THEN** 测试连通失败，错误含两个状态码并提示使用真实生成/评估验证

