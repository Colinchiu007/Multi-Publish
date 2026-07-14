# Bug 修复计划 — refactoring-critical-bugs 分支

> **分支**: `refactoring-critical-bugs`（基于 main fc32b44）
> **日期**: 2026-07-11
> **质量节拍**: source-driven-dev → TDD → incremental-impl → /review
> **参考文档**: REFACTORING-ANALYSIS.md + REFACTORING-ANALYSIS-SUPPLEMENT.md

---

## 修复范围（P0 — 5 个 Critical Bug）

### Bug-1: bootstrap.js 上帝模块拆分 🔴 CRITICAL

**文件**: `apps/desktop/electron/bootstrap.js`

**问题诊断**:
- 当前 430 行混合 6 种职责：DI 容器消费、任务执行器闭包定义、事件监听器注册、渲染引擎初始化、平台配置/敏感词加载、数据同步
- `createAppContext()` 函数承担了全部启动编排工作，无法独立测试各阶段
- 全局状态依赖 (`global.usageTracker`) 不在 DI 容器中管理

**修复方案**:
```
bootstrap/
├── index.js          # 入口：按顺序调用 5 个阶段
├── phase1-infra.js   # Phase 1: 基础设施（DI容器 + 窗口引用缓存）
├── phase2-data.js    # Phase 2: 数据层（store + 迁移）
├── phase3-business.js# Phase 3: 业务服务（taskQueue + publisher + pipeline）
├── phase4-events.js  # Phase 4: 事件总线接线
└── phase5-ipc.js     # Phase 5: IPC handler 注册
```

**验收标准**:
- [ ] 每个 phase 文件 ≤ 80 行
- [ ] `createAppContext()` ≤ 30 行（仅编排调用）
- [ ] `getMainWin()` 改为从 DI 容器获取缓存的窗口引用
- [ ] `global.usageTracker` 移入 DI 容器
- [ ] 现有单元测试全部通过

---

### Bug-2: Preload API 分级裁剪 🔴 CRITICAL

**文件**: `apps/desktop/electron/preload/system.js`, `publish.js`, `account.js`, `index.js`

**问题诊断**:
- `system.js` 暴露 ~80 个方法（含支付、代理、许可证、AI写作、视频处理等）
- `publish.js` 暴露 ~45 个方法
- `account.js` 暴露 ~25 个方法
- 渲染进程拥有对敏感操作的完整调用能力，无权限分级

**修复方案**:
```javascript
// preload/index.js — 分级暴露
const api = {
  // Public API — 所有用户可用
  ...createPublicApi(ipcRenderer),       // getVersion, getPlatformList, etc.
  // Authenticated API — 登录后可用
  ...createAuthenticatedApi(ipcRenderer), // publish, getAccounts, etc.
  // Admin API — 仅开发模式
  ...(isDevMode ? createAdminApi(ipcRenderer) : {}), // paymentComplete, proxyTest, etc.
}
```

**敏感操作迁移清单** (从渲染进程移除):
| 方法 | 原位置 | 处理方式 |
|---|---|---|
| `paymentComplete` | system.js | 仅主进程内部触发 |
| `proxyTest` | system.js | 仅主进程内部触发 |
| `licenseActivate` | system.js | 仅设置页调用 |
| `aiWriteGenerate` | system.js | 保留但加权限检查 |
| `videoRenderStart` | system.js | 保留但加权限检查 |

**验收标准**:
- [ ] public API ≤ 25 个方法
- [ ] authenticated API ≤ 40 个方法
- [ ] admin API 仅在 devMode 暴露
- [ ] 现有前端调用点同步更新
- [ ] 所有测试通过

---

### Bug-3: 移除 @ts-nocheck 恢复类型安全 🔴 CRITICAL

**文件**: `apps/desktop/electron/main.js`, `bootstrap.js`

**问题诊断**:
- `main.js` 使用 `// @ts-nocheck`（完全禁用类型检查）
- `bootstrap.js` 使用 `// @ts-nocheck`
- 类型安全链在入口处断裂，整个应用无编译期保护
- IPC 通信数据结构无法编译期验证

**修复方案**:
1. 移除 `main.js` 的 `@ts-nocheck`，修复类型错误（预计 5-10 个）
2. 移除 `bootstrap.js` 的 `@ts-nocheck`，配合 Bug-1 拆分后逐文件修复
3. 为核心服务类编写 `.d.ts` 类型声明文件

**验收标准**:
- [ ] `main.js` 无 `@ts-nocheck`
- [ ] `bootstrap.js` 无 `@ts-nocheck`
- [ ] `npm run build` （或 tsc 检查）零错误
- [ ] 核心服务有 `.d.ts` 声明

---

### Bug-4: container.js 编码修复 🟠 MAJOR

**文件**: `apps/desktop/electron/core/container.js`

**问题诊断**:
- JSDoc 中文注释出现编码损坏（显示为乱码）
- 文件非 UTF-8 编码保存，影响 IDE 智能提示和团队协作

**修复方案**:
1. 将文件重新保存为 UTF-8 with BOM 编码
2. 重写所有中文 JSDoc 注释为正确 UTF-8 文本
3. 补充缺失的英文注释作为备选

**同时增强 DI 容器**:
- 添加循环依赖检测（注册时检查依赖图是否有环）
- 添加 `dispose()` 生命周期方法
- 修复工厂函数签名判断逻辑（`value.length` 对箭头函数不可靠）

**验收标准**:
- [ ] 文件编码为 UTF-8
- [ ] 中文注释正常显示
- [ ] 循环依赖检测通过测试
- [ ] `dispose()` 方法可用

---

### Bug-5: getMainWin() 缓存优化 🟢 MINOR

**文件**: `apps/desktop/electron/bootstrap.js` L28

**问题诊断**:
```javascript
// 当前：每次进度通知都调用
function getMainWin() {
  return require('electron').BrowserWindow.getAllWindows()[0]
}
```
高频调用 `getAllWindows()[0]` 产生不必要的开销。

**修复方案**:
在 `phase1-infra.js` 中创建窗口引用后注入 DI 容器：
```javascript
container.register('mainWindow', mainWindow)
// 后续通过 container.get('mainWindow') 获取
```

**验收标准**:
- [ ] `getMainWin()` 不再使用 `getAllWindows()`
- [ ] 窗口引用从 DI 容器获取
- [ ] 进度通知性能无明显回归

---

## 执行顺序

```
Bug-4 (container.js)     ← 基础设施，其他修复依赖它
    ↓
Bug-1 (bootstrap拆分)    ← 核心重构，最大工作量
    ↓
Bug-5 (getMainWin)       ← 随 Bug-1 一起完成
    ↓
Bug-3 (@ts-nocheck)      ← 依赖 Bug-1 拆分后的清晰结构
    ↓
Bug-2 (Preload分级)      ← 可独立进行，放最后减少冲突
```

## 质量门禁检查清单

### QM-1: 打包验证（修改 electron/ 后必须执行）
- [ ] `cd apps/desktop && npx electron-builder --win --dir --publish never` exit code 0
- [ ] asar 文件清单包含所有新文件
- [ ] require 链测试通过
- [ ] 启动测试 8 秒不崩溃

### QM-2: Code Review 必检项
- [ ] 每个 `require('../x')` 解析目标真实存在
- [ ] 注释语法 `/* */` 成对
- [ ] `module.exports = {` 后无多余逗号
- [ ] `package.json` files 数组覆盖所有新文件

### QM-3: 测试策略
- [ ] 单元测试全通过（1830 passed | 10 skipped）
- [ ] 新增测试覆盖每个 bug 修复

---

## 变更日志

| 时间 | 操作 | 说明 |
|---|---|---|
| 2026-07-11 | 创建分支 | `refactoring-critical-bugs` from main fc32b44 |
| 2026-07-11 | 创建本文件 | BUGFIX-PLAN.md |
