## ADDED Requirements

### Requirement: 克隆音色复刻失败必须 fail closed

`MinimaxTtsAdapter.cloneVoice` MUST 在解析 `/v1/voice_clone` 响应后检查 `base_resp.status_code`；状态码为数值且非 0（如 2038 voice clone user forbidden）时 MUST 抛出 ProviderError（message 保留供应商原因、context.statusCode 保留原始状态码），MUST NOT 返回本地生成的 voice_id 作为成功。

#### Scenario: 复刻接口返回 200 + 业务错误

- **WHEN** `/v1/voice_clone` 返回 HTTP 200 且 `base_resp.status_code=2038`
- **THEN** cloneVoice reject 且不返回克隆结果；调用方不得持久化该 voice_id

#### Scenario: 复刻成功且平台回显 id 合规

- **WHEN** `base_resp.status_code=0` 且响应包含 voice_id
- **THEN** 返回平台 voice_id，行为不变

### Requirement: 故事讲述流水线不得静默替换克隆音色

`tryReCloneVoice` MUST 只尝试「本地样本重新克隆 + 新 id 重试合成」；clone service 缺失、样本缺失、重克隆失败或重试失败时 MUST 返回 null，MUST NOT 调用 `retryFn('default')` 换取 provider 默认官方音色。

#### Scenario: 重克隆失败

- **WHEN** TTS 返回克隆音色不可用错误且重新克隆失败
- **THEN** tryReCloneVoice 返回 null，调用方透传原始音色错误，成片不回退官方音色

#### Scenario: clone service 缺失

- **WHEN** pipelineEngine.container 无法提供 ttsVoiceCloneService
- **THEN** tryReCloneVoice 返回 null 且不调用 `retryFn('default')`
