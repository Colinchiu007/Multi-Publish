# 审查结果（review.md）

## 外部审查（Claude，认证高风险聚焦 diff 431 行）
发现 2 Critical + 6 Warning + 若干 Info；已全部处置：

| # | 级别 | 发现 | 处置 |
|---|------|------|------|
| C1 | 🔴 | LoginBody 无长度限制 → 未认证 PBKDF2 CPU DoS（1MB 密码阻塞事件循环） | **已修复**：Pydantic `Field(max_length)`（username≤64/password≤128）+ authenticate 长度前置校验 + 422 测试 |
| C2 | 🔴 | HTTPBearer auto_error=True 缺头返回 403 而非 401（破坏统一 401，前端 401 拦截器失效） | **已修复**：`HTTPBearer(auto_error=False)` + credentials None → 显式 401；新增缺头 401 测试 |
| W3 | 🟡 | 时间侧信道用户名枚举（用户不存在不跑 PBKDF2） | **已修复**：row None 时对 dummy 哈希执行 verify_password 抹平时耗 |
| W4 | 🟡 | 错误码靠子串匹配（"429"/"503"），契约脆弱 | **已修复**：authenticate 返回结构化 (err_code, err_detail) |
| W5 | 🟡 | 503 分支无限流且泄露配置状态 | **已修复**：未配置分支也计数（防探测）+ 审计日志 |
| W6 | 🟡 | 登录无审计日志 | **已修复**：成功/失败/锁定/未配置均记 logger（不记密码） |
| W7 | 🟡 | 并发启动竞态（双插 unique）+ 无密码轮换路径 | **已修复**：ensure_admin_seeded 捕获 IntegrityError 忽略；文档注明改密需删行重建 |
| W8 | 🟡 | 测试缺口（缺头/错误secret/锁过期/fail-open/锁不延长） | **已修复**：新增 5 用例（共 12 认证用例） |
| I1 | 🟢 | _login_attempts 无界增长 | 修复：_sweep_expired_attempts 定期清理 |
| I2 | 🟢 | 反代限流按 client.host | 文档注明生产换 Redis/支持 X-Forwarded-For（单机内部可接受） |
| I3 | 🟢 | JWT 无 jti/吊销 | 接受（单管理员 8h，文档注明） |
| I4 | 🟢 | 过期注释（docstring/测试注释/stores auth.js "orchestrator SSO"） | 已修正 |

## 验证
- pytest **78 passed**（认证 12 用例）+ 前端 build 通过 + 本机登录冒烟 200/401。
