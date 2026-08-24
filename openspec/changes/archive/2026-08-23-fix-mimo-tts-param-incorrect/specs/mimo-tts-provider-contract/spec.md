## Purpose

确保 MiMo 普通 TTS 在用户未选择具体音色时使用服务商认可的内置默认音色，从而生成可接受的语音合成请求。

## ADDED Requirements

### Requirement: MiMo 普通 TTS 使用官方默认音色

MiMo 普通 TTS 模型在音色参数未提供或为空字符串时 MUST 在发送给服务商的请求中使用官方内置音色 `mimo_default`。显式提供的非空音色 MUST 原样保留。

#### Scenario: 未选择音色
- **WHEN** 使用 `mimo-v2.5-tts` 合成文本且调用方未提供音色
- **THEN** 请求体的 `audio.voice` 为 `mimo_default`

#### Scenario: 音色为空字符串
- **WHEN** 使用 `mimo-v2.5-tts` 合成文本且调用方提供 `voice=''`
- **THEN** 请求体的 `audio.voice` 为 `mimo_default`，而不是 `default` 或空值

#### Scenario: 显式音色保持不变
- **WHEN** 调用方提供非空音色 ID
- **THEN** 请求体的 `audio.voice` 与调用方提供的音色 ID 完全一致

#### Scenario: 请求继续符合 MiMo Chat 兼容结构
- **WHEN** 适配器使用默认音色发起合成
- **THEN** 请求仍包含普通 TTS 模型 ID、assistant 消息、音频格式和 `stream=false`，且响应音频数据按既有路径解析
