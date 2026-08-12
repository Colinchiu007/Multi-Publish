# video-prompt-engine (delta) Specification

## Purpose

本文件为 video-content-fidelity 对 `video-prompt-engine` capability 的增量要求：视频提示词优化必须支持事实保真指令与 context 事实锚点注入，并保持既有批量契约（上限 20、有界并发 8）不变。

## Requirements

### Requirement: 视频优化事实保真指令
prompt-engine 视频领域（domain=video）优化 SHALL 在指令中约束不得改变输入主体身份、时代背景与事件事实；当请求携带 context 时，优化结果必须与 context 提供的事实锚点一致。

#### Scenario: 中文历史事实不被改写
- **WHEN** 优化请求 domain=video 且 prompt 描述中文历史事件（如"关羽水淹七军"）
- **THEN** 输出保留主体/事件/时代，不翻译成改变事实的表述，不新增与原文矛盾的情节

#### Scenario: context 事实锚点
- **WHEN** 请求携带 context.synopsis/full_text
- **THEN** 策略指令引用事实锚点，输出画面要素与锚点一致（人物身份、时代道具、核心事件）

### Requirement: context 白名单契约
视频优化请求 SHALL 只接受 context 白名单键（synopsis/character/setting/character_list/full_text）；未知键在服务端忽略并记录，不改变优化行为；既有批量上限 20 与有界并发 8 不变。

#### Scenario: 未知键忽略
- **WHEN** 请求 context 含白名单外键
- **THEN** 服务端忽略该键并记录 warning，请求仍按正常流程优化

#### Scenario: 批量契约不变
- **WHEN** 批量请求 12 条且均带 context
- **THEN** 单批 200、结果顺序与请求一致、每条结果非空（与 max_length=20 契约一致）
