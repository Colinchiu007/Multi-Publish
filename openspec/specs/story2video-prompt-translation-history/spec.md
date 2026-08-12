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
流水线 SHALL 在 optimize 阶段完成后，若提交的 `uiLocale` 不等于 'en'，对每个场景的优化后提示词生成 `promptTranslation`（默认 LLM 翻译，按 index 对齐）；翻译失败 SHALL fail-open（对应项置空，不阻塞流水线）。`promptTranslation` SHALL 随分段持久化（story2video-project-service segment 字段，≤20000 字符截断）。

#### Scenario: 非英语流水线生成翻译
- **WHEN** 提交 uiLocale='zh' 且 optimize 输出 N 个提示词
- **THEN** context.optimize.promptTranslations 为按 index 对齐的 N 项（成功项为翻译文本，失败项为 null），generate_assets 写入每场景 promptTranslation

#### Scenario: 英语流水线不生成翻译
- **WHEN** 提交 uiLocale='en' 或缺失（默认 en 语义）
- **THEN** 不调用翻译，promptTranslations 为空，分段无 promptTranslation

#### Scenario: 翻译失败不阻塞
- **WHEN** 默认 LLM 不可用或某场景翻译失败
- **THEN** 对应 promptTranslation 为 null，流水线继续，项目正常保存

### Requirement: 兼容旧数据
旧项目/旧快照无 promptTranslation 字段时 SHALL 正常加载展示，不得报错。

#### Scenario: 旧项目打开
- **WHEN** 打开 manifestVersion 2 但无 promptTranslation 字段的项目
- **THEN** 分段正常展示，无翻译块

