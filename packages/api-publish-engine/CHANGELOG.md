## [1.2.0] — 2026-07-03

### Added
- **Plugin Level 2B — 动态 enable/disable/reload**:
  - `disable(platform)` — 禁用插件，调用 onDisable hook
  - `enable(platform)` — 重新启用插件，调用 onEnable hook
  - `reload(platform)` — 清除 require cache 后重新加载
  - `isEnabled(platform)` — 检查插件状态
  - `getEnabled()` / `getDisabled()` — 分类列出
  - `getPluginInfo()` 新增 isEnabled 字段
  - `getAll()` 现在同时包含启用和禁用的插件

### Testing
- plugin-dynamic.test.js: 9 test cases (25 assertions) all passed
- No regression: manifest 39/39, original loader 7/7, integration 5/5


## [1.1.0] — 2026-07-03

### Added
- **Plugin Level 2A — manifest.json standardization**:
  - manifest.json auto-discovery (dir plugin or single-file plugin)
  - Required fields: name, version
  - Optional: minAppVersion, author, entry, permissions
  - Version compatibility check (minAppVersion <= appVersion)
  - Backward compatible: no-manifest plugins marked as [legacy]
- **PluginLoader new API**:
  - setAppVersion(version) — set app version for manifest checks
  - getPluginInfo(platform) — returns full metadata including manifest
- **Lifecycle hooks (Level 2 foundation)**:
  - onLoad(ctx) — called automatically on plugin load
  - onEnable/onDisable/onUnload — framework ready for Level 2B

### Testing
- plugin-manifest.test.js: 11 test cases (39 assertions) all passed
- Backward compat: existing plugin-loader + integration tests all passed


# Changelog

## [1.0.0] — 2026-07-03

### Added
- **PublishApiServer HTTP API**: 17 端点，零外部依赖（纯 Node.js http 模块）
  - 单平台/批量发布 / 定时发布 / Webhook / 审计日志 / 发布计划 / Metrics
- **Config 文件支持**: 三层优先级（默认值 < JSON 配置 < 环境变量 < CLI 参数）
- **PublishApiClient SDK**: 17 方法 Node.js 客户端
- **API Key 认证**: Bearer token 认证
- **请求频率限制**: 滑动窗口限流 (RateLimiter)
- **Access 请求日志**: 自动记录所有请求
- **优雅关闭**: SIGTERM/SIGINT 信号处理
- **Docker 容器化**: Dockerfile + docker-compose.yml
- **API 文档页面**: HTML 文档 + OpenAPI 3.0 JSON
- **29 平台适配器**: zhihu, douyin, xiaohongshu, kuaishou, bilibili, weibo, toutiao, wechat_mp 等
- **本地签名引擎**: 抖音/kuaishou/小红书 HMAC-SHA256 签名
- **COS/OSS 上传引擎**: 腾讯云 COS + 阿里云 OSS 分片上传

### Changed
- Architecture: 从硬编码注册表改为 Plugin 架构预留
- CLI: 支持 --config 参数，自动发现配置文件

### Testing
- 31 测试文件，全量通过
- 单元测试 + 集成测试覆盖所有端点