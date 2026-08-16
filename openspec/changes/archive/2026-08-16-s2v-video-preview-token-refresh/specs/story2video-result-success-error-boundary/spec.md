## Purpose

结果页视频预览失败 SHALL 先尝试基于既有成片路径自愈，避免本地媒体服务短令牌过期/逐出造成的误报；替换预览 URL 时 SHALL 回收旧令牌以控制媒体注册表膨胀。

## ADDED Requirements

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
