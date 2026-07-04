# TypeScript 迁移评估报告

## 范围

| 层 | 文件数 | 行数 |
|----|--------|------|
| Electron JS (core) | ~42 | ~10,157 |
| Vue SFC | ~37 | ~7,063 |
| **总计** | **~79** | **~17,220** |

## 推荐策略：按层分阶段推进

### Phase 1: Core层（低风险）
core/ 目录零外部依赖，最适合首批迁移。
- core/container.js → .ts
- core/error-codes.js → .ts
- 共 ~200 行，可作为 TS 试点

### Phase 2: IPC Handler 签名
ipc-handlers/ 的 handler 函数签名最适合用 TS 定义。

### Phase 3: 业务服务（按 CI 门禁）
配置 TypeScript + JSDoc 渐进模式。

### Phase 4: Vue（稍后）
推荐等 Vite + Vue 3 的 TS 支持成熟后再迁移。
