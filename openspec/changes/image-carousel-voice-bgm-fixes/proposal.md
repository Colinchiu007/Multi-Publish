# Proposal: 图片轮播流水线 3 个体验缺陷修复

## Why

图片轮播（story2video）流水线存在 3 个用户可见缺陷：
1. 删除本地克隆音色（含 7.1.16 前的存量非法 id「01」）恒弹「音色克隆服务暂时不可用，请稍后重试」。根因：`tts-voice-clone-service._deleteCloneLocked` 无条件要求远端 `deleteVoice` 成功，而 MiniMax adapter 未实现该 API（`supports('deleteVoice') === false`），`callAdapter` 返回 `code:-1` 后全部折叠为 `VOICE_CLONE_PROVIDER_UNAVAILABLE`。删除语义本应是**本地管理**（移除 registry 记录 + 本地样本 + 偏好），PRD 7.1.16 也要求删除「仍可用，便于清理旧记录」。
2. 克隆音色「设为默认」点击无反应，且无默认状态显示。根因：前端 `selectS2VVoice` 的并发守卫 `isCurrentS2VVoiceSelectionRequest` 要求 `s2vConfig.voiceId === voiceId`，但克隆列表按钮未先同步 `s2vConfig.voiceId` → IPC 结果被静默丢弃；成功后也不更新下拉框；克隆行无「默认」徽标。
3. 选择背景音乐本地音频弹「无法读取所选文件，请确认文件未被占用或已损坏后重试」。根因：失败原因被折叠为笼统文案且 `kindLabel` 恒为空（不说清是背景音乐）；preload 路径解析失败（`无法读取媒体文件路径`）与主进程文件不可读/被占用未区分，用户得不到可操作建议。

## What Changes

- **Bug①**：`ModelProviderManager` 新增 `supportsAdapterMethod(providerId, method)` 能力查询（不依赖 API Key 有效性、不污染 adapter 缓存）；`_deleteCloneLocked` 在 adapter 不支持 `deleteVoice` 时跳过远端删除、完成纯本地删除（registry + 本地样本 + 偏好清理）；仅在支持远端删除时保留「远端删除失败 → `VOICE_CLONE_PROVIDER_UNAVAILABLE`」语义。无 `supportsAdapterMethod` 的调用方回退旧行为。
- **Bug②**：`selectS2VVoice` 显式选择先同步 `s2vConfig.voiceId` 再走 IPC（守卫不再静默丢弃），成功路径同步下拉与 `s2vPersistedVoiceId`；克隆列表行对当前默认音色显示「默认」徽标（高亮 class）。
- **Bug③**：`resolveMediaImportFailure` 透传 `kindLabel`（背景音乐/旁白音频/视频素材/图片）；新增 `MEDIA_PATH_UNRESOLVED` 细分（preload 拿不到 File 本地路径 → 引导重新选择），与「文件不可读/被占用」区分；主进程 `importUserSelectedMedia` 复制文件增加 Windows 有界重试（仅 EBUSY/EPERM/EACCES，短退避）并回传可读中文原因。

## Capabilities

- **New Capabilities**:
  - `story2video-voice-clone-local-management`（本地克隆音色删除/设为默认的生命周期与交互合同）
  - `story2video-media-import-feedback`（媒体导入失败反馈细分合同）
- **Modified Capabilities**: 无（现有 specs 无音色/媒体导入行为规格，均为新增）。

## Impact

- 运行时代码：`apps/desktop/electron/services/model-provider-manager.js`、`apps/desktop/electron/services/tts-voice-clone-service.js`、`apps/desktop/electron/services/story2video-paths.js`、`apps/desktop/src/views/CreateView.vue`、`apps/desktop/src/story2video/story2video-notifications.js`
- 测试：`tts-voice-clone-service.test.js`、`model-provider-manager.test.js`、`story2video-paths.test.js`、`CreateView.test.js`
- 文档：`01-docs/PRD.md`、`01-docs/learnings.md`、`CHANGELOG.md`、`.quality-gates.md`
- 无契约破坏；新增能力查询与错误码均为向后兼容增量。
