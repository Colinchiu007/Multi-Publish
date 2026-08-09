# Design — voice-catalog-error-clarity

## Context

`TtsVoiceService.getCatalog`（apps/desktop/electron/services/tts-voice-service.js:160-177）将 adapter 调用失败一律折叠为 `VOICE_CATALOG_UNAVAILABLE`，丢弃底层原因；IPC handler（apps/desktop/electron/ipc-handlers/tts-voice-catalog.js:50-86）catch 分支同样折叠；目录路径无任何日志。前端 CreateView.vue:1900-1934 将其映射为「暂时无法获取音色列表，已使用默认音色，请稍后重试。」，且模板 386-403 无重试/刷新入口（`refresh:true` 无调用者）。

运行时证据（2026-08-09 debug profile）：`minimax-tts` 未配置 key、`minimax-multimodal` key safeStorage 解密失败 → `callAdapter` 返回「尚未配置 API Key」→ 全部折叠为上述误导文案；合成路径有 `AssetGenerator TTS provider ... failed` 日志可定位，目录路径无日志。

## Goals

- 用户能区分「配置问题（永久，需去模型设置）」与「瞬时问题（可重试）」
- 底层原因可定位：目录失败路径有日志
- 用户能真正执行提示的动作：配置 API Key 或点击刷新重试
- 不向 UI/settings/日志泄漏敏感信息（token/密钥）

## Non-Goals

- 不修改能力白名单（tts-voice-catalog.js PROVIDER_MODEL_CAPABILITIES）
- 不修改合成路径（AssetGenerator.generateTTS）
- 不实现 provider 可用性过滤（并发任务 s2v-configured-provider-filter 覆盖）
- 不改变成功路径、缓存与偏好持久化行为

## Decisions

### D1：新增 `VOICE_CATALOG_CONFIG_UNAVAILABLE`，分类判定基于底层 message 关键词
- 配置类关键词（中英文）：`尚未配置 API Key`、`API Key not configured`、`未找到服务商`、`Provider ... not found`、`未找到 ... 适配器`、`No adapter registered`、`适配器初始化失败`、`Factory initialization failed`、`401`、`unauthorized`、`invalid api key`、`认证失败`、`key 无效`
- 方法不支持（`不支持该操作`/`not supported`）→ 复用 `VOICE_CATALOG_UNSUPPORTED`（文案「暂不支持音色列表与克隆功能」，而非「配置 API Key」）
- 「模型服务尚未初始化 / Store not initialized」不归配置类（瞬时，可重试）→ `VOICE_CATALOG_UNAVAILABLE`
- 其余（网络/超时/未知/ProviderError 透传）→ `VOICE_CATALOG_UNAVAILABLE`
- 理由：`callAdapter` 对配置类失败返回 `code:-1` 且 message 稳定可判；网络/超时类 message 为 ProviderError 动态内容，无法也不应枚举
- 备选：按 `error.code`（ProviderError ERROR_CODES）分类——更精确，但 `callAdapter` 对配置类返回不总是 ProviderError（多数是普通 {code:-1,message}），依赖内部实现，耦合更高；采用 message 关键词 + 保底分类
- 补充（评审 W2）：401/unauthorized/invalid api key 属永久配置问题，加入配置类；not-supported 从配置类拆出归 UNSUPPORTED

### D2：failure 响应附带 `detail`，敏感 message 脱敏
- `detail = 底层 message 截断 ≤200 字符`
- 命中敏感模式（`Bearer `、`Authorization`、`token`、`api[_-]?key`、`secret`）时 detail 只保留前缀分类短语（如 `upstream-auth-error`），不回显原文
- 理由：现有测试用例 `'Bearer token leaked by upstream'` 必须不回显；IPC 返回给 renderer 的 detail 视为可显示内容
- 落点：`failure(message, data)` 扩展为可带 detail；`VOICE_CATALOG_UNAVAILABLE`/`VOICE_CATALOG_CONFIG_UNAVAILABLE` 均携带 `{ reason, detail }` data

### D3：日志
- service 层使用 `services/logger.js` 的 `log.warn`，记录 `[tts-voice] catalog failed providerId=... model=... reason=...`（脱敏后 detail）
- IPC handler catch 分支 `log.warn('[tts-voice] catalog handler error', providerId, model, sanitized)`；catch 中无法拿到 input 时记录 `unknown-input`
- 不记录 api_key / 完整 token

### D4：前端文案与刷新入口
- `friendlyVoiceCatalogError` 增加 `VOICE_CATALOG_CONFIG_UNAVAILABLE`：中文「当前语音服务商尚未配置或无法使用，请在模型设置中配置 API Key 后重试。」/ EN "The voice provider is not configured or unavailable. Configure an API key in model settings and retry."
- 模板错误态（CreateView.vue:400-402 区域）追加「刷新音色列表」按钮：`v-if="s2vVoiceCatalogError"`，`:disabled="s2vVoiceCatalogLoading"`，`@click="loadS2VVoiceData({ refresh: true })"`；点击前清空 `s2vVoiceCatalogError`
- 复用既有 loading/error 状态与 requestId 防竞态（loadS2VVoiceData 已处理）

## Risks & Rollback

- 错误码新增对既有前端/测试的影响：既有断言需同步拆分；IPC 码向后兼容（旧码保留），renderer 未知码走默认文案
- detail 脱敏遗漏风险：脱敏函数用正则覆盖常见敏感模式 + 测试断言 'Bearer token leaked by upstream' 与 'api_key=xxx' 场景
- 刷新按钮重复请求竞态：loadS2VVoiceData 已有 requestId/isCurrentS2VVoiceRequest 防过期响应，无新增竞态面
- 回退：单 commit 可回退；行为仅影响错误呈现与日志，不改变成功路径
