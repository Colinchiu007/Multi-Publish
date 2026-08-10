# model-multimodal Specification

## Purpose

定义多模态模型（MiniMax 等）能力声明与路由合同，重点约束 video 能力由用户开关控制（默认关闭）。

## ADDED Requirements

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

llm / tts / image 能力 SHALL 保持既有 `capabilities.includes(category)` 路由语义，不受 `capability_enabled` 影响。

#### Scenario: 仅关闭 video
- **WHEN** `capability_enabled.video === false`（或缺省）
- **THEN** `getDefault('llm'|'tts'|'image')` 仍按多模态优先返回该多模态模型（若声明并配置）

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
