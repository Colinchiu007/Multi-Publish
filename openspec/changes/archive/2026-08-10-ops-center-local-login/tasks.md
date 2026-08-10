## 1. 后端

- [ ] 1.1 models.py AdminUser 表 + config.py admin_username/admin_password
- [ ] 1.2 services/auth_service.py：PBKDF2 哈希 + 种子管理员 + 签发 JWT + 限流
- [ ] 1.3 routers/auth.py：POST /api/auth/login + GET /api/auth/me
- [ ] 1.4 main.py include auth router + lifespan ensure_admin_seeded；middleware 注释更新
- [ ] 1.5 tests/test_auth_login.py：成功/失败/未配置/限流/过期/权限

## 2. 前端

- [ ] 2.1 vite.config.js /api/auth 代理 target → 8010
- [ ] 2.2 npm run build 通过

## 3. 文档与归档

- [ ] 3.1 PRD 12A 登录章节 + CHANGELOG
- [ ] 3.2 审查 + openspec validate + archive（三同步）
