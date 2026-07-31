---
mapped_date: 2026-07-31
last_mapped_commit: 8001685ead710cab7f34ab9def5d0d98e929b3f3
working_tree_has_changes: true
scope: full-repo
---

# 外部集成

## 身份与授权

- Logto 是用户身份主系统；桌面客户端位于 `apps/desktop/electron/services/identity/`，Renderer 接口位于 `apps/desktop/src/api/identity.js`。
- Node 业务 API 的 JWT、Opaque Token introspection、JWKS、Webhook 和 entitlement 实现在 `packages/api-publish-engine/src/auth/`。
- Python JWT 验证位于 `packages/python-backend/src/multi_publish/auth/logto.py`。
- Logto 生产编排、Nginx、监控与 Webhook POST 重试派生镜像位于 `deploy/logto/`。
- 身份 Schema 与事件 ledger 迁移位于 `migrations/postgresql/002_logto_identity.sql` 和 `003_logto_webhook_events.sql`。

## 发布平台

- API 引擎内置适配器注册表位于 `packages/api-publish-engine/src/index.js`，覆盖抖音、快手、知乎、百家号、微信公众号、视频号、微博等。
- YouTube、TikTok、Twitter 等 API 模式适配器位于 `packages/api-publish-engine/src/adapters/`。
- Python publisher 位于 `packages/python-backend/src/multi_publish/publishers/`，包括抖音、B 站、小红书等平台自动化。
- Electron RPA 服务和平台页面控制集中在 `apps/desktop/electron/services/` 与 `packages/rpa-engine/src/`。
- 平台能力、URL 与选择器基础配置位于 `config/platforms.yaml`。

## AI 与媒体供应商

- 模型适配器位于 `apps/desktop/electron/services/adapters/`，包含 OpenAI、Anthropic、OpenAI Image/TTS/Whisper 兼容接口。
- 模型供应商管理 UI 位于 `apps/desktop/src/views/ModelProviders.vue`。
- Python 图片与音频 provider 位于 `packages/python-backend/src/multi_publish/video_creation/providers/`。
- Remotion 合成位于 `packages/remotion-composer/`，Story2Video 逻辑位于 `packages/story2video-engine/`。
- FFmpeg/ffprobe 作为打包资源由 `apps/desktop/scripts/before-pack.js`、`.media-tools` 和 electron-builder `extraResources` 管理。

## 数据库与对象存储

- PostgreSQL 用于业务身份、entitlement 与迁移 ledger，Node repository 位于 `packages/api-publish-engine/src/auth/postgres-identity-repository.js`。
- 桌面 SQLite/WASM 存储使用 `sql.js`，实现位于 `apps/desktop/electron/services/sqlite-wrapper.js`。
- 阿里云 OSS 上传实现位于 `packages/api-publish-engine/src/oss-uploader.js` 和 `upload/providers/oss-provider.js`。
- Python 后端账号元数据当前仍写入本地 JSON，见 `packages/python-backend/src/server.py`。

## HTTP、Webhook 与回调

- 业务发布 HTTP API 位于 `packages/api-publish-engine/src/publish-api-server.js`，默认本地绑定 `127.0.0.1`。
- 通用发布 Webhook 位于 `packages/api-publish-engine/src/webhook-manager.js`，含 SSRF 回归测试。
- Logto Webhook 消费端位于 `packages/api-publish-engine/src/auth/logto-webhook.js`。
- 桌面实时回调服务位于 `apps/desktop/electron/services/callback-server.js`，默认端口合同记录在 `AGENTS.md`。
- 生产健康、readiness 与 smoke 工具位于 `packages/api-publish-engine/scripts/` 和 `deploy/logto/scripts/`。

## 更新、发布与观测

- 桌面自动更新使用 `electron-updater`，GitHub Releases 配置位于 `apps/desktop/package.json` 的 `build.publish`。
- GitHub Actions 在 `.github/workflows/` 执行构建、质量门禁、GUI、视觉和自主审查。
- Prometheus、Alertmanager 与 blackbox 配置位于 `deploy/logto/monitoring/`。
- 日志在 Electron 中经 `apps/desktop/electron/services/logger.js`，Python 中经 `multi_publish/core/logging_setup.py`。

## 凭据边界

- 仅把变量名和配置合同写入仓库；实际值应通过环境变量或系统凭据存储提供。
- 敏感变量模板集中在 `.env.example` 与 `deploy/logto/*.env.example`，不得把真实值写入地图或提交。
- 桌面凭据加密和恢复逻辑位于 `apps/desktop/electron/services/credential-store.js` 与身份服务目录。
