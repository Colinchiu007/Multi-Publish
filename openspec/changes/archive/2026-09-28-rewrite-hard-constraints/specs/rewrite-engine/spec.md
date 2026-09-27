# rewrite-engine (delta: rewrite-hard-constraints)

## ADDED Requirements

### Requirement: 改写硬约束最前置注入

系统 SHALL 支持 `setHardConstraints(text)` 注入最高优先级改写硬约束：`_buildPrompt` 将其构造的硬约束段置于 systemPrompt 最前（先于策略/模式/字数等既有指令段），段内显式声明冲突裁决（冲突时以硬约束为准）；非字符串/空白输入 SHALL 被忽略。

#### Scenario: 注入后硬约束段位于 systemPrompt 最前

- **WHEN** 引擎实例已 `setHardConstraints(有效文本)` 后执行改写
- **THEN** 构造出的 systemPrompt 中硬约束段位于位置 0（先于策略/模式/字数指令段），且段内含「冲突时以硬约束为准」裁决声明

#### Scenario: 未注入时回退引擎内置默认

- **WHEN** 未调用 setHardConstraints 或运营中心未配置默认版本
- **THEN** 引擎使用内置默认硬约束（BUILTIN_DEFAULT_HARD_CONSTRAINTS），离线桌面仍保有纯文案输出约束

#### Scenario: 非法输入被忽略

- **WHEN** `setHardConstraints` 收到空白字符串或非字符串值
- **THEN** 忽略该次注入，维持既有约束（内置默认或上一次有效值）

#### Scenario: getHardConstraints 返回清洗后的当前值

- **WHEN** 调用 `getHardConstraints()`
- **THEN** 返回经清洗（trim/空白折叠）的当前生效约束文本
