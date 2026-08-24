# Story2Video 克隆音色恢复持久化

## Why

真实 Electron E2E 发现：失效克隆音色重克隆成功后，新 `voiceId` 只存在当前运行的 `voice_recovery` 映射，克隆注册表和用户偏好仍保存旧 ID。下一次运行会先调用失效 ID，再重复重克隆，增加延迟和 provider 成本。

## What Changes

- 重克隆成功后，将 provider 返回的新 `voiceId` 写回当前用户的克隆注册表。
- 保留原克隆的展示名、创建时间、删除状态和样本存储描述。
- 当用户偏好指向旧 ID 时，同步迁移偏好到新 ID。
- 注册表目标 ID 已存在时拒绝覆盖；偏好存储异常不阻断本次已成功的 TTS 重试。
- 增加服务层和 Story2Video 阶段回归测试。

## Scope

仅影响 `tts-voice-clone-service` 的 owner-scoped registry/preference 和 `tryReCloneVoice` 恢复路径；不改变默认官方音色回退、provider 熔断或视频合成行为。
