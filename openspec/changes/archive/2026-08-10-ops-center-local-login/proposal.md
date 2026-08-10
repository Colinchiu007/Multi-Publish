## Why

ops-center 登录目前依赖 platform-orchestrator（:8000 /api/auth + 共享 JWT secret），而 orchestrator 已停更并冻结；项目已有成熟用户系统 Logto（不适用于内部管理后台，且用户明确不接）。运营后台仅供内部管理员使用，需要一个自包含的简单登录，解除对 orchestrator 的运行时依赖。

## What Changes

- ops-center 后端新增自包含管理员登录：`admins` 表（PBKDF2-SHA256 密码哈希，零新依赖）+ `POST /api/auth/login` 签发 HS256 JWT（OPS_JWT_SECRET，role=admin，8h 过期）+ 登录失败限流（5 次/60s）。
- 管理员凭据由 `OPS_ADMIN_USERNAME` / `OPS_ADMIN_PASSWORD` 显式配置；未配置且无管理员时登录返回 503（fail-closed，无默认口令）。
- 现有验证中间件（OPS_JWT_SECRET + role=admin）保持不变，仅更新注释（本地签发）。
- 前端 Vite `/api/auth` 代理 target 从 orchestrator:8000 改为 ops-center:8010；登录页/鉴权 store 路径不变。
- 不引入 Logto；不集成 orchestrator 认证模块。

## Capabilities

### New Capabilities
- `ops-center/local-login`: ops-center 自包含管理员登录（凭据配置、密码哈希、JWT 签发、失败限流、未配置 fail-closed）。

## Impact

- ops-center/backend：models.py、config.py、services/auth_service.py（新）、routers/auth.py（新）、main.py、middleware/auth.py（注释）
- ops-center/frontend：vite.config.js
- tests/test_auth_login.py（新）；PRD 12A 登录章节
