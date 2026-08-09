# tts-voice-catalog-error-handling Specification

## Purpose

定义音色目录失败的错误分类、底层原因脱敏透传、日志与前端可操作性，使配置类错误与瞬时错误可区分、可定位、可执行。

## Requirements

### Requirement: 配置类错误与瞬时错误分类
音色目录获取失败 SHALL 区分配置类错误、方法不支持与瞬时错误：配置类（未配置/无效 API Key、认证失败 401/unauthorized、服务商/适配器缺失、适配器初始化失败）返回稳定错误码 `VOICE_CATALOG_CONFIG_UNAVAILABLE`；adapter 方法不支持返回 `VOICE_CATALOG_UNSUPPORTED`；网络/超时/未知原因返回 `VOICE_CATALOG_UNAVAILABLE`。

#### Scenario: 未配置 API Key 返回配置类错误码
- **WHEN** adapter 调用返回「尚未配置 API Key」类失败
- **THEN** `tts-voice:get-catalog` 返回 `{ code: -1, message: 'VOICE_CATALOG_CONFIG_UNAVAILABLE' }`，且不写入目录缓存

#### Scenario: 网络失败仍返回瞬时错误码
- **WHEN** adapter 调用因网络/超时/未知原因失败
- **THEN** 返回 `VOICE_CATALOG_UNAVAILABLE`，且不写入目录缓存

### Requirement: 底层原因脱敏透传
失败响应 SHALL 携带底层原因摘要 `detail`（≤200 字符）；命中敏感模式（Bearer/Authorization/token/api key/secret）的 message SHALL 只回显分类短语，不回显原文。

#### Scenario: 普通失败透传原因摘要
- **WHEN** adapter 返回 `{ code: -1, message: 'upstream 503' }`
- **THEN** 响应 `detail` 包含截断后的 `upstream 503`，长度 ≤200

#### Scenario: 敏感 message 脱敏
- **WHEN** adapter 返回 `{ code: -1, message: 'Bearer token leaked by upstream' }`
- **THEN** 响应 `detail` 不含原文 token，仅含分类短语（如 `upstream-auth-error`）

### Requirement: 失败路径日志
音色目录失败路径（service 与 IPC handler）SHALL 记录日志：providerId、model、脱敏后的底层原因；不得记录 API Key 或完整 token。

#### Scenario: 目录失败可定位
- **WHEN** 目录获取失败
- **THEN** 日志包含 providerId/model 与脱敏原因，可通过日志定位配置或网络问题

### Requirement: 前端可操作提示与刷新入口
前端 SHALL 对配置类错误显示可操作文案（引导去模型设置配置 API Key），对瞬时错误保留「稍后重试」语义，并提供「刷新音色列表」入口触发重新拉取（refresh）。

#### Scenario: 配置类错误显示可操作文案
- **WHEN** 目录返回 `VOICE_CATALOG_CONFIG_UNAVAILABLE`
- **THEN** 音色区显示「当前语音服务商配置不可用，请在模型设置中检查并配置后重试。」（英文对应文案），且不显示「刷新音色列表」按钮（配置问题重试无效）

#### Scenario: 刷新按钮仅瞬时错误可见并触发强制重拉
- **WHEN** 目录失败原因属于瞬时类（`VOICE_CATALOG_UNAVAILABLE` 或未知）且用户点击「刷新音色列表」
- **THEN** 以 `refresh: true` 重新调用目录接口，loading/error 状态随之更新；配置类/不支持/模型不匹配等永久错误不显示刷新按钮
