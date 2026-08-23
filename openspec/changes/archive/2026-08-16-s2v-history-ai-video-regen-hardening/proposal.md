## Why

PR #870（s2v-history-ai-video-regen，已合并 d044d4b4）交付后，双模型审查报告遗留 **3 个 Warning + 2 个增强项**；其中 W1（`_serializeProject` 前置校验失败丢队）、W2（通知正则漏匹配）、W3（AI 视频产物泄漏）已在 PR #870 内一并修复。本 change 处理其余两项：

- **W4 队列覆盖缺口**：`story2video:replace-segment-audio`、`story2video:retry-segment`、`story2video:select-scene-material`、`story2video:generate-scene-image`、`story2video:generate-scene-video` 五个写通道绕过 `_serializeProject` 同项目串行队列，直接调用服务。用户并发（或快速连点）「替换旁白 + 重新生成图片 + 重试视频」时，多个写操作可能交错读写同一项目文件，产生互相覆盖/部分写入竞态——与 W2 修复的目标一致，但覆盖不全。
- **W5 瞬时错误重试缺失**：历史记录「生成 AI 视频」直接调用 `generateSceneVideoStage` 一次，provider 瞬时限流/网络超时（如 `request timed out`）直接失败，无重试；与流水线 generate_assets 阶段（stages `withAssetTransientRetry`，3 次/限流 4 次有界退避）行为不一致，用户侧表现为偶发「AI 视频生成失败」。

目标：让历史记录场景所有写操作统一经过同项目串行队列（W4），并把 AI 视频重生成包上与流水线同源的瞬时重试（W5），保证「修改/重新生成后重新合成」链路在并发与瞬时故障下行为一致、可预期。

## What Changes

- **W4（story2video.js IPC）**：`replace-segment-audio`、`retry-segment`、`select-scene-material`、`generate-scene-image`、`generate-scene-video`、`delete-project` 六个通道改为 `await requireProjectService()._serializeProject(projectId, () => service(...))`；`select-scene-material` 由同步返回改为异步透传（返回语义不变 `{ code: 0, data }`）；`delete-project` 入队消除「删除后队列内任务 `_upsertProject` 复活项目」竞态（审查 M3）。连同既有 6 个通道（update-segments / recompose / regenerate-subtitle / regenerate-audio / regenerate-prompt / generate-scene-ai-video），历史记录写路径（含删除）全部串行化。
- **W5（story2video-project-service.js）**：构造器新增可注入 `this.assetRetry = options.assetRetry || ((fn) => withAssetTransientRetry(fn, { excludeMessages: [轮询超时/任务终态三类文案] }))`（与流水线 stages 同源，默认 3 次 / 限流 4 次、800ms/2500ms 乘数退避，仅瞬时错误重试，内容政策/模型配置失败原样返回）；`generateSceneAiVideo` 对 `generateSceneVideoStage` 调用包上 `this.assetRetry(() => ...)`，重试耗尽后按 `{code:-1,message}` fail closed 上抛（守卫读 `outcome.error || outcome.message`，保留真实瞬时错误文案，审查 M2），旧视频保留语义不变。历史交互路径排除「视频生成超时或失败/任务失败/任务状态为」——任务已提交后的轮询超时/终态不整体重试（避免 3 次计费 + 30 分钟队列持锁，审查 M1），流水线默认参数行为不变。
- **stages 导出**：`story2video-stages.js` `module.exports` 增加 `withAssetTransientRetry`（供 service 复用，行为单一来源）。
- **测试**：IPC 队列计数断言 6→12（新增 3 通道 + delete-project 调用与断言）；service 新增 4 用例（注入 assetRetry 包装且瞬时失败重试成功、默认 withAssetTransientRetry 对 `{success:false,error:'request timed out'}` 重试成功、真实重试耗尽 fail-closed 保留真实文案（M2/m5）、非瞬时结果对象不重试（m5））；两个「替换旁白」用例 mock 补齐 `_serializeProject`。

## Capabilities

### New Capabilities
- `story2video-history-regen-hardening`: 历史记录场景写操作同项目串行队列全覆盖（通道清单、返回语义）与 AI 视频重生成瞬时重试契约（默认参数、仅瞬时重试、重试耗尽 fail closed、旧视频保留）。

### Modified Capabilities
- `story2video-history-ai-video-regen`（已归档）：`generateSceneAiVideo` 行为补充「瞬时错误有界重试」，其余不变。

## Impact

- **代码**：`apps/desktop/electron/services/story2video-stages.js`（导出+1）、`apps/desktop/electron/services/story2video-project-service.js`（构造器注入 + 调用包装）、`apps/desktop/electron/ipc-handlers/story2video.js`（5 通道入队）。
- **测试**：`electron/ipc-handlers/story2video.test.js`、`electron/services/story2video-project-service.test.js`。
- **文档**：`01-docs/PRD-video-creation.md`（3.1.29.2 小节）、`CHANGELOG.md`、本 change 的 specs/design/tasks。
- **不涉及**：渲染端 UI、locales、preload、权益、流水线阶段内部、compose、Python sidecar、数据库、第三方契约。
