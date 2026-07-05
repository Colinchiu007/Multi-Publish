# MediaTrace 技术复用分析报告

**日期**: 2026-07-05
**项目**: [mediaTrace/MediaTrace](https://github.com/mediaTrace/MediaTrace)
**目标**: 评估其代码和架构中可复用到 Multi-Publish 的技术点

---

## 一、项目概述

MediaTrace 是一个基于 Electron + Vue 3 + TypeScript + Playwright 的**桌面端媒体数据采集平台**，支持抖音等平台的搜索/详情/创作者数据抓取。与 Multi-Publish 技术栈高度重合（Electron/Vue/Playwright/better-sqlite3/Element Plus）。

**定位差异**: MediaTrace 是**数据采集**工具，Multi-Publish 是**内容发布**工具。

---

## 二、高价值复用点

### 2.1 Cookie/登录态管理 ★★★★★

MediaTrace 的 Cookie 管理体系非常成熟：

- `Cookie 序列化/反序列化`: `parseCookieString()` / `normalizeCookieForPlaywright()` — Cookie 字符串↔Playwright cookies 互相转换
- `登录状态检测`: `pong()` 方法同时检查 localStorage 和 cookies 判断登录态
- `Storage-agnostic Cookie 存储`: Store 接口统一 `getCookie/saveCookie/listAccounts/deleteAccount`

**Multi-Publish 现状**: Cookie 管理分散在各服务中，无统一接口层。可以直接复用 MediaTrace 的 `Cookie → Playwright cookies` 转换逻辑(`normalizeCookieForPlaywright` 和 `trySetStoredCookiesToContext`)。

### 2.2 Store 接口 + 工厂模式 ★★★★☆

```
store.ts          → Store 接口（clean interface）
storeFactory.ts   → Factory 模式（csv/json/sqlite/mysql/mongodb）
stores/sqliteStore.ts / csvStore.ts / jsonStore.ts → 多实现
```

MediaTrace 将存储抽象为 `Store` 接口，支持 CSV/JSON/SQLite/MySQL/MongoDB 五种后端，通过 `createStore(config)` 工厂方法创建。

**Multi-Publish 现状**: 使用直接的 SQLite + 手写查询。可以复用 **接口 + 工厂模式架构**，但存储后端不需要那么多（SQLite 已足够）。

### 2.3 任务调度引擎 ★★★★☆

`TasksRepo` 提供了完整的任务生命周期管理：
- 6 种状态: pending/running/completed/failed/canceled/paused
- 调度策略: 一次性(once)/循环(interval)
- `findDueSchedules()` — 查找到期的定时任务
- 持久化进度统计（new_videos/updated_videos 等）
- `updateStatus()` 部分更新模式（仅传变更字段）

**Multi-Publish 现状**: 有 PublishPoller 和 Scheduler，但 MediaTrace 的 TasksRepo 设计更完整，**建议直接复用 `TasksRepo` 的完整实现**。

### 2.4 Playwright 反检测增强 ★★★★☆

MediaTrace 使用 `stealth.min.js` 通过 `context.addInitScript()` 注入，在页面 JS 执行**之前**篡改浏览器指纹：

```typescript
const stealthPath = path.join(this.config.runPath, "libs", "stealth.min.js");
await context.addInitScript({ path: stealthPath }).catch(() => undefined);
```

**Multi-Publish 现状**: stealth-helper.js 在 `did-finish-load` 之后注入（太晚）。MediaTrace 的方式更有效（`addInitScript` 在页面加载前注入）。

**复用建议**: 替换 stealth-helper.js 的注入时机为 `context.addInitScript()`。`stealth.min.js` 本身可直接引用（MIT 协议）。

### 2.5 媒体文件下载管线 ★★★★☆

MediaTrace 的 IPC 层(`ipc.ts`)实现了**流式下载管线**：
- `Readable.fromWeb()` + `Transform` 流 + `pipeline()`
- 实时进度更新到 `mediaDownloadStatus` Map
- Content-Type 判断扩展名: `getExtensionFromContentType()`
- Content-Disposition 解析: `getFileNameFromDisposition()`
- 文件名冲突处理: `ensureUniqueFilePath()`（自动加序号）
- 下载状态查询: `media:download:status` IPC

**Multi-Publish 现状**: 有 video-uploader.js 但无统一下载管线。**可以直接复制整个下载管线实现**。

### 2.6 数据库 Migration 模式 ★★★☆☆

`sqlite.ts` 中 `ensureTaskStatsColumns()` / `ensureAccountColumns()` 使用 `PRAGMA table_info` 检查列存在性后 `ALTER TABLE ADD COLUMN`。这是一种**渐进式 schema 迁移策略**。

**Multi-Publish 现状**: 手动管理 schema。`ensure*Columns` 模式值得复制。

### 2.7 类型系统 ★★★☆☆

MediaTrace 使用 TypeScript，关键类型定义在 `runtime/types.ts`：
- 联合类型枚举: `Platform`, `LoginType`, `CrawlType`, `SaveDataOption`, `TaskStatus`
- `RuntimeConfig extends CliArgs` 模式清晰

**Multi-Publish 现状**: JavaScript，但正在 TS 迁移中。**类型定义模式可参考**。

### 2.8 取消信号 + 任务中断 ★★★☆☆

```typescript
private cancelSignal: AbortSignal | undefined;
// ...
if (this.cancelSignal?.aborted) throw new Error("closed_by_user");
```

使用标准 `AbortSignal` 实现任务取消，所有循环点都检查 `aborted` 状态。

**Multi-Publish 现状**: 任务中断处理不完整。**AbortSignal 模式值得引入**。

---

## 三、技术栈对比

| 维度 | MediaTrace | Multi-Publish | 复用难度 |
|------|-----------|---------------|---------|
| Electron | v30.x | v33.x | 兼容 |
| Vue | 3.4 + TS | 3.x + JS | 需转 JS |
| Playwright | v1.50 | v1.47 | ✅ 直接 |
| SQLite | better-sqlite3 | better-sqlite3 | ✅ 直接 |
| UI 框架 | Element Plus + Tailwind | Element Plus | ✅ 部分 |
| 构建 | Vite 5 + vite-plugin-electron | Vite 5 | ✅ 兼容 |
| 状态管理 | Pinia | Pinia | ✅ 直接 |
| 语言 | TypeScript | JavaScript | 需转译 |

---

## 四、推荐复用优先级

| 优先级 | 模块 | 难度 | 价值 | 工作量 |
|--------|------|------|------|--------|
| P0 | Cookie 管理（Cookie ↔ Playwright 转换） | 低 | 高 | 0.5d |
| P0 | `stealth.min.js` + `addInitScript` 注入 | 低 | 高 | 0.5d |
| P1 | 媒体下载管线（ipc.ts 中的流式下载） | 中 | 中 | 1d |
| P1 | TasksRepo 任务调度 | 中 | 高 | 1.5d |
| P2 | Store 接口 + 工厂模式 | 中 | 中 | 1d |
| P2 | 渐进式 Migration（ensure*Columns） | 低 | 低 | 0.3d |
| P3 | AbortSignal 取消模式 | 低 | 低 | 0.3d |
| P3 | TypeScript 类型定义参考 | 低 | 中 | — |

---

## 五、注意事项

1. **License**: MIT 协议，可自由复用
2. **语言差异**: MediaTrace 是 TypeScript，Multi-Publish 是 JavaScript。复用时需要转译
3. **定位差异**: MediaTrace 是采集工具（大量 API 签名、反爬），Multi-Publish 是发布工具（RPA 填表）。底层 Playwright+Electron 部分共享，业务逻辑层不重叠
4. **直接可用的文件**: `stealth.min.js` 可完全复用
