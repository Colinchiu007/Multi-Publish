# Story2Video 历史断点恢复与当前模型路由架构（2026-08-19）

## 1. 范围与结论

本说明定义“视频创作 → 历史记录 → 从断点继续”在模型设置发生变化后的运行时合同。恢复入口仍是现有的一键操作，不增加模型选择器、确认弹窗或新的恢复状态。恢复策略只改变未完成 provider 调用的路由；已完成且可读取的本地资产继续复用。

核心结论：

1. 文字推理、图片、语音和视频的未完成调用，在恢复执行到实际调用边界时解析当前设置中的能力模型。
2. 已完成图片、音频、视频以稳定的场景 index 匹配，并在 provider 调用前校验本地路径；有效资产不因原模型不同而重新生成。
3. 恢复快照保留提示词、场景文本、场景索引、输入媒体、画幅、视频模式/比例、voiceId、语速、音调和情绪等内容参数，只清理旧 provider/model 路由。
4. 当前实现不持久化远程视频 taskId。远程已提交但本地文件尚未落盘时属于未知状态，恢复不能把它显示或记录为已完成，也不能声称已经查询到原任务。

## 2. 数据流

History Continue
  -> pipeline:resumeOrchestration(runId)
  -> RunStateStore 读取 version 1 snapshot
  -> prepareResumeParams(params, pipeline)
       - JSON-safe clone
       - Story2Video 删除旧图片/TTS/视频 provider/model
       - 写入内部 __resumeUseCurrentModels=true
  -> resolveRuntimeStageOptions()
       - 防止 stageOptions 再注入旧路由
  -> 已完成 stage 的 context 直接复用
  -> 未完成 stage 执行到调用边界
       - ModelProviderManager.getDefault(capability)
       - 读取 capability_models[capability]，缺失时取 models 首项
  -> provider 调用 / 既有错误与重试合同

__resumeUseCurrentModels 是主进程内部标记，不是用户可编辑字段，不进入新的 IPC 参数合同，不作为历史页面显示项。非 Story2Video 流水线保持原有参数恢复语义。

## 3. 模型与资产矩阵

| 阶段/资产 | 已完成且有效 | 未完成或失败后继续 | 保留参数 | 风险与处理 |
|---|---|---|---|---|
| 文字推理/提示词优化 | 使用 context 中已有结果 | 按调用时当前默认 LLM/PromptBridge 解析 | 文案、策略、长度、场景 index | 当前 LLM 不可用时沿用既有 fail-closed 错误 |
| 图片 | imagePath 或受控输入图片存在且可读时复用 | 当前 image provider/model | prompt、风格、负面词、画幅、输入模式 | 当前 provider 缺失或调用失败沿用图片失败/人工处理合同 |
| TTS | audioPath 存在时复用，不重生成 | 当前 TTS provider/model | voiceId、语速、音调、情绪、旁白文本 | 新模型不支持旧音色时不静默换音色；按既有兼容错误或 re-clone 合同失败关闭 |
| 视频 | videoPath 存在时复用，并保留 continuity 元数据 | 当前 video provider/model | video prompt、秒数、比例、fps、场景选择 | 生成失败沿用混合模式图片回退；远程未知状态不伪造完成 |

新旧资产可以在同一最终 manifest 中混合存在。混合结果必须按场景 index 回填，不能因模型版本不同覆盖旧文件或错位合并。

## 4. 快照校验与兼容性

恢复前执行以下校验：

- params 非对象时按空对象恢复；可 JSON 序列化的内容复制到内存，不能持久化 Promise、密钥、二进制或运行时对象。
- 仅 Story2Video 设置当前模型策略；其它 pipeline 不受 marker 影响。
- 清理顶层及 stageOptions.generate_assets、stageOptions.select_video_scenes.video、stageOptions.generate_assets.video 和 videoConfig 中的 provider/model 字段。
- 旧 version 1 快照没有 provider/model 或没有 capability metadata 时仍可读取；缺少路由按当前设置解析，不做迁移失败。
- context.generate_assets.resume.completed 仅接受合法整数 index，并要求相应路径存在；无效路径不能阻止后续场景按当前模型重新生成。
- video_plan.provider/model 在恢复 marker 存在时不是权威路由，因为 select_video_scenes 可能已经完成且不会重新执行。

## 5. 语音兼容与风险

voiceId 是内容参数，不是模型路由。切换 TTS 模型后继续任务不会自动替换音色 ID，也不会把旧音频覆盖成另一种音色。当前模型/provider 的音色目录或 adapter 白名单拒绝组合时：

- 不能把默认音色、相似音色或空音频当作成功；
- 既有音频文件必须继续保留；
- 允许既有 tryReCloneVoice 在满足当前 provider 的克隆能力、样本和权限合同后重建音色；
- 永久不兼容错误和瞬时网络/限流错误必须沿用既有分类，不能统一提示“稍后重试”。

因此恢复后的一个任务可能同时包含旧模型生成的已完成旁白与新 TTS 模型生成的未完成旁白。产品不在恢复页强制用户选择“全部重生成”或“全部沿用旧模型”。

## 6. 远程视频未知状态

generateSceneVideo 当前将远程 taskId 保存在函数局部变量，只有视频下载并校验成功后才形成可复用的本地 videoPath。若进程在提交成功后、本地路径写入前中断：

- 快照不能证明远程任务是否成功；
- 恢复不会查询一个没有持久化的 taskId；
- 恢复不会将场景标成 completed；
- 按现有阶段级重试/混合模式回退语义重新处理未完成场景。

未来若支持远程任务查询，必须在轮询前持久化 providerId、model、taskId、status，并使用原 provider/model 查询，不能把原任务切换到新模型。

## 7. 交互与显示合同

History Continue 仍是单按钮、单次点击：

- 历史卡片仍显示现有“已暂停/生成失败/从断点继续”等状态和操作；
- 不显示旧模型、新模型、模型比较器或确认选择器；
- 复用已有资产时使用现有资产/场景结果展示，不增加第二份素材；
- 当前模型路由属于运行时诊断元数据，不改变历史卡片状态文本；
- 语音不兼容沿用现有 TTS/音色错误提示和可操作建议；
- 远程视频未知状态只能显示未完成/失败/回退等事实状态，禁止显示“已完成”或“已查询成功”。

新增用户可见文字时必须写入 apps/desktop/src/locales/zh.js 与 en.js，并通过 locale pair/CJK 门禁；本实现不新增文案键。

## 8. 回滚与观测

回滚运行时代码即可恢复旧的快照参数语义；version 1 快照仍可读取，因为 marker 只在内存中添加，没有 schema migration。日志和测试可以记录 capability provider/model、scene index、复用/生成分支和失败分类，但不得记录 API key、完整 prompt 或远程凭据。
