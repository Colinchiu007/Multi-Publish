# model-multimodal Specification

## Purpose
定义多模态模型（MiniMax 等）能力声明与路由合同，重点约束 video 能力由用户开关控制（默认关闭）。
## Requirements
### Requirement: 多模态 video 能力默认关闭

MiniMax 多模态 provider 的 video 能力 SHALL 默认视为不可用，除非用户在模型设置中显式开启「支持生成视频」。

#### Scenario: 未配置开关（缺省）
- **WHEN** minimax-multimodal 的 config 不含 `capability_enabled.video`
- **THEN** `getDefault('video')` 不得返回该多模态模型；视频默认解析回落显式 video 类别 provider

#### Scenario: 开关关闭
- **WHEN** `capability_enabled.video === false`
- **THEN** 同上，多模态不参与 video 默认解析

#### Scenario: 开关开启
- **WHEN** `capability_enabled.video === true` 且该多模态 provider 已配置（有可用 Key）且 capabilities 声明 video
- **THEN** `getDefault('video')` 在多模态优先开启时可返回该多模态模型

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

### Requirement: 用户开关持久化与不被回填覆盖

「支持生成视频」开关 SHALL 持久化于 `model_providers.config.capability_enabled.video`；`_syncPresetCapabilities` SHALL 不回填或覆盖该字段。

#### Scenario: 重启后开关保持
- **WHEN** 用户开启/关闭开关后重启应用
- **THEN** config.capability_enabled.video 保持用户设置，预设能力同步不覆盖

### Requirement: 设置页开关

模型设置页多模态表单 SHALL 提供「支持生成视频」开关（默认关闭），保存后生效。

#### Scenario: 新建 MiniMax 多模态
- **WHEN** 用户添加 minimax-multimodal
- **THEN** 开关默认关闭，config 保存 `capability_enabled: { video: false }`

#### Scenario: 编辑已有 MiniMax 多模态
- **WHEN** 用户切换「支持生成视频」
- **THEN** 提交后 config.capability_enabled.video 更新并生效
