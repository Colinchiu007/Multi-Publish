## Purpose

同一 Story2Video 运行内对同一个失效 `(providerId, voiceId)` 最多重克隆一次，并发 TTS 共享恢复结果，并让断点恢复复用已恢复 voice id。

## ADDED Requirements

### Requirement: 失效音色重克隆去重

Story2Video SHALL 对同一 `(providerId, voiceId)` 的克隆音色恢复最多执行一次 cloneVoice；并发 TTS 回调 SHALL 共享同一 pending Promise；clone 成功 SHALL 记录新 voice id 并供后续 TTS 尝试复用；clone 失败 SHALL 记录本次运行不再重复 clone。

#### Scenario: 并发 TTS 共享克隆
- **WHEN** 多个 TTS 任务同时遇到同一失效克隆音色
- **THEN** 只执行一次 cloneVoice，其余任务等待同一 Promise 结果

#### Scenario: 克隆成功后续任务复用新 ID
- **WHEN** 一次克隆成功返回新 voice id
- **THEN** 后续同音色失败项直接使用新 voice id 重试 TTS，不再调用 cloneVoice

#### Scenario: 克隆失败只尝试一次
- **WHEN** 一次 cloneVoice 失败
- **THEN** 本次运行内该 voice_id 不再重克隆，阶段按原始错误失败

### Requirement: 恢复结果可断点复用

系统 SHALL 把已恢复的 voice id 写入可序列化 context 字段；resume 后同一 voice_id 再次失效时优先复用已恢复 id，不再重复克隆。

#### Scenario: resume 复用新 ID
- **WHEN** 断点恢复读取 voice_recovery 映射且映射存在
- **THEN** TTS 重试使用映射中的新 voice id，不调用 cloneVoice

#### Scenario: 无映射时恢复为新运行
- **WHEN** context 无 voice_recovery 映射
- **THEN** 仍允许本运行按去重规则执行一次 cloneVoice

## 1. 规格与实现

- [ ] 1.1 ProviderRunContext voice coordinator
- [ ] 1.2 tryReCloneVoice 接入 context 与可序列化恢复字段
- [ ] 1.3 generate_assets/finalize_assets 去重回归

## 2. 验证与交付

- [ ] 2.1 定向 Vitest
- [ ] 2.2 双模型审查
- [ ] 2.3 PR / CI / 合并
- [ ] 2.4 OpenSpec/CCG/learnings 三同步归档
