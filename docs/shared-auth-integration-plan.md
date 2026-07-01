# 共享认证模块集成方案

**日期**: 2026-06-03  
**目标**: 复用 002 的 `shared/auth/` 模块，供 001 + 002 + 003 三个项目共享

---

## 现状分析

### 002 已有完整认证模块 ✅

```
shared/auth/
├── jwt_handler.py      # JWT 生成/验证（HS256，7天 access + 30天 refresh）
├── auth_middleware.py  # FastAPI 依赖注入式鉴权（get_current_user, check_video_quota）
├── auth_routes.py      # 注册/登录/刷新/查询当前用户
└── models.py           # Pydantic 数据模型
```

**功能完整度**：
| 功能 | 状态 |
|------|------|
| 用户注册 | ✅ |
| 登录（username/email） | ✅ |
| JWT Access + Refresh Token | ✅ |
| 依赖注入式鉴权 | ✅ |
| 配额检查 | ✅ |
| 角色权限 | ✅ |

### 当前问题

| 问题 | 说明 |
|------|------|
| **硬编码配置** | `JWT_SECRET_KEY`、`DATABASE_URL` 直接写在代码里 |
| **数据库依赖** | 直接 `psycopg2` 连接 PostgreSQL，001 用 SQLite |
| **项目耦合** | `shared/auth/` 在 002 项目目录内，001/003 无法直接引用 |

---

## 推荐方案：提取为独立共享模块

### 架构设计

```
~/.qclaw/workspace/team/shared/
└── auth/
    ├── __init__.py
    ├── jwt_handler.py      # 纯 Python，无数据库依赖 ✅ 可直接复用
    ├── auth_middleware.py  # FastAPI 依赖，无数据库依赖 ✅ 可直接复用
    ├── models.py           # Pydantic，无数据库依赖 ✅ 可直接复用
    ├── auth_routes.py      # 需要适配数据库连接
    └── config.py           # 新增：配置管理
```

### 复用策略

| 模块 | 001 复用方式 | 002 复用方式 | 003 复用方式 |
|------|-------------|-------------|-------------|
| `jwt_handler.py` | 直接 copy | 原地使用 | 直接 copy |
| `auth_middleware.py` | 直接 copy | 原地使用 | 直接 copy |
| `models.py` | 直接 copy | 原地使用 | 直接 copy |
| `auth_routes.py` | 需要适配 SQLite | 原地使用 | 需要适配 |

---

## 实施步骤

### Step 1：创建共享目录结构

```bash
mkdir -p ~/.qclaw/workspace/team/shared/auth
cp shared/auth/*.py team/shared/auth/
```

### Step 2：提取配置（新增 config.py）

```python
# team/shared/auth/config.py

import os
from functools import lru_cache

class AuthConfig:
    """认证模块配置"""
    
    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "dev-secret-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # 数据库（各项目可覆盖）
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    
    # 数据库类型：postgresql | sqlite
    DATABASE_TYPE: str = os.getenv("DATABASE_TYPE", "postgresql")
    
    # SQLite 路径（当 DATABASE_TYPE=sqlite 时使用）
    SQLITE_PATH: str = os.getenv("SQLITE_PATH", "./data/user.db")


@lru_cache
def get_config() -> AuthConfig:
    return AuthConfig()


def get_db_connection():
    """根据配置返回数据库连接"""
    config = get_config()
    
    if config.DATABASE_TYPE == "sqlite":
        import sqlite3
        conn = sqlite3.connect(config.SQLITE_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    
    # PostgreSQL
    import psycopg2
    return psycopg2.connect(config.DATABASE_URL)
```

### Step 3：修改 jwt_handler.py（移除硬编码）

```python
# 修改前
JWT_SECRET_KEY: str = "dev-secret-key-change-in-production!"

# 修改后
from shared.auth.config import get_config

JWT_SECRET_KEY: str = get_config().JWT_SECRET_KEY
JWT_ALGORITHM: str = get_config().JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES: int = get_config().ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS: int = get_config().REFRESH_TOKEN_EXPIRE_DAYS
```

### Step 4：修改 auth_routes.py（适配多数据库）

```python
# 修改前
DATABASE_URL: str = "postgresql://..."

def _get_conn():
    import psycopg2
    return psycopg2.connect(...)

# 修改后
from shared.auth.config import get_db_connection, get_config

def _get_conn():
    return get_db_connection()
```

### Step 5：各项目配置

**PROJECT-001（SQLite）**：
```yaml
# content-aggregator/config/auth.yaml
auth:
  jwt_secret: "content-aggregator-secret-change-in-production"
  database_type: sqlite
  sqlite_path: ./data/user.db
```

**PROJECT-002（PostgreSQL）**：
```yaml
# MoneyPrinterTurbo/config/auth.yaml
auth:
  jwt_secret: "mpt-saas-secret-change-in-production"
  database_type: postgresql
  database_url: "postgresql://..."
```

**PROJECT-003（可选 SQLite）**：
```yaml
# multi-publish/config/auth.yaml
auth:
  jwt_secret: "multi-publish-secret-change-in-production"
  database_type: sqlite
  sqlite_path: ./data/user.db
```

---

## 关键决策

### 决策 1：JWT_SECRET 是否统一？

| 方案 | 说明 | 推荐 |
|------|------|------|
| A. 统一密钥 | 三个项目用同一 JWT_SECRET，用户登录一个系统即可访问所有 | ⭐ 推荐 |
| B. 独立密钥 | 各项目独立密钥，需要跨项目登录时重新认证 | 备选 |

**建议**：初期用 **统一密钥**，简化用户体验。后期可拆分为独立密钥 + OAuth2。

### 决策 2：用户数据库是否统一？

| 方案 | 说明 | 推荐 |
|------|------|------|
| A. 统一 user_db | 三个项目共享同一 PostgreSQL 用户库 | ⭐ 推荐 |
| B. 各自 SQLite | 各项目独立用户库，需要用户重复注册 | 备选 |

**建议**：初期用 **统一 PostgreSQL user_db**（002 已有），001 和 003 连接同一库。

---

## 实施优先级

| 优先级 | 任务 | 预计工时 |
|--------|------|----------|
| P0 | 提取 `shared/auth/` 到独立目录 | 1h |
| P0 | 新增 `config.py` 配置管理 | 0.5h |
| P0 | 修改 `jwt_handler.py` 移除硬编码 | 0.5h |
| P1 | 修改 `auth_routes.py` 适配多数据库 | 1h |
| P1 | 001 集成认证模块（复制 + 配置） | 1h |
| P1 | 003 集成认证模块（复制 + 配置） | 1h |
| P2 | 统一用户数据库迁移 | 2h |

---

## 代码复用清单

可直接复制的文件（无需修改）：
- ✅ `jwt_handler.py`（修改配置导入后）
- ✅ `auth_middleware.py`（修改配置导入后）
- ✅ `models.py`（无需修改）

需要适配的文件：
- ⏳ `auth_routes.py`（数据库连接适配）
- ⏳ 各项目的 `config.yaml`（添加 auth 配置）

---

## 总结

| 问题 | 答案 |
|------|------|
| 002 有现成代码吗？ | **有**，`shared/auth/` 模块完整 |
| 可以直接用吗？ | **基本可以**，需提取配置 + 适配数据库 |
| 需要重新写吗？ | **不需要**，复用 002 的代码 |
| 三个项目共享吗？ | **是**，提取到 `team/shared/auth/` |

**下一步**：需要我立即开始提取和适配吗？
