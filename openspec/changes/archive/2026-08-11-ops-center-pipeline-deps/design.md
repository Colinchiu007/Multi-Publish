## 设计

### 数据模型
`pipeline_dependencies`：id（代理主键）/ pipeline_id（`^[a-z0-9_-]{1,64}$`）/ pipeline_name（≤100）/ model_type（枚举 llm/tts/speech_recognition/image/video/audio/multimodal）/ required（0=可选）/ provider_candidates（JSON 字符串数组 ≤50，去重保序）/ default_provider（必须在候选内或留空）/ description（≤200）/ enabled / sort_order（非负整数）/ deleted_at（软删，不复活，可重建）/ updated_at / updated_by；唯一约束 (pipeline_id, model_type)。

### 端点（GET 登录可读；写 admin）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/pipeline-dependencies?pipeline_id=&model_type= | 列表（筛选） |
| POST | /api/v1/pipeline-dependencies | 新增（重复 400；软删后可重建） |
| PUT | /api/v1/pipeline-dependencies/{id} | 更新（404；改 key 撞唯一 400） |
| DELETE | /api/v1/pipeline-dependencies/{id} | 软删（404） |

### 种子（代码事实，INSERT-OR-IGNORE）
12 个有模型依赖的流水线共 31 条（story2video-compose/animated-explainer/talking-head/cinematic/animation/avatar-spokesperson/character-animation/clip-factory/documentary-montage/hybrid/localization-dub/podcast-repurpose）；供应商候选与默认值对齐 model-provider-seeds.js / ops-center 模型预设目录（llm→anthropic、image→flux、video→minimax、tts→minimax-tts、speech_recognition→whisper、audio→suno）。screen-demo/framework-smoke 无模型依赖不播种。

### 前端「流水线依赖」页
列表（ID/名称/类型 tag/必选 tag/默认供应商/候选 tags/说明/启用/编辑/删除）+ 流水线 ID 输入筛选 + 类型下拉筛选 + 新增弹窗（候选逗号输入 + 默认供应商下拉，提示建议预设）。
