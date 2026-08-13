## Why

审计 C3：容器（publish-api / logto / postgres）默认使用 Docker json-file 日志驱动且**无轮转配置**，长期运行日志无限增长，可能占满宿主磁盘。

## What Changes

- `packages/api-publish-engine/docker-compose.yml`、`deploy/logto/docker-compose.yml`、`deploy/logto/docker-compose.monitoring.yml`：为所有服务统一添加 `logging: driver: json-file, options: {max-size: 50m, max-file: 5}`。
- `packages/api-publish-engine/test/logto-deploy-contract.test.js`：补契约断言（driver/options 存在）。

## Capabilities

### New Capabilities
- `container-log-rotation`: 容器日志轮转契约——业务与身份服务容器必须配置 json-file 驱动的大小/文件数上限，防止日志无限增长。

### Modified Capabilities
<!-- 无 -->

## Impact

- 代码：3 个 compose 文件 + 1 个契约测试
- 无运行行为变更（仅日志保留策略）；docker compose config 校验通过
