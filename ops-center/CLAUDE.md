# OpsCenter

## 开发


## 关键约定
- 配置 ID: {project}.{category}.{key}
- 鉴权: 复用 orchestrator JWT
- DB: aiosqlite WAL
- 配置传播: API → 文件缓存 → 默认值 三层兜底
