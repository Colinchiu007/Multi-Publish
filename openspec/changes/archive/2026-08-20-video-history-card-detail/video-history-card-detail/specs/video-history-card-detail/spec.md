# video-history-card-detail Specification

## ADDED Requirements

### Requirement: 统一历史卡片信息

历史记录的 all、running、paused、failed、completed、cancelled 六个标签 SHALL 使用同一张任务卡片结构。每张卡片 SHALL 显示标题、文案预览、场景缩略图、视频时长、更新时间、创建时间（可用时）、任务耗时（可用时）、状态和任务标识。

卡片字段类型与校验如下：title、sourceText、text 为字符串时才参与展示；videoDuration、video_duration、video.duration、composeDuration、durationSeconds 只接受有限且大于等于 0 的数字；执行耗时字段 duration/activeMs 不得作为视频时长回退。文案预览最多 120 个 JavaScript 字符，截断时追加单个 …。

#### Scenario: 标题为空时回退文案

- WHEN 任务标题为空或仅包含空白字符
- THEN 卡片显示任务文案的截断值作为标题；文案也为空时显示流水线名称或本地化未命名文案

#### Scenario: 文案预览替代提示词预览

- WHEN 卡片存在任务文案或场景文案
- THEN 字段标签显示“文案预览”，内容取任务文案而非图片/视频提示词，并在超过上限时追加 …

#### Scenario: 缺少可选字段不破坏卡片

- WHEN 任务缺少标题、文案、时长或时间字段
- THEN 卡片仍保持稳定布局，并使用本地化“未生成”/“不可用”占位，不渲染 undefined、null 或内部枚举

### Requirement: 首场景素材缩略图

每张视频创作历史卡片 SHALL 展示第一个场景片段素材缩略图。若该场景存在合法图片，SHALL 选择第一张图片；仅当没有合法图片时，若存在视频，SHALL 使用第一个视频的第 0 秒首帧。候选路径必须是受控项目/媒体根目录内的普通文件，不得是目录、符号链接、越界路径或超过媒体大小上限的文件。生成失败 SHALL fail-soft 为固定空背景和“未生成”。

#### Scenario: 图片优先

- WHEN 第一个场景同时存在一张或多张合法图片及视频
- THEN 卡片缩略图使用原始顺序的第一张合法图片，不调用视频首帧生成

#### Scenario: 仅视频回退首帧

- WHEN 第一个场景没有合法图片但有合法视频
- THEN 主进程使用受控 FFmpeg execFile 生成并缓存首帧，卡片显示该首帧

#### Scenario: 缩略图异常不阻塞历史

- WHEN 素材不存在、路径越界、符号链接或 FFmpeg 失败/超时
- THEN 历史列表仍成功加载，缩略图显示空背景和“未生成”，且不向用户显示堆栈或命令行

### Requirement: 内容和操作更新时间

任务 SHALL 在文案/分段/素材/提示词/翻译/语音内容成功保存，以及暂停、从断点继续、取消、失败或完成状态成功写回时刷新 updatedAt。历史 project/run 合并 SHALL 先按 projectId、项目 runId、项目 legacy id 匹配；项目的标题、文案、分段、素材和项目字段优先，run 的 status、currentStage、stages、checkpoint、error、activeMs、runId 和运行字段优先，updatedAt 取两者有效时间的较新者。只有 runId 的纯 run 记录不得制造项目卡片。

#### Scenario: 内容变更刷新更新时间

- WHEN 用户保存任务内容或素材操作成功
- THEN 项目的 updatedAt 变为当前 ISO 时间且历史卡片按新时间排序

#### Scenario: 操作刷新更新时间

- WHEN 用户暂停、从断点继续或取消任务
- THEN 对应项目/运行记录的有效更新时间变为操作完成时间，并在下一次历史刷新中可见

### Requirement: 已启动非运行任务可编辑

只要视频创作流水线已经创建了可识别的项目，paused、failed、completed 和 cancelled 状态 SHALL 都能从历史卡片进入视频任务编辑页；running 状态 SHALL 不从历史卡片主体进入详情编辑页。进入详情 SHALL 不自动恢复或取消任务；取消任务 SHALL 只能查看和编辑，不执行断点继续。running 卡片仍保留原有流水线控制入口。若项目明确 startedPipeline === false，不得把它当作已启动项目提供编辑入口。

#### Scenario: 终态进入编辑页

- WHEN 用户点击 paused、failed、completed 或 cancelled 项目的卡片主体/编辑动作
- THEN 导航到带 project 和可用 runId 的 /create/result，不调用恢复 IPC

#### Scenario: 运行中保持流水线控制入口

- WHEN 用户查看 running 项目卡片
- THEN 卡片显示统一信息但主体不导航到详情编辑页；暂停、后台运行和取消操作仍遵守现有流水线门控

### Requirement: 详情缺失素材占位

视频任务编辑页 SHALL 为每个场景的图片、视频、图片/视频提示词、翻译、字幕和语音保留稳定的显示位置。字段没有生成、生成失败、文件不存在或被清理时 SHALL 显示空的占位背景及“未生成”，不得隐藏整个信息项或显示原始错误对象。

#### Scenario: 缺失或失败素材显示未生成

- WHEN 场景资产路径为空/不可读，或资产状态为 failed
- THEN 对应素材槽显示本地化“未生成”，布局尺寸保持不变，其他场景和编辑操作继续可用

#### Scenario: 缺失文本仍可编辑

- WHEN 图片提示词、视频提示词、翻译、字幕或语音字段为空
- THEN 显示对应字段标签和“未生成”占位/placeholder；用户仍可输入、保存或执行已有生成/重试操作
