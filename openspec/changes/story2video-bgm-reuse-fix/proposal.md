# Proposal: Story2Video BGM 复用与错误映射修复

## Why

线上日志（`C:\tmp\Multi-Publish-debug-profile\logs\app-2026-08-09.log`）实证：图片轮播（story2video-compose）在资源全部生成成功后，compose 阶段 36ms 内失败 `BGM path is not allowed or unreadable`。根因链：

1. 前端选择 BGM 时经 `story2videoImportMedia` 复制到 `%TEMP%\story2video\selected-media\bgm-*.mp3`，`s2vConfig.bgmPath` 指向该路径；
2. `pipeline-engine.js` 运行收尾（完成/失败/取消均触发）执行 `cleanupImportedMediaPaths(run.params)`，把 `params.bgmPath`（导入的 BGM）删除；
3. 用户以同一配置重试/断点续跑时，compose 校验 `bgmPath` 文件已不存在 → 整条流水线失败，浪费 3.5 分钟资源生成。

附带两个误导问题：

- `story2video-notifications.js` 的 `MODEL_CONFIGURATION_PATTERN` 把「api key not configured / 尚未配置 API Key」也归一化成「未找到需要的相关模型，请在设置中添加模型」；当日 13:41-14:52 出现 safeStorage 解密失败（`ModelProviderCrypto Decrypt failed`）导致 key 读不出时，用户看到该提示但实际 key 已保存，误导排查。
- `minimax-multimodal` 预设 models 已含 `MiniMax-M2.7`，但存量 DB 行 models 仍为旧 3 项，设置页展示与预设不一致。

## What Changes

- `story2video-paths.js`：`cleanupImportedMediaPaths` 增加 `skipBgm` 选项；`pipeline-engine.js` 运行收尾以 `{ skipBgm: true }` 调用，不再删除仍被 UI/配置引用的已导入 BGM（音频/视频一次性导入的清理语义不变）。
- `story2video-compose-engine.js`：BGM 路径校验失败（不存在/不可读/越界/超限）时降级为无 BGM 继续合成，返回 `bgmSkipped: true` + 警告原因，不再让整条流水线失败（BGM 本就是可选配置）。
- `story2video-notifications.js`：新增 `MODEL_API_KEY_REQUIRED` 通知（zh/en），把「API Key 未配置/未设置/解密失败」从「未找到模型」中拆出；`MODEL_CONFIGURATION_PATTERN` 收窄为真正的模型缺失。
- `model-provider-manager.js`：`_syncPresetCapabilities` 对 multimodal 类预设行 diff-merge 回填缺失的预设 models（只增不删，其他类别不动）。
- 回归测试：paths skipBgm、compose BGM 降级、通知 key 拆分、multimodal models 回填。

## Capabilities

- **Added Capabilities**: `story2video-bgm-reuse`
- **Modified Capabilities**: `story2video-media-import-feedback`（错误提示拆分）、`story2video-parameter-governance`（多模态预设 models 一致性）

## Impact

- 生产代码：`apps/desktop/electron/services/story2video-paths.js`、`pipeline-engine.js`、`story2video-compose-engine.js`、`model-provider-manager.js`；`apps/desktop/src/story2video/story2video-notifications.js`
- 测试：`story2video-paths.test.js`、`story2video-compose-engine.test.js`、`story2video-notifications.test.js`、`notifications.test.js`、`model-provider-multimodal.test.js`
- 无 DB schema 变更；行为变更仅限 BGM 失败路径与错误提示文案。
