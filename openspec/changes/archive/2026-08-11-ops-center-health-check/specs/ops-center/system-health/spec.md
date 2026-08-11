## Purpose
运营后台一键诊断云服务健康（业务 API / Logto / 存储 / 自定义目标）。

## ADDED Requirements

### Requirement: 只读健康探针
`GET /api/v1/system/health`（admin）：并发执行只读探测（自身 /api/v1/health、业务 API health+ready、Logto OIDC discovery、存储可写、OPS_HEALTH_TARGETS 自定义目标），单项 ≤5s 超时，返回 {name, ok, latency_ms, detail} + overall（ok/degraded/error）。未配置 URL 的项状态 skipped 不计失败。

#### Scenario: 探测结果
- **WHEN** 所有已配置目标可达
- **THEN** overall=ok，各检查 ok=true
- **WHEN** 任一目标超时/非 2xx
- **THEN** overall=error，对应检查 ok=false 且 detail 含原因

#### Scenario: 未配置跳过
- **WHEN** OPS_HEALTH_API_URL/LOGTO_URL 未配置
- **THEN** 对应检查 skipped，不影响 overall

#### Scenario: 权限
- **WHEN** 非 admin 调用
- **THEN** 403

### Requirement: 前端巡检页
「系统健康」页：一键巡检（异步 loading）、结果表（服务/状态/耗时/详情）、总体徽章；首次进入自动巡检。

#### Scenario: 交互
- **WHEN** 点击巡检
- **THEN** 展示 loading，完成后渲染每项结果与总体状态
