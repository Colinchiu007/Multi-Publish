# story2video-omnipotent-creation Specification

## Purpose
将 Story2Video「图片轮播」流水线更名为「全能创作」，多语言版本同步更新，所有用户可见文案由 i18n 资源驱动，禁止硬编码。

## ADDED Requirements

### Requirement: 流水线展示名更名
「图片轮播」流水线（story2video-compose）SHALL 以「全能创作」为本地化名称展示（zh）/「Omni Creation」（en）；流水线描述同步更新（zh：将文案自动生成全能创作视频（图片轮播 + 可选 AI 视频混合）；en 对应翻译）。用户可见文案 MUST 由 i18n 资源文件驱动（zh.js / en.js），禁止硬编码。

#### Scenario: 中文界面显示新名称
- **WHEN** 界面语言为 zh 且渲染流水线列表
- **THEN** story2video-compose 卡片标题显示「全能创作」，描述为更新后的中文描述

#### Scenario: 英文界面显示新名称
- **WHEN** 界面语言为 en 且渲染流水线列表
- **THEN** story2video-compose 卡片标题显示「Omni Creation」，描述为更新后的英文描述

#### Scenario: 配置区与错误提示同步
- **WHEN** 打开全能创作的配置区或触发权限/模式提示
- **THEN** 配置标题（configurationTitle）、access_denied、selectVideoScenesOff 等含旧名「图片轮播」的文案同步更新为「全能创作」语境，且仍由 i18n 驱动

### Requirement: 旧名残留检查
更名后仓库内用户可见文案 SHALL 不再把「图片轮播」作为流水线名展示；测试断言（E2E/单元）中的流水线名/文案引用 MUST 同步更新为新名称或模式内合法语义（如「全部图片轮播」「视频+图片轮播」素材模式）。

#### Scenario: 测试断言同步
- **WHEN** 运行流水线相关 E2E/单元测试断言卡片文案
- **THEN** 断言匹配「全能创作 / Omni Creation」，且仍能识别素材模式选项「全部图片轮播 / 视频+图片轮播」

### Requirement: 不改变流水线语义
更名 SHALL 仅影响展示文案与配置标题，不得改变 story2video-compose 的 pipeline id、阶段清单、执行语义与持久化契约。

#### Scenario: 旧记录兼容
- **WHEN** 历史记录中 pipeline 仍为 story2video-compose
- **THEN** 展示使用新名称，记录数据结构不变
