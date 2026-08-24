# Delta: Story2Video Voice Recovery

## MODIFIED Requirements

### Requirement: 恢复结果可断点复用

系统 SHALL 把已恢复的 voice id 写入可序列化 context 字段；resume 后同一 voice_id 再次失效时优先复用已恢复 id，不再重复克隆。重克隆成功后，系统 SHALL 在当前用户的克隆注册表中以新 id 替换旧 id，并保留原样本存储描述；若用户偏好指向旧 id，系统 SHALL 将偏好迁移到新 id。

#### Scenario: 跨运行复用持久化的新 ID

- **WHEN** 失效克隆音色重克隆成功并返回新 voice id
- **THEN** 当前运行使用新 id 重试，后续运行读取注册表时直接使用新 id，不先调用旧 id

#### Scenario: resume 复用新 ID

- **WHEN** 断点恢复读取 voice_recovery 映射且映射存在
- **THEN** TTS 重试使用映射中的新 voice id，不调用 cloneVoice

#### Scenario: 无映射时恢复为新运行

- **WHEN** context 无 voice_recovery 映射
- **THEN** 仍允许本运行按去重规则执行一次 cloneVoice

#### Scenario: 目标 ID 冲突不覆盖已有克隆

- **WHEN** provider 返回的替换 id 已存在于当前用户注册表
- **THEN** 系统拒绝覆盖现有记录，保留原 registry 内容，并继续让本次 TTS 使用 provider 返回的新 id
