# Design: story2video-bgm-reuse-fix

## 1. 运行收尾不再删除可复用的导入 BGM

`cleanupImportedMediaPaths(params, options)` 现有语义：删除 `params.audio[].path`、`params.video`、`params.bgmPath` 中位于 `IMPORTED_MEDIA_DIR`（`%TEMP%\story2video\selected-media`）内的普通文件。归一化后的 `run.params` 中 `audio=[]`、`video=null`，唯一会被删除的就是 BGM。

设计：新增 `options.skipBgm === true` 时跳过 `bgmPath` 候选。`pipeline-engine.js` 的 story2video-compose 收尾改为 `cleanupImportedMediaPaths(run.params, { skipBgm: true })`。一次性导入场景（`replace-segment-audio`、归一化拒绝回滚）仍按原语义清理，不传该选项。

## 2. compose 对 BGM 校验失败降级

`Story2VideoComposeEngine.compose()` 中 `requestedBgmPath` 存在但 `resolveReadableMediaFile` 返回 null（扩展名不支持/越界/不存在/符号链接/超限）时：不再 `return { code: -1 }`，改为 `bgmPath = null` 并记录 `warnings: ['BGM 文件不存在或不可读，已跳过背景音乐']`；结果 data 增加 `bgmSkipped: true`、`bgmApplied: false`。大小超总限额路径保持失败（这是防滥用边界，不是可选性降级）。日志以 warn 记录原始路径摘要（不落盘敏感路径全文可省略）。

## 3. 通知 key 拆分

`MODEL_CONFIGURATION_PATTERN` 收窄为仅匹配「模型缺失」类（默认 LLM/默认模型/未找到.*(LLM|模型)/模型不可用），去掉 api key 分支；新增 `MODEL_API_KEY_PATTERN`（api key not configured / 尚未配置 api key / 未配置 api key / decrypt failed / 解密失败），在 `resolveMessageKey` 中先于 MODEL 分支匹配，命中返回新 key `MODEL_API_KEY_REQUIRED`（zh：模型已添加但 API Key 未配置或无法读取，请在「模型设置」中重新填写 API Key；en 对应）。`STORY2VIDEO_NOTIFICATION_KEYS`、`STORY2VIDEO_NOTIFICATION_MESSAGES` 双语补齐。

## 4. multimodal 预设 models 回填

`_syncPresetCapabilities()` 已对预设行做 capabilities/capability_models 的 diff-merge。扩展：当预设 `category === 'multimodal'` 时，把预设 `models` 中缺失的模型追加进行 `models`（保持现有顺序，只增不删）。其他类别（用户可编辑 models）不触碰。

## 契约与测试映射

| 场景 | 测试 |
|---|---|
| 收尾清理 skipBgm 后 BGM 文件保留 | story2video-paths.test.js + pipeline 收尾调用断言 |
| 一次性导入清理语义不变 | story2video-paths.test.js 既有用例保持绿 |
| compose BGM 不可读 → 成功 + bgmSkipped | story2video-compose-engine.test.js |
| 通知拆分：api key 未配置 → MODEL_API_KEY_REQUIRED；模型缺失 → MODEL_CONFIGURATION_REQUIRED | story2video-notifications.test.js / notifications.test.js |
| multimodal 存量行 models 回填 MiniMax-M2.7 | model-provider-multimodal.test.js |
