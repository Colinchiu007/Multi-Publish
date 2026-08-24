# Delta Specification

## Modified Requirement: 恢复结果可断点复用

系统 SHALL 把已恢复的 voice id 写入可序列化 context 字段；resume 后同一 voice_id 再次失效时优先复用已恢复 id，不再重复克隆。重克隆成功后，系统 SHALL 在当前用户的克隆注册表中以新 id 替换旧 id，并保留原样本存储描述；若用户偏好指向旧 id，系统 SHALL 将偏好迁移到新 id。

### Scenario: 重克隆后跨运行复用

- **WHEN** 失效克隆音色使用本地样本重克隆成功并返回新 voice id
- **THEN** 当前运行使用新 id 重试，后续运行读取注册表时直接发现新 id，不先调用旧 id

### Scenario: 目标 ID 冲突

- **WHEN** provider 返回的替换 id 已存在于当前用户注册表
- **THEN** 系统拒绝覆盖现有记录并保留原 registry 内容；本次 TTS 仍可使用 provider 返回的新 id继续完成
