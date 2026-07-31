---
mapped_date: 2026-07-31
last_mapped_commit: 8001685ead710cab7f34ab9def5d0d98e929b3f3
working_tree_has_changes: true
scope: full-repo
---

# 风险与技术债

## 高风险安全边界

- 身份链同时实现 JWT、Opaque Token introspection、JWKS、Webhook、entitlement 和桌面离线恢复，跨 Node/Python/Electron；关键路径在 `packages/api-publish-engine/src/auth/`、`packages/python-backend/src/multi_publish/auth/` 和 `apps/desktop/electron/services/identity/`。
- `packages/api-publish-engine/src/publish-api-server.js` 超过 1000 行，同时承担 HTTP、认证、API Key、限流、排期、审计与 readiness，变更爆炸半径大。
- Electron preload/IPC 是本地权限边界；`apps/desktop/electron/preload/`、`ipc-handlers/` 与 `window.js` 的改动必须真实打包验证。
- 扫描时未提交的 `electron/startup-compat.js` 改写 userData/session/cache 路径和 Windows GPU 默认值；若最终合入，调用时机或目录选择错误会影响登录态、缓存与启动稳定性。
- 平台账号 Cookie、OAuth Token、主密钥和 API Key 属高敏感数据，迁移和文件替换错误可能导致不可恢复或越权。

## 大文件与复杂度热点

- `packages/python-backend/src/multi_publish/video_creation/providers/video/video_compose.py` 超过 2500 行，是最大实现热点。
- `apps/desktop/src/views/CreateView.vue` 约 1500 行，`ModelProviders.vue` 超过 1100 行，页面职责偏重。
- `apps/desktop/electron/services/pipeline-engine.js` 与 `story2video-compose-engine.js` 接近或超过 1000 行。
- `packages/python-backend/src/multi_publish/publishers/douyin.py` 约 900 行，平台 DOM 变化会造成脆弱回归。
- 大量测试文件也超过 800 行，说明合同覆盖丰富，但失败定位和维护成本较高。

## 状态与数据一致性

- `packages/python-backend/src/server.py` 明确保留进程内 `_publish_tasks`/`_publish_progress`，重启会丢失。
- Python 账号元数据仍使用本地 JSON，与桌面 SQL.js、API PostgreSQL 并存，存在多存储事实源。
- API Key 文件只支持单 writer，不代表共享卷横向扩容；生产扩容前需迁移到事务型共享存储。
- 身份 migration、Webhook ledger、离线 entitlement 与本地凭据恢复存在跨进程时间和顺序一致性风险。

## 外部系统脆弱性

- RPA publisher 依赖第三方页面 DOM、选择器、登录态和反自动化策略，平台升级可能无代码提示地破坏流程。
- Logto Webhook POST 重试依赖固定上游版本和运行时补丁，升级 `svhd/logto` 时必须重新验证哈希与行为。
- OpenAI/Anthropic/平台 API 的模型名、配额、响应结构和网络错误需要 adapter 层持续兼容。
- Windows 打包依赖 Electron、Playwright Chromium、FFmpeg/ffprobe、ASAR 与 workspace junction，环境差异大。

## 构建与仓库体积

- OCR 训练数据、截图、HTML 手册和基准图是较大的 Git 跟踪资产，增加 clone、CI artifact 与审查成本。
- `01-docs/learnings.md` 与 `.quality-gates.md` 已非常庞大，新增证据容易使当前有效门禁被历史记录淹没。
- `apps/desktop/electron/preload/index.bundle.js` 是生成文件，源码与 bundle 漂移必须由构建和完整性测试阻止。
- Electron 产物必须确认 workspace junction 指向当前分支，避免借用其他 worktree 源码生成错误证据。

## 测试与流程风险

- 主 Vitest 配置排除视觉、E2E 和部分 bridge 测试，单一 `npm test` 不能证明 GUI、IPC 和打包产物可用。
- 视觉基准对字体、DPI、浏览器版本和渲染时序敏感，更新 baseline 需要人工审核 diff。
- 外部身份、真实平台账号、ECS 和 Windows GUI 验收依赖凭据/环境，CI 可能只能执行 Shadow 或合同测试。
- 测试默认单 worker 降低竞态噪音，但可能隐藏真实并发和锁竞争问题；关键锁已有专项并发测试时仍需保留。

## 当前映射快照限制

- 扫描期间工作树被其他会话切换到 `codex/trellis-daily-development`，并存在业务文件未提交改动。
- frontmatter 记录的是 HEAD `8001685ead710cab7f34ab9def5d0d98e929b3f3`，正文同时参考了当前未提交工作树。
- 因策略禁止向外部模型导出私有仓库，本轮未完成 antigravity/Claude 双模型分析；由主代理本地扫描降级完成。
- 提交地图前应先确认其他会话已停止切换分支，并重新运行 `git status`、路径抽查和密钥扫描。
