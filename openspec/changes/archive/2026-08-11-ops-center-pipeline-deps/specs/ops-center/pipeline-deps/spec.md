## Purpose
列出所有视频创作流水线运行所需的模型类型与候选供应商，运营可维护，为后续桌面端配置检查提供依据。

## ADDED Requirements

### Requirement: 流水线依赖目录管理
`pipeline_dependencies` 表 + `GET/POST /api/v1/pipeline-dependencies`、`PUT/DELETE /api/v1/pipeline-dependencies/{id}`（admin）。校验：pipeline_id `^[a-z0-9_-]{1,64}$`、model_type 枚举、provider_candidates 字符串数组 ≤50（数组或 JSON 字符串，解析后必须为数组）去重保序、default_provider 必须在候选内（候选空也给 400）、required/enabled 严格布尔、sort_order 非负整数。POST 重复 → 400；PUT/DELETE 不存在 → 404；DELETE 软删（不复活，可重建）；PUT 改 key 撞唯一 → 400。

#### Scenario: 校验与 CRUD
- **WHEN** 非法 pipeline_id/model_type/候选/默认值/布尔/排序
- **THEN** 400 且提示字段
- **WHEN** POST 重复 (pipeline_id, model_type) / PUT·DELETE 不存在 id
- **THEN** 400 / 404
- **WHEN** 删除种子后再次种子化
- **THEN** 不复活；同 key 可重建

### Requirement: 种子与目录一致性
首次启动播种 12 个有模型依赖的流水线共 31 条；供应商候选必须是 ops-center 模型预设目录（PRESET_CATALOG）的子集，默认值在候选中。

#### Scenario: 种子
- **WHEN** 首次启动
- **THEN** 31 条种子存在且 story2video-compose 覆盖 llm/image/tts/video(可选)
- **WHEN** 供应商目录漂移
- **THEN** 一致性测试失败（防漂移）
