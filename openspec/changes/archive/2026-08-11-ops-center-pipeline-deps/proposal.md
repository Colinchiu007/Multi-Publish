## Why

视频创作流水线（Story2Video / 解释视频 / 说话头像 / 数字人 / 切片工厂等）各自依赖不同模型类型（llm/图片/视频/TTS/语音识别/音频）与候选供应商。目前这些依赖只散落在代码事实里，运营无法集中查看哪些流水线需要哪些模型、缺配哪些供应商。本功能在运营后台建立「流水线所需依赖」目录：把全部视频创作流水线需要的模型类型与特定模型供应商列出，运营可维护（后续可接入桌面端配置检查）。

## What Changes

- ops-center：`pipeline_dependencies` 表（pipeline_id + model_type 唯一）+ CRUD（admin；pipeline_id 字符集 / model_type 枚举 / provider_candidates 字符串数组 / default_provider 必须在候选内 / required 布尔；POST 重复 400、PUT/DELETE 404、DELETE 软删）+ 种子对齐代码事实（15 个流水线中的 12 个有模型依赖，覆盖 llm/image/video/tts/speech_recognition/audio 六类 + 供应商候选）。
- ops-center 前端：「流水线所需依赖」页（按流水线分组/筛选/新增/编辑/删除/启用停用）。
- 文档：PRD/CHANGELOG + OpenSpec（数据校验/流程/交互/显示项/提示文字）。

## Capabilities

### New Capabilities
- `ops-center/pipeline-deps`: 流水线所需依赖目录管理。

## Impact

- ops-center/backend：models.py、services/pipeline_dependency_service.py（新）、routers/pipeline_dependencies.py（新）、main.py、tests
- ops-center/frontend：views/PipelineDeps.vue（新）、api/pipelineDeps.js（新）、router、侧边栏
- 文档：01-docs/PRD.md、ops-center/docs/PRD.md、CHANGELOG
