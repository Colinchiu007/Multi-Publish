## Context

- 现状：ops-center 无登录端点，JWT 由 orchestrator 签发；中间件仅验证 OPS_JWT_SECRET + role=admin。
- 约束：不接 Logto；不集成 orchestrator；内部后台单角色（admin）；零新 Python 依赖优先。

## Goals / Non-Goals

**Goals:**
- ops-center 可离线自包含登录（不依赖 orchestrator 运行）。
- 安全基线：PBKDF2 哈希、JWT 8h 过期、登录失败限流、无默认口令（未配置 fail-closed）。

**Non-Goals:**
- 不做多角色/RBAC（仅 admin）。
- 不接 Logto/微信等外部 IdP（后续可扩展）。
- 不做用户自助注册/找回密码（管理员凭据由运维配置）。

## Decisions

1. 凭据来源：`OPS_ADMIN_USERNAME`/`OPS_ADMIN_PASSWORD` 环境变量；启动时若 admins 表为空则创建；两者未配置且表空 → 不创建，登录返回 503（「未配置管理员账号，请设置 OPS_ADMIN_USERNAME/OPS_ADMIN_PASSWORD」）。
2. 哈希：`hashlib.pbkdf2_hmac('sha256', password, salt(16B), 200000)`，存储格式 `pbkdf2_sha256$200000$salt_hex$hash_hex`；验证用 `hmac.compare_digest`。
3. JWT：python-jose `jwt.encode/decode`，HS256，payload `{sub, username, role:"admin", exp: now+8h}`；验证沿用现有中间件。
4. 限流：内存计数（username+IP），5 次失败锁定 60s，返回 429「尝试次数过多，请稍后再试」；进程重启清零（文档注明生产可用 Redis 替换）。
5. 前端：Vite `/api/auth` 代理 target 8000→8010；登录页与 auth store 不变。
6. 登录成功/失败写入审计（复用 ConfigAuditLog 不适合——不扩表，日志记录 + 标注后续审计表）。

## Risks / Trade-offs

- 内存限流在重启后重置、多实例不共享（内部单机后台可接受，文档注明）。
- PBKDF2 200k 迭代在低端机器约 50-150ms/次，可接受。
- 移除 orchestrator 依赖后，若历史运营数据里存在 orchestrator 签发的旧 token，将立即失效（需重新登录）——可接受。
