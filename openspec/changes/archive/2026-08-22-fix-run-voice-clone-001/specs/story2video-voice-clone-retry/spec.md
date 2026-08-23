## ADDED Requirements

### Requirement: 重克隆必须复用初始 TTS 后端

当 Story2Video 的克隆音色合成失败并且本地样本重克隆成功时，系统 SHALL 使用与初次合成相同的 TTS 后端完成重试：存在资产生成器时调用 assetGenerator.generateTTS，否则调用 serviceBus.callPythonSkill('generate_tts', ...)。

#### Scenario: legacy Python TTS 重克隆成功

- WHEN 初次 generate_tts 因克隆 voice id 失效失败，样本可读且 cloneVoice 返回新 voice id
- THEN 第二次 generate_tts 使用新 voice id 调用 serviceBus.callPythonSkill，成功结果作为该 scene 音频

#### Scenario: asset generator TTS 重克隆成功

- WHEN 初次 generateTTS 因克隆 voice id 失效失败，样本可读且 cloneVoice 返回新 voice id
- THEN 第二次 generateTTS 使用新 voice id 调用资产生成器

#### Scenario: 重克隆失败保持 fail-closed

- WHEN 样本不存在、重克隆服务失败或重试合成失败
- THEN 阶段返回原始音色错误，且不得调用默认官方音色
