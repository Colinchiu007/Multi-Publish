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

