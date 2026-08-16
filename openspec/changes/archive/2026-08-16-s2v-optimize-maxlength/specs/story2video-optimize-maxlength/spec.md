# story2video-optimize-maxlength Specification

## Purpose
图片提示词优化（story2video_optimize / 8013）输出长度上限的默认值与可配置区间契约：默认 2000、渲染层区间 [200, 2000]、执行器契约收敛不可绕过。

## ADDED Requirements

### Requirement: 图片提示词默认上限放开
Story2Video 编排流水线 optimize 阶段的图片提示词 `max_length` 默认 SHALL 为 2000（8013 契约上限），不得再以 500 硬截优化器输出。

#### Scenario: 默认流水线运行不再 500 硬截
- **WHEN** 用户不做任何长度设置直接启动 story2video 流水线
- **THEN** optimize 阶段请求 `max_length` 为 2000，优化器输出超过 500 字符时不再被 500 截断，且经执行器契约收敛后 ≤2000

#### Scenario: 历史记录重生成图片优化词同样 2000
- **WHEN** 用户在历史记录重新生成某场景的图片优化词（regenerateScenePrompt kind=image）
- **THEN** 请求经 buildPromptEngineOptimizeRequest 显式携带 `max_length=2000`，结果按 2000 防御性本地截断后落库，不再走 8013 后端默认 500 截断

#### Scenario: 超契约值仍需收敛
- **WHEN** 渲染层或调用方传入 `max_length > 2000` 或非数值
- **THEN** 执行器契约仍收敛到 [50, 2000]，请求不会携带越界值

### Requirement: 渲染层长度设置
创作页 SHALL 提供「提示词最大长度」设置（区间 200–2000，默认 2000），并透传到 optimize 阶段 options。

#### Scenario: 设置透传
- **WHEN** 用户选择 maxPromptLength=1000 并启动流水线
- **THEN** `story2videoTextConfig.optimize.maxLength` 为 1000，`resolveRuntimeStageOptions` 将其映射为 optimize stage 的 `max_length`，执行器按 1000 收敛

#### Scenario: 无设置回落默认
- **WHEN** 用户未修改设置（含旧版保存的 last-options 缺字段）
- **THEN** 渲染层与 stageDef 均回落默认 2000，行为与 Requirement 1 一致

### Requirement: 文案与同步
新增用户可见文案 SHALL 以 locale 键（zh/en 成对）提供，渲染源文件不得新增中文字符串字面量。

#### Scenario: locale 成对
- **WHEN** 新增「提示词最大长度」相关文案
- **THEN** `locales/zh.js` 与 `locales/en.js` 对应键均存在且 check-locale-sync 通过

## Test Mapping
- 场景「默认流水线运行不再 500 硬截」→ `pipeline-story2video-contract.test.js`（请求 max_length 2000）、`story2video-text-config.test.js`（maxLength 默认/区间）
- 场景「历史记录重生成图片优化词同样 2000」→ `story2video-project-service.test.js`（regenerateScenePrompt image 断言 max_length=2000 + 超长 2000 截断）
- 场景「超契约值仍需收敛」→ `stage-executor.test.js` 既有契约收敛用例保持（不改断言值）
- 场景「设置透传」→ `CreateView.test.js`（buildStory2VideoTextConfig 透传 maxPromptLength）+ `pipeline-engine` resolveRuntimeStageOptions 单测
- 场景「无设置回落默认」→ 渲染层默认断言
- 场景「locale 成对」→ `scripts/check-locale-sync.js` CI Gate 7
