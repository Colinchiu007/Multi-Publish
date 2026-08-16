# story2video-history-regen-hardening Specification

## Purpose
历史记录场景内容编辑/重新生成的写操作全部经 `_serializeProject` 同项目串行队列，杜绝并发写竞态；AI 视频重新生成包上与流水线同源的瞬时错误有界重试，保证瞬时故障下行为一致。

## ADDED Requirements

### Requirement: 历史记录写通道同项目串行队列全覆盖（W4）
以下 `story2video:*` 通道 SHALL 全部经 `requireProjectService()._serializeProject(projectId, () => serviceMethod(...))` 执行（失败经 `catch` 归一化为 `REQUEST_ERROR` + 透传 message）：
- `story2video:replace-segment-audio`（替换旁白）
- `story2video:retry-segment`（分段重试，mode=image|video）
- `story2video:select-scene-material`（场景素材选择，kind=image1|image2|video；由同步返回改为异步透传，返回语义不变）
- `story2video:generate-scene-image`（生成新图）
- `story2video:generate-scene-video`（生成视频/图片动效渲染）
- `story2video:delete-project`（删除项目，审查 M3：入队消除「删除后队列内任务 `_upsertProject` 复活项目」竞态）

连同既有已入队通道（update-segments / recompose-project / regenerate-scene-subtitle / regenerate-scene-audio / regenerate-scene-prompt / generate-scene-ai-video），历史记录全部写路径串行化；`_serializeProject` 未暴露（mock/旧装配）时按既有 catch 语义返回 `REQUEST_ERROR`，不静默降级。

#### Scenario: 写通道入队
- **WHEN** 依次调用上述 6 个通道（同项目，含 delete-project）
- **THEN** `_serializeProject` 调用计数含全部通道，且每个服务方法经队列任务执行；参数透传不变

### Requirement: AI 视频重生成瞬时重试（W5）
`generateSceneAiVideo` 对 `generateSceneVideoStage` 的调用 SHALL 经 `this.assetRetry(fn)` 包装：
- 构造器 `assetRetry` 可注入（`options.assetRetry`），缺省为 `story2video-stages.withAssetTransientRetry` 的包装（与流水线 generate_assets 单一来源）；
- 仅对瞬时错误重试（`isTransientErrorLike`：timeout / network / 429 限流类），内容政策、模型配置、参数校验等失败原样返回/上抛；
- **历史交互路径排除轮询超时/任务终态（审查 M1）**：默认包装 `excludeMessages: ['视频生成超时或失败', '视频生成任务失败', '视频生成任务状态为']`——任务已提交后的轮询超时或 provider 终止态不整体重试（避免重复提交计费任务、最坏 30 分钟队列持锁）；提交/下载阶段瞬时错误仍重试；`withAssetTransientRetry` 的 `excludeMessages` 缺省为空数组，流水线行为不变；
- **耗尽文案保留（审查 M2）**：抛错路径耗尽返回 `{code:-1, message}`，`generateSceneAiVideo` 守卫读取 `outcome.error || outcome.message` 上抛，真实瞬时错误文案不回退为兜底「AI 视频生成失败」；
- 默认有界：普通瞬时错误最多 3 次、限流最多 4 次，退避 800ms×attempt / 2500ms×attempt；
- 重试耗尽：返回 `{code:-1, message}` 或最后一次 outcome，由 `generateSceneAiVideo` 既有守卫（`!outcome.success || !outcome.path` → throw）fail closed，旧视频保留、状态回写失败语义不变。

#### Scenario: 瞬时失败重试成功
- **WHEN** stage 首次抛 `request timed out`、第二次成功
- **THEN** stage 调用 2 次，`videoPath` 替换为新产物，`status='completed'`

#### Scenario: 结果对象瞬时失败重试成功
- **WHEN** stage 首次返回 `{success:false, error:'request timed out'}`、第二次成功
- **THEN** 默认 `withAssetTransientRetry` 重试后成功，产物替换

#### Scenario: 非瞬时失败不重试
- **WHEN** stage 抛内容政策/配置类错误
- **THEN** 原样上抛，不重试、不清空旧素材
