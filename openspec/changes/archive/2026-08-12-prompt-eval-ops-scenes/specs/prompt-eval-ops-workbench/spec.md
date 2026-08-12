# prompt-eval-ops-workbench Specification (modified by prompt-eval-ops-scenes)

## Purpose
本文件记录 prompt-eval-ops-scenes 对既有「提示词评测工作台」能力（openspec/specs/prompt-eval-ops-workbench）的增量修改：新增 scene 模式入口与逐场景工作流，既有 manual 模式与生成→评估状态机不变。

## MODIFIED Requirements

### Requirement: 评测 case 与中英对照（scene 模式扩展）
新建评测 SHALL 支持 manual/scene 两种模式：scene 模式输入整篇文案（≤20000 字），prompt_zh 不必需（逐场景由 LLM 生成），case 落库 source_mode=scene 并同步分句建 scenes；manual 模式原校验（prompt_zh 必填）不变。中英对照翻译复用 12A.22 服务（machine_translation + 7 天幂等缓存），scene 模式按场景粒度调用。

#### Scenario: scene 模式创建 case
- **WHEN** 运营选择场景模式并提交整篇文案与分句配置
- **THEN** 创建 source_mode=scene 的 case 并返回 scenes 列表；manual 模式行为与校验不变

### Requirement: 评测列表/详情（场景维度）
评测列表 SHALL 展示 source_mode 列；scene 模式详情 SHALL 额外返回 scenes（含每场景字幕块/上下文/中英提示词）并展示场景摘要，runs 可按 scene_id 归属到场景卡片。

#### Scenario: scene 模式详情
- **WHEN** 打开 scene 模式 case 详情
- **THEN** 展示 scenes 列表与场景 run 关联（scene_id），manual case 不返回 scenes
