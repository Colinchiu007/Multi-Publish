---
name: create-plan
description: 创建实施计划的兼容入口。将旧版 quality-rhythm 的 create-plan 路由映射到当前规划技能。
---

# Create Plan Compatibility Router

根据任务规模路由：

- 多阶段或跨模块工作：使用 `autoplan`。
- 常规实施计划：使用 `agent-skills:planning-and-task-breakdown`。
- 需要正式代码实施计划并请求用户审批：使用计划模式或 `agent-skills:plan`。
- 仅需计划文档结构：使用 `superpowers:writing-plans`。

计划必须包含范围、关键文件、依赖、风险、验证标准和测试策略。
