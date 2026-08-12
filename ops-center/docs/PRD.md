## 变更日志（2026-08-10）

- 预设模型目录扩展至 53 项，数据来源=Multi-Publish 桌面端代码事实（适配器端点/种子模型/静态限流表）；limit_per_5h 与 models_url 无代码事实 → 置空由运营填写；新增目录一致性测试。
# OpsCenter — 运营配置中心 PRD v0.1

> 项目 012 / 一站式运营配置后台
> 状态：规划中 | 目标：消除 SSH + 手改 YAML 的运维模式

---

## 1. 产品概述

### 1.1 一句话定义

统一管理 9 个子项目所有配置、参数、凭据、功能开关的一站式运营后台。不依赖它也能运转，有了它不用再 SSH 进服务器改文件。

### 1.2 目标用户

| 用户 | 场景 | 需求 |
|------|------|------|
| 平台运营者 | 日常开关功能、调整参数 | Web UI 一键操作，不用懂服务器 |
| 开发者 | 调试、灰度、配置排障 | 快速定位配置变更历史，对比差异 |
| 系统自动 | 服务启动时拉取最新配置 | API 拉取，本地缓存兜底 |

### 1.3 解决的核心问题

**当前痛点：**
- 功能开关要 SSH 上 ECS，`vim feature_gates.yaml`，改完还得重启服务
- AI 提供商 API Key 散落在 4 个项目的 .env / config.yaml 里，过期了不知道哪个受影响
- 发布平台 cookie/token 过期后，排查是哪个平台、哪个服务用的哪个 key 极其耗时
- 改了个参数（如 SSS 的 max_input_length），过两周忘了改过，出事时无从追溯

**目标体验：**
- 打开网页 → 看到所有项目的所有配置 → 点一下开关 → 30 秒内全服务生效
- 任何配置变更都有记录：谁、什么时候、改了什么、改之前是什么
- 敏感信息（Key、Token）加密存储，UI 上默认掩码

### 1.4 核心设计原则

| 原则 | 说明 |
|------|------|
| **非侵入** | 没有 OpsCenter 时，所有项目照常运行。配置变更的生效依赖各项目已有的配置重载机制 |
| **单一事实源** | 运营配置以 OpsCenter DB 为准，各项目的本地配置文件是只读缓存 |
| **最小权限** | 敏感配置（密钥类）与普通配置（开关类）分权管理，操作日志全记录 |
| **渐进收敛** | 不要求一次性迁移所有配置。先从功能开关做起，逐步覆盖 |
| **独立部署** | 不影响现有项目的前端和 API，作为一个新服务独立存在 |

---

## 2. 当前配置审计（9 项目全景）

> 基于 2026-07-01 全项目代码审计。

### 2.1 配置散落矩阵

| 项目 | 配置形式 | 配置项数 | 有管理 UI | 有鉴权 | 变更生效方式 |
|------|---------|---------|----------|--------|-------------|
| platform-orchestrator | .env (PO_) + feature_gates.yaml | ~30 | 部分（admin/users, admin/providers） | ✅ JWT | 重启服务 |
| trendscope | .env (TS_) + DB 平台凭证 + sensitive_words.json | ~25 | ✅ Vue3 SPA（仪表盘/平台/用户/API Keys） | ✅ JWT admin | 重启服务 |
| content-aggregator | .env | ~8 | ❌ | ❌ | 重启服务 |
| prompt-engine | config.yaml + ${ENV_VAR} | ~20 | ❌ | ❌ | 重启服务 |
| smart-sentence-splitter | YAML + 代码默认值 | ~30 | ❌ | ❌ | 重启服务 |
| Story2Video | Supabase user_settings 表 + .env | ~5 | 部分（ApiSettingsDialog） | ✅ Supabase | 页面刷新 |
| Multi-Publish | config.yaml + platforms.yaml (17平台) | ~40 | ❌ | ❌ | 重启应用 |
| unified-frontend | NEXT_PUBLIC_API_URL | ~2 | 部分（settings, admin/users, admin/providers） | ✅ JWT | 重新构建 |
| content-aggregator-shared | YAML + env var | ~5 | ❌ | ❌ | 重启服务 |

### 2.2 需要收敛的配置分类

| 类别 | 当前存放位置 | 数量 | 变更频率 | 敏感度 | OpsCenter 优先级 |
|------|------------|------|---------|--------|-----------------|
| **功能开关** | orchestrator/feature_gates.yaml | 20 个 | 高（每迭代） | 低 | **P0** |
| **AI Key** | orchestrator .env + prompt-engine config.yaml | 6+ 家 | 中（过期/轮换） | 🔴 高 | **P0** |
| **发布平台凭证** | Multi-Publish platforms.yaml + trendscope DB | 17+ 平台 | 中（cookie 过期） | 🔴 高 | P1 |
| **项目运行参数** | SSS YAML + prompt-engine config + aggregator .env | ~50 | 低 | 低 | P2 |
| **环境级配置** | 各项目 .env（DB URL / Redis / JWT Secret） | ~20 | 极低 | 🔴 高 | P3 |
| **前端配置** | unified-frontend env | ~2 | 极低 | 低 | P3 |

---

## 3. 架构设计

### 3.1 系统定位

```
┌─────────────────────────────────────────────────────────────┐
│                      OpsCenter                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ 配置管理  │  │ 密钥管理  │  │ 开关管理  │  │ 审计日志     │ │
│  │ CRUD API │  │ 加密存储  │  │ 即时生效  │  │ 变更追溯     │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│       └──────────────┴─────────────┴───────────────┘        │
│                          │  Config DB (SQLite)               │
└──────────────────────────┼──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                 ▼
   REST API ( pull )  Config File Gen  Webhook ( push )
   各服务启动时拉取    写入共享 volume    通知服务重载配置
```

### 3.2 配置传播机制（三层兜底）

```
Layer 1 — API 拉取（推荐）
  服务启动 → GET /api/v1/config/{project} → OpsCenter DB
  ├── 成功 → 使用最新配置
  └── 失败 → 进入 Layer 2

Layer 2 — 配置文件缓存
  各项目本地 config.yaml / feature_gates.yaml
  ├── 由 OpsCenter 定期写入（cron 每 5 分钟）
  └── 项目已有配置热重载机制（如 orchestrator 的 mtime watch）

Layer 3 — 硬编码默认值
  配置文件不存在或解析失败
  └── 使用代码内置的 DEFAULT_CONFIG（各项目已有）
```

**关键理解**：OpsCenter 不替代各项目的配置加载机制，而是作为配置的「编辑器和分发器」。各项目保持自己的配置加载逻辑不变，只是配置文件的来源从「人工 SSH 编辑」变成「OpsCenter 自动生成」。

### 3.3 不破坏现有项目的保证

- **网络隔离**：OpsCenter 不可用时，各项目使用本地配置文件（已存在），完全不受影响
- **格式兼容**：生成的配置文件格式与各项目当前格式 100% 兼容（YAML 还是 YAML，env 还是 env）
- **不修改代码**：各项目不需要引入新的 SDK 或依赖，除非主动选择 API 拉取模式
- **渐进迁移**：可以先只迁移功能开关，看效果再逐步迁移其他配置

### 3.4 技术选型建议

| 层 | 选型 | 理由 |
|----|------|------|
| 后端框架 | FastAPI (Python 3.12+) | 与现有项目技术栈一致，async 支持好 |
| 数据库 | aiosqlite (WAL 模式) | 与 orchestrator 一致，零运维，够用 |
| 前端 | Vue 3 + Element Plus | 与 TrendScope admin 一致，可复用组件 |
| 构建工具 | Vite | 与 TrendScope admin 一致 |
| 加密 | Python cryptography (Fernet) | 对称加密，密钥由环境变量注入 |
| 部署 | 独立 uvicorn 进程 on ECS | 端口 8010，nginx 反代 |

---

## 4. 数据模型

### 4.1 核心表设计

```sql
-- 配置项主表
CREATE TABLE config_items (
    id          TEXT PRIMARY KEY,           -- "orchestrator.feature_gates.video_full_pipeline"
    project     TEXT NOT NULL,              -- "platform-orchestrator"
    category    TEXT NOT NULL,              -- "feature_flag" | "api_key" | "platform_credential" | "project_param" | "env_var"
    key         TEXT NOT NULL,              -- "video_full_pipeline"
    value       TEXT NOT NULL,              -- JSON-encoded value
    value_type  TEXT NOT NULL DEFAULT 'string',  -- "string" | "boolean" | "number" | "json" | "secret"
    description TEXT,
    is_secret   INTEGER NOT NULL DEFAULT 0, -- 1 = 加密存储
    is_required INTEGER NOT NULL DEFAULT 0,
    default_value TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    updated_by  TEXT
);

-- 变更审计日志
CREATE TABLE config_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id   TEXT NOT NULL,
    old_value   TEXT,                       -- JSON
    new_value   TEXT,                       -- JSON
    changed_by  TEXT NOT NULL,
    changed_at  TEXT NOT NULL,
    change_type TEXT NOT NULL,              -- "create" | "update" | "delete"
    source_ip   TEXT
);

-- 项目注册表
CREATE TABLE projects (
    code        TEXT PRIMARY KEY,           -- "platform-orchestrator"
    name        TEXT NOT NULL,              -- "Platform Orchestrator"
    description TEXT,
    config_file_path TEXT,                  -- ECS 上的配置文件路径
    config_format    TEXT DEFAULT 'yaml',   -- "yaml" | "env" | "json"
    enabled     INTEGER NOT NULL DEFAULT 1
);

-- 配置组（用于批量操作，如"导出所有 AI Key"）
CREATE TABLE config_groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT
);

CREATE TABLE config_group_items (
    group_id    TEXT NOT NULL,
    config_id   TEXT NOT NULL,
    PRIMARY KEY (group_id, config_id)
);
```

### 4.2 配置 ID 命名规范

```
{project_code}.{category}.{key}

示例:
  orchestrator.feature_flag.video_full_pipeline
  orchestrator.api_key.openai
  multi-publish.platform_credential.bilibili_cookie
  sss.project_param.max_input_length
  prompt-engine.project_param.default_platform
```

### 4.3 加密策略

- `is_secret=1` 的配置项，value 用 Fernet 对称加密后存储
- 加密密钥 `OPS_ENCRYPTION_KEY` 通过环境变量注入，不存 DB
- API 返回时，secret 类配置默认掩码（`sk-***a1b2`），需额外鉴权才能查看明文
- 导出配置文件时自动解密写入

---

## 5. 功能规格（分版本）

### 5.1 V0.1 — 功能开关管理（P0 痛点）

**范围**：只管理 `feature_gates.yaml` 中的 20 个开关

**功能点：**
- [ ] 开关列表（表格：名称、描述、当前状态、适用 tier、最后修改时间）
- [ ] 开关详情（描述、适用项目、依赖关系）
- [ ] 一键启用/禁用
- [ ] 按 tier 筛选（tier 1/2/3）
- [ ] 批量操作（启用全部 tier-1 开关等）
- [ ] 变更确认弹窗（含影响说明）
- [ ] 保存后自动生成 `feature_gates.yaml` 并写入 ECS 共享路径
- [ ] orchestrator 的 mtime watch 检测到文件变化 → 自动热重载（已有机制）
- [ ] 审计日志：谁、什么时候、改了哪个开关、旧值→新值

**不包含：**
- 新增/删除开关（开关定义由代码控制）
- 开关依赖关系自动检测

**完成标准：** 打开网页 → 切换 `video_full_pipeline` → 30 秒内 ECS 上 orchestrator 生效，无需重启

### 5.2 V0.2 — 官方内置 AI Key 管理（P0）

**范围**：管理平台运营方的官方内置 LLM Key。⚠️ 注意区分：这是**运营后台**的 Key 管理，
不是用户自己配 Key 的前台设置。用户自有 Key 的管理在 unified-frontend 会员前台实现。

两套 Key 体系的区分见 [定价策略 & 用户分级设计](pricing-strategy.md)。

**功能点：**
- [ ] 官方 Key 的 CRUD（多 Provider：OpenAI、豆包、Minimax、Deepseek、Kling 等）
- [ ] Key 掩码显示（`sk-***a1b2`），二次确认查看明文
- [ ] Key → Tier 访问映射：哪些 Key 供免费用户用，哪些供付费用户用
- [ ] Key 过期提醒（到期前 7 天告警）
- [ ] 「测试连接」按钮（调用对应 API 验证 Key 可用）
- [ ] 配置导出：生成 prompt-engine / orchestrator 需要的 Key 配置
- [ ] 成本监控仪表盘（按 Provider 的预估月成本）

**不包含（这些是会员前台/其他模块的范围）：**
- ❌ 用户自有 Key 的 CRUD（已在 unified-frontend Settings/Providers 页）
- ❌ 用户配额管理（已在 orchestrator user_usage 表）
- ❌ Key 自动轮换
- ❌ 支付集成（微信/支付宝）

### 5.3 V0.3 — 发布平台凭证管理（P1）

**范围**：管理 17 个发布平台的 token/cookie/secrets

**功能点：**
- [ ] 平台列表（B站、抖音、小红书、视频号、YouTube 等）
- [ ] 每个平台的认证信息（cookie、token、app_id、app_secret）
- [ ] Cookie 过期检测（手动触发验证）
- [ ] 批量导出 platforms.yaml
- [ ] 平台启用/禁用开关
- [ ] 与 Multi-Publish 和 orchestrator 的 cloud-publisher 对齐字段

### 5.4 V0.4 — 项目级运行参数（P2）

**范围**：各项目的内部可调参数

**示例参数：**
| 项目 | 参数 |
|------|------|
| SSS | max_input_length, enable_era, target_seconds, speech_rate |
| prompt-engine | default_platform, default_style, max_retries |
| content-aggregator | provider, model, timeout |
| orchestrator | queue_max_concurrent, publish_interval_minutes |

**功能点：**
- [ ] 参数列表（按项目分组）
- [ ] 参数编辑（类型校验：number/string/boolean/enum）
- [ ] 默认值展示和重置
- [ ] 参数说明/文档内联展示
- [ ] 变更历史对比（diff 视图）

### 5.5 V0.5 — 配置版本化与回滚（P2）

**功能点：**
- [ ] 配置快照：手动创建全量配置快照
- [ ] 快照对比：选择两个快照，查看差异
- [ ] 一键回滚：从快照恢复配置
- [ ] 配置导入/导出：JSON 格式，可跨环境迁移
- [ ] 变更审批流（可选）：敏感配置变更需要二次确认

### 5.6 V0.6 — 环境级配置只读视图（P3）

**范围**：展示但不编辑环境变量（DB URL / Redis / JWT Secret 等）

**功能点：**
- [ ] 各项目环境变量只读列表（掩码敏感值）
- [ ] 配置一致性检查（如 JWT Secret 跨项目是否一致）
- [ ] 缺失配置告警（如某项目缺了必要环境变量）
- [ ] 配置文档自动生成（Markdown 格式）

---

## 6. API 设计

### 6.1 配置管理 API

| 端点 | 方法 | 说明 | 鉴权 |
|------|------|------|------|
| `/api/v1/config/{project}` | GET | 获取项目全部配置 | JWT |
| `/api/v1/config/{project}/{category}` | GET | 获取某类配置 | JWT |
| `/api/v1/config/{project}/{category}/{key}` | GET | 获取单个配置 | JWT |
| `/api/v1/config/{project}/{category}/{key}` | PUT | 更新配置 | JWT admin |
| `/api/v1/config/batch` | PUT | 批量更新配置 | JWT admin |
| `/api/v1/config/{project}/export` | GET | 导出为配置文件格式 | JWT admin |
| `/api/v1/config/audit-log` | GET | 查询变更日志 | JWT admin |
| `/api/v1/config/snapshots` | POST | 创建配置快照 | JWT admin |
| `/api/v1/config/snapshots/{id}/restore` | POST | 从快照恢复 | JWT admin |

### 6.2 密钥管理 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/secrets/{project}/{key}` | GET | 获取密钥（掩码） |
| `/api/v1/secrets/{project}/{key}/reveal` | POST | 查看明文（需二次确认） |
| `/api/v1/secrets/{project}/{key}` | PUT | 更新密钥 |
| `/api/v1/secrets/{project}/{key}/test` | POST | 测试密钥可用性 |

### 6.3 健康与同步 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/sync/{project}` | POST | 强制生成并推送配置文件 |
| `/api/v1/sync/status` | GET | 查看各项目配置同步状态 |
| `/health` | GET | 健康检查 |

### 6.4 认证方案

- 复用 orchestrator 的 JWT 体系（共享 `PO_SECRET_KEY`）
- Admin 操作需要 `role: admin`
- 查看密钥明文需要额外二次确认（前端输入密码或 OTP）
- 可选：IP 白名单限制（仅 ECS 内网 + 指定公网 IP 可访问）

**鉴权分级（2026-08-09 修订，与 model-presets 语义对齐）**：

| 资源 | 已登录（任意 role） | Admin（role=admin） |
|------|--------------------|--------------------|
| 模型预设目录读取（`GET /api/v1/model-presets`，默认不含隐藏项） | ✅ | ✅ |
| 模型预设目录读取含隐藏项（`include_hidden=true`） | ❌ 403 | ✅ |
| 模型预设新增/编辑/删除 | ❌ 403 | ✅ |
| 环境变量只读视图 / 一致性检查 | ✅ | ✅ |
| 配置项读取（项目配置、feature-gates） | ✅ | ✅ |
| 配置项写入 / 批量 / 密钥写 / 快照写 | ❌ 403 | ✅ |

> 说明：orchestrator 登录签发的 JWT 不含 `role` 字段，因此普通登录用户天然是「只读」角色；
> 运营管理写操作依赖带 `role: admin` 的 token（由 orchestrator API Key 路径或运营侧签发）。

**环境一致性检查语义（2026-08-09 修订）**：
- 检查对象是 ops-center 进程内可观察的环境变量（`PO_SECRET_KEY`/`TS_SECRET_KEY` 等）。
- 变量未配置 → `status=unknown`（不计为缺陷；这些密钥属于 orchestrator/trendscope 各自进程）。
- 已配置且一致 → `status=ok`；已配置但不一致 → `status=mismatch`（passed=false）。
- 前端对 `unknown` 展示「未配置」标签，不再误报「✗ 未通过」。

---

## 7. 前端设计

### 7.1 技术栈

| 层 | 选型 |
|----|------|
| 框架 | Vue 3 (Composition API) |
| UI 库 | Element Plus |
| 构建 | Vite |
| 状态 | Pinia |
| 路由 | Vue Router |

### 7.2 页面结构

```
OpsCenter
├── /                          # 首页 — 全局仪表盘
│   ├── 配置概览卡片（项目数、开关数、Key 数）
│   ├── 最近变更时间线
│   └── 配置健康检查结果
├── /feature-flags             # 功能开关管理（V0.1 核心）
│   ├── 开关列表 + 筛选
│   └── 开关详情弹窗
├── /projects                  # 项目列表（V0.1+，2026-08-09 实现）
│   ├── 项目表格（代码/名称/描述/格式/状态）
│   └── 点击项目 → 该项目配置项只读表格（普通登录只读；编辑需 admin，见 6.4）
├── /secrets                   # 密钥管理（V0.2）
│   ├── 提供商列表
│   └── 密钥编辑弹窗
├── /platforms                 # 平台凭证（V0.3）
├── /audit-log                 # 审计日志（2026-08-09 实现）
│   ├── 变更记录表格（配置 ID/类型/旧值/新值/操作人/时间）
│   ├── 按配置 ID 过滤
│   └── 变更详情（diff 视图，后续迭代）
├── /snapshots                 # 配置快照（V0.5）
└── /settings                  # OpsCenter 自身设置
```

### 7.3 关键交互

- **开关切换**：Switch 组件 + 确认弹窗（含影响说明） → 即时生效
- **密钥编辑**：Input type=password + 显示/隐藏切换 + 复制按钮
- **批量操作**：表格多选 + 批量编辑/导出
- **实时反馈**：操作后 Toast 通知 + 同步状态指示

---

## 8. 部署方案

### 8.1 ECS 部署架构

```
ECS (Aliyun Linux 3, 4G)
├── nginx (80/443)
│   ├── /api/         → orchestrator:8000
│   ├── /trendscope/  → trendscope:8001
│   ├── /sss/         → sss:8002
│   ├── /prompt/      → prompt-engine:8013
│   └── /ops/         → ops-center:8010          ← 新增
├── ops-center (uvicorn, port 8010)              ← 新增
│   ├── SQLite: /data/ops-center/config.db       ← 新增
│   └── Config file output: /data/configs/       ← 新增（共享目录）
├── orchestrator:8000
├── trendscope:8001
├── sss:8002
└── prompt-engine:8013
```

### 8.2 配置文件输出路径

OpsCenter 生成的配置文件写入 `/data/configs/`，各项目通过符号链接或挂载读取：

```
/data/configs/
├── orchestrator/
│   ├── feature_gates.yaml
│   └── .env.ai_keys
├── trendscope/
│   └── platform_credentials.env
├── multi-publish/
│   ├── platforms.yaml
│   └── config.yaml
├── prompt-engine/
│   └── config.yaml
├── sss/
│   └── config.yaml
└── content-aggregator/
    └── .env
```

### 8.3 环境变量

```bash
# OpsCenter 自身
OPS_ENCRYPTION_KEY=xxx          # Fernet 密钥，用于加密存储敏感配置
OPS_SECRET_KEY=xxx              # JWT 签名密钥（与 orchestrator 共享 PO_SECRET_KEY）
OPS_DB_PATH=/data/ops-center/config.db
OPS_CONFIG_OUTPUT_DIR=/data/configs
OPS_ADMIN_IPS=xxx               # 可选：管理后台 IP 白名单
```

---

## 9. 迁移计划

### 9.1 零风险迁移策略

**原则**：每一步都保证「回退到手动模式」不受影响。

| 阶段 | 内容 | 风险 | 回退方式 |
|------|------|------|---------|
| Step 0 | 部署 OpsCenter，导入现有配置（只读模式） | 无 | 删除服务即可 |
| Step 1 | 开启配置生成（写入 `/data/configs/`），各项目**不读取**新路径 | 极低 | 删除生成的文件 |
| Step 2 | 选 orchestrator 做试点，将其 `feature_gates.yaml` 路径指向 `/data/configs/` | 低 | 改回原路径 |
| Step 3 | 在 OpsCenter 中修改一个开关，验证 orchestrator 热重载生效 | 低 | 手动改回 |
| Step 4 | 逐步迁移其他项目和配置类别 | 中 | 逐项目回退 |
| Step 5 | 关闭各项目的旧配置文件，全量由 OpsCenter 管理 | 中 | 恢复旧文件 |

### 9.2 配置初始化

首版部署时，运行初始化脚本 `seed_config.py`，从各项目现有配置文件读取内容导入 OpsCenter DB。

```bash
python scripts/seed_config.py --project orchestrator --source /path/to/feature_gates.yaml
python scripts/seed_config.py --project orchestrator --source /path/to/.env --type env
# ... 逐个导入
```

---

## 10. 风险与限制

| 风险 | 影响 | 缓解 |
|------|------|------|
| OpsCenter 宕机 | 无法通过 Web 修改配置 | 各项目使用本地缓存配置文件，不受影响 |
| 配置写入错误 | 项目加载到错误配置 | 配置生成前做 schema 校验；生成后保留旧文件备份 |
| 加密密钥丢失 | 无法解密已存储的 Key | `OPS_ENCRYPTION_KEY` 备份；Key 从各项目 .env 可恢复 |
| 多服务配置不一致 | A 服务用了新配置，B 还是旧的 | 配置生成时带版本号；各服务启动日志记录加载的配置版本 |
| 权限失控 | 误操作改了关键配置 | 审计日志全记录；敏感操作二次确认；快照回滚 |

---

## 11. 排除项（明确不做）

- **不替代各项目的前端功能**：TrendScope 管理后台、unified-frontend 设置页保持不变
- **不做监控告警**：已有 `ecs-monitor` 脚本，不重复建设
- **不做部署编排**：不管理各项目的启动/停止/重启
- **不做用户管理**：用户系统由 orchestrator 统一管理
- **不做配置模板市场**：不搞「一键导入最佳配置」
- **不做多环境管理**：首版只管理 ECS 生产环境
- **不做配置 A/B 测试**：开关只管 on/off，不做流量分配

---

## 12. 配套文档

- [定价策略 & 用户分级功能设计](pricing-strategy.md) — 会员等级、配额体系、双 Key 架构、成本估算

## 13. 与其他项目的关系

```
OpsCenter  ←→  platform-orchestrator  (JWT 共享，读取 feature_gates)
OpsCenter  ←→  trendscope             (平台凭证导出)
OpsCenter  ←→  Multi-Publish          (平台配置导出)
OpsCenter  ←→  prompt-engine          (LLM 配置导出)
OpsCenter  ←→  SSS                    (运行参数导出)
OpsCenter  ←→  content-aggregator     (配置导出)
OpsCenter  ←→  unified-frontend       (独立，互不影响)
```

---

## 14. 迭代计划

| 版本 | 内容 | 预计工时 | 交付物 |
|------|------|---------|--------|
| V0.1 | 功能开关管理 | 3-5 天 | Web UI + API + 配置生成 |
| V0.2 | AI Key 管理 | 3-5 天 | 加密存储 + 测试连接 + 导出 |
| V0.3 | 平台凭证管理 | 3-5 天 | 多平台 credential 管理 |
| V0.4 | 项目运行参数 | 3-5 天 | 参数编辑 + 类型校验 |
| V0.5 | 版本化与回滚 | 2-3 天 | 快照 + diff + 回滚 |
| V0.6 | 环境变量只读视图 | 2-3 天 | 一致性检查 + 告警 |

总计：V0.1-V0.6 约 16-26 天。

---

## 12. 预设模型设置 / 多模态能力管理（2026-08-08 新增）

### 12.1 产品概述

运营人员在运营后台维护 Multi-Publish 前端【模型设置】的预设服务商目录：

- **预设模型设置**：设定哪些模型在前端【模型设置】中显示（`is_visible` 开关）；每个模型可填写最多 10 条技术文档网页链接（`doc_links`）；可填写/修改平台预设默认模型 Model ID（`default_model`）。
- **多模态设置**：针对多模态模型，手工配置其支持的每个能力（`capabilities`）、每能力默认模型（`capability_models`）与每能力技术文档链接（`capability_doc_links`，每能力最多 10 条）。

### 12.2 功能列表

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 模型预设目录 CRUD | 新增/编辑/删除模型预设（id/name/category/base_url/models/default_model） | P0 |
| 前端显示开关 | `is_visible` 控制是否在前端【模型设置】展示；`include_hidden=false` 过滤隐藏项 | P0 |
| 默认模型设置 | 每个预设可填写默认 Model ID，系统已知默认模型预填（MiniMax 多模态 `MiniMax-M2.7` 等） | P0 |
| 文档链接管理 | 模型级 `doc_links` ≤10 条、能力级 `capability_doc_links` 每能力 ≤10 条；必须为 http(s) URL | P0 |
| 多模态能力配置 | 多模态预设配置能力数组 + 每能力默认模型（缺省报 400）+ 每能力文档链接 | P0 |
| 种子目录初始化 | 首次启动自动填充内置目录（与 Multi-Publish 预设对齐，含 MiniMax 各能力官方文档链接） | P0 |

### 12.3 数据约束

- `model_presets.id`：唯一主键（如 `minimax-multimodal`）。
- `category`：`llm / tts / speech_recognition / image / video / audio / multimodal` 之一。
- `doc_links` / `capability_doc_links`：JSON 数组/对象；每项必须 `http(s)` 开头；模型级 ≤10 条、每能力 ≤10 条，超限/非法返回 400。
- `capabilities` 中的每个能力必须出现在 `capability_models`（缺默认模型 → 400「缺少默认模型」）。
- `default_model`：字符串，可为空；已知默认值由种子目录预填。

### 12.4 API

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/v1/model-presets` | admin | 列表，支持 `category` / `include_hidden` 参数 |
| GET | `/api/v1/model-presets/{id}` | admin | 详情 |
| POST | `/api/v1/model-presets` | admin | 创建（校验同上） |
| PUT | `/api/v1/model-presets/{id}` | admin | 更新 |
| DELETE | `/api/v1/model-presets/{id}` | admin | 删除 |

### 12.5 前端页面「预设模型」

- 菜单入口：「预设模型」（`/model-presets`）。
- 列表：类别筛选、多模态标签、能力 chips、默认模型列、文档链接数（N/10）、前端显示开关、编辑/删除。
- 编辑对话框：基础信息（ID/名称/类别/Base URL/模型列表/默认模型 ID/多模态开关/前端显示）+ 多模态能力配置（能力多选、每能力默认模型、每能力文档链接 ≤10）+ 模型文档链接（≤10）。

### 12.6 验收标准

1. 运营后台可新增/编辑/删除模型预设。
2. 默认模型字段预填已知值（如 MiniMax 多模态 = `MiniMax-M2.7`）且可修改。
3. `doc_links` 超过 10 条或非 URL 被拒绝（400）。
4. 多模态能力缺少默认模型被拒绝（400）。
5. `is_visible=false` 后列表（`include_hidden=false`）不再展示该预设。
5. 多模态能力缺少默认模型被拒绝（400）。

---

## 12A. 模型更多信息字段 / 获取模型ID / 多模态分能力文档URL（2026-08-10 新增）

> 在既有「预设模型设置」基础上扩展运营信息字段，指导前端调度并发与排队，并支持从模型网址拉取模型 ID 列表。

### 12A.1 新增信息项（字段与数据校验）

| 显示项 | 字段 | 类型 | 允许为空 | 校验规则 |
|--------|------|------|---------|---------|
| 接口 Base URL（端口URL） | `base_url` | string | ✅ | 空允许；非空必须 `http(s)` 开头，长度 ≤500 |
| 获取模型ID URL | `models_url` | string | ✅ | 空允许；非空必须 `http(s)` 开头，长度 ≤500；用于「获取模型」按钮拉取模型 ID |
| 默认模型 ID | `default_model` | string | ✅ | 空允许；**非空且模型列表非空时，必须 ∈ 模型列表**，否则 400「默认模型 ID 必须在模型列表中」 |
| 接口技术文档URL | `doc_links` | string[] | ✅ | ≤10 条；每条 `http(s)` 开头 |
| 每分钟连接次数 | `rate_per_minute` | integer | ✅ | 空/None 视为未配置（null）；非空必须为 `[1, 100000]` 的整数（`int()` 严格转换，拒绝 `1.5`/`'abc'`/负数/布尔），否则 400 |
| 5小时限额次数 | `limit_per_5h` | integer | ✅ | 空/None 视为未配置（null）；非空必须为 `[1, 10000000]` 的整数，否则 400 |

- 前端输入框留空 → 保存为 `null`（`rate_per_minute`/`limit_per_5h`）或空串（URL 类）。
- 语义说明：`rate_per_minute`=该模型每分钟允许的 API 请求次数；`limit_per_5h`=每 5 小时请求次数上限。桌面端据此调度并发与排队；留空表示使用默认限流（不报错）。

### 12A.2 默认模型下拉与「获取模型」按钮

- **默认模型 ID 改为下拉选择**：选项来自「模型列表」（`models` 数组），支持过滤/清空；模型列表为空时下拉为空（仅可留空）。
- **「获取模型」按钮**（编辑/新增弹窗内，默认模型下拉旁）：
  - 点击后调用 `POST /api/v1/model-presets/{id}/fetch-models`（body 可带 `models_url` 覆盖未保存的表单值）；
  - 成功：`models` 被更新为返回的模型 ID 列表，`default_model` 若不在新列表则清空，前端回填模型列表文本框与默认模型下拉，提示「获取成功，共 N 个模型 ID」；
  - 失败：不修改已有 `models`，弹出错误详情（URL 未配置 / 超时 / 非 JSON / SSRF 拒绝 / HTTP 状态码）。
- 前端必填校验：点击获取模型前需有「预设 ID」与「获取模型ID URL」；未填写时提示「请先填写…」。

### 12A.3 获取模型ID 端点（fetch-models）

| 项 | 契约 |
|----|------|
| 方法/路径 | `POST /api/v1/model-presets/{preset_id}/fetch-models` |
| 鉴权 | admin-only（普通用户 403） |
| 请求体 | `{"models_url": "https://..."}`（可选；未传用预设已保存的 `models_url`） |
| 成功响应 | `{"models": [...], "default_model": "...", "count": N}`；回写 `models`（`models_url` 覆盖时一并回写）、`default_model` 不在新列表则清空 |
| 失败 | 400 + 中文错误（不修改已有数据） |

**SSRF 防护清单**：
1. URL 必须是 `http(s)` 且长度 ≤500（`ftp://` 等拒绝）；
2. 仅本机环回主机（`localhost` / `127.0.0.1` / `::1`）允许 `http`（供本地 ollama 等）；非环回主机必须 `https`；
3. DNS 解析后任一地址为私网/环回/链路本地/组播/保留/未指定 → 拒绝「解析到私网/保留地址」；
4. `follow_redirects=False`：任何 3xx 重定向视为失败（HTTP ≥300 → 400）；
5. 超时 10s；响应体 ≤512KB；
6. JSON 契约：支持 `{models:[...]}` / `{data:[...]}` / `{data:[{id:...}]}` / 纯数组；提取非空字符串去重，最多 500 个；无模型 ID → 400「未找到任何模型ID」。

### 12A.4 多模态分能力技术文档 URL

多模态模型（`is_multimodal=true`）编辑弹窗显示 **7 个固定能力标签的单 URL 输入框**（不再仅按已勾选能力动态显示）：

| 能力键 | 显示 label | 存储 |
|--------|-----------|------|
| `llm` | 文字推理接口技术文档URL | `capability_doc_links.llm` |
| `image` | 图片生成技术文档URL | `capability_doc_links.image` |
| `video` | 视频生成技术文档URL | `capability_doc_links.video` |
| `tts` | TTS语音生成技术文档URL | `capability_doc_links.tts` |
| `voice_clone` | TTS语音克隆技术文档URL | `capability_doc_links.voice_clone` |
| `speech_recognition` | 语音识别技术文档URL | `capability_doc_links.speech_recognition` |
| `vision` | 视觉识别技术文档URL | `capability_doc_links.vision` |

- 结构保持 `capability -> links 数组`（单 URL 也存为单元素数组），兼容存量多链接数据（编辑回填取首条，保存时保留首条避免数据丢失）。
- 校验：`capability_doc_links` 的键必须是 7 能力键之一（另兼容历史 `audio`），未知键 → 400「未知的能力文档键」；每条链接 `http(s)`、≤10 条。

### 12A.5 数据迁移与种子

- `init_db` 后执行幂等列迁移：存量 `model_presets` 表补充 `models_url`（VARCHAR DEFAULT ''）、`rate_per_minute`（INTEGER）、`limit_per_5h`（INTEGER）。
- 启动种子（`services/config_seed_service.py`）：幂等注册 6 个预置项目（含 `platform-orchestrator`，功能开关页面依赖）+ 从 `feature_gates.yaml` 导入功能开关（源可经 `OPS_FEATURE_GATES_SOURCE` 指定；显式配置时只使用该源，文件缺失即跳过不 fallback；未配置则探测 `D:/Data/projects/platform-orchestrator/feature_gates.yaml` 与 `~/feature_gates.yaml`）。修复「功能开关页面 404 → 加载失败」：原依赖手动 `scripts/seed.py`，新库为空导致项目缺失。
- 种子目录（`PRESET_CATALOG`）**由 Multi-Publish 桌面端代码事实生成**（见 12A.8 数据来源）：覆盖桌面端全部 53 个预设；`base_url`=适配器默认端点/桌面预设值、`models`/`capabilities`/`capability_models`=桌面 `model-provider-seeds`、`rate_per_minute`=桌面 `governor-provider-limits` 静态表；`limit_per_5h` 与 `models_url` **无代码事实 → 不预填（留空由运营填写）**；`INSERT OR IGNORE` 不覆盖用户修改。

### 12A.6 前端交互与提示文案

- 编辑/新增弹窗字段顺序：预设 ID → 名称 → 类别 → 接口 Base URL（端口URL）→ 获取模型ID URL → 模型列表 → 默认模型 ID（下拉 + 获取模型按钮）→ 每分钟连接次数 → 5小时限额次数 → 多模态开关 → 前端显示 →（多模态时）能力配置 + 7 能力文档 URL → 通用文档链接。
- 提示文案：
  - 每分钟连接次数：「留空表示未配置，前端使用默认限流；正整数」
  - 5小时限额次数：「留空表示未配置；5 小时内请求次数上限（正整数）」
  - 获取模型ID URL placeholder：「允许为空，用于「获取模型」按钮」
  - 默认模型 ID placeholder：「从模型列表中选择（允许为空）」
- 列表新增「限流（每分钟/5小时）」列，展示 `rate_per_minute / limit_per_5h`（未配置显示 `-`）。

### 12A.7 验收标准

1. 保存合法 `models_url`/`rate_per_minute`/`limit_per_5h` 成功且响应回显；全留空成功且字段为 null/空。
2. 非法 URL（`ftp://`）、非法数字（`-1`/`1.5`/`'abc'`/超上限）、默认模型不在模型列表、未知能力文档键 → 均 400 且错误信息含字段名。
3. 默认模型 ID 以下拉选择；点击「获取模型」成功回填模型列表与默认模型，失败不改动已有数据。
4. fetch-models 对私网解析/重定向/非 JSON/超时分别返回 400，且普通用户 403。
5. 多模态编辑弹窗显示 7 个固定能力文档 URL 输入框，保存后 `capability_doc_links` 对应键为单元素数组。
6. 预设目录与桌面端代码事实一致：default_model ∈ models、rate_per_minute 与桌面静态表一致、limit_per_5h/models_url 为空（防估算污染）。

---

## 12A.9 自包含管理员登录（2026-08-10，替代 orchestrator 认证依赖）

运营后台为**内部管理工具**（非前端用户使用），不接 Logto 等外部 IdP，也不依赖 platform-orchestrator：

| 项 | 契约 |
|----|------|
| 登录端点 | `POST /api/auth/login`（本地），body `{username, password}`；成功返回 `{token, username, role:"admin"}` |
| 凭据配置 | `OPS_ADMIN_USERNAME` / `OPS_ADMIN_PASSWORD` 环境变量；启动时若 `admins` 表为空则创建（PBKDF2-SHA256 哈希存储） |
| fail-closed | 未配置管理员且表为空 → 登录返回 503「未配置管理员账号，请设置 OPS_ADMIN_USERNAME/OPS_ADMIN_PASSWORD」；**无默认口令** |
| JWT | HS256，`OPS_JWT_SECRET` 签发，payload `{sub, username, role:"admin", exp}`，8h 过期；现有验证中间件不变 |
| 密码安全 | PBKDF2-SHA256、随机 16B salt、200000 迭代、`hmac.compare_digest` 常量时间比较；存储格式 `pbkdf2_sha256$iterations$salt_hex$hash_hex`（字面 `$` 分隔） |
| 限流 | 内存计数（username+IP），5 次失败锁定 60s → 429「尝试次数过多，请稍后再试」；重启/多实例重置（单机内部后台可接受） |
| 密码错误 | 统一 401「用户名或密码错误」，不区分用户是否存在 |
| 当前用户 | `GET /api/auth/me`（受保护） |
| 前端 | Vite `/api/auth` 代理 target → `localhost:8010`（不再指向 orchestrator:8000）；登录页/鉴权 store 路径不变 |
| 迁移影响 | 签发方改为本地；历史由不同 secret 签发的会话 token 将失效，需重新登录 |

## 12A.8 预设目录数据来源（2026-08-10 补充）

运营后台预设目录（`PRESET_CATALOG`）的「已确定」数据项全部来自 Multi-Publish 桌面端代码事实，禁止编造：

| 数据项 | 来源（代码事实） | 说明 |
|--------|------------------|------|
| `base_url`（端口URL） | 适配器 `DEFAULT_BASE_URL`（`apps/desktop/electron/services/adapters/*.js`）；OpenAI 兼容类读 provider 配置，用桌面预设值 | 如 Anthropic `https://api.anthropic.com`（无 `/v1`）、MiniMax `https://api.minimaxi.com/v1`、本地类用适配器默认（localhost:8080/7860/5000/8188 等） |
| `models` | 桌面 `model-provider-seeds.js` `PRESET_PROVIDERS[].models` | 预设可用的模型 ID 白名单 |
| `default_model` | 已知默认值且必须 ∈ models（校验拒绝） | MiniMax 多模态 `MiniMax-M2.7` 等 |
| `capabilities` / `capability_models` | 桌面多模态预设声明（minimax-multimodal） | llm/tts/image/video → 对应模型 |
| `rate_per_minute`（每分钟连接次数） | 桌面 `governor-provider-limits.js` `PROVIDER_LIMITS[].rpm` | 代码常量（如 openai 120、video 类 6）；**与静态表一致，非估算** |
| `limit_per_5h`（5小时限额次数） | **无代码事实** → 空（null） | 由运营在模型设置/运营后台填写；桌面端 `ApiUsageGovernor` 按 provider 级 5h 请求窗口使用 |
| `models_url`（获取模型ID URL） | **无代码事实**（适配器无 `/models` 调用）→ 空 | 「获取模型」按钮需运营填写模型网址 |

- 变更守则：任何桌面适配器端点/模型/限流常量变更，须同步更新本目录并跑 12A.7-6 一致性测试（`test_catalog_facts_consistency`）。

## 12A.10 模型目录只读同步端点（catalog，桌面端运行时下发）（2026-08-10 新增）

> 桌面端通过只读目录端点拉取运营配置（限流/模型/能力），实现「运营后台填写 → 桌面端运行时自动下发」，前端限流/模型字段改为只读。详见 Multi-Publish PRD §7.4.5。

### 12A.10.1 端点契约

| 项 | 契约 |
|----|------|
| 方法/路径 | `GET /api/v1/model-presets/catalog`（**在 `/{preset_id}` 动态路由之前注册**，避免被吞） |
| 鉴权 | `X-Catalog-Key` 请求头 == `OPS_CATALOG_API_KEY`（`hmac.compare_digest` 常量时间比较），**无需登录** |
| 未配置 | `OPS_CATALOG_API_KEY` 未配置（空）→ **404**（不暴露端点存在性，fail-closed） |
| Key 错误/缺失 | → **401**「目录同步 Key 无效」 |
| 成功响应 | `{ "items": [...], "count": N, "synced_at": "ISO8601Z" }` |
| 数据范围 | 仅 `is_visible=1` 预设，按 `is_multimodal DESC, category, name` 排序 |
| item 字段 | `id` / `name` / `category` / `base_url` / `models` / `default_model` / `rate_per_minute` / `limit_per_5h` / `is_multimodal` / `capabilities` / `capability_models` / `updated_at`；**不含** api_key、密钥、审计等敏感字段 |
| 数据自洽 | `default_model` 非空必须 ∈ `models`；`rate_per_minute`/`limit_per_5h` 为 `null` 或正整数（`[1,100000]`/`[1,10000000]` 已由写入校验保证） |

### 12A.10.2 桌面端消费契约

| 项 | 契约 |
|----|------|
| 服务 | 主进程 `OpsCenterSync`（`apps/desktop/electron/services/ops-center-sync.js`） |
| 配置存储 | settings `opsCenterSync`：`{url, apiKeyEnc, autoSync, lastSyncedAt}`；API Key 经 safeStorage 加密 base64，`getConfig()` 不返回明文 |
| URL 校验 | 必须 http(s)；非本机回环强制 https；拒绝 URL 内嵌凭据 |
| 拉取 | `{url}/api/v1/model-presets/catalog`；`X-Catalog-Key` 头；禁重定向；10s 超时；≤1MB；JSON 必须含 `items` 数组 |
| 错误映射 | 401/403→Key 无效；404→未启用目录同步；超时→同步请求超时（10 秒）；连接失败→无法连接 Ops Center；其余→HTTP {status} |
| 写入 | `ModelProviderManager.applyCatalog`：合并限流/模型/能力；不覆盖 api_key/enabled/is_default/base_url；缺失行插入（is_preset=1/enabled=0）；本地独有行不清除；限流 null/非法值清除本地并回退默认 |
| Governor | 写库后 `_applyGovernorLimits()`：rate_per_minute→setProviderLimits、limit_per_5h→setProviderTokenWindows(5h) |
| 前端 | 模型设置页「运营后台同步」卡片（地址/Key/自动同步/立即同步/上次同步时间/状态文案）；限流与预设模型列表只读 |

### 12A.10.3 测试

- `ops-center/backend/tests/test_model_catalog_api.py`：正确 Key 返回全部可见预设（≥50 项、minimax-multimodal 命中、default∈models、限流正整数或空）；错误/缺失 Key 401；未配置 404；隐藏项排除。
- 桌面端：`ops-center-sync.test.js`（URL 校验/加密存储/错误映射/超时/大小/JSON/结构/成功落盘/自动同步）、`model-provider-apply-catalog.test.js`（合并/不覆盖/插入/不清除/清空回退/governor 重应用）、`ipc-handlers/ops-center-sync.test.js`、`useOpsCenterSync.test.js`。

### 12A.10.4 未配置时的降级链路（桌面端，2026-08-11 补充）

运营后台未填写 `rate_per_minute` / `limit_per_5h`（null）时，桌面端按以下顺序降级，不报错、不阻塞：

1. **桌面数据库种子默认值**：`model-provider-seeds.js` `PRESET_RATE_LIMITS` 回填 `config.rate_per_minute`（`_syncPresetLimits` diff-merge 仅填缺失键）；数值为代码事实，与桌面静态表一致；
2. **静态表**：`governor-provider-limits.js` `PROVIDER_LIMITS`（已知 provider 的 rpm / maxConcurrent / cooldownMs / retry429）；
3. **类别默认**：`api-usage-governor.js` `DEFAULT_LIMITS`（llm 30/2、tts 10/2、image 10/2、video 4/1、audio 10/2、default 20/2）。

- 运营**显式清空**（null/''/0/布尔）→ `applyCatalog` 删除桌面本地 config 值 → 回退 2/3；`limit_per_5h` 清空 → 清除 provider 级 5h 请求窗口。
- 桌面端排队时序预算：并发队列 30s、RPM 时间槽 180s、冷却 45s；超限返回明确限流文案，429 自适应 ×0.75 下调、成功 +0.05 恢复。详见 Multi-Publish PRD §7.1.8.1 / §7.4.4.3。

## 12A.11 运行时运营策略：公告 / 版本发布 / 内容安全（2026-08-10 新增）

> 运营后台集中维护公告、版本发布策略、内容安全敏感词库；桌面端经 `GET /api/v1/runtime/bootstrap`（与模型目录同鉴权）一次性拉取应用。详见 Multi-Publish PRD §7.4.6。

### 12A.11.1 数据模型与管理端点

| 资源 | 端点（管理，require_admin） | 字段/校验 |
|------|---------------------------|----------|
| 公告 | `GET/POST /api/v1/announcements`、`PUT/DELETE /api/v1/announcements/{id}` | title/content 必填；severity ∈ info/warning/maintenance；时间 ISO 且 until ≥ from；sort_order/enabled |
| 版本发布策略 | `GET/PUT /api/v1/update-policy`（单条 upsert） | 版本号 `x.y.z`（可空）；force ≥ min；gray_ratio 0-100；enabled/note |
| 内容安全策略 | `GET/PUT /api/v1/content-policy`（单条 upsert） | word_list JSON 去重 ≤5000、单项 ≤100；replacement ≤16；enabled |

校验失败返回 400 + 中文字段提示；不合法值拒绝保存。审计沿用 ConfigAuditLog 模式（操作方为 admin）。

### 12A.11.2 运行时只读端点

`GET /api/v1/runtime/bootstrap`：`X-Catalog-Key` 鉴权（`OPS_CATALOG_API_KEY`，常量时间比较；未配置→404；错→401）。返回：
- `announcements`：enabled=1 且在 `[active_from, active_until]` 窗口内的公告（按 sort_order），仅 title/content/severity/窗口；
- `update_policy` / `content_policy`：单条策略对象或 null；
- `synced_at`。

### 12A.11.3 桌面端消费

- `OpsCenterSync.syncNow()` 目录同步后 best-effort 拉取并 `applyRuntime`（失败仅 warn）；
- 公告 → App 顶部横幅（maintenance 常驻不可关闭，info/warning 可关闭）；
- 内容安全 → 重建 `SensitiveFilter`（内置 + 远程词，`sensitive:check/replace` 生效）；
- 版本发布 → auto-updater `applyPolicy`（force 强制 / gray 灰度 / min 提示）。

### 12A.11.4 测试

- ops-center pytest：`test_runtime_policy_api.py` 4 用例（公告 CRUD+校验、版本策略 upsert+校验、内容安全 upsert+校验、bootstrap 鉴权+活动过滤）。
- 桌面端 vitest：ops-center-sync 运行时 4 用例（applyRuntime/敏感词重建/策略消费者/syncNow runtime）、auto-updater 策略 5 用例、sensitive 远程过滤器 2 用例、useOpsCenterRuntime 3 用例、IPC runtime 通道。

## 12A.12 模型调用用量上报与看板（2026-08-10 新增，P0 第二批）

> 桌面端 `model_provider_logs` 脱敏聚合后上报运营后台；看板支撑限流/采购/容量决策。详见 Multi-Publish PRD §7.4.7。

### 12A.12.1 上报端点

`POST /api/v1/usage/ingest`（X-Catalog-Key 鉴权同目录端点，无需登录）：body `{ items: [...], synced_at }`，items 含 usage_date/client_id/provider_id/category/action/calls/ok_count/fail_count/ratelimit_count/latency_ms/tokens_in/tokens_out/cost/latency_buckets。校验：usage_date YYYY-MM-DD、数值非负、provider/action 非空、单次 ≤500 条 → 400。按 `(usage_date, client_id, provider_id, action)` upsert 累加（幂等）。

### 12A.12.2 汇总查询

`GET /api/v1/usage/summary?days=N`（admin，默认 30/上限 90）：totals（调用/成功率/429/平均耗时/成本/活跃服务商）、by_date、by_provider（调用降序）、by_action。

### 12A.12.3 桌面端上报

- `UsageReporter`：读 `model_provider_logs id > 水印`（settings `opsCenterUsageReport.lastId`），按日期+provider+action 聚合，POST ingest；成功推进水印，失败保留重试；启动 5s 首报 + 30min 周期；未配置静默跳过。
- 脱敏：不上报 error_message/model 原文；429 识别（状态/文案含 rate limit/限流/429）。
- 修复：`addProviderLog` INSERT 补 `created_at=datetime('now')`。

### 12A.12.4 前端

「模型用量」页：7/30/90 天切换、汇总卡片、每日趋势 CSS 柱状图、按服务商/按动作表格、空态提示。

### 12A.12.5 测试

- ops-center pytest：`test_usage_api.py` 3 用例（鉴权+幂等累加、输入校验、汇总分组+权限）。
- 桌面端 vitest：`usage-reporter.test.js` 6 用例（分类/静默/无数据/聚合上报+水印+脱敏/失败重试/定时）。

## 12A.13 官方 Key 池配额/成本概览 + 许可证管理（2026-08-10 新增，P0/P1 第三批）

> P0-1 官方 Key 池增强（配额/告警/成本）与 P1-6 许可证管理（签发/吊销/列表）运营后台管理面。桌面端消费（官方 Key 回退路由、许可证服务端验签）需商业模式确认后另行接入，本 change 不触碰桌面端 entitlement 现有合同。

### 12A.13.1 官方 Key 池增强

- `official_keys` 新增列（`ensure_official_key_columns` 幂等迁移）：`rate_per_minute`（每分钟配额，正整数或空）、`daily_limit`（每日上限，正整数或空）、`alert_threshold_cost`（成本告警阈值 ¥，≥0 或空）、`note`。
- upsert 校验：布尔/小数/负数拒绝（400 + 字段提示）。
- `GET /api/v1/secrets/summary`（admin）：总数/活跃/30 天内到期/已过期、近 30 天成本（复用 `model_usage_daily` 按 provider 聚合）、达告警阈值 Key 列表。
- 前端 Key 管理页：新增配额/上限/告警/备注字段 + 池概览卡片。

### 12A.13.2 许可证管理

- `licenses` 表：`license_key`（唯一，自动生成 `MP-XXXX-XXXX-XXXX-XXXX`，去易混淆字符）、`plan`（free/trial/pro）、`device_limit`（≥1）、`expires_at`（ISO 或空=永久）、`status`（active/disabled；expired 由查询派生）、`note`。
- 端点（require_admin）：`GET/POST /api/v1/licenses`、`PUT/DELETE /api/v1/licenses/{id}`。
- 前端「许可证管理」页：签发（展示生成的 Key 一次）、列表（状态标签/过期高亮）、禁用/启用/删除。

### 12A.13.3 测试

- `test_keypool_license_api.py` 3 用例：Key 新字段校验 + 池概览（非 admin 403）、许可证 CRUD + 校验 + 权限、Key 唯一性与过期派生。

## 12A.14 云服务健康巡检（2026-08-11 新增，P1 其余）

> 运营后台一键诊断云服务健康（业务 API / Logto / 存储 / 自定义目标），复用 production-smoke 的探测口径，只读不修改服务状态。

### 12A.14.1 探针

| 探针 | 目标 | 判定 |
|------|------|------|
| ops-center 自身 | 进程存活 | ok |
| 业务 API | `OPS_HEALTH_API_URL` → `/api/v1/health` + `/api/v1/ready` | 均 2xx → ok |
| Logto | `OPS_HEALTH_LOGTO_URL` → OIDC discovery（`/oidc/.well-known/openid-configuration`） | 2xx 且含 issuer → ok |
| 存储可写 | config_output_dir / db 目录 | 临时写删成功 → ok |
| 自定义目标 | `OPS_HEALTH_TARGETS` JSON `[{name,url}]` | 2xx → ok |

- 单项 ≤5s 超时；URL 校验（http(s)，非本机回环强制 https）；未配置 → skipped（不计失败）。
- `GET /api/v1/system/health`（admin）：并发探测，返回 `{overall: ok|error, checks:[{name,status,ok,latency_ms,detail}], generated_at}`。

### 12A.14.2 前端

「系统健康」页：一键巡检按钮 + 总体徽章 + 结果表（服务/状态/耗时/详情）；首次进入自动巡检。

### 12A.14.3 测试

`test_health_api.py` 2 用例：未配置跳过 + 权限、自定义目标失败 + 非法目标忽略。


## 12A.16 桌面端功能开关运行时下发（2026-08-11 新增，P0-1）

> 桌面端功能开关（key → typed value）由运营后台统一维护，随 `runtime/bootstrap` 下发；桌面端同步后即时生效。首个真实用例：4K 输出能力开关 `videoCreation.maxOutputResolution`（PRD 7.1.20）。

### 12A.16.1 数据模型与校验

`feature_flags` 表：

| 字段 | 类型 | 校验 | 说明 |
|------|------|------|------|
| key | str PK | 必填、`^[A-Za-z0-9_.-]{1,128}$` | 开关标识（如 videoCreation.maxOutputResolution） |
| value_type | str | 枚举 string/boolean/number，默认 string | 值类型 |
| value | str | 按类型可解析：boolean ∈ true/false/1/0；number 可解析数字 | 存储字符串，下发时转 typed value |
| description | str | ≤200 | 用途说明 |
| enabled | bool | 0/1 | 停用后不下发 |
| updated_at / updated_by | str | 自动 | 审计 |

- key 拒绝 `__proto__`/`constructor`/`prototype`；value ≤512。
- number value 统一 float 解析并校验有限（含科学计数法，前后端一致）。
- POST 重复 key → 409；PUT / DELETE 不存在 → 404；PUT 部分更新（null 不修改、body 中 key 被忽略不可变）；并发冲突 IntegrityError → 409；种子并发冲突幂等忽略。
- 种子：`videoCreation.maxOutputResolution` = '1080p'（默认禁止 4K），已存在即跳过，不覆盖运营修改。

### 12A.16.2 端点与运行时下发

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/feature-flags | 列表（登录可读，含 typed_value） |
| POST | /api/v1/feature-flags | 新增（admin） |
| PUT | /api/v1/feature-flags/{key} | 更新（admin，部分更新） |
| DELETE | /api/v1/feature-flags/{key} | 删除（admin） |
| GET | /api/v1/runtime/bootstrap | 增加 `feature_flags` = `{key: typed_value}`（enabled=1，同 X-Catalog-Key 鉴权） |

### 12A.16.3 桌面端消费

| 项 | 要求 |
|----|------|
| OpsCenterSync | `applyRuntime` 应用 `feature_flags`（仅接受字符串/布尔/数字值，结构非法或 >100 项 → 空对象 fail-closed）；持久化 opsCenterRuntime，重启恢复；`getFeatureFlag(key)` 供主进程/引擎读取；`getRuntimeState()` 暴露 featureFlags（渲染端经现有 `opsCenterSyncRuntime` IPC） |
| 4K 读取优先级 | 环境变量 `MAX_OUTPUT_RESOLUTION` → 运营功能开关 `videoCreation.maxOutputResolution`（phase1 `setFeatureFlagProvider` 注入）→ store 设置 → 默认 1080p（fail-closed） |
| 引擎 | `Story2VideoComposeEngine` 支持 `getMaxOutputResolution` 惰性读取：compose/renderSegment 能力校验时取当前值，构造期静态值兜底 |
| 渲染端 | CreateView `loadMaxOutputResolution`：runtime featureFlags → store → 默认 |

### 12A.16.4 前端「桌面端功能开关」页

- 列表：Key / 类型 tag / 当前值（typed 展示，空显示「（空）」）/ 描述 / 启用开关 / 操作（编辑、删除）；顶部「全部/已启用/已停用」筛选 + 「新增开关」。
- 编辑弹窗：Key（编辑禁用）/ 值类型下拉 / 值输入（布尔提示 true/false、数字提示数字、字符串提示如 1080p/4k）/ 描述 / 启用下发。
- 校验提示：Key 字符集、布尔值枚举、数字可解析；保存失败显示后端 detail。
- 顶部说明文案注明内置 4K 开关用途与 fail-closed 语义。

### 12A.16.5 验收标准

① 首次启动 4K 开关种子存在；② 非法 key/value_type/value → 400；③ POST 重复 → 409、PUT/DELETE 不存在 → 404；④ bootstrap 返回 enabled 开关 typed value；⑤ 桌面端 applyRuntime 应用/持久化/重启恢复；非法结构 → 空对象；⑥ 引擎惰性读取：静态 1080p + 动态 4k → 放行 4K，动态 1080p → 拒绝（fail-closed）；⑦ 未配置同步的桌面端用本地默认（1080p）。
## 12A.15 平台发布元数据管理（2026-08-11 新增，P1 其余）

> 平台发布元数据（标题/内容上限、内容类型分类、是否支持 API、临时下线）从桌面端 `config/platforms.yaml` 迁移到运营后台维护，随运行时 bootstrap 下发；桌面端启动/同步时覆盖同名平台字段，不改写 yaml。

### 12A.15.1 数据模型与校验

`platform_defs` 表：

| 字段 | 类型 | 校验 | 说明 |
|------|------|------|------|
| id | str PK | 必填、≤64 | 平台 id（如 wechat_mp） |
| name | str | 必填、≤100 | 平台名称 |
| category | str | ≤20，默认「中文」 | 中文/海外分组 |
| content_category | str | 枚举 VIDEO/IMAGE_TEXT/MIXED，默认 MIXED | 内容类型分类（PRD F9） |
| type | str | ≤20，默认 mixed | article/mixed 兼容字段 |
| max_title | int | 正整数或空（拒绝布尔/小数/负数） | 标题上限 |
| max_content | int | 正整数或空（同上） | 内容上限 |
| has_api | bool | 0/1 | 是否支持 API 发布 |
| enabled | bool | 0/1 | 临时下线开关（关闭后不下发） |
| note | str | ≤200 | 运营备注 |
| updated_at | str | 自动 | 更新时间 |

- id 字符集 `^[a-z0-9_-]{1,64}$`；category ∈ 中文/海外；type ∈ article/mixed；has_api/enabled 仅接受 true/false/1/0（其余 400）。
- 创建（POST）走全量校验，重复 id → 409；更新（PUT）为**部分更新**语义：与已存在记录合并后做全量校验，null 视为不修改该字段，路径 id 优先，空串清空上限，不存在 → 404。
- 删除为**软删除**（deleted_at + enabled=0）：已删除平台不再列出/下发；种子化遇到已存在记录（含软删）即跳过，**已删种子不复活**；软删后同一 id 可重建（恢复）。
- 种子：对齐 `config/platforms.yaml` 关键平台（wechat_mp/weibo/douyin/bilibili/toutiao/xiaohongshu/zhihu/kuaishou/youtube/tiktok/twitter/facebook），已存在即跳过。

### 12A.15.2 管理端点（admin）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/platform-defs | 列表（登录用户可读） |
| POST | /api/v1/platform-defs | 新增（admin；校验失败 400） |
| PUT | /api/v1/platform-defs/{id} | 更新（admin；部分更新） |
| DELETE | /api/v1/platform-defs/{id} | 删除（admin；不存在 404） |

### 12A.15.3 运行时下发

- `GET /api/v1/runtime/bootstrap` 增加 `platform_defs`（enabled=1 项，含 id/name/category/content_category/max_title/max_content/has_api），与公告/版本发布/内容安全同链路、同 `X-Catalog-Key` 鉴权。
- 桌面端 `PlatformConfig.applyRemote(defs)`：按 id 覆盖已存在平台的远程字段（仅覆盖远程出现的键）；本地独有平台保留；远程新增平台不自动引入（fail-closed，避免出现无适配器的平台）；**不改写 yaml**；cover_size 字符串同步重建解析尺寸。
- `OpsCenterSync.applyRuntime`：注入 platformConfig 时应用 `platform_defs`（`setPlatformConfig` 由 phase1 接线）；未注入跳过，不影响其他运行时策略。

### 12A.15.4 前端「平台元数据」页

- 列表：ID / 名称 / 类别（中文|海外 tag）/ 内容类型（视频|图文|混合 tag）/ 标题上限 / 内容上限 / 支持 API / 下发开关 / 操作（编辑、删除）；顶部「中文/海外/全部」筛选 + 「新增平台」按钮。
- 编辑弹窗：平台 ID（编辑时禁用）/ 名称（必填）/ 类别 / 内容类型（必填下拉）/ 类型 / 标题上限 / 内容上限（正整数或留空）/ 支持 API / 启用下发（关闭提示「桌面端将不再下发该平台」）/ 备注。
- 下发开关即时保存（部分更新 enabled），成功提示「已启用，将随下次同步下发给桌面端」。

### 12A.15.5 验收标准

① 首次启动种子 12 平台且可编辑；② 非法 content_category / 负数或小数上限 → 400；③ PUT 仅传部分字段可更新（enabled 临时下线）；④ bootstrap 仅返回 enabled=1 项；⑤ 桌面端 applyRemote 覆盖同名平台、本地独有保留、远程新增不引入、yaml 不被改写；⑥ 未注入 platformConfig 时跳过应用不影响其他策略；⑦ 非 admin 写 403、读 200。


## 12A.18 发布数据看板（2026-08-11 新增，P1-3）

> 桌面端把发布指标脱敏聚合上报运营后台，运营看板展示各平台产粮/失败情况（发布总数/成功/失败/成功率/平台排行/每日趋势）。仅计数，不含标题/正文/账号等敏感内容。

### 12A.18.1 数据模型与校验

`publish_metrics_daily`：usage_date（YYYY-MM-DD）/ client_id（设备稳定哈希，脱敏）/ platform / publish_count / ok_count / fail_count / updated_at；唯一约束 (usage_date, client_id, platform)，同桶 upsert 累加（幂等由客户端水印防重）。

| 校验 | 规则 |
|------|------|
| date | `YYYY-MM-DD` |
| platform | `^[A-Za-z0-9_.-]{1,64}$` |
| 计数 | 非负整数；publish_count ≥ ok+fail |
| items | ≤500 |

### 12A.18.2 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/publish/ingest | 上报（X-Catalog-Key；校验失败 400） |
| GET | /api/v1/publish/summary?days=N | 看板（admin，默认 30，上限 90）：totals + by_date + by_platform（含成功率） |

### 12A.18.3 桌面端上报（PublishReporter）

- 聚合 publish-history 记录按 日期+平台 分桶；status success → ok、含 fail/error → fail、监控状态（visible 等）不计（避免同一次发布重复计数）。
- 水印 = 最后上报记录 timestamp（ISO 字典序）；成功推进，失败保留下次重试；启动 5s 首报 + 30min 周期；未配置 URL/Key 静默跳过。
- 仅上报计数，不含标题/正文/账号/平台凭证。

### 12A.18.4 前端「发布数据」页

- 7/30/90 天切换 + 6 张汇总卡片（发布总数/成功/失败/成功率/平台数/设备数）+ 按平台表（发布/成功/失败/成功率）+ 每日趋势 CSS 柱状图（成功绿/失败红）+ 空态提示「尚未收到发布数据上报（桌面端需配置运营后台同步）」；非 admin 403 提示。

### 12A.18.5 验收标准

① 上报校验：非法日期/平台/负数/publish<ok+fail → 400；② 同桶累加正确；③ 未配置 Key 404、Key 错误 401；④ summary 非 admin 403；⑤ 按日期/平台聚合、成功率=ok/publish；⑥ 桌面端分桶正确（监控状态不计数）、水印推进/失败保留、未配置静默；⑦ 不上报敏感内容。
## 12A.17 官方内容模板库下发（2026-08-11 新增，P0-2）

> 官方内容模板库由运营后台统一维护，随 `runtime/bootstrap` 下发；桌面端同步时合并进本地模板（内置标记 builtin），用户自建模板保留。

### 12A.17.1 数据模型与校验

`content_templates` 表：

| 字段 | 类型 | 校验 | 说明 |
|------|------|------|------|
| id | str PK | 必填、`^[a-z0-9_-]{1,64}$` | 模板 id（如 preset-weekly） |
| name | str | 必填、≤100 | 模板名称 |
| category | str | ≤40 | report/marketing/tutorial/event/daily 等 |
| title | str | ≤200 | 模板标题 |
| content | text | ≤20000 | Markdown 正文 |
| platforms | JSON | 非空字符串数组 ≤50 | 适用平台 |
| tags | JSON | 非空字符串数组 ≤50 | 标签 |
| enabled | bool | 0/1 | 停用后不下发 |
| sort_order | int | 非负整数 | 排序 |
| deleted_at | str | 软删 | 软删不复活，可重建 |

- POST 重复 → 409；PUT 部分更新（null 不修改、body 中 id 忽略）+ 404；DELETE 软删 + 404；IntegrityError 兜底 409。
- 种子对齐桌面端 TemplateManager.getPresets() 5 个（preset-weekly/product/tutorial/event/daily），已存在（含软删）即跳过。

### 12A.17.2 端点与运行时下发

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/content-templates | 列表（登录可读） |
| POST | /api/v1/content-templates | 新增（admin） |
| PUT / DELETE | /api/v1/content-templates/{id} | 更新/软删（admin） |
| GET | /api/v1/runtime/bootstrap | 增加 `content_templates`（enabled=1 未软删，sort_order 排序，builtin=true） |

### 12A.17.3 桌面端消费

| 项 | 要求 |
|----|------|
| TemplateManager.applyRemote(templates) | 按 id upsert；官方字段白名单；新增标记 builtin=true；用户自建模板保留；数组 >200 fail-closed 返回 0；变更后 save() 持久化 |
| OpsCenterSync | setTemplateManager 注入（phase1 接线）；applyRuntime 应用 content_templates（数组 + 已注入时），异常仅 warn |

### 12A.17.4 前端「内容模板库」页

- 列表：ID / 名称 / 分类 tag / 标题 / 适用平台 tags / 内置标记 / 下发开关 / 操作（编辑、删除）；分类筛选 + 新增。
- 编辑弹窗：ID（编辑禁用）/ 名称（必填）/ 分类下拉 / 标题 / Markdown 正文（≤20000）/ 适用平台（逗号分隔）/ 标签（逗号分隔）/ 排序 / 启用下发。
- 顶部说明文案注明内置种子与用户模板不受影响。

### 12A.17.5 验收标准

① 首次启动种子 5 个内置模板；② 非法 id/name/platforms/sort/content → 400；③ POST 重复 409、PUT/DELETE 不存在 404；④ bootstrap 返回 enabled 模板（builtin=true）；⑤ 软删种子重启不复活、可重建；⑥ 桌面端 applyRemote 按 id 覆盖/新增/保留用户模板/上限 fail-closed；⑦ 未注入 templateManager 跳过不影响其他策略。


## 12A.20 关键词监测目录下发（2026-08-11 新增，P1-5）

> 运营后台维护关键词监测目录（关键词/飙升阈值/轮询间隔），随 `runtime/bootstrap` 下发；桌面端同步后按目录监测热度，异常飙升触发通知；用户自建监测词不受影响。

### 12A.20.1 数据模型与校验

`keyword_watchlist`：id（代理主键）/ keyword（唯一，2-100 字）/ category（≤40）/ threshold（≥1，飙升倍数）/ interval_minutes（10-10080 整数分钟）/ enabled / sort_order / deleted_at（软删，不复活，可重建）/ updated_at / updated_by。

- POST 重复 keyword → 400；PUT 部分更新 + 404；DELETE 软删 + 404。

### 12A.20.2 端点与运行时下发

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/keyword-watchlist | 列表（登录可读） |
| POST | /api/v1/keyword-watchlist | 新增（admin） |
| PUT / DELETE | /api/v1/keyword-watchlist/{id} | 更新/软删（admin） |
| GET | /api/v1/runtime/bootstrap | 增加 `keyword_watchlist`（enabled=1 未软删，sort_order 排序） |

### 12A.20.3 桌面端消费

| 项 | 要求 |
|----|------|
| KeywordMonitor.applyRemoteWatchlist(entries) | 按 keyword upsert：已存在更新 interval/threshold 并标记 source=remote（重建定时器）；不存在新增（立即首查+定时轮询）；缺席即停止远程监测；用户/恢复条目保留；MAX_KEYWORDS(20) 上限 skip+warn |
| OpsCenterSync | setKeywordMonitor 注入（phase1 接线）；applyRuntime 应用 keyword_watchlist（数组+已注入时，异常仅 warn） |

### 12A.20.4 前端「关键词监测」页

- 列表：关键词 / 分类 tag / 飙升阈值 / 轮询间隔 / 启用开关 / 操作（编辑、删除）；状态筛选 + 新增。
- 编辑弹窗：关键词（编辑禁用，2-100 字）/ 分类 / 飙升阈值（≥1）/ 轮询间隔（10-10080 分钟）/ 启用下发。
- 顶部说明：用户自建监测词不受影响；关闭后桌面端停止监测该词。

### 12A.20.5 验收标准

① 校验：keyword/threshold/interval 非法 → 400；② POST 重复 400、PUT/DELETE 404；③ 软删不复活、可重建；④ bootstrap 仅 enabled 条目；⑤ 桌面端 applyRemoteWatchlist 新增/更新/缺席停止/用户保留；⑥ 未注入跳过不影响其他策略；⑦ 非 admin 写 403。
## 12A.19 兑换码签发/吊销/查询（2026-08-11 新增，P1-4）

> 运营后台批量签发 Pro 激活码，格式与桌面端 `redemption-codes.js` 完全兼容（HMAC-SHA256，`MP-XXXX-XXXX-SIG`）。共享密钥：`OPS_REDEMPTION_SECRET` 必须等于桌面端 `REDEMPTION_SECRET`，否则桌面端无法验证。

### 12A.19.1 数据模型与签发算法

`redemption_codes`：id（代理主键，操作引用）/ code（唯一）/ plan（free|trial|pro）/ batch_id / status（active|revoked）/ expires_at（ISO 或空）/ note（≤200）/ created_at / updated_by。列表始终掩码 `MP-****-****-SIG`，操作按 id。

签发算法（与桌面端逐字符一致）：
- 随机段字母表 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（去 I/O/0/1），4 字符 ×2；
- payload = `MP-RAND-RAND`；签名 = `HMAC-SHA256(payload, secret).hexdigest().upper()[:4]`；
- code = `payload-SIG`。

### 12A.19.2 端点（均 admin）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/redemption-codes/batch | 批量签发（count 1-200、plan 枚举、expires_at ISO、note ≤200；未配置 OPS_REDEMPTION_SECRET → 400 fail-closed） |
| GET | /api/v1/redemption-codes?plan=&status=&limit=&offset= | 列表（掩码） |
| PUT | /api/v1/redemption-codes/{id}/revoke | 吊销（404 兜底） |
| DELETE | /api/v1/redemption-codes/{id} | 删除（404 兜底） |

### 12A.19.3 前端「兑换码」页

- 批量签发弹窗：数量（1-200）/ 套餐下拉（free/trial/pro）/ 过期时间（ISO）/ 备注。
- 签发成功：批次号 + 掩码列表（提示「列表展示为掩码，完整码已存库」）。
- 列表：掩码 / 套餐 tag / 状态 tag（有效|已吊销）/ 批次 / 过期时间 / 签发时间 / 备注 / 操作（有效→吊销、删除）。
- 顶部说明：OPS_REDEMPTION_SECRET 与桌面端 REDEMPTION_SECRET 一致契约。

### 12A.19.4 验收标准

① 签发格式与桌面端 validate() 兼容（签名可复算）；② count/plan/expires_at 非法 → 400；③ 未配置密钥 → 400；④ 列表掩码、操作按 id；⑤ 吊销/删除不存在 → 404；⑥ 非 admin 403。


## 12A.21 流水线所需依赖目录（2026-08-11 新增）

> 列出所有视频创作流水线运行所需的模型类型（推理 / 图片生成 / 视频生成 / TTS 语音 / 语音识别 / 音频生成）与候选供应商，种子对齐代码事实（pipeline-engine.js 流水线定义 + model-provider-seeds.js 供应商目录）；运营可维护，为后续「桌面端配置检查」提供依据。

### 12A.21.1 数据模型与校验

`pipeline_dependencies`：id（代理主键）/ pipeline_id（`^[a-z0-9_-]{1,64}$`）/ pipeline_name（≤100）/ model_type（枚举 llm/tts/speech_recognition/image/video/audio/multimodal）/ required（0=可选）/ provider_candidates（JSON 字符串数组 ≤50，去重保序）/ default_provider（必须在候选内或留空）/ description（≤200）/ enabled / sort_order（非负整数）/ deleted_at（软删，不复活，可重建）/ updated_at / updated_by；唯一约束 (pipeline_id, model_type)。

- POST 重复 (pipeline_id, model_type) → 400；PUT 部分更新 + 404（改 key 撞唯一 → 400 兜底）；DELETE 软删 + 404；IntegrityError 兜底 400。

### 12A.21.2 种子（代码事实，INSERT-OR-IGNORE 不覆盖运营修改）

覆盖 12 个有模型依赖的流水线（story2video-compose / animated-explainer / talking-head / cinematic / animation / avatar-spokesperson / character-animation / clip-factory / documentary-montage / hybrid / localization-dub / podcast-repurpose），共 31 条；供应商候选与默认值对齐 model-provider-seeds.js 预设目录（如 llm 默认 anthropic、image 默认 flux、video 默认 minimax、tts 默认 minimax-tts、speech_recognition 默认 whisper、audio 默认 suno）。
screen-demo（屏幕演示录制）与 framework-smoke（冒烟测试）无模型依赖，不播种。

### 12A.21.3 端点（GET 登录可读；写 admin）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/pipeline-dependencies?pipeline_id=&model_type= | 列表（筛选） |
| POST | /api/v1/pipeline-dependencies | 新增（admin） |
| PUT | /api/v1/pipeline-dependencies/{id} | 更新（admin） |
| DELETE | /api/v1/pipeline-dependencies/{id} | 软删（admin） |

### 12A.21.4 前端「流水线依赖」页

- 列表：流水线 ID / 名称 / 模型类型 tag / 必选 tag（必选=红 / 可选=灰）/ 默认供应商 / 候选供应商 tags / 说明 / 启用开关 / 操作（编辑、删除）；顶部流水线 ID 输入筛选 + 模型类型下拉筛选 + 「新增依赖」。
- 编辑弹窗：流水线 ID（编辑禁用）/ 名称 / 模型类型（编辑禁用下拉）/ 必选开关（提示「关闭=可选（缺省时该能力降级）」）/ 候选供应商（逗号分隔，提示建议预设）/ 默认供应商（从候选中下拉）/ 说明 / 启用。
- 顶部说明：数据种子对齐代码事实；「必选」表示运行前必须配置该类模型。

### 12A.21.5 验收标准

① 种子 31 条、story2video-compose 含 llm/image/tts/video(可选)；② 校验：pipeline_id 字符集 / model_type 枚举 / default 在候选内 / 候选类型 → 400；③ POST 重复 400、PUT/DELETE 404；④ 软删不复活、可重建；⑤ 筛选正确；⑥ 非 admin 写 403、读 200。
## 12A.22 提示词评测工作台 PromptEval Workbench（2026-08-12 新增）

> 由运营人员在运营后台**真实生成**图片/视频，对「提示词优化引擎」的改写效果进行同屏比对与聚合分析。桌面端 PromptEval（PR #559，eaf067c8）提供评估契约；本功能在运营后台落地「评测工作台」。配套独立文档：`01-docs/PRD-PROMPT-EVAL-OPS-WORKBENCH-2026-08-12.md`。

### 12A.22.1 背景与目标

桌面端 PromptEval v1 已实现「图片评估」（关联度/内容准确性/视觉审美/跨图一致性打分、问题归因、提示词优化点），但评估数据只存在于用户本机，运营/产品完全不可见，无法形成「评估 → 改进 → 复评」的运营侧实证闭环。

本功能在运营后台建设**评测工作台**：运营人员录入「原文文本 + 优化后的提示词（中文）」，后台 LLM 自动生成**英文对照（标注「机器翻译」来源）**，真实调用图片生成模型产出素材，再调用视觉评估模型打分，页面同屏展示 **原文 | 中英提示词 | 生成物 | 评估结果**，支持多次生成对比、历史回溯与聚合分析，为 prompt-engine 改写模板迭代提供运营侧数据依据。

### 12A.22.2 决策点定案（2026-08-12 用户确认）

| 决策点 | 定案 |
|--------|------|
| A 生成 provider 选型 | **A1：ops-center 后端服务端直连模型 API**。v1 图片：`minimax-image`（image-01）与 `flux` 至少其一（可配置多 provider，默认 minimax-image）；v2 视频：minimax / hunyuan |
| A 密钥管理 | ops-center 环境变量 + 后台「模型密钥」配置（复用 `OPS_CATALOG_API_KEY` 管理模式）；密钥仅服务端持有、加密存储、**绝不返回前端** |
| B 中英对照 | **后台 LLM 自动翻译**优化后提示词 → 英文对照，UI 标注「机器翻译」徽标；来源写库可审计；可配置启用/禁用与目标语言（默认 zh→en） |
| 视频范围 | **v1 图片先行；视频 v2**（与桌面端口径一致：mediaType=video 明确拒绝，v2 再实现时序一致性/运动准确性/音画同步维度） |

### 12A.22.3 角色与权限

| 角色 | 能力 |
|------|------|
| 运营（登录） | 创建评测 case、触发翻译、创建/查看 run、查看/对比/删除**自己创建**的评测、查看聚合分析 |
| 管理员（`require_admin`） | 管理「模型密钥」、查看/删除全部评测、清理数据 |
| 未登录 | 不可访问（全部接口 `get_current_user` 起） |

- 读接口：`get_current_user`；写接口（cases/runs/translate）：`get_current_user`；密钥管理：`require_admin`。

### 12A.22.4 数据模型

| 表 | 字段（要点） |
|----|--------------|
| `prompt_eval_cases` | id、title、source_text（原文）、context（可选）、prompt_zh（优化后提示词·中文，必填）、prompt_en（LLM 翻译结果，服务端生成）、prompt_en_source（`machine_translation`/`manual`/null）、prompt_en_translated_at、provider、model、image_count（1-20，默认 1）、aspect_ratio、created_by、created_at、updated_at、deleted_at |
| `prompt_eval_runs` | id、case_id、provider、model、status（`queued/processing/succeeded/failed`）、image_paths（JSON 数组，落盘/COS URL）、video_path（v2 预留）、eval_status（`pending/succeeded/failed`）、overall_score、grade、dimensions（JSON）、problems（JSON）、optimization_points（JSON）、error（阶段+原因）、created_by、created_at、completed_at |
| `prompt_eval_provider_keys`（admin） | provider、model、key_enc（加密）、base_url（可选）、enabled、created_at |

- 生成物只存 URL/路径，不存 base64；删除 case 时级联删除 run 与本地生成物（回收）。

### 12A.22.5 接口契约（`/api/v1/prompt-eval/*`）

| 方法/路径 | 权限 | 说明 |
|-----------|------|------|
| `POST /cases` | 登录 | 创建评测 case（全字段校验，见 12A.22.8） |
| `POST /cases/{id}/translate` | 登录/创建者 | 触发 LLM 翻译 prompt_zh→prompt_en（幂等：同 prompt_zh 已翻译且未过期则复用） |
| `POST /cases/{id}/runs` | 登录/创建者 | 创建 run 并异步执行「生成 → 评估」流水线（立即返回 run，前端轮询） |
| `GET /runs/{id}` | 登录/创建者/管理员 | run 详情（含 status/eval_status/结果），轮询用 |
| `GET /cases` | 登录 | 列表（分页、按创建人/状态/时间筛选） |
| `GET /cases/{id}` | 登录/创建者/管理员 | case + 全部 runs（详情/对比用） |
| `DELETE /cases/{id}` | 创建者/管理员 | 删除 case（级联 runs 与本地生成物） |
| `GET /summary` | 登录 | 聚合分析（记录数/平均分/等级分布/维度均值/问题类别分布/优化点 Top/按 provider·model 对比） |
| `GET/PUT /providers` | admin | 模型密钥目录管理（provider/model/base_url/enabled；返回不含密钥明文） |

### 12A.22.6 异步流程与状态机

```
POST /cases/{id}/runs → status=queued
  → processing：生成图片（有界瞬时重试；429 退避）
      ├─ 失败 → status=failed（error 记录阶段+原因；不静默降级）
      └─ 成功 → 生成物落盘/COS → status=succeeded，eval_status=pending
  → eval_status=evaluating：调用视觉评估 LLM
      ├─ 非法输出（非 JSON/分数越界/白名单外）→ eval_status=failed（生成物保留）
      └─ 合法 → eval_status=succeeded，写入 overall/grade/dimensions/problems/optimization_points
```

- 前端轮询 `GET /runs/{id}`：图片 2-5s；视频 v2 放宽到 10-30s。
- 断点/并发：同一 case 可多次创建 run（多次生成对比）；`POST /cases/{id}/runs` 对进行中 run 不做互斥（允许并行生成，额度由后台配置限制并发 ≤3）。

### 12A.22.7 生成服务与密钥管理（决策点 A）

- 新增 `services/prompt_eval_generation.py`：provider 适配（v1 至少 `minimax-image`、`flux`；OpenAI 兼容 `/images/generations` 或各 provider 原生），HTTP 客户端 + 超时 + 有界重试 + 429 退避；
- 请求参数与桌面端 AssetGenerator 对齐（prompt/style/image_provider/aspect_ratio/image_count）；
- 结果校验：返回必须为受支持图片（扩展名/魔数），空/错误 → run failed（不降级）；
- 密钥：`prompt_eval_provider_keys` 加密存储，admin 维护；未配置任何可用密钥时创建 run 返回可操作错误（**按角色区分**：admin →「未配置可用的图片生成模型，请先在侧边栏「模型密钥」（/model-keys）中配置」；非 admin →「…请联系管理员在「模型密钥」中配置」——因「模型密钥」菜单仅 admin 可见，非 admin 不应被引导到不可见页面）；
- 密钥类型（「模型密钥」页 Provider 下拉）：`minimax-image` / `flux`（生图）、`minimax-llm`（中英对照优化+翻译）、`minimax-vision` / `opencode-go-vision`（生成物视觉评估，OpenAI 兼容 base_url/model/api_key，如 Opencode-Go 视觉模型 base_url=`https://opencode.ai/zen/go/v1`）；LLM/视觉密钥优先读密钥表（视觉候选顺序 minimax-vision → opencode-go-vision），fallback 环境变量 `OPS_PROMPT_EVAL_LLM_*` / `OPS_PROMPT_EVAL_VISION_API_KEY`；
- 与桌面端一致：密钥/凭据不出现在任何响应、日志、评估提示词中；
- **测试连通**：`POST /providers/test`（admin）用表单值或已保存密钥探测连通性——先 `POST {base}/chat/completions`（`max_tokens=1` 最小请求，覆盖 llm/vision/opencode），404/405 时 fallback `GET {base}/models`（覆盖 image 类）；均不可达提示「请用真实生成验证」；不落库、不产生真实生成费用。前端「模型密钥」表单与列表项均提供「测试连通」按钮。

### 12A.22.8 数据校验（fail closed，对齐桌面端契约）

| 字段 | 规则 |
|------|------|
| source_text | 非空，≤20000 |
| context（可选） | 序列化 ≤20000；**递归**过滤敏感键（password/token/secret/api_key/credential 等，任意嵌套命中即 400） |
| prompt_zh | 非空，≤5000 |
| provider/model | 必须在已配置密钥目录内（否则 400 + 引导文案） |
| image_count | 整数 1-20 |
| aspect_ratio | 枚举：`1:1/16:9/9:16/3:4/4:3` |
| prompt_en | 只能由服务端翻译生成（`prompt_en_source` 服务端标注，客户端不可伪造） |
| 生成结果 | 图片扩展名/魔数校验，空/非法 → run failed |
| 评估结果 | overall 0-100、维度 id 白名单且不重复、score 0-100、evidence 非空、problems/promptOptimizationPoints 必须为数组且白名单；任一违反 → eval_status=failed（不静默降级） |

错误响应统一 `{ code, message, details? }`（对齐桌面端 EVAL_* 语义，前缀 `OPS_PROMPT_EVAL_*`）。

### 12A.22.9 中英对照（决策点 B）

- `services/prompt_eval_translation.py`：LLM 翻译 prompt_zh → prompt_en，输出契约 `{ prompt_en, source: 'machine_translation' }`；
- 幂等：同一 case 同一 prompt_zh 已翻译且 7 天内不重复翻译；翻译失败可重试（不阻塞生图，生图仍用 prompt_zh）；
- UI：英文提示词旁显示「机器翻译」徽标；来源字段可审计；
- 配置：`prompt_eval.translation.enabled`（默认 true）、`target_language`（默认 en）。

### 12A.22.10 评估服务

- 复用桌面端 PromptEval 维度/评分/问题分类/优化点**契约常量**（`IMAGE_DIMENSIONS` 权重、11 类问题、7 类优化点、severity 3 类），以共享常量表或一致性测试保证两端对齐；
- `services/prompt_eval_evaluation.py`：调视觉 LLM（OpenAI 兼容 `image_url` content），构造评估提示词（复用桌面端 prompt-builder 的「输入快照 + JSON 契约」语义：原文/上下文/prompt_zh/prompt_en/图片数）；
- 解析 + 白名单校验 fail closed；评估输入快照存库（可审计、可复现）。

### 12A.22.11 交互逻辑与显示项（前端「评测工作台」页）

**Tab1 新建评测**
- 显示项：标题、原文（多行）、上下文（可选多行）、优化后提示词·中文（多行）、英文对照（只读，生成后显示 + 「机器翻译」徽标）、provider/模型下拉（从密钥配置读取，无密钥时显示引导）、图片数（1-20）、画幅下拉；
- 操作按钮：①「生成英文对照」（调 translate，成功后双语并排显示）②「生成并评估」（创建 run）；
- 校验：字段级错误提示；翻译失败可重试。

**Tab2 评测列表/详情**
- 列表：标题、创建时间、创建人、provider/模型、状态徽章（生成中/评估中/成功/失败）、总体分；
- 详情：**同屏四栏 = 原文 | 中英提示词（英文标「机器翻译」）| 生成图片缩略图（点击放大）| 评估结果**（总分/等级/维度条/问题清单按严重度/提示词优化点）；
- 操作：重新生成（新 run）、删除（二次确认）；同 case 多 run **并排对比**（分数对比表：维度 × run）。

**Tab3 聚合分析**
- 显示项：记录数/平均分/等级分布（优秀/良好/一般/差）、维度均值条形、问题类别 Top（次数+严重度）、优化点类型 Top（含示例）、按 provider/模型分数对比、推荐动作文本。

**关键提示文字（文案清单）**
- 「生成英文对照」「机器翻译」「生成并评估」「评估中（第 {n}/{m} 张）...」「生成失败：{原因}」「评估失败：评估模型未返回有效结果」「请先填写原文与优化后的提示词」「未配置可用的图片生成模型，请先在「模型密钥」中配置」「确认删除该评测及其生成物？」

### 12A.22.12 存储与安全

- 生成物：ops-center 媒体目录（或 COS），记录 URL；删除 case 级联清理；
- 密钥：加密存储、admin 管理、不出现在响应/日志/评估提示词；评估与翻译请求中不携带凭据；
- 敏感上下文递归过滤（对齐桌面端 `assertNoSensitiveContext` 语义）；图片/文案上云为运营自测内容（无用户数据合规风险）。

### 12A.22.13 验收标准

1. 创建 case 全字段校验矩阵通过（pytest）；
2. 中英对照：LLM 翻译成功 → 展示+「机器翻译」标注+来源入库；失败可重试；幂等复用；
3. 真实生图：至少 1 个 provider 真实生成图片并落盘/URL 可访问（外部验收边界：真实 provider 与密钥）；
4. 评估：真实视觉模型对生成图打分并落库；非法响应 → eval_status=failed（fail closed 测试用 mock）；
5. 前端三 Tab 可用；无密钥时给出引导文案；双语标注正确；
6. 聚合分析输出正确（数值与桌面端 analyze 口径一致）；
7. `pytest` 全量通过 + 前端 `npm run build` 通过 + 与桌面端 prompt-eval 契约一致性测试；
8. 视频 v2 预留：`video_path` 字段与 video 维度占位，v1 不暴露视频生成入口。

### 12A.22.14 视频扩展（v2，不在本期实现）

- provider 增加视频生成（minimax/hunyuan）；runs 增加 video_path 与抽帧（首/中/尾）；
- 评估维度增加 `temporal_consistency/motion_accuracy/audio_visual_sync/video_aesthetic_quality`（与桌面端 v2 对齐）；
- 中英对照、聚合分析、鉴权与存储模式不变。

### 12A.22.15 测试策略

- 后端 pytest：cases/runs/summary 接口、校验矩阵、翻译服务（mock LLM）、生成服务（mock provider HTTP + 真实 provider 外部验收）、评估服务（mock 视觉 LLM + 非法响应 fail closed）、鉴权（登录/管理员/未登录）、删除级联；
- 前端：组件测试（表单校验/状态徽章/双语标注/非空数据路径）；
- 契约：桌面端 prompt-eval 维度/错误码一致性断言（两端共享枚举表）。


### 12A.22.16 场景层评测工作流（2026-08-12 调整）

> 运营人员**输入整篇文案原文**，后台按**桌面端分句机制**拆成场景层，逐场景自动展示「场景文字 / 字幕二次分句 / 场景上下文 / 优化后提示词（中英对照）」，并可逐场景「生成图片」+ 评估（复用 12A.22 既有流程，生成部分不变）。

**工作流**：输入整篇文案 → 后台分句（场景级分割 + 字幕二次分句 + 场景上下文提取）→ 场景层列表 → 逐场景生成/展示 中英优化提示词 → 逐场景「生成图片」→ 生成物 + 评估结果 → 多 run 对比 / 聚合分析。

### 12A.22.17 场景层数据模型

| 表/字段 | 说明 |
|---------|------|
| `prompt_eval_cases`（扩展） | 新增 `source_mode`（`manual`=旧整 case 模式 / `scene`=场景层模式）；`scene` 模式时 `source_text` 为整篇文案原文 |
| `prompt_eval_scenes`（新增） | id、case_id（FK）、index、scene_text、subtitle_blocks（JSON）、scene_context（JSON）、prompt_zh、prompt_en、prompt_en_source（machine_translation/manual）、prompt_en_translated_at、created_at、updated_at |
| `prompt_eval_runs`（扩展） | 新增 `scene_id`（可空 FK；NULL=旧模式整 case 生成） |
| subtitle_blocks 结构 | `[{ index, text, start_seconds?, end_seconds?, duration? }]`（对齐桌面端字幕分句输出） |
| scene_context 结构 | 白名单键（对齐桌面端 story-context-engine 语义）：`genre/era/culture/setting/time/characters/props/visual_style/tone/summary/anchors/negative_anchors` |

### 12A.22.18 场景层接口

| 方法/路径 | 权限 | 说明 |
|-----------|------|------|
| `POST /cases`（scene 模式） | 登录 | 传 `source_mode=scene` + 整篇原文 + 分句配置 → 后台分句并创建 scenes，返回 case+scenes |
| `GET /cases/{id}` | 登录/创建者/管理员 | 含 scenes（每场景：scene_text / subtitle_blocks / scene_context / prompt_zh / prompt_en） |
| `POST /cases/{id}/scenes/{sid}/translate` | 登录/创建者 | 按场景生成中英对照（LLM 优化 + 翻译，source=machine_translation，幂等 7 天） |
| `POST /cases/{id}/scenes/{sid}/runs` | 登录/创建者 | 按场景生成图片（prompt 用该场景 prompt_zh；provider/model/画幅/图片数来自 case）→ 复用生成→评估状态机 |
| `GET /runs/{id}`、`GET /summary` | 登录 | 不变；summary 可按 scene 维度聚合 |

**分句配置（scene 模式请求体）**：`target_chars_per_scene`（默认 20，1-200）、`subtitle_min_chars`（默认 8）、`subtitle_max_chars`（默认 15）、`subtitle_timing`（proportional/equal，默认 proportional）、`language`（默认 zh）——与桌面端 story2video-compose split 阶段默认一致。

### 12A.22.19 分句与优化提示词生成（复用桌面端分句机制）

- **分句语义基准**：桌面端 `packages/story2video-engine/src/text-segmentation.ts`（三级分割：句子边界消歧 → 场景级分割 → 字幕级分割，纯本地无网络）与 smart-sentence-splitter（8002）契约；ops-center 后端提供 Python 分句实现（场景级 + 字幕级），**一致性测试**用 node 加载桌面端 `text-segmentation.ts` 对同一输入断言 scenes/subtitle_blocks 一致（参照 prompt_eval_contract 的 node 加载断言模式）。
- **场景上下文**：按桌面端 `story-context-engine.js` 语义提取（白名单键见 12A.22.17），后台实现；提取失败不静默降级（明确错误或标记 degraded）。
- **优化提示词生成**：后台 LLM 以「整篇原文 + 场景文字 + 场景上下文」为输入生成该场景中文优化提示词（prompt_zh），再翻译英文（prompt_en，source=machine_translation）；支持运营编辑覆盖 prompt_zh（编辑后 prompt_en 标记需重新生成）。
- **分句失败处理**：分句服务异常 → 返回可操作错误（「分句失败：{原因}」），不落库、不降级。

### 12A.22.20 交互与显示（场景层评测工作台）

**Tab「新建评测」**新增「场景模式」：
- 输入：整篇文案原文（多行，≤20000）+ 分句配置（折叠高级项）+ provider/模型/画幅/图片数；
- 按钮：「分句并生成场景」→ 调 `POST /cases`（scene 模式）→ 展示场景层列表；
- **每场景卡片四区**：① 场景文字（序号 + scene_text）；② 字幕二次分句（subtitle_blocks 逐条：文字 + 目标时长，来源标注 local/分句服务语义）；③ 场景上下文（scene_context 键值展示：时代/地域/角色/道具/视觉风格/负面锚点等）；④ 优化提示词中英文（中文可编辑 + 英文「机器翻译」徽标 + 「重新生成中英对照」）；
- 每场景操作：「生成图片」（复用生成→评估）+ 评估结果卡（总分/等级/维度/问题/优化点）+ 多 run 对比；
- 可选：「批量生成中英对照」（全部场景一次生成）。

**新增提示文字**：「分句并生成场景」「场景 {n}」「字幕二次分句」「场景上下文」「重新生成中英对照」「批量生成中英对照」「分句失败：{原因}」「请先输入整篇文案原文」。

**校验（scene 模式）**：原文非空 ≤20000；分句配置边界（target_chars_per_scene 1-200、subtitle_min 1-50、subtitle_max min+1..200、subtitle_min < subtitle_max）；provider/model 已配置密钥；场景数上限 100（超出 400）。

### 12A.22.21 验收标准（场景层增补）

1. scene 模式分句：同一输入与桌面端 `text-segmentation.ts` 输出场景数/字幕块一致（一致性测试）；
2. 每场景四区完整展示（场景文字/字幕块/上下文/中英提示词），且「生成图片」→ 评估结果可用（真实 provider 外部验收）；
3. 中英对照幂等、可编辑覆盖；编辑 prompt_zh 后 prompt_en 标记待重生成；
4. 分句失败明确报错不降级；场景数超限 400；
5. pytest（分句/场景接口/一致性）+ 前端 build；12A.22.13 既有验收不回归。
