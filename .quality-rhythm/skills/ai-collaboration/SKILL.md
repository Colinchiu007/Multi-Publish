---
name: ai-collaboration
description: AI 协作能力兼容入口。用于问题描述、上下文提供、输出审查和经验沉淀；将旧版 quality-rhythm 路由映射到当前可用技能。
---

# AI Collaboration Compatibility Router

这是 `quality-rhythm` 的兼容路由入口。

按用户意图调用当前已注册技能：

1. 问题描述和需求澄清：使用 `office-hours` 或 `agent-skills:idea-refine`。
2. 上下文组织：使用 `agent-skills:context-engineering`。
3. AI 输出审查：使用 `review` 或 `agent-skills:code-review-and-quality`。
4. 经验沉淀：使用 `learn`；跨会话上下文使用 `context-save` / `context-restore`。

不要仅输出方法论；应选择最匹配的实际技能继续完成用户任务。
