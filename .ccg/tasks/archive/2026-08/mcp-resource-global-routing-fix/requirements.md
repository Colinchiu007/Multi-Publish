# 需求与根因

- 新会话仍复现旧的 Resource 解释，说明只改 `.ccg/engine` 子策略不足。
- 上游 `C:\Users\邱领\.claude\commands\ccg\go.md` 仍有全局禁止 `read_mcp_resource` 的两处规则。
- 用户级记忆摘要也保留了旧的“绝对禁止 Resource”结论，必须同步修正。
