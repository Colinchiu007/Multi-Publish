## 设计

### 探针
- 每个探针 = 异步 HTTP GET（AbortController 等价物：httpx timeout），单次 ≤5s；并发执行（asyncio.gather）。
- `check_api(base)`：GET `{base}/api/v1/health` 与 `{base}/api/v1/ready`，200 且 body.ok/status 合理 → ok。
- `check_logto(base)`：GET `{base}/oidc/.well-known/openid-configuration`（或 `{base}` 若以 /oidc 结尾），200 且含 issuer → ok。
- `check_storage()`：config_output_dir / db 目录可写（os.access W_OK + 临时写删）。
- `check_self()`：直接返回 ok（自身进程在运行）。
- 未配置 URL 的探针 → 状态 `skipped`（不判失败）。
- 自定义目标：`OPS_HEALTH_TARGETS` JSON 数组 [{name, url}]，仅 http(s)（非本机回环强制 https，与 smoke 一致）。

### 端点
`GET /api/v1/system/health`（require_admin）：返回 `{ overall: "ok"|"degraded"|"error", checks: [...], generated_at }`。skipped 不计入失败；任一 error → overall error；有 skipped 无 error → ok（明确列出）。

### 前端
「系统健康」页：巡检按钮（loading）+ 表格（服务/状态/耗时/详情）+ 总体徽章；自动加载一次。
