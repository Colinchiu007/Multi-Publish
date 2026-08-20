# Design: 视频创作历史记录卡片与详情编辑增强

## Data flow

1. Story2VideoProjectService.listProjects() 返回项目基础字段、运行终态、updatedAt、videoDuration、首个场景素材路径和缩略图状态。
2. 项目服务在写入/状态同步时调用统一时间戳 helper，使用一次操作时间更新 updatedAt，保留原 createdAt。
3. 历史 renderer 合并 project 与 pipeline run 时，项目内容字段优先于 run 的旧副本；run 只补状态、阶段、错误、运行 ID 和最新运行时间。合并后按统一有效更新时间排序。
4. 历史卡片只消费 thumbnailPath 的 IPC 派生 URL，不保存短生命 URL。图片存在即直接生成媒体 URL；无图且有视频时主进程生成/缓存首帧 PNG，再生成 URL。
5. 缩略图生成失败写入结构化 thumbnailStatus=failed，列表继续渲染默认空背景和“未生成”。

## Project/run matching and post-merge validation

- 合并前建立三个索引：projectId、项目 runId、旧项目 id。每条 run 依次使用 projectId、runId、id 查找，首个命中即视为同一任务；不会把 run 的 id 盲当成 projectId。
- 合并后重新校验：项目必须保留非空 projectId；标题和文案来自项目优先级；状态和阶段来自 run（run 缺字段才回退项目）；updatedAt 使用两侧所有有效时间中的最大值；数组字段必须仍为数组。
- 没有任何项目索引命中的 run 只能作为纯运行记录展示，不能生成结果页项目 query，也不能让 renderer 伪造可编辑项目。
- 所有 IPC 入参为普通 JSON 值，projectId/runId/segmentId 在主进程按安全 ID 校验；renderer 不传 Vue reactive proxy。

## Thumbnail contract

thumbnail: { path: string|null, kind: image|video-frame|missing|failed, status: ready|missing|failed, updatedAt: ISO string }

场景素材候选按场景数组顺序扫描。图片候选按 imagePath、imagePaths、候选图片数组的原始顺序取第一项；只有没有任何合法图片时才扫描视频候选。视频首帧使用 findFfmpeg() + execFile()，固定 -ss 0 -frames:v 1，输入和输出均经过路径校验，输出使用临时文件后原子 rename。任何失败都 fail-soft。

## Card contract

- 标题优先级：title → params.title/params.publishTitle → 任务文案 → 流水线名 → 未命名。
- 文案预览优先读取 sourceText/text，再从首个场景 text 拼接；长度上限为 120 个 JavaScript 字符，超限追加 …。
- 视频时长优先 videoDuration/video.duration，再回退 duration 中明确表示成片时长的值；运行耗时只显示在“耗时”字段，不混作视频时长。
- 所有缺失值只能显示本地化“未生成”或“不可用”，不能显示 undefined/null。

## Detail eligibility and placeholders

- startedPipeline 由 projectId 和 runId/status 快照证明；paused、failed、completed、cancelled 可进入编辑页，running 明确排除在详情编辑入口之外。
- 详情页只在运行中显示暂停/运行操作；取消任务不执行恢复。running 卡片仍显示完整信息，但继续沿用流水线控制流。
- 每个资产槽固定占位尺寸。素材路径缺失、文件不存在、生成状态为 failed 或对应错误字段存在时，显示 story2video.asset.placeholder 的“未生成”；有素材时显示媒体。文本输入仍可编辑，空值显示 placeholder 而不是消失。

## Timestamp rules

updatedAt is an operation timestamp, not merely a completion timestamp. Successful project content writes and successful pause/resume/cancel/fail/complete state writes call the same monotonic timestamp helper. A new value is at least one millisecond later than the previous valid value, even when two writes occur in the same clock tick. Read failures do not overwrite the last known project or timestamp.

## Failure handling

- 历史加载不能因单个缩略图失败；主进程捕获 FFmpeg exit/timeout/非法媒体并返回结构化状态。
- 项目更新失败保持原项目对象和旧更新时间；操作返回结构化错误。
- IPC 参数使用纯 JSON、非空安全 ID；所有渲染端 IPC 调用不传 Vue reactive proxy。

## Test mapping

- CreateViewHistory.test.js：六状态统一卡片、文案预览、缩略图、视频时长、取消可编辑。
- CreateView.test.js：project/run 合并优先级、更新时间刷新、五状态导航。
- story2video-project-service.test.js：更新时间 helper、素材选择和首帧 fail-soft/缓存。
- story2video-history-thumbnail.test.js：图片优先、视频首帧、安全路径和 FFmpeg 失败。
- ResultView.test.js：缺失/失败的图片、视频、prompt、翻译、字幕、语音占位与稳定布局。
