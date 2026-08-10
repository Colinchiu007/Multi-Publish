# 验证记录

## 根因

修复前存在三层语义来源：

1. Codex 全局 `AGENTS.md` 正确规定本地路径使用 FastCtx/CodeGraph。
2. CCG 子策略已改为 discover-first，但上游 `commands/ccg/go.md` 仍把 Resource 全局禁用。
3. 记忆摘要仍保留旧的“绝对禁止 read_mcp_resource/resources/read”结论，新会话会继续继承它。

因此，新会话仍可能输出旧的二分法说明，甚至拒绝真实 Resource 调用。

## 修复

- `C:\Users\邱领\.claude\commands\ccg\go.md` 两处改为：本地文件保持本地读取；真实 Resource 先枚举，再只读取本次返回的精确 `server + uri`。
- 写入 `C:\Users\邱领\.codex\memories\extensions\ad_hoc\notes\2026-08-03-mcp-resource-discover-first.md`，纠正长期记忆规则。
- 保留 `C:\Users\邱领\.codex\AGENTS.md` 的本地 FastCtx/CodeGraph 路由，因为它没有禁用 Resource，且本地路径仍应走本地工具。

## 验证

- CCG command/engine 中旧的全局 Resource 禁令搜索结果为零。
- `go.md` 已包含 discover-first、枚举和精确 `server + uri` 规则。
- 记忆修正文件存在。
- 无窗口的测试 Electron/Vite 进程已停止。
