## Why

故事讲述（story2video-compose）目前只能单条文案手动启动流水线，用户有批量创作需求（多条文案 / 多个本地 .txt、.md 文件依次成片）。缺少队列化调度：没有排队等待、并行上限管理、批量任务状态展示；批量任务完成后也必须与手动任务一样出现在历史记录中。

## What Changes

- 故事讲述详情页新增【批量创作】按钮，打开批量创作弹窗（UiModal）
- 弹窗内容：创作模式隐藏（固定全自动）；「视频增强模式」下拉框（同故事讲述界面，off/fixed/ai-judged）；【启动】按钮；队列规则提示文字
- 可切换标签：输入文案（1-10 条，带「+」新增按钮）/ 本地文件（选择 .txt/.md，最多 20 个）
- 新增主进程批量队列服务：任务排队执行，批量任务最大并行 2；存在运行中的手动任务时批量任务仅并行 1；遵守引擎全局并发预算
- 批量任务复用现有 startOrchestrated 流水线执行链路与历史记录（run 打 source=batch / batchId 标记，_finalizeRun 天然入历史）
- 弹窗内展示任务与排队信息（运行中/排队中/完成/失败/取消、阶段进度、错误摘要），支持取消排队任务
- 数据校验：文案非空且不超过 MAX_STORY2VIDEO_TEXT_CHARACTERS；文件扩展名白名单 .txt/.md；文件可读、内容非空且不超限；文件大小上限
- 文案与文件读入统一进引擎侧 normalizeStory2VideoTextParams 校验链，fail closed
- 补充 PRD 与项目文档（数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字）

## Capabilities

### New Capabilities
- `story2video-batch-create`: 批量创作——批量队列调度（并行上限 2 / 手动任务互斥 / 全局预算）、批量弹窗交互（标签页/输入框/文件选择/队列展示）、批量任务历史记录集成、数据校验契约

### Modified Capabilities
<!-- 无既有 spec 需要修改（openspec/specs/ 目前仅 openspec-integration） -->

## Impact

- 涉及：apps/desktop（CreateView.vue 弹窗、preload、ipc-handlers、services 新增 batch 队列服务、pipeline-engine 打标）、i18n 资源（zh/en 成对）、测试（batch 队列单测/引擎打标/CreateView 组件）、PRD/learnings/CHANGELOG 文档
- 约束：批量任务与手动任务共享 startOrchestrated 执行链路，不得另起执行引擎；队列状态不持久化到磁盘（应用重启后排队任务丢失，仅提示用户）；文件读取编码 utf-8（含 BOM），读取失败 fail closed
- 待澄清：无（需求明确；排队任务取消范围限定为未启动的排队项，运行中任务取消沿用引擎 cancel 语义）
