## Why

云服务（业务 API / Logto / 存储）健康状态散落在各部署脚本与 production-smoke 检查里，运营后台没有一个统一的一键诊断入口。P1 其余：新增「系统健康」巡检页，集中展示各依赖服务可达性。

## What Changes

- ops-center：`services/health_service.py` 只读探针（HTTP GET + 短超时，不修改任何服务状态）：
  - 自身 `/health`
  - 业务 API（env `OPS_HEALTH_API_URL`）→ `/api/v1/health` + `/api/v1/ready`
  - Logto（env `OPS_HEALTH_LOGTO_URL`）→ OIDC discovery（只读 GET）
  - 配置输出目录可写性
  - 可选额外目标（env `OPS_HEALTH_TARGETS` JSON `[{name,url}]`）
- `routers/health.py`：`GET /api/v1/system/health`（admin，短超时并发探测），返回每项 {name, ok, latency_ms, detail} + 总状态
- 前端「系统健康」页：一键巡检 + 结果表 + 总体状态徽章
- 测试：service 单测（各探针 ok/fail/超时/未配置跳过）、API 权限

## Capabilities

### New Capabilities
- `ops-center/system-health`: 云服务健康巡检（业务 API / Logto / 存储 / 自定义目标）。

## Impact

- ops-center/backend：config.py（health env）、services/health_service.py（新）、routers/health.py（新）、main.py、tests
- ops-center/frontend：views/SystemHealth.vue（新）、router、侧边栏
- 文档：ops-center/docs/PRD.md、CHANGELOG
