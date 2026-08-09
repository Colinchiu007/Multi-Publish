# story2video-history-public-read Specification

## Purpose
TBD - created by archiving change story2video-history-public-read-channels. Update Purpose after archive.
## Requirements
### Requirement: 本地只读历史通道未登录放行
身份服务启用但未登录时，`story2video:list-projects` 与 `pipeline:history` 两个只读历史通道 SHALL 允许调用（返回本地数据，按 owner 隔离），不得被访问控制层以许可证拒绝。

#### Scenario: 未登录查看历史
- **WHEN** 身份启用且未登录，渲染端调用 `story2video:list-projects` / `pipeline:history`
- **THEN** 两个通道放行（handler 执行，返回 code 0 与本地数据），不返回 `code:-3 许可证无权访问`

#### Scenario: 写通道仍收紧
- **WHEN** 未登录调用 `story2video:get-project` / `story2video:delete-project` 等读写通道
- **THEN** 仍被访问控制层拒绝（code -3），不扩大未登录权限面

### Requirement: 场景-测试映射
访问控制回归 SHALL 由 license-access-control 测试断言两通道 requiredLevel='public' 且未登录 handler 放行，写通道 requiredLevel='authenticated' 且被拒。

#### Scenario: 访问控制回归
- **WHEN** 访问控制回归
- **THEN** license-access-control 测试断言两通道 requiredLevel='public' 且未登录 handler 放行；写通道 requiredLevel='authenticated' 且被拒

