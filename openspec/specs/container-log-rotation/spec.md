# container-log-rotation Specification

## Purpose
定义 container-log-rotation 的行为契约，判据只认下列 Requirement 与其 Scenario：「容器日志轮转配置」，共 1 条。本规格由归档 change `container-log-rotation` 产生。

## Requirements
### Requirement: 容器日志轮转配置
部署 Compose SHALL 为每个长期运行服务配置日志驱动 `json-file` 与轮转上限（单文件最大 50MB、最多保留 5 个文件）。

#### Scenario: 业务与身份容器具备轮转
- **WHEN** 检查 publish-api / logto / postgres 服务的 Compose 定义
- **THEN** 每个服务 SHALL 声明 `logging.driver = json-file`，且 `options` 含 `max-size` 与 `max-file`

#### Scenario: 监控容器具备轮转
- **WHEN** 检查 monitoring Compose（prometheus / alertmanager / blackbox）
- **THEN** 各服务 SHALL 声明相同的 json-file 轮转配置

