# story2video-resume-gating Specification

## Purpose
定义视频创作内容政策失败任务的恢复门控一致性（前端三处判定点 + 实时失败对话框与主进程关键字规则对齐），以及历史记录对不可恢复任务的本地化原因提示（含场景号），使用户理解为何不能断点恢复并知道需要修改哪些场景。
## Requirements
### Requirement: 恢复门控关键字规则一致
系统 SHALL 在实时失败对话框（CreateView `canResumeStory2Video`）、历史列表恢复判定（`historyItemResumable`，CreateViewHistory 与 usePipelineHistory）、以及 CreateView 实时对话框的隐藏按钮判定中，对内容政策类失败采用一致的关键字匹配：错误文本命中 `needs_user_input`、`content` 与 `policy` 之间带空格/下划线/连字符或不带分隔符的变体、`可能需要修改文案`、或中文 `内容政策`（覆盖主进程 `PIPELINE_USER_INPUT_REQUIRED` 拒绝文案「该失败需要人工处理（内容政策）」）时，SHALL 判定为不可恢复且不提供「从断点继续」入口。关键字正则 SHALL 以 `history-utils.js` 导出的 `RESUME_BLOCKING_ERROR_PATTERN` 为单一来源（与主进程 `pipeline-engine.js` `resumeOrchestration` 的判定对齐），场景号提取正则 SHALL 从该门控正则派生，不得另维护一份关键字清单。

#### Scenario: 连字符 content-policy 在对话框同样拦截
- **WHEN** 实时失败错误文本包含 "content-policy"（连字符）
- **THEN** `canResumeStory2Video` 返回 false，失败对话框不显示「从断点继续」按钮，与历史列表一致

#### Scenario: 空格与下划线变体
- **WHEN** 错误文本包含 "content policy" 或 "content_policy"
- **THEN** 三处前端判定均返回不可恢复，按钮隐藏

#### Scenario: 中文内容政策与主进程拒绝文案
- **WHEN** 错误文本包含「内容政策」（含主进程拒绝文案「该失败需要人工处理（内容政策）」）
- **THEN** 前端判定不可恢复，按钮隐藏，与主进程 `PIPELINE_USER_INPUT_REQUIRED` 行为一致

#### Scenario: 非政策失败不受影响
- **WHEN** 失败错误文本不包含任何门控关键字（如 ffmpeg 超时、时长超限）
- **THEN** 恢复判定保持可恢复，「从断点继续」按钮正常显示

### Requirement: 不可恢复原因可见
历史列表卡片与详情弹窗 SHALL 对因内容政策不可恢复的 failed 任务，在错误摘要之后展示本地化提示：提示 SHALL 说明需修改文案后重新生成；当错误文本可解析出内容政策失败的具体场景号时，SHALL 将场景号按升序、连续区间压缩后（如 `#49、#73-77`）放入提示；解析不到场景号时 SHALL 展示不含场景号的兜底提示。提示文案 SHALL 来自成对中英文 locale（`create.history.policyResumeBlockedLabel/Hint/Generic`），不得硬编码；含场景号的提示 SHALL 采用 vue-i18n 函数消息（`(ctx) => … ctx.named('scenes') …`）插值，与仓库既有插值约定一致（纯字符串消息在 `toMessageFunctions` 下不做 `{named}` 插值）。

#### Scenario: 可解析出政策场景号
- **WHEN** failed 任务 error 为 "…Image #49: …content-policy review; Image #73…Image #77…"
- **THEN** 卡片与详情显示含场景号提示，场景号升序去重且连续区间压缩为 `#49、#73-77`，插值后的文案不含字面 `{scenes}`

#### Scenario: 混合失败只提取政策场景
- **WHEN** error 同时包含瞬时失败（如 "This operation was aborted"）与内容政策失败
- **THEN** 提示中的场景号仅包含内容政策失败项，不含瞬时失败项

#### Scenario: 中文错误可提取场景号
- **WHEN** error 为 "Image #5: 内容政策拦截"
- **THEN** 提示包含场景号 `#5`（中文「内容政策」变体同样参与提取）

#### Scenario: 无法解析场景号
- **WHEN** failed 任务命中门控关键字但 error 无 `Image #N` 结构
- **THEN** 显示不含场景号的兜底提示

#### Scenario: 可恢复失败不显示提示
- **WHEN** failed 任务不命中门控关键字（可恢复）
- **THEN** 不显示该提示，按钮正常显示

