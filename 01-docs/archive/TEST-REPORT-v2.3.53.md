# Multi-Publish v2.3.53 测试与 Bug 修复报告

> **日期**: 2026-07-11  
> **分支**: `fix/test-and-bugfix-v2.3.53`  
> **方法**: 静态代码分析（基于源码逐文件审查）+ 质量节拍 defense-in-depth 模式

---

## 一、测试范围

| 层级 | 文件数 | 状态 |
|---|---|---|
| Electron 主进程 | 15 个核心模块 | ✅ 已审查 |
| Preload / IPC | 4 个模块 | ✅ 已审查 |
| 服务层 | 8 个服务类 | ✅ 已审查 |
| 核心基础设施 | container / error-codes / pipeline-engine | ✅ 已审查 |
| Vue 前端 | App.vue + 5 个页面组件 | ✅ 已审查 |
| RPA 引擎 | platform-selectors / registry | ✅ 已审查 |

---

## 二、发现的 Bug 清单

### 🔴 Bug #1: DI 容器中文注释乱码（container.js）

**文件**: `apps/desktop/electron/core/container.js`  
**行号**: L3-16  
**严重程度**: 🟡 中（影响维护性，不影响运行）

**现象**: JSDoc 注释中的中文字符全部显示为 `?` 问号：
```
// Container ? ?????????
// * ?????????????????
// * ?????? singleton????????????
```

**根因**: 文件编码不是 UTF-8，或编辑器保存时使用了非 UTF-8 编码。

**影响**: 
- IDE 智能提示无法显示中文文档
- 团队协作时注释不可读
- 与项目其他 UTF-8 文件不一致

**修复方案**: 将文件重新保存为 UTF-8 编码。

---

### 🔴 Bug #2: getMainWin() 高频调用性能问题（bootstrap.js）

**文件**: `apps/desktop/electron/bootstrap.js`  
**行号**: L28, L89, L117, L155, L164, L175（共 6 处调用）  
**严重程度**: 🟡 中（性能）

**现象**: 
```javascript
function getMainWin() { 
  return require('electron').BrowserWindow.getAllWindows()[0] 
}
```
每次进度通知都调用 `BrowserWindow.getAllWindows()[0]`。

**影响**: 在高频场景（如视频渲染进度每秒多次更新）下产生不必要的数组分配和遍历。

**修复方案**: 在 `createAppContext()` 时缓存窗口引用：
```javascript
let _cachedWin = null;
function getMainWin() {
  if (!_cachedWin || _cachedWin.isDestroyed()) {
    _cachedWin = require('electron').BrowserWindow.getAllWindows()[0];
  }
  return _cachedWin;
}
```

---

### 🔴 Bug #3: 全局状态污染 — usageTracker 在 DI 外管理（bootstrap.js）

**文件**: `apps/desktop/electron/bootstrap.js`  
**行号**: L111-114  
**严重程度**: 🟡 中（可测试性、初始化顺序风险）

**现象**:
```javascript
if (typeof global.usageTracker !== 'undefined' && global.usageTracker) {
  global.usageTracker.trackFeatureUsage('publish', 'success')
  global.usageTracker.trackDaily('articles_published', 1)
}
```

**问题**:
- `global.usageTracker` 不在 DI 容器中管理，初始化顺序依赖隐式约定
- 单元测试时无法 mock
- 如果 usageTracker 未初始化，代码静默跳过（无错误提示）

**修复方案**: 将 usageTracker 移入 DI 容器，或通过参数注入。

---

### 🔴 Bug #4: PipelineEngine 纯内存运行 — 崩溃丢失全部状态（pipeline-engine.js）

**文件**: `apps/desktop/electron/services/pipeline-engine.js`  
**行号**: L106-109  
**严重程度**: 🔴 高（数据丢失风险）

**现象**:
```javascript
constructor() {
  this._runs = new Map();      // 内存 Map
  this._currentPipeline = null; // 内存变量
  this._history = [];           // 内存数组，只追加不清理
}
```

**问题**:
1. 应用崩溃或重启后，所有管线状态丢失（正在执行的任务、历史记录）
2. `_history` 数组无限增长，长时间运行后持续占用内存
3. 无检查点持久化机制

**修复方案**: 
- 将活跃 run 序列化到 SQLite
- `_history` 设置最大长度限制（如最近 100 条）
- 启动时从存储恢复未完成的管线

---

### 🔴 Bug #5: PipelineEngine runId 碰撞风险（pipeline-engine.js）

**文件**: `apps/desktop/electron/services/pipeline-engine.js`  
**行号**: L134  
**严重程度**: 🟢 低（概率低但存在）

**现象**:
```javascript
const runId = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
```

**问题**: 
- `Date.now()` 精度毫秒级，高并发下可能碰撞
- `Math.random().slice(2, 6)` 仅 4 位随机字符，熵不足
- 无去重检查

**修复方案**: 使用 crypto.randomUUID() 或增加随机字符长度到 12 位 + 去重检查。

---

### 🔴 Bug #6: CJS/ESM interop 兼容代码散落（bootstrap.js）

**文件**: `apps/desktop/electron/bootstrap.js`  
**行号**: L22-24  
**严重程度**: 🟢 低（技术债）

**现象**:
```javascript
const _CloudPublisherModule = require('./services/cloud-publisher')
const CloudPublisher = _CloudPublisherModule.default || _CloudPublisherModule
```

**问题**: 说明项目中 CJS 和 ESM 混用，此兼容代码是 workaround。如果 vitest mock 使用 ESM default export 而生产代码使用 CJS module.exports，会导致 Tree-shaking 失效、打包体积增大。

**修复方案**: 统一模块方案（建议全量 CJS 或全量 ESM），消除 interop 代码。

---

### 🔴 Bug #7: @ts-nocheck 在关键入口文件（main.js / bootstrap.js）

**文件**: `apps/desktop/electron/main.js` (L1), `apps/desktop/electron/bootstrap.js` (L1)  
**严重程度**: 🔴 高（类型安全链断裂）

**现象**: 两个最关键的入口文件使用 `@ts-nocheck` 完全禁用类型检查。

**影响**: 整个应用的类型安全链在起点断裂。430 行的 bootstrap.js 包含大量 DI 容器消费、任务队列接线、事件监听器注册等复杂逻辑，完全没有编译期类型保护。

**修复方案**: 
1. 移除 `@ts-nocheck`
2. 逐步修复类型错误（预计 20-40 个）
3. 为核心接口编写 `.d.ts` 类型声明

---

### 🔴 Bug #8: PipelineEngine advance() 引用不存在的属性（pipeline-engine.js）

**文件**: `apps/desktop/electron/services/pipeline-engine.js`  
**行号**: L243  
**严重程度**: 🔴 高（运行时错误）

**现象**:
```javascript
const checkpoint = run.stages[run.currentStage].requiresCheckpoint || false;
```

**问题**: 查看 PIPELINES 定义（L10-102），所有 stage 都是纯字符串（如 `'research'`, `'script'`），**没有 `requiresCheckpoint` 属性**。这意味着 `advance()` 总是返回 `checkpoint: false`，检查点功能形同虚设。

这是一个**逻辑 bug**：要么 stage 定义缺少 `requiresCheckpoint` 字段，要么 `advance()` 的 checkpoint 逻辑是死代码。

**修复方案**: 
- 方案 A：在 PIPELINES 元数据中为需要人工确认的 stage 添加 `requiresCheckpoint: true`
- 方案 B：如果不需要 checkpoint 功能，移除 `advance()` 中的死代码

---

## 三、架构层面问题（非 Bug 但需关注）

| # | 问题 | 文件 | 优先级 |
|---|---|---|---|
| A1 | bootstrap.js 430 行混合 6 种职责 | bootstrap.js | P0 |
| A2 | Preload 暴露 100+ 方法给渲染进程 | preload/*.js | P0 |
| A3 | DI 容器缺循环依赖检测 | container.js | P1 |
| A4 | DI 容器缺生命周期管理（dispose） | container.js | P1 |
| A5 | 任务队列无优先级（纯 FIFO） | task-queue.js | P2 |
| A6 | 选择器无版本号管理 | platform-selectors.js | P2 |

---

## 四、质量节拍检查结果

按 `.codex/skills/质量节拍/SKILL.md` 的 defense-in-depth 标准：

| 检查项 | 结果 | 说明 |
|---|---|---|
| 入口文件有 @ts-nocheck | ❌ 不通过 | main.js + bootstrap.js |
| 全局状态污染 | ❌ 不通过 | global.usageTracker |
| DI 容器编码 | ❌ 不通过 | 中文注释乱码 |
| 管线引擎持久化 | ❌ 不通过 | 纯内存，崩溃丢数据 |
| 死代码/无效逻辑 | ❌ 不通过 | requiresCheckpoint 永远为 false |
| 错误码跨包冲突 | ⚠️ 需关注 | api-publish-engine 占用 -4/-5 |

**总体评级**: 🟡 有条件通过（需修复 #1-#5 后方可进入联调）

---

## 五、修复计划

### 第一批（立即修复，预计 30 分钟）

1. ✏️ **Bug #1**: container.js 编码修复 → 重写为 UTF-8
2. ✏️ **Bug #2**: getMainWin() 缓存优化 → 改为缓存模式
3. ✏️ **Bug #8**: requiresCheckpoint 死代码 → 移除或补充元数据

### 第二批（本次会话修复）

4. ✏️ **Bug #3**: usageTracker 全局状态 → 移入 DI 或参数化
5. ✏️ **Bug #4**: PipelineEngine 持久化 → 添加 SQLite 存储
6. ✏️ **Bug #7**: 移除 @ts-nocheck → 逐步修复类型错误

### 第三批（后续迭代）

7. ✏️ **Bug #5**: runId 碰撞 → 改用 crypto.randomUUID()
8. ✏️ **Bug #6**: CJS/ESM 统一 → 制定迁移计划

---

*报告生成时间: 2026-07-11 23:21 CST*
