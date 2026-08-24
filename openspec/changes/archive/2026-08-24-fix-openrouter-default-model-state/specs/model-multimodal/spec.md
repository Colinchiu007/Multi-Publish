## MODIFIED Requirements

### Requirement: 非 video 能力不受开关影响

llm / tts / image 能力 SHALL 不受 `capability_enabled.video` 影响。多模态 provider 只有在该能力被明确设为默认，或在冲突处理前具有代表全部声明能力的历史全局默认时，才可以作为该能力的默认。用户将同一能力的普通 provider 设为默认后，该普通 provider SHALL 成为该能力唯一的运行时默认；任何先前的多模态全局默认不得继续覆盖该能力。

#### Scenario: 仅关闭 video
- **WHEN** `capability_enabled.video === false`（或缺省），且已配置的多模态 provider 明确保留 llm、tts 或 image 的默认资格
- **THEN** `getDefault('llm'|'tts'|'image')` 仍可返回该多模态 provider，`getDefault('video')` 不得因该资格返回它

#### Scenario: OpenRouter 覆盖多模态文字推理默认
- **WHEN** 已配置的多模态 provider 以全局默认形式覆盖文字推理，且用户将已配置的 OpenRouter 设为文字推理默认
- **THEN** 后续文字推理默认解析返回 OpenRouter，持久化列表中的 OpenRouter 标记为默认，多模态 provider 不再保留全局默认标记或文字推理默认资格

#### Scenario: 覆盖文字推理不取消其他多模态能力
- **WHEN** 多模态 provider 原本以全局默认覆盖文字推理、TTS 和生图，且用户将普通文字推理 provider 设为默认
- **THEN** 多模态 provider 的 TTS 和生图默认资格保持为显式能力默认，文字推理资格被移除

#### Scenario: 刷新设置页后状态一致
- **WHEN** 普通文字推理 provider 成功设为默认且设置页重新读取 provider 列表
- **THEN** 默认样式所依据的 provider 默认标记与运行时文字推理默认解析指向同一 provider
