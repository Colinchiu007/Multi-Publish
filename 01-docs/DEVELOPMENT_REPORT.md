# PROJECT-003 多平台一键发布 — 开发报告

**最后更新**: 2026-07-30
**当前版本**: 2.3.53
**当前状态**: Story2Video Text 标准模式对齐与剩余工作树祖先关系整合已完成本地门禁

> 本文件顶部保留 2026-06-03 的历史基线；当前 Logto 用户系统交付以文末
> “2026-07-20：Logto 用户系统交付补充”为准。

---

## 2026-07-30：剩余工作树祖先关系整合

### 整合边界

- `codex/desktop-baseline-fixes@df36d6a` 的许可证权限和四类 STT 行为已由主线等价吸收；与 `main@df188100` 创建双父 merge commit 只闭合提交祖先关系，不回退主线产品实现。
- 6 个冲突路径均保留主线增强版本；冲突消解后的产品树与 `main` 无净差异。
- PR #345 的净差异仅为 CCG 任务记录、质量门禁和本开发报告，不包含产品代码、配置、依赖或运行时产物。

### 验证与流程

- 聚焦回归 9 files / 191 tests；Desktop 全量 335 files / 5839 tests；Fault 14/14、Monkey 5/5、Vue 1825 modules 和 preload 双 sandbox 均通过。
- Windows x64 QM-1 使用 electron-builder 25.1.8 / Electron 43.1.1 生成最终 NSIS/ASAR；离线 Chromium 610 files / 721,890,062 bytes，源码与产物逐文件哈希一致；随包 FFmpeg 编码、ffprobe 探测和完整解码通过。
- 污染开发环境变量下隐藏启动 10 秒，8 个本次进程存活且 stderr 0；`16521/8002/8013` 均归属本次进程树，精确清理后无 PID、端口或临时目录残留。stdout 中既有通用 Python backend、托盘图标/快捷键和 orchestrator 降级保持显式记录。
- 两个隔离本地复核无阻断项；用户明确选择暂不向 antigravity/Claude 外发审计差异，因此不把本次流程豁免记作 CCG 双模型通过。
- PR #345 最新 head 的 Doc Sync、单元测试/Lint、Windows/Linux build、Electron tests 和两组 Quality Gate 全部通过，并于 `2026-07-30T15:27:14Z` 以 merge commit `1539014` 合入 `main`。

---

## 2026-07-26：Story2Video Text 标准模式对齐

### 交付范围

- `story2video-compose` 只接受 `text`；`image/remix/gallery/audio/batch` 明确排除，不再作为待实现模式。
- 对齐文案、分句、提示词优化、图片/TTS Provider、字幕、BGM、动效、模板、输出版本、项目历史、结果交付和发布参数。
- 普通视频流水线继续支持文字、图片、音频和视频输入；结果页的分段编辑、旁白替换、STT、重试、裁剪和 ZIP 不因创作模式收敛而删除。

### 实现与数据合同

- Electron 适配层新增 `Story2VideoTextConfig` v1，在创建 run 前完成默认值、枚举、数值范围、text-only、敏感上下文和纯 JSON 白名单校验。
- CreateView 只为 Story2Video 展示文案输入，构造版本化嵌套配置，并以独立 `s2vOutputConfig` 隔离分辨率、FPS 和格式。
- PipelineEngine 仅在 `story2video-compose` 启动路径调用归一化器，再把参数映射到既有六阶段；共享 `StageExecutor`、`ServiceBus` 和普通 `pipelineStart` 未修改。
- Python YAML 收敛为 `required: [text]`、`supported_modes: [text]`，默认值和阶段 options 与 Electron 合同同步。
- 完成项目使用 manifest v2 保存白名单配置，BGM 先复制到受控项目目录；旧 manifest v1 保持可读。

### 整体架构影响评估

| 边界 | 影响 | 结论 |
|------|------|------|
| 普通视频流水线 | 不经过 Story2Video 归一化，原有 text/images/audio/video 参数继续进入既有 stage 映射 | 低风险，无流程变更 |
| `StageExecutor` / `ServiceBus` | 接口和实现均未修改 | 无架构变更 |
| Story2Video 调用方 | 旧图片、音频、视频创作输入会在创建 run 前失败 | 预期的合同收紧 |
| 项目持久化 | 新项目写 manifest v2；读取端继续接受 v1 | 低风险、向后兼容 |
| 外部服务 | 8002、8013、真实 Provider、发布账号、音色克隆、配额和公网分享仍在外部边界 | 不冒充本地完成 |

### 质量结果

- TDD text-only 边界：新增畸形媒体输入用例先 `3 failed`，实现后归一化器 `21/21` 通过；四个相关测试文件 `97/97` 通过。
- 新归一化器覆盖率：statements 84.31%、branches 76.57%、functions 100%、lines 89.31%。
- 故障注入 `14/14`、Monkey `5/5`、真实 ffmpeg MP4/WebM + BGM/水印/转场 `1/1`。
- 真实 YAML loader + JSON Schema 合同通过；当前可用 Python 环境缺少 pytest，未将直接 loader 验证写成 pytest 全套通过。
- Vue 生产构建通过（1825 modules），preload 在 `sandbox:true/false` 两种模式通过。
- Story2Video 详情页只出现“文案”输入；桌面和 390px 移动 viewport 无横向溢出或运行时错误；像素门禁 `17/17`。
- Windows x64 electron-builder 通过；关键文件进入 ASAR，从解包文件集加载 RPA 入口成功，应用 8 秒存活且 stderr 为空。
- 全桌面 coverage：323 files / 5720 tests 通过，5 files / 9 tests 失败。失败文件在本分支无 diff，分别是许可证环境判断 6 项和 STT 旧能力预期 3 项，作为基线阻断单独处理。

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

---

## 2026-08-04：蚁小二账号/发布 GUI E2E 收口

### 本轮变更

- 发布页标题、正文编辑器、发布目标、批量模式、提交按钮和进度区域补充稳定 `data-testid`；账号页添加账号和活动账号“验证”入口使用稳定选择器。
- `FunctionalRunner` 的首次挂载和重置路由就绪预算统一提升到 15 秒，覆盖 CI 首次 Vite 编译、Vue 异步挂载和平台/账号 fixture 加载。
- 发布集成流改用 feature-ready 条件、稳定选择器和 IPC 调用增量（baseline → increment）断言；离线缓存、恢复在线、空表单校验和 IPC 失败路径均等待真实 UI/IPC 结果后再判定。
- 修复路由结果页 query hash 等待、末尾斜杠 URL、页面链接扫描的非法 `Locator.filter({ visible })` 用法；同步迁移旧账号/发布 E2E 的过时 testid 合同。

### 验证证据

| 门禁 | 结果 |
|------|------|
| 账号/发布组件定向 Vitest | 3 files / 28 tests passed |
| 桌面完整 Vitest | 357 files / 6107 tests passed |
| 路由 functional E2E | 18/18 routes passed；发布 12/12、账号 14/14 |
| 跨页面集成流 | Flow 1–6 共 44/44 checks passed |
| Vite renderer/preload build | `npm run build:vue` exit 0 |
| 像素视觉门禁 | 17/17 passed |

### 2026-08-04 续作：账号排序与状态可见性合同

#### 本轮变更

- 账号 Store 增加名称、平台、添加时间、最后使用、粉丝数、登录状态六类排序字段，支持升序/降序；文本、日期、粉丝数统一归一化，缺失/非法值和相同值均有确定性处理。
- Accounts 视图增加 `account-sort` 字段选择器和 `account-sort-order` 方向按钮，排序发生在搜索/状态筛选后，平台、分组、负责人/发布人筛选沿用稳定结果。
- AccountManagementCard 为每个账号提供稳定卡片/状态/检查记录 testid、`role=status` 和可访问标签；状态分为已登录、已过期、异常、暂无检查记录，检查时间优先于错误原因。
- 对未知第三方状态保持 fail-closed 语义：不生成 Cookie、团队归属、检查结果或线上授权结论；未接入的团队分享仍显示禁用状态。

#### 续作验证证据

| 门禁 | 结果 |
|------|------|
| 账号 Store / Accounts / AccountManagementCard 定向 Vitest | 3 files / 151 tests passed |
| renderer/Vue 模板构建 | `npm run build:vue` exit 0；仅有既有动态导入和大 chunk warning |
| diff / 空白检查 | `git diff --check` passed |
| 外部双模型审查 | 未声称通过；需保留 wrapper 不可用证据并完成本地静态审查 |

该证据使用续作工作树的临时依赖 junction 运行，依赖目录未纳入提交；它证明本地 renderer/test 合同，不替代真实蚁小二账号授权、Cookie 恢复、第三方发布或安装包验收。

### 交付边界

上述结果证明本地 mock/fixture、渲染合同、IPC 调用和视觉基线一致；不等同于真实第三方账号授权、真实平台上传/发布、团队分享服务、跨设备同步或生产 Electron 安装包验收。Antigravity 与 Claude 外部审查本轮均不可用，原因分别记录为 `agy command not found in PATH` 与 Claude wrapper exit code 1。
