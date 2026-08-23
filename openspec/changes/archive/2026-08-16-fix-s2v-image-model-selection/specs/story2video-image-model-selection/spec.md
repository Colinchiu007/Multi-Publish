## Purpose

定义 Story2Video 历史任务图片重试/重生成的目标 provider 解析合同：任务创建时固化的 imageProvider/imageModel 只在仍符合当前设置时复用，否则按当前 image 能力默认重新解析；无可用默认时 fail closed；老项目空值保持占位图语义。

## ADDED Requirements

### Requirement: 历史任务图片重试按当前设置解析 provider

历史任务【重试图片】/【重生图片】SHALL 在调用图片生成器前，按当前「优先使用多模态模型」设置与 provider 状态解析目标 provider+model；任务创建时固化的多模态 provider 在用户关闭多模态优先时 SHALL 不再被使用，转而使用当前 image 能力默认 provider。

#### Scenario: 关闭多模态优先且有专用生图模型

- **WHEN** 用户关闭「优先使用多模态模型」，配置并启用了 image 类别 provider（如 agnes image），历史任务固化的 imageProvider 为多模态 provider（如 minimax-multimodal）
- **THEN** 点击【重试图片】/【重生图片】时使用当前 image 默认 provider 与其默认图片模型，而非固化的多模态 provider

#### Scenario: 开启多模态优先保留固化值

- **WHEN** 用户开启「优先使用多模态模型」且保存的多模态 provider 仍配置可用
- **THEN** 重试图片继续使用固化的多模态 provider/model

#### Scenario: 显式 image provider 保留

- **WHEN** 任务固化的是 image 类别 provider（用户显式选择）且仍配置可用
- **THEN** 即使关闭多模态优先也继续使用该固化 provider

### Requirement: 无可用 image 默认时 fail closed

关闭多模态优先且不存在 image 类别可配置 provider 时 SHALL 抛可读错误，明确提示先在「模型设置」配置并启用支持图片生成的模型；不得静默回退占位图，也不得调用已禁用的多模态 provider。

#### Scenario: 无 image 默认且固化多模态被弃用

- **WHEN** 关闭多模态优先，固化 provider 为多模态，且不存在可用的 image 类别默认 provider
- **THEN** 重试图片失败并提示「未找到可用的图片生成器」，不调用任何图片生成器，不产生占位图

### Requirement: 老项目空值保持占位图语义

未固化 imageProvider 的老项目 SHALL 保持既有空 provider 透传语义（`asset-generator` 离线占位图降级），不得因解析逻辑引入新错误。

#### Scenario: 老项目无固化 provider

- **WHEN** 历史任务 options 不含 imageProvider/imageModel
- **THEN** 重试图片以空 provider/model 调用图片生成器，走既有占位图降级路径
