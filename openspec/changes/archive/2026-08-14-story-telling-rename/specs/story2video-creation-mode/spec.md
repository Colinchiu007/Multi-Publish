## MODIFIED Requirements

### Requirement: 视频增强区创作模式 UI
CreateView「视频增强」区 SHALL 展示「创作模式」单选（`全自动（推荐）` 默认 / `分镜素材自选`）；选择「分镜素材自选」时 MUST 展示成本提示文案（每个分镜段落将生成多张图片和 1 个视频供选择；Token 或积分消耗将大量增加，建议先用短文案测试后，再用于真实创作），并展示「素材模式」单选（`全部故事讲述` / `视频+故事讲述`）及其说明。提交 SHALL 组装 `creation` 段。

#### Scenario: 全自动默认选中
- **WHEN** 打开故事讲述配置
- **THEN** 创作模式默认选中「全自动（推荐）」，素材模式区域隐藏

#### Scenario: 自选模式联动
- **WHEN** 选择「分镜素材自选」
- **THEN** 显示成本提示与素材模式单选；提交参数含 creation.mode='manual' 与所选 materialMode
