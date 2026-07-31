---
mapped_date: 2026-07-31
last_mapped_commit: 8001685ead710cab7f34ab9def5d0d98e929b3f3
working_tree_has_changes: true
scope: full-repo
---

# 架构

## 总体形态

Multi-Publish 是以 Electron 桌面应用为中心的 monorepo，同时包含本地 Python sidecar、独立 Node 发布 API、RPA 引擎和视频合成包。桌面端通过 IPC 隔离 Renderer 与主进程，主进程再编排本地服务、平台适配器、持久化和外部身份系统。

## 桌面启动链

1. `apps/desktop/electron/main.js` 取得单实例锁并创建应用上下文。
2. 扫描时未提交的 `apps/desktop/electron/startup-compat.js` 在 Electron ready 前处理 GPU 安全默认值和可写 userData/session/cache 路径。
3. `apps/desktop/electron/bootstrap.js` 从 `core/container.setup.js` 构建 DI 容器。
4. `bootstrap/phase1-context.js` 提取依赖，`phase2-bridges.js` 启动 Python/Prompt/Splitter bridge。
5. `bootstrap/phase3-services.js` 启动后台服务，`phase5-ipc.js` 注册 IPC。
6. `apps/desktop/electron/window.js` 创建 BrowserWindow 并加载开发 Vite 或打包 Renderer。
7. `shutdown.js` 协调 bridge、服务、端口和窗口退出。

## Renderer 分层

- `apps/desktop/src/main.js` 注册 Vue、Pinia、Router、Element Plus 与全局错误处理。
- `apps/desktop/src/router/index.js` 定义页面路由，页面组件位于 `src/views/`。
- 复用 UI 位于 `src/components/`，业务状态位于 `src/stores/`。
- 业务流程组合逻辑位于 `src/composables/`，领域聚合位于 `src/features/`。
- `src/api/` 是 Renderer 到 `window.electronAPI` 的薄封装，不直接访问 Node 能力。

## 主进程分层

- `electron/preload/` 暴露最小 bridge，生成入口为 `preload/index.bundle.js`。
- `electron/ipc-handlers/` 校验 sender、参数和权限，再调用 service。
- `electron/services/` 持有身份、发布、账号、视频、模型、数据库和后台任务实现。
- `electron/core/` 提供 DI、共享基础设施和容器装配。
- `electron/bootstrap/` 只负责编排生命周期和依赖接线。

## 发布数据流

1. Renderer 在 `src/views/Publish.vue` 或 composable 中构造纯 JSON 发布任务。
2. Preload bridge 将请求转为 IPC，handler 做安全校验和参数脱壳。
3. `taskQueue` 调用 `publisherRouter` 选择 API 或 RPA publisher。
4. API 模式进入 `packages/api-publish-engine/`；RPA 模式进入 Electron WebContents/Playwright 或 Python publisher。
5. 进度通过 `publish:progress` IPC 返回 Renderer，历史和监控服务持久化结果。

## 身份数据流

1. Renderer 身份菜单调用 `src/api/identity.js`。
2. IPC 进入 `electron/ipc-handlers/identity.js` 与 `services/identity/`。
3. 桌面 Logto 客户端完成 OIDC 登录并获取 access token。
4. 业务 API 在 `packages/api-publish-engine/src/auth/` 验证 JWT 或 introspection Opaque Token。
5. PostgreSQL repository 维护业务用户、会话、entitlement 与 Webhook 状态。

## Python sidecar

- `packages/python-backend/src/server.py` 提供 FastAPI 健康、账号、发布和视频接口。
- `multi_publish/core/publisher_manager.py` 选择 publisher，平台实现位于 `multi_publish/publishers/`。
- Electron bridge 负责 Python 进程启动、健康检查、调用和停止。
- Python 账号与发布状态并未完全迁移到共享数据库，部分仍是本地 JSON/内存状态。

## 独立 API 服务

- `packages/api-publish-engine/bin/publish-api` 是 CLI 入口。
- `src/publish-api-server.js` 使用原生 HTTP server，组合认证、API Key、限流、审计、排期和 Webhook。
- `src/index.js` 是平台适配器注册表与公共导出面。
- `src/auth/` 是 Logto/PostgreSQL/entitlement 安全边界，失败时遵循 fail closed 合同。

## 视频管线

- `packages/story2video-engine/` 提供纯 TypeScript 分镜、音频、字幕、效果与模板逻辑。
- `packages/remotion-composer/` 负责 React/Remotion 视频渲染。
- `apps/desktop/electron/services/pipeline-engine.js` 与 `story2video-compose-engine.js` 编排桌面管线。
- Python `video_creation/` 提供供应商适配、剪辑、拼接和合成实现。

## 开发启动

- 扫描时未提交的 `apps/desktop/scripts/dev.js` 直接启动本地 Vite，条件轮询就绪后再启动 Electron。
- 开发启动使用独立临时 userData，并显式传递 GPU/userData 参数，避免污染正式用户目录。
