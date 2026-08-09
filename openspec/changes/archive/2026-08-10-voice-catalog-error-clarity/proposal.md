## Why

图片轮播流水线中，当 TTS 服务商没有可用 API Key（未配置或密钥解密失败）时，音色目录拉取失败被折叠为单一错误码 `VOICE_CATALOG_UNAVAILABLE`，前端提示「暂时无法获取音色列表，已使用默认音色，请稍后重试。」——把**永久性配置错误**描述成「暂时、稍后重试」，用户无法按提示修复；且目录路径无日志、无重试入口，问题不可定位、不可操作。

## What Changes

- 新增稳定错误码 `VOICE_CATALOG_CONFIG_UNAVAILABLE`：adapter 失败原因命中配置类（未配置 API Key / 未找到服务商 / 未找到适配器 / 模型服务尚未初始化 / 适配器初始化失败 / 不支持该操作）时返回该码；网络/超时/未知原因保持 `VOICE_CATALOG_UNAVAILABLE`
- 失败响应附带 `detail`（底层原因截断 ≤200 字符），对可能含敏感信息的 message 脱敏，只保留分类不回显原文
- 音色目录失败路径增加日志（providerId/model/底层原因，不记录密钥），IPC catch 分支同样记录
- 前端 `friendlyVoiceCatalogError` 增加配置类错误的中英文映射（「当前语音服务商配置不可用，请在模型设置中检查并配置后重试」），与瞬时错误文案区分；select/clear 失败路径同样经友好映射（不直显错误码）
- 音色下拉错误态在**瞬时/未知错误**时显示「刷新音色列表」按钮，调用既有的 `loadS2VVoiceData({ refresh: true })`；配置类等永久错误不显示刷新按钮
- 回归测试：service 层（缺 key→CONFIG、网络→UNAVAILABLE、敏感 message 脱敏）、CreateView 层（映射断言、刷新按钮触发 refresh:true）

## Capabilities

### New Capabilities
- `tts-voice-catalog-error-handling`: 音色目录错误分类与可操作性——配置类/瞬时类稳定错误码、底层原因脱敏透传、失败日志、前端可操作文案与刷新入口

### Modified Capabilities
<!-- 无（openspec/specs/ 现有 specs 未定义音色目录错误分类要求） -->

## Impact

- 涉及：`apps/desktop/electron/services/tts-voice-service.js`、`apps/desktop/electron/ipc-handlers/tts-voice-catalog.js`、`apps/desktop/src/views/CreateView.vue`、`apps/desktop/electron/services/tts-voice-service.test.js`、`apps/desktop/src/views/CreateView.test.js`
- 契约影响：IPC `tts-voice:get-catalog` 新增错误码 `VOICE_CATALOG_CONFIG_UNAVAILABLE`（非破坏性，既有码保留）；现有 `tts-voice-service.test.js` 断言 `callAdapter code!=0 → VOICE_CATALOG_UNAVAILABLE` 需按新分类拆分
- 依赖：仅使用既有 `services/logger.js` 与前端既有 `loadS2VVoiceData`，无新依赖
- 非目标：不改动 provider 能力白名单、不修改合成路径、不处理运行中任务恢复（由并发任务 s2v-configured-provider-filter 覆盖「仅展示已配置服务商」）
