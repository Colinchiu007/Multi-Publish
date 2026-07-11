# Multi-Publish Bug 修复补丁 v1

> **生成日期**: 2026-07-11  
> **分支**: 请先执行 `git checkout -b fix/bugfix-v1` 后应用本补丁  
> **基于源码**: v2.3.53 (main 分支最新)  
> **质量节拍**: source-driven-dev → TDD → incremental-impl → /review  

---

## 修复清单总览

| # | 文件 | Bug | 严重度 | 修复类型 |
|---|---|---|---|---|
| BF-01 | `electron/main.js` | `@ts-nocheck` 关闭类型检查 | 🔴 P0 | 1 行改动 |
| BF-02 | `electron/bootstrap.js` | `@ts-nocheck` 关闭类型检查 | 🔴 P0 | 1 行改动 |
| BF-03 | `electron/bootstrap.js` | `getMainWin()` 高频调用性能问题 | 🟡 P2 | ~5 行改动 |
| BF-04 | `electron/preload/system.js` | 敏感 API 无权限分级暴露 | 🔴 P0 | 重构拆分 |
| BF-05 | `electron/bootstrap.js` | CJS/ESM interop 脆弱兼容 | 🟡 P2 | ~3 行改动 |
| BF-06 | `electron/bootstrap.js` | 全局状态污染 global.usageTracker | 🟡 P1 | ~5 行改动 |
| BF-07 | `services/pipeline-engine.js` | 纯内存运行无持久化 | 🟡 P1 | 新增持久化 |

---

## BF-01: main.js 移除 @ts-nocheck

**文件**: `apps/desktop/electron/main.js` 第 1 行

### 问题
```javascript
// @ts-nocheck   ← 完全关闭 TypeScript 类型检查
```

### 修复为
```javascript
// @ts-check     ← 启用 JSDoc 类型推断（渐进式迁移）
```

### 手动操作
用编辑器打开 `apps/desktop/electron/main.js`，将第 1 行的 `@ts-nocheck` 改为 `@ts-check`。

> **注意**: 改完后运行 `npm run dev` 或 `npm test`，如有类型报错需逐步修复。可先用 `// @ts-expect-error` 标记无法立即修复的类型错误。

---

## BF-02: bootstrap.js 移除 @ts-nocheck

**文件**: `apps/desktop/electron/bootstrap.js` 第 1 行

### 问题
```javascript
// @ts-nocheck   ← 430 行核心模块完全无类型约束
```

### 修复为
```javascript
// @ts-check     ← 启用 JSDoc 类型推断
```

### 手动操作
同 BF-01，将第 1 行改为 `@ts-check`。

---

## BF-03: bootstrap.js 缓存 getMainWin() 引用

**文件**: `apps/desktop/electron/bootstrap.js`

### 问题（第 28 行 + 第 89 行）
```javascript
// 第 28 行：每次调用都重新查询所有窗口
function getMainWin() { return require('electron').BrowserWindow.getAllWindows()[0] }

// 第 89 行：在任务执行器闭包中被频繁调用（每个进度通知都调用）
const win = getMainWin()  // 高频调用！
```

### 修复为
在 `createAppContext()` 函数中缓存窗口引用：

```javascript
// 在 createAppContext() 顶部添加：
let _cachedMainWindow = null

// 替换原来的 getMainWin：
function getMainWin() {
  if (_cachedMainWindow && !_cachedMainWindow.isDestroyed()) {
    return _cachedMainWindow
  }
  _cachedMainWindow = require('electron').BrowserWindow.getAllWindows()[0]
  return _cachedMainWindow
}
```

---

## BF-04: Preload API 权限分层（安全修复）

**文件**: `apps/desktop/electron/preload/system.js`

### 问题
`system.js` 暴露了 **~80 个方法** 给渲染进程，包含以下敏感操作且无权限校验：

| 敏感方法 | 风险 |
|---|---|
| `paymentComplete(orderId, txnId)` | 渲染进程可直接完成支付 |
| `paymentSimulate(orderId)` | 可模拟支付 |
| `proxyTest(id, timeout)` | 可测试代理连接 |
| `licenseActivate(key)` | 可激活许可证 |
| `providerTest(providerId)` | 可测试第三方 Provider |

### 修复方案
将 `preload/system.js` 拆分为三个文件：

#### Step 1: 创建 `preload/public-system.js`（公开 API — 所有用户可用）
```javascript
/**
 * 公开系统 API — 无需认证即可调用
 */
function createPublicSystemApi(ipcRenderer) {
  return {
    // 系统
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    
    // 自动更新
    updateCheck: () => ipcRenderer.invoke('update:check'),
    updateDownload: () => ipcRenderer.invoke('update:download'),
    updateInstall: () => ipcRenderer.invoke('update:install'),
    onUpdateStatus: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('update:status', handler)
      return () => ipcRenderer.removeListener('update:status', handler)
    },
    
    // 首次运行引导
    firstRunCheck: () => ipcRenderer.invoke('first-run:check'),
    onFirstRunStatus: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('first-run:status', handler)
      return () => ipcRenderer.removeListener('first-run:status', handler)
    },
    
    // 平台配置
    platformList: () => ipcRenderer.invoke('platform:list'),
    platformGet: (id) => ipcRenderer.invoke('platform:get', id),
    getPlatformDefinitions: () => ipcRenderer.invoke('platform:definitions'),
    
    // 敏感词预检
    sensitiveCheck: (text) => ipcRenderer.invoke('sensitive:check', { text }),
    sensitiveReplace: (text) => ipcRenderer.invoke('sensitive:replace', { text }),
    
    // 数据同步
    syncAll: () => ipcRenderer.invoke('sync:all'),
    syncPlatform: (platform) => ipcRenderer.invoke('sync:platform', platform),
    syncCached: () => ipcRenderer.invoke('sync:cached'),
    
    // 通知
    showNotification: (data) => ipcRenderer.invoke('show-notification', data),
    onNotification: (cb) => {
      const h = (_, data) => cb(data)
      ipcRenderer.on('notification', h)
      return () => ipcRenderer.removeListener('notification', h)
    },
    
    // 分屏监控
    webviewSetLayout: (count) => ipcRenderer.invoke('webview:set-layout', count),
    webviewOpenTab: (opts) => ipcRenderer.invoke('webview:open-tab', opts),
    webviewCloseTab: (tabId) => ipcRenderer.invoke('webview:close-tab', tabId),
    webviewCloseAll: () => ipcRenderer.invoke('webview:close-all'),
    webviewListTabs: () => ipcRenderer.invoke('webview:list-tabs'),
    onWebviewLayoutChanged: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('webview:layout-changed', h); return () => ipcRenderer.removeListener('webview:layout-changed', h)
    },
    onWebviewTabOpened: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('webview:tab-opened', h); return () => ipcRenderer.removeListener('webview:tab-opened', h)
    },
    onWebviewTabClosed: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('webview:tab-closed', h); return () => ipcRenderer.removeListener('webview:tab-closed', h)
    },
    onWebviewNav: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('webview:navigated', h); return () => ipcRenderer.removeListener('webview:navigated', h)
    },
    onWebviewAllClosed: (cb) => {
      const h = () => cb(); ipcRenderer.on('webview:all-closed', h); return () => ipcRenderer.removeListener('webview:all-closed', h)
    },
    
    // 回调服务器
    onCallbackReceived: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('callback:received', h); return () => ipcRenderer.removeListener('callback:received', h)
    },
    
    // 离线模式
    offlineStatus: () => ipcRenderer.invoke('offline:status'),
    offlineIsOffline: () => ipcRenderer.invoke('offline:is-offline'),
    offlineCachedTasks: () => ipcRenderer.invoke('offline:cached-tasks'),
    offlineAddToCache: (task) => ipcRenderer.invoke('offline:add-to-cache', task),
    offlineClearCache: () => ipcRenderer.invoke('offline:clear-cache'),
    onOfflineRestored: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('offline:restored', h); return () => ipcRenderer.removeListener('offline:restored', h)
    },
    
    // Onboarding
    onboardingComplete: () => ipcRenderer.invoke('onboarding:complete'),
    onboardingGetSteps: () => ipcRenderer.invoke('onboarding:get-steps'),
    onboardingStatus: () => ipcRenderer.invoke('onboarding:status'),
    
    // 全局导航
    onNavigate: (cb) => {
      const h = (_, route) => cb(route); ipcRenderer.on('app:navigate', h); return () => ipcRenderer.removeListener('app:navigate', h)
    },
    
    // Analytics
    analyticsOverview: () => ipcRenderer.invoke('analytics:overview'),
    analyticsPlatform: (platform) => ipcRenderer.invoke('analytics:platform', { platform }),
    analyticsPlatforms: () => ipcRenderer.invoke('analytics:platforms'),
    
    // Hotkeys
    hotkeysList: () => ipcRenderer.invoke('hotkeys:list'),
    
    // Keyword Monitor
    keywordStart: (keyword, opts) => ipcRenderer.invoke('keyword:start', { keyword, opts }),
    keywordStop: (keyword) => ipcRenderer.invoke('keyword:stop', { keyword }),
    keywordStatus: () => ipcRenderer.invoke('keyword:status'),
    keywordHistory: (keyword) => ipcRenderer.invoke('keyword:history', { keyword }),
    keywordStopAll: () => ipcRenderer.invoke('keyword:stop-all'),
    
    // Upload
    uploadChunked: (filePath) => ipcRenderer.invoke('upload:chunked', { filePath }),
    uploadCancel: () => ipcRenderer.invoke('upload:cancel'),
    
    // Template
    templateList: () => ipcRenderer.invoke('template:list'),
    templateGet: (id) => ipcRenderer.invoke('template:get', id),
    templateAdd: (tpl) => ipcRenderer.invoke('template:add', tpl),
    templateUpdate: (id, updates) => ipcRenderer.invoke('template:update', { id, updates }),
    templateDelete: (id) => ipcRenderer.invoke('template:delete', id),
    templateListByCategory: (category) => ipcRenderer.invoke('template:list-by-category', category),
    templateGetPresets: () => ipcRenderer.invoke('template:get-presets'),
    
    // License (只读)
    licenseInfo: () => ipcRenderer.invoke('license:info'),
    licenseHasFeature: (name) => ipcRenderer.invoke('license:has-feature', name),
    licenseFeatures: () => ipcRenderer.invoke('license:features'),
    
    // Provider (只读 + 用户级操作)
    providerList: () => ipcRenderer.invoke('provider:list'),
    providerListUser: () => ipcRenderer.invoke('provider:list-user'),
    providerGetUser: () => ipcRenderer.invoke('provider:get-user'),
    providerSetUserKey: (key) => ipcRenderer.invoke('provider:set-user-key', key),
    providerDeleteUserKey: () => ipcRenderer.invoke('provider:delete-user-key'),
    
    // AI 写作 (只读配置 + 生成)
    aiListProviders: () => ipcRenderer.invoke('ai:list-providers'),
    aiGetConfig: () => ipcRenderer.invoke('ai:get-config'),
    aiListModels: (providerId) => ipcRenderer.invoke('ai:list-models', providerId),
    aiGenerate: (params) => ipcRenderer.invoke('ai:generate', params),
    aiTestConnection: (config) => ipcRenderer.invoke('ai:test-connection', config),
    aiSaveConfig: (config) => ipcRenderer.invoke('ai:save-config', config),
    onAIProgress: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('ai:progress', h); return () => ipcRenderer.removeListener('ai:progress', h)
    },
    onAIComplete: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('ai:complete', h); return () => ipcRenderer.removeListener('ai:complete', h)
    },
    onAIError: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('ai:error', h); return () => ipcRenderer.removeListener('ai:error', h)
    },
    
    // 视频处理 (只读状态 + 操作)
    videoStatus: () => ipcRenderer.invoke('video:status'),
    videoListProcessTypes: () => ipcRenderer.invoke('video:list-process-types'),
    videoListAnalyzeTypes: () => ipcRenderer.invoke('video:list-analyze-types'),
    videoListStockSources: () => ipcRenderer.invoke('video:list-stock-sources'),
    videoProcess: (params) => ipcRenderer.invoke('video:process', params),
    videoAnalyze: (params) => ipcRenderer.invoke('video:analyze', params),
    videoMixAudio: (params) => ipcRenderer.invoke('video:mix-audio', params),
    videoSearchStock: (query) => ipcRenderer.invoke('video:search-stock', query),
    videoGenerateSubtitle: (params) => ipcRenderer.invoke('video:generate-subtitle', params),
    onVideoProgress: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('video:progress', h); return () => ipcRenderer.removeListener('video:progress', h)
    },
    onVideoComplete: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('video:complete', h); return () => ipcRenderer.removeListener('video:complete', h)
    },
    onVideoError: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('video:error', h); return () => ipcRenderer.removeListener('video:error', h)
    },
    
    // 批量管理
    batchCreate: (batch) => ipcRenderer.invoke('batch:create', batch),
    batchExecute: (id) => ipcRenderer.invoke('batch:execute', id),
    batchSchedule: (id, schedule) => ipcRenderer.invoke('batch:schedule', { id, schedule }),
    batchList: () => ipcRenderer.invoke('batch:list'),
    batchGet: (id) => ipcRenderer.invoke('batch:get', id),
    batchDelete: (id) => ipcRenderer.invoke('batch:delete', id),
    batchDuplicateArticle: (id) => ipcRenderer.invoke('batch:duplicate-article', id),
    onBatchProgress: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('batch:progress', h); return () => ipcRenderer.removeListener('batch:progress', h)
    },
  }
}

module.exports = { createPublicSystemApi }
```

#### Step 2: 创建 `preload/admin-system.js`（管理 API — 仅开发模式或管理员）
```javascript
/**
 * 管理/敏感系统 API — 需要权限校验
 * 
 * 这些方法涉及支付、代理池、许可证激活等敏感操作，
 * 不应直接暴露给渲染进程普通用户。
 * 
 * 使用方式：
 * - 开发模式下通过 preload/index.js 条件性加载
 * - 生产环境仅通过主进程内部调用
 */
function createAdminSystemApi(ipcRenderer) {
  return {
    // ─── 支付（敏感）─────────────────────
    paymentCreateOrder: (options) => ipcRenderer.invoke('payment:create-order', options),
    paymentListOrders: () => ipcRenderer.invoke('payment:list-orders'),
    paymentGetOrder: (orderId) => ipcRenderer.invoke('payment:get-order', orderId),
    paymentComplete: (orderId, txnId) => ipcRenderer.invoke('payment:complete', { orderId, txnId }),
    paymentSimulate: (orderId) => ipcRenderer.invoke('payment:simulate', { orderId }),
    paymentCancel: (orderId) => ipcRenderer.invoke('payment:cancel', orderId),

    // ─── 代理池（敏感）─────────────────────
    proxyAdd: (host, port, type) => ipcRenderer.invoke('proxy:add', { host, port, type }),
    proxyAddBatch: (proxies) => ipcRenderer.invoke('proxy:add-batch', { proxies }),
    proxyList: () => ipcRenderer.invoke('proxy:list'),
    proxyRemove: (id) => ipcRenderer.invoke('proxy:remove', { id }),
    proxyTest: (id, timeout) => ipcRenderer.invoke('proxy:test', { id, timeout }),
    proxyTestAll: (timeout) => ipcRenderer.invoke('proxy:test-all', { timeout }),
    proxyStatus: () => ipcRenderer.invoke('proxy:status'),
    proxyGetNext: () => ipcRenderer.invoke('proxy:get-next'),
    proxyReset: () => ipcRenderer.invoke('proxy:reset'),
    proxyRemoveDead: () => ipcRenderer.invoke('proxy:remove-dead'),

    // ─── 许可证写入操作（敏感）──────────────
    licenseActivate: (key) => ipcRenderer.invoke('license:activate', key),
    licenseDeactivate: () => ipcRenderer.invoke('license:deactivate'),
    licenseActivateTrial: () => ipcRenderer.invoke('license:activate-trial'),

    // ─── Provider 写入操作（敏感）───────────
    providerCreate: (data) => ipcRenderer.invoke('provider:create', data),
    providerUpdate: (id, data) => ipcRenderer.invoke('provider:update', { id, data }),
    providerDelete: (id) => ipcRenderer.invoke('provider:delete', id),
    providerTest: (id) => ipcRenderer.invoke('provider:test', id),
  }
}

module.exports = { createAdminSystemApi }
```

#### Step 3: 修改 `preload/index.js` 聚合入口
```javascript
/**
 * preload 聚合入口（Phase 3.3 — 安全增强版）
 * 
 * 安全改进：
 * - public-system.js: 所有用户可用的公开 API
 * - admin-system.js: 敏感操作，仅在开发模式(isDev)下暴露
 */
const { contextBridge, ipcRenderer } = require('electron')
const { createPublishApi } = require('./publish')
const { createAccountApi } = require('./account')
const { createPublicSystemApi } = require('./public-system')

let api = {
  ...createPublishApi(ipcRenderer),
  ...createAccountApi(ipcRenderer),
  ...createPublicSystemApi(ipcRenderer),
}

// 仅在开发模式下暴露管理 API
if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV) {
  try {
    const { createAdminSystemApi } = require('./admin-system')
    api = { ...api, ...createAdminSystemApi(ipcRenderer) }
  } catch (e) {
    console.warn('[preload] admin-system not available:', e.message)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
```

---

## BF-05: CJS/ESM Interop 标准化

**文件**: `apps/desktop/electron/bootstrap.js` 第 22-24 行

### 问题
```javascript
// 脆弱的 CJS/ESM 兼容代码
const _CloudPublisherModule = require('./services/cloud-publisher')
const CloudPublisher = _CloudPublisherModule.default || _CloudPublisherModule
```

### 修复为
```javascript
// 标准化的 interop helper（提取为工具函数，统一处理所有 ESM/CJS 混用场景）
function resolveModule(mod) {
  return mod && (typeof mod === 'object') && 'default' in mod ? mod.default : mod
}

const CloudPublisher = resolveModule(require('./services/cloud-publisher'))
```

> 同时建议在项目中创建 `electron/utils/interop.js` 统一导出此函数，供所有需要的地方引用。

---

## BF-06: 全局状态污染清理

**文件**: `apps/desktop/electron/bootstrap.js`

### 问题（约第 111 行附近）
```javascript
if (typeof global.usageTracker !== 'undefined' && global.usageTracker) {
  global.usageTracker.trackFeatureUsage('publish', 'success')
  global.usageTracker.trackDaily('articles_published', 1)
}
```

`global.usageTracker` 不在 DI 容器中管理，破坏了依赖注入的一致性和可测试性。

### 修复为
在 `createAppContext()` 中从 DI 容器获取 usageTracker（如果已注册），否则跳过：

```javascript
// 在 createAppContext() 的 DI 消费区域添加：
let usageTracker = null
try {
  usageTracker = container.has('usageTracker') ? container.get('usageTracker') : null
} catch (e) {
  // usageTracker 未注册，静默忽略
}
```

然后将任务执行器中的全局访问替换为：
```javascript
// 原代码：
if (typeof global.usageTracker !== 'undefined' && global.usageTracker) {
  global.usageTracker.trackFeatureUsage('publish', 'success')
  global.usageTracker.trackDaily('articles_published', 1)
}

// 修复后：
if (usageTracker) {
  usageTracker.trackFeatureUsage('publish', 'success')
  usageTracker.trackDaily('articles_published', 1)
}
```

---

## BF-07: PipelineEngine 持久化（架构改进）

**文件**: `apps/desktop/electron/services/pipeline-engine.js`

### 问题
PipelineEngine 的 `_runs` 和 `_history` 都是内存 Map，应用崩溃后全部丢失。14 条管线状态无法恢复。

### 修复方案
新增 SQLite 持久化支持：

```javascript
// 在 PipelineEngine 类中添加：

class PipelineEngine {
  constructor({ store }) {
    this._runs = new Map()
    this._history = []
    this._store = store  // 注入 SQLite store 实例
    this._loadPersistedState() // 启动时恢复
  }

  // ─── 持久化 ─────────────────────────────
  async _loadPersistedState() {
    try {
      const saved = await this._store.get('pipeline_runs')
      if (saved) {
        for (const [id, run] of Object.entries(saved)) {
          this._runs.set(id, run)
        }
      }
      const history = await this._store.get('pipeline_history')
      if (history) this._history = history
    } catch (e) {
      log.warn('PipelineEngine', 'Failed to load persisted state:', e.message)
    }
  }

  async _persistState() {
    try {
      const runsObj = Object.fromEntries(this._runs)
      await this._store.set('pipeline_runs', runsObj)
      await this._store.set('pipeline_history', this._history)
    } catch (e) {
      log.error('PipelineEngine', 'Failed to persist state:', e.message)
    }
  }

  // 在 start() 方法末尾添加：
  async start(pipelineName, params) {
    // ... 现有逻辑 ...
    this._runs.set(run.id, run)
    await this._persistState() // 新增：立即持久化
    return run
  }

  // 在 updateRun() 方法末尾添加：
  async updateRun(runId, updates) {
    // ... 现有逻辑 ...
    await this._persistState() // 新增：变更后持久化
  }
}
```

同时在 `container.setup.js` 中确保 PipelineEngine 接收 store 依赖。

---

## 应用顺序建议

按以下顺序逐个应用补丁，每步完成后跑一次 `npm test` 验证：

1. **BF-01** → `main.js` 改 1 行（30 秒）
2. **BF-02** → `bootstrap.js` 改 1 行（30 秒）
3. **BF-03** → `bootstrap.js` 改 ~5 行（2 分钟）
4. **BF-06** → `bootstrap.js` 改 ~10 行（3 分钟）
5. **BF-05** → `bootstrap.js` 改 ~5 行（2 分钟）
6. **BF-04** → 新建 2 个文件 + 修改 index.js（10 分钟）
7. **BF-07** → `pipeline-engine.js` 改动较大（15 分钟）

**预计总时间**: ~35 分钟（不含测试验证时间）

---

*本补丁文件由 Tabbit 基于 v2.3.53 源码逐文件审查生成*
