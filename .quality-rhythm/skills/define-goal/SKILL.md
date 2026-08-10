---
name: define-goal
description: 目标定义兼容入口。把模糊意图转为可验证目标，并路由到现有需求澄清与规划技能。
---

# Define Goal Compatibility Router

将目标整理为：具体结果、范围、排除项、验收证据和停止条件。

路由规则：

- 产品或业务目标：使用 `office-hours`。
- 技术任务目标：使用 `agent-skills:idea-refine`。
- 目标已明确且需要实施计划：使用 `autoplan` 或 `agent-skills:planning-and-task-breakdown`。

只有缺失信息会实质改变结果时才提问；否则采用合理默认值继续。
