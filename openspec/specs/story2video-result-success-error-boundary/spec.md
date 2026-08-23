# story2video-result-success-error-boundary Specification

## Purpose

Ensures Story2Video projects that finished successfully remain usable and truthful on the result page: completion signaling waits until the persisted project is ready, and preview/media failures are isolated instead of being reported as task-level failures.

Video preview failures caused by short-lived local media token expiry or registry eviction are self-healed on the first player `error` (re-sign the same file path once and reload); replacing a preview URL revokes the previous local media token to bound registry growth.

## Requirements

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

### Requirement: 预览/结果页失败不得改写 run 终态

系统 SHALL 对 Story2Video 完成后的结果页/预览操作失败保持 run 终态不变；run 已完成时，结果页媒体加载、播放器错误或附加资源失败 SHALL 只影响前端预览状态，不得把已完成 run 标记为失败，也不得覆盖项目 status。

#### Scenario: 预览失败不污染完成记录

- **WHEN** 已完成 run 的结果页视频播放或场景预览失败
- **THEN** 持久化项目与 run 快照仍为 completed，仅前端展示预览失败提示

### Requirement: 主视频 error 自愈

结果页主视频元素发生 `error` 事件 SHALL 在本次预览未重试过时，以同一成片路径重新签发本地预览 URL 并重载播放器一次；重载后不再触发 `error` 时 SHALL 不展示任何失败提示，播放恢复。自愈重载后仍失败时 SHALL 展示「视频预览加载失败，成片文件仍已保存」类提示。自愈尝试 SHALL NOT 改写 run 终态或项目状态，也不得无限循环重载。

#### Scenario: 令牌失效自愈成功

- **WHEN** 主视频 URL 令牌过期或被容量逐出导致播放器 `error`，成片文件完好且重新签发成功
- **THEN** 播放器以新令牌 URL 重载并恢复可播放，不弹任何失败提示

#### Scenario: 自愈失败才提示

- **WHEN** 主视频 `error` 后按同一路径重新签发并重载，播放器仍触发 `error`
- **THEN** 展示「视频预览加载失败，成片文件仍已保存」隔离提示，项目与成片路径信息保持可用，run 终态不变

#### Scenario: 无成片路径时不重试直接提示

- **WHEN** 主视频元素 `error` 但结果页没有可用的成片路径
- **THEN** 直接展示预览加载失败提示，不发起令牌签发

### Requirement: 预览 URL 替换时回收旧令牌

renderer 替换同槽位预览 URL（主视频 / 旁白 / 分段素材 / 裁剪预览）SHALL 通过 `story2video:create-share-url` 的可选 `previousUrl` 参数申请新令牌；主进程签发新 URL 成功后 SHALL 对匹配本地媒体令牌格式的 `previousUrl` 执行回收。调用方未传 `previousUrl` 时 SHALL 保持现状（只签发、不回收）。回收 SHALL 仅作用于本地媒体服务内存令牌，不删除或移动磁盘文件。

#### Scenario: 替换时回收旧令牌

- **WHEN** renderer 携带 `previousUrl` 为同一成片申请新 URL 并成功
- **THEN** 新 URL 可访问且旧 URL 立即返回 404，媒体服务注册表不因同一文件反复签发而持续膨胀

#### Scenario: 不带 previousUrl 兼容旧调用

- **WHEN** 调用方仅传 `filePath`（旧版调用）
- **THEN** 仅签发新 URL，不回收任何令牌，行为与当前一致

#### Scenario: previousUrl 非本地媒体令牌

- **WHEN** `previousUrl` 不是本地媒体服务 `/media/<token>` 格式
- **THEN** 签发正常完成，回收被忽略，不抛错不回滚
