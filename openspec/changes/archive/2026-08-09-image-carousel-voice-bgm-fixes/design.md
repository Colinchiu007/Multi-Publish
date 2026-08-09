# Design: 图片轮播流水线 3 个体验缺陷修复

## 决策背景

### Bug① 删除克隆音色
- **基线审计**：origin/main 已交付 PR #413（克隆 voice_id 合规 + 失效回退默认音色），7.1.16 成文「删除仍可用，便于清理旧记录」；但 `_deleteCloneLocked` 仍要求远端 `deleteVoice`。MiniMax 官方 clone API 无删除端点（adapter 仅实现 `cloneVoice`，`supports('deleteVoice')` false → `callAdapter` 返回 `code:-1`（不抛）→ `_isDeleteSuccess` false → `VOICE_CLONE_PROVIDER_UNAVAILABLE`）。
- **方案**：删除 = 本地管理。adapter 支持 `deleteVoice`（如 ElevenLabs）→ 先远端删除（保持既有 PENDING→REMOTE_DELETED 状态机与失败语义）；不支持（如 MiniMax）→ 直接本地删除（registry 移除 + 样本清理 + 偏好清理），成功返回 `code:0`。
- **能力查询**：新增 `ModelProviderManager.supportsAdapterMethod(providerId, method)`：用 `getProviderWithKey` 取 provider、经 `_getOrCreateAdapter` 建 adapter（与 `callAdapter` 一致，避免缓存污染）、返回 `adapter.supports(method) === true`；任何异常返回 false。`tts-voice-clone-service` 无该方法时回退旧行为（保守尝试远端删除）。

### Bug② 设为默认无反应 + 无状态显示
- **根因链**：克隆列表「设为默认」`@click="selectS2VVoice(voice.id)"` → `selectS2VVoice` 内 `isCurrentS2VVoiceSelectionRequest(requestId, context, voiceId)` 要求 `s2vConfig.voiceId === voiceId`，但按钮未先更新 `s2vConfig.voiceId` → 守卫 false → 静默 return（IPC 结果被丢弃）。即使成功路径也不回写 `s2vConfig.voiceId` → 下拉框不同步。克隆行模板无任何默认标识。
- **方案**：`selectS2VVoice` 在显式选择非空 voiceId 时先 `this.s2vConfig.voiceId = normalizedVoiceId`（下拉同步 + 守卫通过），成功后更新 `s2vPersistedVoiceId`；克隆行按 `voice.id === s2vConfig.voiceId` 显示「默认」徽标与高亮 class。无效克隆（`voice.invalid`）保持按钮禁用（7.1.16 合同）。

### Bug③ 背景音乐读取失败提示
- **根因链**：`handleS2VBgmFile` → `importStory2VideoMedia(file,'bgm')` → `story2videoImportMedia`（preload `webUtils.getPathForFile`，失败返回 `无法读取媒体文件路径`）→ 或主进程 `importUserSelectedMedia` fs 失败（`媒体文件不存在或不可读` / Windows 占用 EBUSY 原始错误）→ renderer `resolveMediaImportFailure` 的 `/不存在|不可读|无法读取|被占用|corrupt|locked/` 分支统一映射 `MEDIA_UNREADABLE` 且 `kindLabel:''`（文案缺宾语）。
- **方案**：
  1. `resolveMediaImportFailure` 接收 `kindLabel`，各分支透传（格式/大小/不可读/路径）。
  2. 新增 `MEDIA_PATH_UNRESOLVED` key（zh/en），专用于 preload `无法读取媒体文件路径`（路径解析失败 → 「请重新选择文件；若持续出现请重启应用」），在通用 `/无法读取/` 之前匹配。
  3. `importStory2VideoMedia` catch 分支也带 kindLabel。
  4. 主进程 `importUserSelectedMedia` 的 `copyFileSync` 改为 `copyWithRetry`：仅对 EBUSY/EPERM/EACCES 做 ≤3 次短退避（150ms×n），其余错误原样抛出；占用场景回传「媒体文件被占用，请关闭占用程序后重试」。
  5. `validateStory2VideoFile` 的 kind→label 映射抽为 `story2videoKindLabel(kind)` 复用。

## 数据流

- Bug①：renderer 删除按钮 → IPC `tts-voice-clone:delete` → `deleteClone` → `_deleteCloneLocked` → `_supportsRemoteDelete`（manager.supportsAdapterMethod）→ 支持则远端删除，否则本地删除 → 返回 `code:0`/错误码。
- Bug②：renderer 设为默认 → `selectS2VVoice`（先同步 voiceId）→ IPC `tts-voice:select` → service 保存偏好 → 回写 `s2vPersistedVoiceId` + 徽标渲染。
- Bug③：renderer 选择文件 → preload `getPathForFile`（失败 → `MEDIA_PATH_UNRESOLVED`）→ IPC import-media → `importUserSelectedMedia`（有界重试）→ 成功回受控路径 / 失败中文原因 → renderer 细分提示（带 kindLabel）。

## 安全与兼容

- 能力查询不校验 API Key、不改变 `callAdapter` 行为；仅新增公开方法。
- 本地删除仍执行 `_writeRegistry` 原子语义 + 样本清理 + 偏好清理，未引入新的权限面。
- 错误码与消息向后兼容：新增 key 不影响既有 key 匹配；`kindLabel` 为空时文案与旧版一致（除新增 path 分支）。
