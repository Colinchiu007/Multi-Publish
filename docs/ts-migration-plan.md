# TypeScript 迁移评估报告

## 范围

| 层 | 文件数 | 行数 |
|----|--------|------|
| Electron JS (core) | ~42 | ~10,157 |
| Vue SFC | ~37 | ~7,063 |
| **总计** | **~79** | **~17,220** |

## 推荐策略：按层分阶段推进

## 当前进度

### Phase 1: Core层 ✅ 已完成
| 文件 | 状态 | 说明 |
|------|------|------|
| `core/types.ts` | ✅ | 定义了 DI Container 接口 + ErrorCode 枚举 |
| `core/container.ts` | ✅ | class 实现，编译到 `dist-ts/`，JS 入口已引用 |
| `core/container.setup.ts` | ✅ | TS 源码已编写，JS 入口使用 `require('../../dist-ts/core/container')` |
| `core/error-codes.ts` | ✅ | TS 源码，JS 入口已改为 wrapper 加载编译版 |
| `build:ts` 脚本 | ✅ | 已添加到 `package.json`（`tsc`） |

**迁移模式**: 混合模式 — TS 源码编译到 `dist-ts/`，JS 入口作为 wrapper 加载编译版，逐步减少 JS 负担。

### Phase 2: IPC Handler 签名（计划中）
- IPC handler 的函数签名适合用 TS 定义
- 等待 Phase 1 稳定后再推进

### Phase 3: 业务服务（计划中）
- 配置 TypeScript + JSDoc 渐进模式
- 需解决 `dist-ts/` 相对路径问题

### Phase 4: Vue（稍后）
- 推荐等 Vite + Vue 3 的 TS 支持成熟后再迁移

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-05 | Phase 1 完成: error-codes.js 改为 wrapper，container.setup 已使用 TS Container，添加 build:ts |
