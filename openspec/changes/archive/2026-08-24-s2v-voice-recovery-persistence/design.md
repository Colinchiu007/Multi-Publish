# Design

`TtsVoiceCloneService.replaceCloneVoiceId` 在 registry lock 内完成旧记录查找、目标 ID 冲突校验和 ID 替换；样本目录保持不变，因此恢复后的音色仍可再次重克隆。若偏好记录的 `voiceId` 等于旧 ID，沿用其 `selectedAt` 等字段，仅更新 ID。注册表写入成功后偏好写入失败采用 best effort，并返回迁移成功但 `preferenceMigrated=false`。

`tryReCloneVoice` 在 cloneVoice 成功后调用该方法，再写入本次运行 `voice_recovery`，最后使用新 ID 重试 TTS。迁移错误只记录不含 provider 原文的告警，不影响已获得的新音色。
