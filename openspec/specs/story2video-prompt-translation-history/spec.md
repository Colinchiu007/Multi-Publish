# story2video-prompt-translation-history Specification

## Purpose
当界面语言不是英语时，在历史记录/项目详情的分段「画面提示词」文本框旁以只读方式展示本国语言翻译，帮助用户理解生成素材所用的提示词。
## Requirements
### Requirement: 分段提示词本地语言翻译展示
项目详情（ResultView 分段编辑）中每个分段的「画面提示词」文本域下方/上方 SHALL 展示只读的本国语言翻译文本，当且仅当：界面语言 `getAppLocale() !== 'en'` 且该分段存在非空 `promptTranslation`。翻译块 MUST 只读、不可编辑，与可编辑 textarea 视觉区分，并带稳定 testid（`segment-prompt-translation`）。

#### Scenario: 中文界面显示翻译
- **WHEN** 界面语言为 zh、分段存在 promptTranslation
- **THEN** 画面提示词文本域下方展示只读中文翻译，内容等于该分段的 promptTranslation

#### Scenario: 英文界面隐藏翻译
- **WHEN** 界面语言为 en
- **THEN** 不展示翻译块（英文用户无需翻译）

#### Scenario: 无翻译数据隐藏
- **WHEN** 分段无 promptTranslation（旧项目或翻译失败）
- **THEN** 不展示翻译块，不报错

### Requirement: 翻译生成与持久化
流水线 SHALL 在 optimize 阶段完成后，若提交的 `uiLocale` 不等于 'en'，为每个场景的优化后提示词准备 JSON-safe 的延迟翻译 pending payload；自动素材模式和手动选材模式均不得在 optimize 阶段等待翻译。手动模式的候选生成和 `scene_asset_selection` checkpoint SHALL 在翻译缺失时继续运行，候选字段可为 `promptTranslation: null`。pending payload MUST 包含规范化 locale 及按稳定 `index` 对齐的非空 prompt 列表；有效翻译文本 MUST 为非空字符串且不超过 2000 字符。视频合成阶段 SHALL 将翻译任务与 `composeVideo` 并行启动，并按稳定场景 `index` 回填 `promptTranslation`；翻译失败、超时、空响应、非法 JSON、缺项、错误 index 或错误 prompt SHALL fail-open（对应项置空或保留已有有效值，不阻塞流水线）。翻译 apply SHALL NOT replace candidate arrays, selections, candidate IDs, media paths, prompts, or audio paths. `promptTranslation` SHALL 随分段持久化（story2video-project-service segment 字段，≤20000 字符截断）。

#### Scenario: 非英语流水线生成翻译
- **WHEN** 提交 uiLocale='zh' 且 optimize 输出 N 个提示词
- **THEN** optimize 仅写入 `context.prompt_translations_pending`，compose 阶段与视频合成并行执行有界翻译任务，并按 index 将成功项写入每场景 `promptTranslation`

#### Scenario: 英语流水线不生成翻译
- **WHEN** 提交 uiLocale='en' 或缺失（默认 en 语义）
- **THEN** 不调用翻译，promptTranslations 为空，分段无 promptTranslation

#### Scenario: 翻译失败不阻塞
- **WHEN** 默认 LLM 不可用或某场景翻译失败
- **THEN** 对应 promptTranslation 为 null，流水线继续，项目正常保存

#### Scenario: 合成阶段翻译超时不阻塞成片
- **WHEN** 自动素材模式或手动选材模式进入 compose，翻译任务超过批次或总预算但 `composeVideo` 成功
- **THEN** 视频结果正常保存，未完成项保持 null 或既有有效翻译，并记录可诊断的 translation-degraded 状态

#### Scenario: 手动选材 checkpoint 不等待翻译
- **WHEN** 手动选材模式生成非英语候选场景且翻译尚未完成
- **THEN** 候选素材选择 checkpoint 仍展示并允许提交 `index + candidateId`，候选 `promptTranslation` 可以为 null，且不影响候选和媒体数据

#### Scenario: 手动选材合成后回填翻译
- **WHEN** 手动选材确认后进入 compose，翻译返回有效结果
- **THEN** 最终 scenes 和 compose segments 按 index 获得 `promptTranslation`，候选数组、selection、媒体路径和音频路径保持不变

### Requirement: 兼容旧数据
旧项目/旧快照无 promptTranslation 字段时 SHALL 正常加载展示，不得报错。

#### Scenario: 旧项目打开
- **WHEN** 打开 manifestVersion 2 但无 promptTranslation 字段的项目
- **THEN** 分段正常展示，无翻译块

