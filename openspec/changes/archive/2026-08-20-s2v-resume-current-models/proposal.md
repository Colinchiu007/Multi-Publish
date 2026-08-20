## Why

Story2Video 的历史记录恢复目前会深度保留启动任务时的 `params`。图片、语音和视频阶段随后把这些旧 provider/model 当作显式配置使用，因此用户在设置中切换模型后，继续失败或中断任务仍可能调用旧模型。文字推理的主要入口已经在每次调用时解析默认 LLM，但恢复契约没有把四类模型的行为写清楚。

## What Changes

- 为普通失败/中断 Story2Video 恢复增加“当前模型”策略：已完成的本地图片、音频和视频资产继续复用；没有可复用产物的后续调用从当前模型设置解析。
- 恢复时清除旧快照中图片、TTS 和视频的显式路由字段，同时保留场景文本、提示词、比例、音色 ID、语速、情绪和视频选择比例等内容参数。
- 让已完成的 `video_plan` 不会把旧视频 provider/model 重新带入未完成视频生成。
- 保持文字推理、提示词优化和 AI 视频场景判断走现有的运行时默认 LLM/能力模型解析。
- 对当前语音模型的 provider/model 白名单和既有音色目录能力进行 fail-closed 校验；不会静默把一个不兼容的 voice ID 当成新音色。现有 TTS 错误与克隆重建机制仍按原有边界工作。
- 明确当前实现没有持久化远程视频 taskId，不能在恢复时安全查询一个“已提交但状态未知”的远程任务；该状态不会被伪造成已完成，仍按现有阶段级重试语义处理，并记录为后续远程任务持久化能力。
- 不新增模型选择 UI、确认弹窗或额外用户操作。

## Capabilities

### New Capabilities

- story2video-resume-current-models: Defines current-model routing, local asset reuse, voice compatibility, legacy snapshot compatibility, and unknown remote-task limitations during history resume.

### Modified Capabilities

- None. Existing resume gating and video carousel resume specs remain valid; this change adds the cross-asset routing contract.

## Impact

- Runtime: `apps/desktop/electron/services/pipeline-engine.js` and `apps/desktop/electron/services/story2video-stages.js`.
- Tests: resume orchestration, Story2Video stage routing, asset reuse, video plan routing, and legacy snapshot compatibility.
- Product behavior: History “Continue” remains one click; successful local assets are reused and only incomplete generation uses current Settings models. Mixed old/new assets are allowed and retain their original files.
- Documentation: Story2Video PRD, architecture note, root/专项 changelog, learnings, OpenSpec and CCG task records.
