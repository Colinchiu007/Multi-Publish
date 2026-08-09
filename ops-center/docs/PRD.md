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
├── /projects                  # 项目列表
│   └── /projects/:code        # 项目配置详情
│       ├── 配置分组 tabs
│       └── 配置编辑器
├── /secrets                   # 密钥管理（V0.2）
│   ├── 提供商列表
│   └── 密钥编辑弹窗
├── /platforms                 # 平台凭证（V0.3）
├── /audit-log                 # 审计日志
│   ├── 过滤（项目、时间、操作人）
│   └── 变更详情弹窗（diff 视图）
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
