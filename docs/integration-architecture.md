# PROJECT-001 + PROJECT-003 集成架构方案

**日期**: 2026-06-03  
**目标**: 两个项目独立运营 + API 集成 + 统一用户系统

---

## 核心原则

| 原则 | 说明 |
|------|------|
| **独立产品** | 各自独立部署、独立域名、独立管理后台 |
| **API 集成** | 001 改写完成后，调用 003 API 发布（而非代码级耦合） |
| **统一用户** | 共享用户数据库 + JWT，单点登录 |

---

## 架构方案

### 方案 A：API 调用集成（推荐 ✅）

```
┌─────────────────────────────────────────────────────────────┐
│                    统一用户系统 (Auth Server)                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  用户数据库 (user_db) + JWT 签发                      │   │
│  │  - users 表                                          │   │
│  │  - user_profiles 表                                  │   │
│  │  - JWT_SECRET 共享                                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                              │
         │ JWT Token                    │ JWT Token
         ▼                              ▼
┌──────────────────────┐    ┌──────────────────────┐
│   PROJECT-001        │    │   PROJECT-003        │
│   Content Aggregator │    │   Multi Publish      │
│                      │    │                      │
│  - 内容采集          │    │  - 账号管理           │
│  - AI 改写           │    │  - 任务队列           │
│  - 多格式导出        │    │  - 平台发布           │
│                      │    │                      │
│  [一键发布按钮] ──────┼────┼─> POST /api/publish  │
│                      │    │                      │
│  独立部署            │    │  独立部署             │
│  独立域名            │    │  独立域名             │
│  独立管理后台        │    │  独立管理后台         │
└──────────────────────┘    └──────────────────────┘
```

**特点**：
- 001 和 003 完全独立，可单独运营、单独定价
- 001 的「一键发布」通过 HTTP API 调用 003
- 用户登录 001 后，JWT 可透传到 003（或 003 验证同一 JWT_SECRET）

---

### 集成方式：001 → 003

**在 PROJECT-001 中添加发布功能**：

```python
# content-aggregator/src/content_aggregator/publish_integration.py

import httpx
from pydantic import BaseModel

class PublishRequest(BaseModel):
    title: str
    content: str
    platforms: list[str]
    draft: bool = False

class PublishClient:
    """PROJECT-003 发布客户端"""
    
    def __init__(self, base_url: str, api_token: str):
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self._http = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_token}"},
        )
    
    async def publish(self, request: PublishRequest) -> dict:
        """调用 003 发布 API"""
        response = await self._http.post("/api/publish", json=request.model_dump())
        return response.json()
    
    async def close(self):
        await self._http.aclose()
```

**001 配置中添加**：

```yaml
# content-aggregator/config/config.yaml

publish:
  enabled: true
  service_url: "http://localhost:8082"  # 003 服务地址
  api_token: "enc:..."                   # 001 服务调用 003 的令牌
  default_platforms: ["wechat_mp"]
```

**001 Web UI 中添加按钮**：

```html
<!-- content-aggregator/web/templates/article.html -->

<div class="publish-actions">
    <button id="publishBtn" class="btn btn-primary">
        🚀 一键发布到公众号
    </button>
</div>

<script>
document.getElementById('publishBtn').addEventListener('click', async () => {
    const response = await fetch('/api/publish-to-platforms', {
        method: 'POST',
        body: JSON.stringify({
            title: article.title,
            content: article.content,
            platforms: ['wechat_mp']
        })
    });
    // 显示 003 返回的结果
});
</script>
```

---

## 统一用户系统设计

### 数据库设计（共享）

```sql
-- 用户数据库（两个项目共享）
-- 位置：可部署在独立服务器，或 001 的数据库服务器

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_profiles (
    user_id UUID REFERENCES users(id),
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    preferences JSONB,
    PRIMARY KEY (user_id)
);

-- 项目 001 专属表
CREATE TABLE content_db.content_items (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    ...
);

-- 项目 003 专属表
CREATE TABLE video_db.publish_accounts (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    platform VARCHAR(50),
    config_encrypted TEXT,
    ...
);
```

### JWT 共享方案

```yaml
# 两个项目共享同一 JWT_SECRET

# PROJECT-001 config.yaml
auth:
  jwt_secret: "shared-secret-key-change-in-production"
  token_expiry: 3600

# PROJECT-003 config.yaml  
auth:
  jwt_secret: "shared-secret-key-change-in-production"  # 相同
  token_expiry: 3600
```

**登录流程**：

```
用户 → 001 登录 → 001 签发 JWT → 存储到 001
                    ↓
用户访问 003 → 003 验证 JWT (同一 SECRET) → 允许访问
```

**或者使用独立 Auth Server**（更专业）：

```
用户 → Auth Server 登录 → 签发 JWT → 001 和 003 都验证同一 JWT
```

---

## 产品运营独立性

| 维度 | 说明 |
|------|------|
| **部署** | 各自独立服务器/容器，可独立扩容 |
| **域名** | 001: `content.example.com`，003: `publish.example.com` |
| **定价** | 001 按采集量/改写次数计费，003 按发布次数计费 |
| **管理后台** | 各自独立，001 管理内容，003 管理账号和发布 |
| **数据隔离** | 用户数据共享，业务数据各自存储 |

---

## 未来扩展

| 场景 | 方案 |
|------|------|
| 001 用户直接使用 003 | 001 内嵌 003 的发布界面（iframe 或 API 代理） |
| 003 独立用户 | 003 独立注册登录，JWT 同样验证 |
| 多项目统一门户 | 新增 Auth Server + Dashboard，聚合 001/003/002 |

---

## 实施步骤

### Phase 1：独立运营（当前状态）
- ✅ 001 独立运行
- ✅ 003 独立运行
- ⏳ 共享用户数据库设计

### Phase 2：API 集成
1. 003 添加 JWT 认证中间件
2. 001 添加发布客户端模块
3. 001 Web UI 添加「一键发布」按钮
4. 001 → 003 API 调用测试

### Phase 3：统一用户系统
1. 共享用户数据库迁移
2. JWT_SECRET 统一配置
3. 跨项目登录验证
4. 用户配额/订阅统一管理

---

## 风险与规避

| 风险 | 规避 |
|------|------|
| 003 宕机影响 001 | 001 发布失败时降级为本地导出，不阻塞改写流程 |
| JWT 泄露 | 使用强密钥，定期轮换，HTTPS 传输 |
| 数据一致性 | 用户操作日志分别记录，不强制同步 |
