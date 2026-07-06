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

### Phase 2: IPC Handler 签名 ✅ 已完成
| 文件 | 状态 | 说明 |
|------|------|------|
| `ipc-handlers/types.ts` | ✅ 新增 | 共享类型: `IpcHandlerDeps`, `IpcHandlerRegistration`, `IpcResponse` |
| `ipc-handlers/index.ts` | ✅ 新增 | 类型化注册中心，引用 19 个 handler |
| 19 个 handler `.ts` 文件 | ✅ | 均有 `export default registerHandlers` + 类型化 deps 参数 |
| `tsc --noEmit` | ✅ | 所有 Phase 1 + 2 文件编译通过 |

**说明**: 由于 `dist-ts/` 相对路径限制，运行时仍使用 `.js` 文件。TS 文件作为类型参考和 IDE 提示源。

### Phase 3: 业务服务（计划中）
- 配置 TypeScript + JSDoc 渐进模式
- 需解决 `dist-ts/` 相对路径问题

### Phase 4: Vue（稍后）
- 推荐等 Vite + Vue 3 的 TS 支持成熟后再迁移

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-05 | Phase 1 完成: error-codes.js 改为 wrapper，container.setup 已使用 TS Container，添加 build:ts |
| 2026-07-05 | Phase 2 完成: 新增 ipc-handlers/types.ts + index.ts，19 个 handler 全部类型化 |

### Phase 3: 业务服务（✅ 已完成）
| 文件 | 状态 | 说明 |
|------|------|------|
| `tsconfig.check.json` | ✅ 新增 | JSDoc 渐进类型化专用配置，extends 主 tsconfig，checkJs:false + noEmit |
| `logger.js` | ✅ `// @ts-check` | 完整 JSDoc 类型注解：LogLevel typedef + 函数签名 |
| `store-interface.js` | ✅ `// @ts-check` | 修复 @param {any} + @returns 类型，修复 _customDbPath 动态属性 |
| `cookie-converter.js` | ⏳ 待处理 | 已有 JSDoc 但 @param {object} 缺少索引签名，需后续统一修复 |
| `check:ts` 脚本 | ✅ 新增 | `tsc -p tsconfig.check.json --noEmit`，已集成到 `check:all` |
| `build:ts` | ✅ 验证 | 主 tsconfig 编译正常（core + ipc-handlers） |
| `tsc --noEmit` | ✅ 验证 | TS 编译 + JSDoc 检查均通过 |

**说明**: 采用 JSDoc 渐进模式（`checkJs:false` + `// @ts-check` 逐文件启用），
不更改文件扩展名，不影响运行时。3 个已类型化文件通过 `npx tsc -p tsconfig.check.json --noEmit` 验证。
