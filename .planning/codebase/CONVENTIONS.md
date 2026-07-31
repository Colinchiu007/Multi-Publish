---
mapped_date: 2026-07-31
last_mapped_commit: 8001685ead710cab7f34ab9def5d0d98e929b3f3
working_tree_has_changes: true
scope: full-repo
---

# 编码约定

## JavaScript 与 TypeScript

- Electron 主进程以 CommonJS 为主，Renderer 以 ESM 为主；不要在同一边界随意混用模块系统。
- 主进程关键文件使用 `// @ts-check` 和 JSDoc 类型，在不全面迁移 TS 的前提下获得静态检查。
- TypeScript 主要用于 Story2Video、Remotion 和类型合同，运行 `apps/desktop/tsconfig.check.json` 做跨 JS/TS 检查。
- Prettier 配置为 2 空格、100 列、trailing comma；历史文件存在单引号/无分号风格差异，应服从所在文件。
- Vue 页面和组件使用 PascalCase，composable 使用 `useXxx`，store/API 使用领域名小写文件。

## 分层与依赖

- `main.js`、`bootstrap.js` 只负责编排；业务逻辑放在 service、handler 或独立包。
- Renderer 调用主进程必须经过 `src/api/`、preload 和 IPC handler 三层。
- IPC 参数必须是纯 JSON；从 Vue reactive/ref 取出的嵌套值先脱壳再调用。
- IPC handler 在调用 service 前完成 sender、权限、路径和参数校验。
- 新 service 优先通过 `electron/core/container.setup.js` 注册并由 bootstrap 注入。

## 错误处理

- 异步关键路径使用 `try/catch` 或显式 rejection 处理，错误码采用大写下划线格式。
- 安全和认证依赖不可用时 fail closed，Node API 使用 `AUTH_*_UNAVAILABLE` 与 HTTP 503 区分配置/依赖失败。
- Electron 全局异常写入 `services/logger.js`；生产代码避免裸 `console.log`。
- 清理流程使用 `Promise.allSettled` 或 `finally`，确保 bridge、锁、监听器和端口释放。
- 空 `catch {}` 只用于明确可忽略的清理或降级路径，新增时应保持范围最小。

## 安全约定

- 打包/开发权限判断以 `app.isPackaged` 为权威，不允许环境变量给打包应用提权。
- 扫描时未提交的 GPU/userData 兼容逻辑集中在 `electron/startup-compat.js`，设计要求是在 `app.whenReady()` 前调用。
- `file://` sender 与受控根路径先做 canonical realpath，再做目录边界检查。
- Access Token 同时支持 JWT 与 Opaque introspection，但损坏 JWT 不得降级为 introspection。
- Webhook、JWKS、introspection 和携带 Bearer Token 的生产请求禁止不受控重定向。
- 敏感值只来自环境变量或凭据存储，仓库模板只保留变量名。

## 持久化约定

- 本地敏感文件采用临时文件加原子替换；Windows rename 仅对明确的短暂冲突做有界重试。
- API Key 持久化需要单 writer lock，启动/失败/停止路径都必须释放。
- PostgreSQL migration 在 advisory lock 内执行，已有 ledger 的无 pending 路径不得要求 CREATE 权限。
- 测试可写状态使用 `os.tmpdir()` 下唯一目录，禁止写入仓库共享状态文件。

## 注释与文档

- 代码注释解释安全合同、非显然取舍和生命周期，不重复代码字面行为。
- 路径、命令、环境变量和错误码保持英文标识；说明性文本使用简体中文。
- Bug 修复需要在 `01-docs/learnings.md` 记录根因、逃逸链和预防措施。
- 重要约束同步到 `AGENTS.md`、`.quality-gates.md` 和相关合同测试。

## 修改后检查

- 修改大文件后必须用 `git diff` 和定向搜索确认没有旧代码残留。
- 修改 preload 后重建 bundle，并在 sandbox true/false 下验证 bridge。
- 修改 Electron 主进程或 RPA 后执行 Windows electron-builder 打包门禁。
- 修改 Vue/CSS 后执行 Vue build 和像素回归；基准图更新需要人工审核。
