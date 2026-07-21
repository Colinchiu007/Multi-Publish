# PROJECT-003 多平台一键发布 — 开发报告

**最后更新**: 2026-07-20
**当前版本**: 2.3.53
**当前状态**: 蚁小二账号管理与内容发布对齐进入最终交付门禁

> 本文件顶部保留 2026-06-03 的历史基线；当前 Logto 用户系统交付以文末
> “2026-07-20：Logto 用户系统交付补充”为准。

---

## 2026-07-20 当前交付

### 交付范围

- 保持 Multi-Publish 顶部菜单和最左侧平台账号列表不变。
- 重构账号管理、内容发布、批量发布、草稿、排期和动态状态区域。
- 复用蚁小二逆向工程中的字段、状态和交互证据，不直接依赖其构建产物。

### 设计与代码分离

| 层级 | 责任 | 主要位置 |
|------|------|----------|
| 展示层 | 纯渲染、可访问性、用户事件 | `src/features/accounts`、`src/features/publish`、`views` |
| 用例层 | 页面状态、校验、流程编排 | `src/composables`、`src/stores` |
| Renderer API | Electron 能力统一入口和 fallback | `src/api/publisher.js` |
| Preload | 最小 IPC 能力暴露 | `electron/preload` |
| IPC 边界 | 来源校验、纯 JSON 契约、字段白名单 | `electron/ipc-handlers` |
| 领域服务 | 账号、队列、发布路由、二维码和存储 | `electron/services`、`electron/publishers` |

页面主路径不直接调用 `window.electronAPI`。账号公开数据与凭证数据分离：渲染层只能读取/写入公开元数据，凭证由主进程登录服务捕获并持久化。

### 完成功能

- 账号分组、收藏、搜索、筛选、排序、默认账号、批量删除和状态刷新。
- 内嵌浏览器登录、二维码登录、OAuth/API 登录入口。
- 单篇和批量多账号发布、定时排期、取消、重试和终态进度。
- 草稿完整往返、平台级差异化标题/正文、内容限制和预检。
- 任务队列 shutdown 取消等待/延迟/运行中任务；RPA 取消与成功响应竞态保护。
- IPC sender 校验、账号公开字段脱敏、渲染器账号写入白名单和路径参数校验。

### 质量状态

单元、覆盖率、故障注入、Monkey、E2E、视觉、preload sandbox 和变异测试已建立。本轮最终打包、ASAR、require 链、启动及完整回归的最新结果统一记录在 `.quality-gates.md`，未完成前不标记发布完成。

---

## 历史基线（2026-06-03，v0.1.1）

## 已完成内容

### 1. 项目骨架
- 目录结构完整（src/web/config/tests/data）
- PRD 文档（`PRD.md`）
- README 说明文档
- requirements.txt 依赖清单
- config.yaml 配置文件

### 2. 核心模块（src/multi_publish/）

| 模块 | 文件 | 状态 |
|------|------|------|
| 顶层导出 | `__init__.py` | ✅ v0.1.1 |
| 数据模型 | `models.py` | ✅ |
| 凭证加密 | `crypto.py` | ✅ |
| **账号持久化** | `account_store.py` | ✅ **新增** |
| 发布器管理器 | `core/publisher_manager.py` | ✅ |
| 任务队列 | `core/task_queue.py` | ✅ |
| 调度器 | `core/scheduler.py` | ✅ |
| 基础发布器接口 | `publishers/base.py` | ✅ |
| 微信公众号发布器 | `publishers/wechat_mp.py` | ✅ **正式发布支持** |

### 3. Web 服务（web/）

| 文件 | 状态 |
|------|------|
| FastAPI 服务 | `web/server.py` ✅ v0.1.1 |
| 首页 | `web/templates/index.html` ✅ |
| 发布页 | `web/templates/publish.html` ✅ |
| 账号管理页 | `web/templates/accounts.html` ✅ **CRUD 完整** |
| 任务列表页 | `web/templates/tasks.html` ✅ |
| 全局样式 | `web/static/style.css` ✅ |

### 4. 测试验证

```
[OK] 顶层导入 OK
[OK] models OK
[OK] crypto OK (AES-256 加密解密通过)
[OK] account_store OK (持久化存储测试通过)
[OK] publisher_manager OK
[OK] task_queue OK
[OK] scheduler OK
[OK] publishers/base OK
[OK] publishers/wechat_mp OK (正式发布接口已实现)
All core tests passed!
```

---

## 本期新增功能

### ✅ 账号持久化存储（P0）
- **模块**: `account_store.py`
- **存储**: JSON 文件（`data/accounts.json`）
- **加密**: PBKDF2-HMAC-SHA256 密钥派生 + AES-256
- **特性**: 原子写入、重启后自动加载、主密码固定密钥
- **API**: GET/POST/PATCH/DELETE `/api/accounts`

### ✅ 微信公众号正式发布（P0）
- **接口**: `cgi-bin/publish`（需要企业认证公众号）
- **流程**: 创建草稿 → 正式发布
- **权限检测**: 自动识别权限不足错误
- **fallback**: 正式发布失败时返回草稿信息
- **验证**: `validate()` 方法测试认证状态

---

## API 端点清单

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/` | 首页 |
| GET | `/publish` | 发布页面 |
| GET | `/accounts` | 账号管理页面 |
| GET | `/tasks` | 任务列表页面 |
| GET | `/api/health` | 健康检查 |
| POST | `/api/publish` | 发布内容（支持定时） |
| GET | `/api/tasks` | 列出任务 |
| GET | `/api/tasks/{id}` | 获取单个任务 |
| POST | `/api/tasks/{id}/cancel` | 取消任务 |
| POST | `/api/tasks/{id}/retry` | 重试任务 |
| GET | `/api/schedules` | 列出调度 |
| DELETE | `/api/schedules/{id}` | 删除调度 |
| POST | `/api/schedules/{id}/pause` | 暂停调度 |
| POST | `/api/schedules/{id}/resume` | 恢复调度 |
| **GET** | `/api/accounts` | 列出账号（支持过滤） |
| **POST** | `/api/accounts` | 添加账号（持久化） |
| **PATCH** | `/api/accounts/{id}` | 更新账号 |
| **DELETE** | `/api/accounts/{id}` | 删除账号 |
| **POST** | `/api/accounts/{id}/validate` | 验证账号配置 |
| WebSocket | `/ws` | 实时进度推送 |

---

## 启动方式

```bash
cd C:\Users\邱领\.qclaw\workspace\team\projects\PROJECT-003-multi-publish
$env:PYTHONPATH="src;" + $env:PYTHONPATH
python -m uvicorn web.server:app --host 0.0.0.0 --port 8082
```

访问: http://localhost:8082

---

## Phase 1 完成情况

| 任务 | 说明 | 状态 |
|------|------|------|
| ✅ 账号持久化存储 | JSON 文件 + PBKDF2 加密 | **完成** |
| ✅ 微信公众号正式发布 | `cgi-bin/publish` 接口 | **完成** |
| ⏳ 与 PROJECT-001 集成 | 在 content-aggregator 中添加一键发布按钮 | 待完成 |
| ⏳ 真实端到端测试 | 需要企业认证公众号的 AppID/AppSecret | 待完成 |

---

## Phase 2 计划

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 格式适配器 | Markdown → 各平台格式转换 | P1 |
| 封面图处理 | 自动裁剪/压缩/上传 | P1 |
| 批量发布队列 | 多任务并行处理 | P2 |

---

## 技术要点

1. **发布器接口标准化**: 所有平台发布器继承 `BasePublisher`，统一 `publish()`/`validate()`/`close()` 接口
2. **凭证加密**: AES-256（Fernet），PBKDF2 密钥派生，`enc:` 前缀自动识别
3. **账号持久化**: JSON 文件存储，原子写入（tmp + rename），重启自动加载
4. **任务队列**: 异步并发控制（Semaphore），支持取消/重试
5. **调度器**: 一次性定时 + 周期性调度，5秒轮询检查
6. **微信正式发布**: `draft/add` → `publish` 流程，权限错误自动检测

---

## 微信公众号 API 权限说明

| 接口 | 权限要求 | 当前状态 |
|------|----------|----------|
| `cgi-bin/token` | 所有公众号 | ✅ 已实现 |
| `cgi-bin/draft/add` | 所有公众号 | ✅ 已实现 |
| `cgi-bin/publish` | **企业认证公众号** | ✅ 已实现 |

**注意**: 个人公众号无法使用 `publish` 接口，只能保存草稿手动发布。

---

## 2026-07-20：Logto 用户系统交付补充

**分支**：`codex/logto-user-system`
**需求版本**：PRD v2.4.0-logto
**架构**：`01-docs/ARCH-F14-logto-user-system.md`
**状态**：本地实现与工程门禁完成；生产集成验收待真实租户/数据库

### 交付范围

1. Electron 登录：PKCE、固定回环回调、safeStorage、恢复/刷新/退出/切换状态机、IPC/preload/Pinia/UI。
2. API 身份：Node/Python JWT/JWKS 验证、统一错误语义、`sub` lazy upsert 和跨用户隔离。
3. 权益与用量：服务端 entitlement、RSA 离线快照、原子额度扣减、本地 license 降权兼容。
4. 运维：PostgreSQL 迁移、Webhook 事务消费、Logto 1.41.0 Compose、环境变量和回滚说明。

### 质量结果

- Desktop coverage：285 files、5007 tests；68.37% statements / 60.59% branches / 69.86% functions / 70.51% lines。
- Node API：61 个测试分组全部通过；Python：2503 passed、1 skipped。
- 故障注入 14/14、Monkey 5/5、视觉 16/16、身份 mock E2E 两个 viewport。
- Preload 在真实 Electron 的 `sandbox:true/false` 两种模式下通过；Windows 打包 exit 0，ASAR 身份文件、敏感文件扫描、require 链和应用 8 秒启动通过。
- 两轮独立安全/代码复审未报告 CRITICAL/MAJOR，范围与结果记录在 `TEST-PLAN-LOGTO.md` 第 7 节；最终新增 IPC 与 Webhook 防护完成 RED -> GREEN。
- API Key 边界完成 RED -> GREEN：历史 pending 定时任务即使跨重启恢复，也会在发布前返回 `SCHEDULE_OWNER_REVOKED`；未托管静态 Key 返回 `SCHEDULE_OWNER_INVALID`；Key 存储损坏时返回 `API_KEY_STORE_UNAVAILABLE` 且不覆盖原文件。
- 最终在独立干净工作树复验 Node API；修复旧异步测试假绿、配置化平台识别和 Webhook SSRF 测试合同后，61 个测试分组与 Vitest 8 files / 24 tests 全部通过。
- Stryker 完整 1505 mutants 在本机负载上限内未完成；`identity-errors.js` 专属分片 90%，完整限制已记录在测试计划。

### 未关闭的外部验收

- 真实 Logto 租户登录、刷新轮换、退出、账号切换和 Webhook 投递。
- 真实 PostgreSQL 迁移、并发 lazy upsert、事务回滚和额度压力测试。
- 身份 E2E 当前使用浏览器注入 mock bridge，不能替代真实 Electron + Logto 验收。
