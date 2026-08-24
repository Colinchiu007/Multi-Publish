# Guides — 跨模块开发指南

> 本文件定义跨前后端的通用指南。适用于所有模块和子 Agent。
> 按项目实际情况修改内容。

## 架构原则

- 单一职责: 每个模块/函数只做一件事
- 依赖方向: 高层依赖低层，禁止循环
- 接口优先: 跨模块通过接口通信，不直接访问内部

## Git 提交规范

- 格式: Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
- 原子提交: 一个逻辑变更一个 commit
- 不提交: `.env`, `node_modules/`, 编译产物, IDE 配置

## 代码审查清单

- [ ] 变更是否符合需求？
- [ ] 是否有测试覆盖？
- [ ] 是否引入安全风险？
- [ ] 是否有性能影响？
- [ ] 命名是否清晰？

## 文档要求

- 公共 API 必须有类型注释
- 复杂逻辑加注释说明 WHY（不是 WHAT）
- 新模块需要 README

## 敏感诊断与发布证据（2026-08-24）

网络抓包的原始 response body、页面正文、localStorage、Cookie 相关 query 和 token 都是敏感数据，不能作为 diagnostics、日志或 IPC 返回值。原文只允许在最小作用域内解析为受限证据；对外只返回字段白名单（去 query 的 endpoint、HTTP 状态、MIME、数量、artifact 是否命中）。

需要证明“本次发布成功”的严格平台，不能从当前 URL、localStorage、页面旧链接或 DOM 中猜测作品 ID；只能接受本次发布响应的明确 ID，或标题和时间窗口共同核验的作品列表 artifact。启动抓包后任何点击、草稿或验证异常路径都必须在 `finally` 调用 stop，避免遗留 debugger listener。

## 多能力 provider 的默认状态归一化（2026-08-24）

当一个多模态 provider 的历史 `is_default` 同时代表多个已声明能力时，用户设置某个普通类别 provider 为默认，必须在同一事务中：将多模态 provider 的其余已声明能力转为显式 `config.capability_defaults`、移除被覆盖能力、清除全局 `is_default`。不得只修改运行时路由或只修正卡片样式；回归测试必须同时断言运行时 `getDefault(capability)`、持久化 provider 行和 renderer 重新加载后的卡片数据一致。
