# story2video-voice-clone-local-management Specification

## Purpose
TBD - created by archiving change image-carousel-voice-bgm-fixes. Update Purpose after archive.
## Requirements
### Requirement: 本地克隆音色删除为本地管理操作

删除本地克隆音色 MUST 等于移除本地 registry 记录 + 清理本地样本存储 + 清理指向该克隆的音色偏好；不得因远端删除 API 缺失而失败。

#### Scenario: adapter 支持 deleteVoice（如 ElevenLabs）

- **WHEN** 用户删除克隆音色且 provider 的 adapter `supports('deleteVoice') === true`
- **THEN** 服务先执行远端 `deleteVoice`；远端失败返回 `VOICE_CLONE_PROVIDER_UNAVAILABLE`（可重试），成功后再完成本地删除并返回 `code:0`

#### Scenario: adapter 不支持 deleteVoice（如 MiniMax）

- **WHEN** 用户删除克隆音色且 provider 的 adapter 明确不支持 `deleteVoice`（能力查询返回 false）
- **THEN** 服务跳过远端删除，直接完成本地删除（registry 记录移除 + 样本清理 + 偏好清理）并返回 `code:0`；不返回「服务不可用」

#### Scenario: 能力查询无法判定（null/异常/API 缺失）

- **WHEN** `supportsAdapterMethod` 返回 `null`（探测失败）或抛异常或 `ModelProviderManager` 未提供该方法
- **THEN** 服务回退旧行为（尝试远端删除），绝不把「探测失败」当作「明确不支持」而静默遗留远端音色

#### Scenario: 本地删除步骤失败

- **WHEN** 本地 registry 写入、样本清理或偏好清理失败
- **THEN** 返回既有错误码（`VOICE_CLONE_STORE_UNAVAILABLE` / `VOICE_CLONE_STORAGE_UNAVAILABLE`），不静默成功

### Requirement: 能力查询不依赖 API Key 且不污染缓存

`ModelProviderManager.supportsAdapterMethod(providerId, method)` MUST 返回三态：`true`=明确支持、`false`=明确不支持、`null`=无法判定。

- 使用与 `callAdapter` 一致的 provider 数据（解密 key）构建 adapter，避免缓存污染
- 不校验 API Key 有效性（能力是静态契约，与配置无关）
- 任何异常返回 `null`，不抛异常

#### Scenario: 明确不支持返回 false

- **WHEN** adapter 存在且 `adapter.supports(method) === false`
- **THEN** 返回 `false`（调用方据此走纯本地管理）

#### Scenario: 无法判定返回 null

- **WHEN** store 未就绪 / factory 缺失 / provider 缺失 / adapter 构造异常 / adapter 无 supports 方法
- **THEN** 返回 `null`，不抛异常

### Requirement: 克隆音色设为默认可见且可反馈

- 克隆列表行对当前默认音色 MUST 显示「默认」徽标与高亮样式；徽标依据 `s2vConfig.voiceId`（下拉当前值）判定
- 点击「设为默认」MUST 先同步下拉框（`s2vConfig.voiceId`），IPC 成功后更新持久化偏好（`s2vPersistedVoiceId`）
- 保存失败 MUST 回滚 `s2vConfig.voiceId` 到先前值，不得显示未持久化的默认音色
- 无效克隆（`invalid: true`）的「设为默认」按钮 MUST 保持禁用（7.1.16 合同），「已失效」徽标展示原因

#### Scenario: 设为默认请求被新请求覆盖

- **WHEN** 用户在旧请求未返回时再次选择其他音色
- **THEN** 旧请求结果被并发守卫丢弃（不覆盖新选择）

#### Scenario: 设为默认保存失败

- **WHEN** IPC `tts-voice:select` 返回非 0（如偏好存储不可用）
- **THEN** `s2vConfig.voiceId` 回滚为先前值，错误提示显示，克隆行不显示「默认」徽标

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

