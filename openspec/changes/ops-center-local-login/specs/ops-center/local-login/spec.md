## Purpose
ops-center 自包含管理员登录：本地凭据校验 + JWT 签发 + 失败限流 + 未配置 fail-closed。

## ADDED Requirements

### Requirement: 本地管理员登录
ops-center 必须提供自包含登录端点 POST /api/auth/login：管理员凭据由 OPS_ADMIN_USERNAME/OPS_ADMIN_PASSWORD 配置并哈希存储，成功签发 HS256 JWT（OPS_JWT_SECRET，role=admin，8h 过期）。

#### Scenario: 登录成功
- **WHEN** 提交正确用户名/密码
- **THEN** 返回 200 与 token（payload 含 sub/username/role=admin）

#### Scenario: 密码错误或用户不存在
- **WHEN** 提交错误密码或不存在用户
- **THEN** 返回 401 且文案不区分「用户不存在/密码错误」

#### Scenario: 未配置管理员
- **WHEN** admins 表为空且未配置 OPS_ADMIN_USERNAME/OPS_ADMIN_PASSWORD
- **THEN** 登录返回 503「未配置管理员账号」

### Requirement: 密码安全存储
管理员密码不得明文存储；必须使用 PBKDF2-SHA256（随机 salt，≥200000 迭代）哈希；验证使用常量时间比较。

#### Scenario: 存储格式
- **WHEN** 创建管理员
- **THEN** 数据库保存 `pbkdf2_sha256$迭代数$salt_hex$hash_hex`，不含明文

#### Scenario: 常量时间校验
- **WHEN** 校验密码
- **THEN** 使用 hmac.compare_digest，不以明文比较

### Requirement: 登录失败限流
连续失败登录必须被限流：同用户名+IP 5 次失败后锁定 60s，期间返回 429。

#### Scenario: 触发锁定
- **WHEN** 5 次连续失败
- **THEN** 第 6 次起返回 429「尝试次数过多，请稍后再试」，直到 60s 窗口结束

### Requirement: 现有 JWT 验证契约不变
现有受保护接口（/api/v1/*、include_hidden 等）的验证逻辑不得改变：OPS_JWT_SECRET + HS256 + role=admin。

#### Scenario: 旧 token 兼容
- **WHEN** 使用 OPS_JWT_SECRET 签发的合法 token（role=admin）
- **THEN** 现有中间件正常放行（本地签发与 orchestrator 签发同格式）

#### Scenario: 非法 token
- **WHEN** token 无效/过期/角色非 admin
- **THEN** 返回 401/403（与现状一致）
