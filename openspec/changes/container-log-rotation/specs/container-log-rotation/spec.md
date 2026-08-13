定义 Multi-Publish 部署容器日志保留契约：业务 API、Logto、PostgreSQL 及监控容器必须使用 json-file 驱动并配置单文件大小与文件数上限，防止容器日志无限增长占满宿主磁盘。

> 适用范围：仅约束 Compose 管理的长期运行容器；systemd/journald 部署（如 ops-center）不适用，其保留策略由宿主 journald 控制。：业务 API、Logto、PostgreSQL 及监控容器必须使用 json-file 驱动并配置单文件大小与文件数上限，防止容器日志无限增长占满宿主磁盘。

## ADDED Requirements

### Requirement: 容器日志轮转配置
部署 Compose SHALL 为每个长期运行服务配置日志驱动 `json-file` 与轮转上限（单文件最大 50MB、最多保留 5 个文件）。

#### Scenario: 业务与身份容器具备轮转
- **WHEN** 检查 publish-api / logto / postgres 服务的 Compose 定义
- **THEN** 每个服务 SHALL 声明 `logging.driver = json-file`，且 `options` 含 `max-size` 与 `max-file`

#### Scenario: 监控容器具备轮转
- **WHEN** 检查 monitoring Compose（prometheus / alertmanager / blackbox）
- **THEN** 各服务 SHALL 声明相同的 json-file 轮转配置
