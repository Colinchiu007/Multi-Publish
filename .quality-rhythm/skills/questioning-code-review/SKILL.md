---
name: questioning-code-review
description: 对复杂或存疑代码执行质疑式审查的兼容入口，优先尝试反驳假设并验证真实失败场景。
---

# Questioning Code Review Compatibility Router

这是旧版 `quality-rhythm` 路由的兼容入口。

执行方式：

1. 使用 `agent-skills:doubt-driven-development` 质疑关键假设和边界。
2. 使用 `review` 或 `agent-skills:code-review-and-quality` 审查当前变更。
3. 每项发现必须给出具体输入或状态、错误结果、文件与行号。
4. 无法验证的猜测不得当作确定缺陷报告。
5. 若用户要求安全专项审查，改用 `cso` 或 `security-audit`。
