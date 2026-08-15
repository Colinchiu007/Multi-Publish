## Purpose

Ensures Story2Video projects that finished successfully remain usable and truthful on the result page: completion signaling waits until the persisted project is ready, and preview/media failures are isolated instead of being reported as task-level failures.

## ADDED Requirements

### Requirement: 完成通知必须先于结果页可见性且晚于项目持久化

Story2Video 编排完成 SHALL 在项目持久化成功之后才向 renderer 发出完成状态与结果页跳转信号；项目持久化（复制素材、写入项目清单）失败 SHALL 将 run 终态标记为失败并携带明确错误，不得先宣告完成。

#### Scenario: 持久化完成后才可见

- **WHEN** run 的 compose/publish 阶段成功，项目清单与媒体复制尚未完成
- **THEN** renderer 不得提前收到 completed 状态或可用结果页信号；持久化完成后才收到 completed

#### Scenario: 持久化失败不得误报完成

- **WHEN** 项目清单写入或任一必需媒体复制失败
- **THEN** run 终态为 failed，错误为 Story2Video 项目保存失败，renderer 不进入 completed 结果页

### Requirement: 结果页加载错误按资源隔离

结果页加载 SHALL 将项目读取、成片 URL、旁白 URL、场景图片/视频 URL 作为独立步骤处理；任一附加预览资源失败 SHALL 保留已成功加载的成片与项目信息，仅对失败资源给出预览级提示，不得将整个项目判为加载失败。

#### Scenario: 场景素材 URL 失败不影响成片

- **WHEN** 项目与成片 URL 正常，但某个场景图片/视频 URL 解析失败
- **THEN** 结果页仍显示成片与项目信息，该场景素材显示预览不可用提示，不弹出任务级失败

#### Scenario: 成片 URL 失败才进入成片缺失状态

- **WHEN** 项目读取成功但成片 URL 无法解析
- **THEN** 结果页显示成片缺失/预览不可用状态，不误报项目加载失败

### Requirement: 视频播放错误文案隔离

结果页主视频元素发生 `error` 事件 SHALL 显示“视频预览加载失败，成片文件仍已保存”类提示，不得使用“当前操作未能完成，请稍后再试”任务级文案。

#### Scenario: 播放器解码失败

- **WHEN** 主视频 URL 有效但播放器触发 error
- **THEN** 用户看到预览加载失败提示，项目与成片路径信息保持可用

## MODIFIED Requirements

### Requirement: 预览/结果页失败不得改写 run 终态

系统 SHALL 对 Story2Video 完成后的结果页/预览操作失败保持 run 终态不变；run 已完成时，结果页媒体加载、播放器错误或附加资源失败 SHALL 只影响前端预览状态，不得把已完成 run 标记为失败，也不得覆盖项目 status。

#### Scenario: 预览失败不污染完成记录

- **WHEN** 已完成 run 的结果页视频播放或场景预览失败
- **THEN** 持久化项目与 run 快照仍为 completed，仅前端展示预览失败提示
