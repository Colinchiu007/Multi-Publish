# 审查记录

## 结果

- 已验证：当前会话 `list_mcp_resources` 返回 `cowart_mcp` 的 `ui://widget/cowart/canvas.html`，模板列表为空；用该精确组合读取成功。
- 已确认根因：`C:\Users\邱领\.claude\.ccg\engine\model-router.md` 和 7 个策略文件存在“不要使用 `read_mcp_resource` / `resources/read`”的全局禁令。这是先前为阻止 `missing`、`x`、`??` 等占位参数造成的过度修复。
- 已修复：将全局禁令改为 discover-first 协议；本地文件读取与 Resource 读取分别明确路由。
- 合同检查通过：8 个受影响文档均包含枚举、精确读取、拒绝本地路径误映射和禁止猜测的规则；旧全局禁令已清除。

## 外部双模型审查

- 已按 CCG 规则并行启动 antigravity 与 Claude 审查，但当前环境无法完成：`agy` 不在 PATH；`claude` 进程以 status 1 退出，wrapper 日志已自动删除，无法取得更细错误。
- 因此未将外部双模型审查标为通过。本次修复依据实时 MCP 成功调用、配置根因定位和静态合同检查完成。

## 风险

- 低：仅修改用户级 CCG 路由 Markdown，不触及 Multi-Publish 产品代码、密钥或数据库。
- 后续会话应自然加载新规则；若再次出现无效 Resource 调用，应记录实际 `server`/`uri`，而不是用占位参数复现。
