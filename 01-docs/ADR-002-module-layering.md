# ADR-002: Electron 主进程模块分层架构

> **日期**: 2026-07-04
> **状态**: 已采纳

## 上下文

apps/desktop/electron/ 下有 42 个 JS 文件直铺在根目录，无清晰层次边界。
main.js 承担了 require(43)→new(27)→use 的全链路职责。

## 决策

采用 4 层架构，从低到高：

  Layer 4: Entry (main.js, preload.js)       ← 组合根，启动初始化
  Layer 3: IPC Handlers (ipc-handlers/)      ← 接收渲染进程请求
  Layer 2: Services (services/, *.js)        ← 业务逻辑
  Layer 1: Core (core/)                      ← 零依赖基础设施

### Layer 1: Core

零外部依赖，可独立测试。
- core/container.js — DI 容器
- core/error-codes.js — 错误码标准
- core/container.setup.js — 服务注册自举

### Layer 2: Services

纯业务逻辑，现有模块分布在根目录和 services/ 下。

### Layer 3: IPC Handlers

ipc-handlers/ 目录已按功能拆分。每个 handler 通过 DI 容器获取 Service 实例。

### Layer 4: Entry

main.js 只用做组合根：创建容器 → 初始化 IPC → 创建窗口。

## 迁移状态

| 阶段 | 状态 | 说明 |
|-----|------|------|
| P0 | ✅ | DI 容器 + 错误码标准化 |
| P1 | ✅ | var→let 现代化 + core 模块 |
| P2-1 | ✅ | container.setup.js 集中注册 |
| P2-2 | ⏳ | 服务文件迁移到 services/ |
| P2-3 | 🔲 | Vue 前端测试 |
| P2-4 | 🔲 | TS 迁移评估 |

## 约束

- Layer N 不能引用 Layer N+1
- Core 层不能引用 electron 或任何 npm 包
- IPC Handler 只做协议转换