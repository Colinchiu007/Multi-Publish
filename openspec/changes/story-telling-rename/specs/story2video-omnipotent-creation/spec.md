## MODIFIED Requirements

### Requirement: 流水线展示名更名
story2video-compose 流水线 SHALL 以「故事讲述」为本地化名称展示（zh）/「Story Telling」（en）；流水线描述同步更新（zh：将文案自动生成故事讲述视频（故事讲述 + 可选 AI 视频混合）；en：Turn your script into a Story Telling video (story telling with optional AI video blend)）。用户可见文案 MUST 由 i18n 资源文件驱动（zh.js / en.js），禁止硬编码。更名链：2026-08-12「图片轮播 / Image Carousel」→「全能创作 / Omni Creation」，2026-08-14 →「故事讲述 / Story Telling」。

#### Scenario: 中文界面显示新名称
- **WHEN** 界面语言为 zh 且渲染流水线列表
- **THEN** story2video-compose 卡片标题显示「故事讲述」，描述为更新后的中文描述

#### Scenario: 英文界面显示新名称
- **WHEN** 界面语言为 en 且渲染流水线列表
- **THEN** story2video-compose 卡片标题显示「Story Telling」，描述为更新后的英文描述

#### Scenario: 配置区与错误提示同步
- **WHEN** 打开故事讲述的配置区或触发权限/模式提示
- **THEN** 配置标题（configurationTitle）、access_denied、selectVideoScenesOff 等含旧名「全能创作」的文案同步更新为「故事讲述」语境，且仍由 i18n 驱动

### Requirement: 旧名残留检查
更名后仓库内用户可见文案 SHALL 不再把「全能创作 / Omni Creation」作为流水线名展示；测试断言（E2E/单元）中的流水线名/文案引用 MUST 同步更新为新名称或模式内合法语义（如「全部故事讲述」「视频+故事讲述」素材模式）。

#### Scenario: 测试断言同步
- **WHEN** 运行流水线相关 E2E/单元测试断言卡片文案
- **THEN** 断言匹配「故事讲述 / Story Telling」，且仍能识别素材模式选项「全部故事讲述 / 视频+故事讲述」
