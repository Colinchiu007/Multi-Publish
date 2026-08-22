## Purpose

保证 Story2Video 的字幕块在本地回退和在线分句结果归一化两条路径中都不会把受保护的中文短语从中间拆开，同时拒绝内容顺序不连续的在线字幕结果。

## ADDED Requirements

### Requirement: 本地字幕切分保护短语边界

本地字幕切分器 SHALL 将共享规则表中的 no_cut_bigrams 项视为不可切开的短语；该字段中的项目可以是任意长度，而不只限于两个字符。字幕切点不得落在任一匹配短语的内部。

#### Scenario: 用户样例的受保护短语不被拆开
- **WHEN** 本地切分器处理包含“蒙古”“江南”“包税人”“大汗”的用户样例文案
- **THEN** 任意相邻字幕块边界都不得落在这四个短语内部，且字幕块拼接后保留原文中的全部非块尾标点字符

#### Scenario: 受保护短语长度超过最长字幕块
- **WHEN** 配置的 max_chars_per_block 小于某个共享保护短语的长度
- **THEN** 该短语 SHALL 仍作为完整字幕块输出，不得为满足长度上限而在短语内部切分
#### Scenario: 三端共享规则保持一致
- **WHEN** TypeScript、Electron JS 镜像和 smart-sentence-splitter Python 端加载同一规则表
- **THEN** 三端 SHALL 对同一输入使用相同的短语边界保护语义

### Requirement: 在线字幕结果必须通过内容与边界质量门

在线字幕结果 SHALL 只有在按原文顺序连续覆盖场景文本，且所有相邻字幕块边界均不落在共享保护短语内部时，才可标记为 smart-sentence-splitter 并直接采用。

#### Scenario: 在线结果包含坏词边界
- **WHEN** 在线结果的字幕块覆盖率足够但在“江|南”或其他受保护短语内部切分
- **THEN** 该场景 SHALL 回退到本地字幕切分，subtitleSource SHALL 为 local-typescript，并记录可追溯的回退原因

#### Scenario: 在线结果内容错序或重复
- **WHEN** 在线字幕拼接长度达到覆盖率阈值但不能按顺序连续匹配场景原文
- **THEN** 该场景 SHALL 回退到本地字幕切分，不得以 smart-sentence-splitter 标记不连续结果

#### Scenario: 在线结果合法
- **WHEN** 在线字幕按顺序完整覆盖场景文本且所有边界安全
- **THEN** 系统 SHALL 原样采用在线字幕，并保持 subtitleSource 为 smart-sentence-splitter

### Requirement: 场景文本与现有来源合同保持兼容

字幕质量修复 SHALL 只替换不合格场景的 subtitleBlocks，不得修改服务返回的场景 text；现有 subtitleSource 枚举值 SHALL 保持兼容。

#### Scenario: 单场景回退不改变场景文本
- **WHEN** 某个在线场景因字幕质量门失败而回退
- **THEN** 场景 text SHALL 与服务结果中的规范化文本一致，且其他合格场景仍可继续使用在线字幕
