const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  // 发布 API
  publishWechat: (articleData) => ipcRenderer.invoke('publish:wechat', articleData),
  publishBatch: (platforms, article) => ipcRenderer.invoke('publish:batch', { platforms, article }),
  listAccounts: () => ipcRenderer.invoke('accounts:list'),

  // ─── 渲染 API 🆕 ────────────────────────────
  renderStart: (data) => ipcRenderer.invoke('render:start', data),
  renderCancel: () => ipcRenderer.invoke('render:cancel'),
  renderGetStatus: () => ipcRenderer.invoke('render:status'),
  onRenderProgress: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on('render:progress', handler);
    return () => ipcRenderer.removeListener('render:progress', handler);
  },
  onRenderComplete: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on('render:complete', handler);
    return () => ipcRenderer.removeListener('render:complete', handler);
  },
  onRenderError: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on('render:error', handler);
    return () => ipcRenderer.removeListener('render:error', handler);
  },

  // 内容情报 API（预存未注册）
  intelligenceSuggestTags: (content, opts) => ipcRenderer.invoke('intelligence:suggest-tags', { content, opts }),
  intelligenceGetOptimalTime: (keyword) => ipcRenderer.invoke('intelligence:get-optimal-time', { keyword }),

  // ─── 队列 API ───────────────────────────────
  getQueueStatus: () => ipcRenderer.invoke('queue:status'),
  getQueueHistory: () => ipcRenderer.invoke('queue:history'),
  cancelTask: (taskId) => ipcRenderer.invoke('queue:cancel', taskId),

  // 发布历史 API
  historyList: (opts) => ipcRenderer.invoke('history:list', opts),
  historyGet: (id) => ipcRenderer.invoke('history:get', id),

  // 发布统计 API
  dashboardStats: () => ipcRenderer.invoke('dashboard:stats'),

  // 定时发布 API
  schedulerCreate: (schedule) => ipcRenderer.invoke('scheduler:create', schedule),
  schedulerList: () => ipcRenderer.invoke('scheduler:list'),
  schedulerCancel: (id) => ipcRenderer.invoke('scheduler:cancel', id),

  // 自动更新 API
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },

  // 首次运行引导 API
  firstRunCheck: () => ipcRenderer.invoke('first-run:check'),
  onFirstRunStatus: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('first-run:status', handler)
    return () => ipcRenderer.removeListener('first-run:status', handler)
  },

  // ─── 平台配置 API ─────────────────────────
  platformList: () => ipcRenderer.invoke('platform:list'),
  platformGet: (id) => ipcRenderer.invoke('platform:get', id),
  // ─── 敏感词预检 API ───────────────────────
  sensitiveCheck: (text) => ipcRenderer.invoke('sensitive:check', { text }),
  sensitiveReplace: (text) => ipcRenderer.invoke('sensitive:replace', { text }),
  // ─── 数据同步 API ─────────────────────────
  syncAll: () => ipcRenderer.invoke('sync:all'),
  syncPlatform: (platform) => ipcRenderer.invoke('sync:platform', platform),
  syncCached: () => ipcRenderer.invoke('sync:cached'),
  showNotification: (data) => ipcRenderer.invoke('show-notification', data),
  onNotification: (cb) => {
    const h = (_, data) => cb(data)
    ipcRenderer.on('notification', h)
    return () => ipcRenderer.removeListener('notification', h)
  },

  // ─── 账号管理 API ─────────────────────
  accountAdd: (platform) => ipcRenderer.invoke('account:add', platform),
  accountDelete: (accountId) => ipcRenderer.invoke('account:delete', accountId),
  accountCheckLogin: (platform, accountId) => ipcRenderer.invoke('account:check-login', { platform, accountId }),
  accountList: () => ipcRenderer.invoke('account:list'),
  accountSetDefault: (platform, accountId) => ipcRenderer.invoke('store:set-default-account', { platform, accountId }),
  accountGetDefault: (platform) => ipcRenderer.invoke('store:get-default-account', platform),
  accountUpdate: (id, fields) => ipcRenderer.invoke('store:update-account', { id, fields }),

  // ─── 内嵌浏览器登录 API ──────────────
  authOpenLogin: (platform) => ipcRenderer.invoke('auth:open-login', platform),
  authClose: () => ipcRenderer.invoke('auth:close'),
  authSaveCredentials: (data) => ipcRenderer.invoke('auth:save-credentials', data),
  onAuthViewOpened: (callback) => {
    const h = (_, data) => callback(data)
    ipcRenderer.on('auth:view-opened', h)
    return () => ipcRenderer.removeListener('auth:view-opened', h)
  },
  onAuthCompleted: (callback) => {
    const h = (_, data) => callback(data)
    ipcRenderer.on('auth:completed', h)
    return () => ipcRenderer.removeListener('auth:completed', h)
  },
  onAuthViewClosed: (callback) => {
    const h = () => callback()
    ipcRenderer.on('auth:view-closed', h)
    return () => ipcRenderer.removeListener('auth:view-closed', h)
  },

  // 进度监听
  onProgress: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('publish:progress', handler)
    return () => ipcRenderer.removeListener('publish:progress', handler)
  },

  // ─── 分屏监控 API ─────────────────────────
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

  // ─── 回调服务器 API ─────────────────────
  onCallbackReceived: (cb) => {
    const h = (_, d) => cb(d); ipcRenderer.on('callback:received', h); return () => ipcRenderer.removeListener('callback:received', h)
  },

  // ─── 扫码登录 API ──────────────────────────
  authOpenQrCodeLogin: (platform) => ipcRenderer.invoke('auth:open-qrcode-login', platform),
  authQrCodeClose: () => ipcRenderer.invoke('auth:qrcode-close'),
  onQrCodeOpened: (cb) => {
    const h = (_, d) => cb(d); ipcRenderer.on('qrcode:opened', h); return () => ipcRenderer.removeListener('qrcode:opened', h)
  },
  onQrCodeDetected: (cb) => {
    const h = (_, d) => cb(d); ipcRenderer.on('qrcode:detected', h); return () => ipcRenderer.removeListener('qrcode:detected', h)
  },
  onQrCodeCompleted: (cb) => {
    const h = (_, d) => cb(d); ipcRenderer.on('qrcode:completed', h); return () => ipcRenderer.removeListener('qrcode:completed', h)
  },
  onQrCodeClosed: (cb) => {
    const h = () => cb(); ipcRenderer.on('qrcode:closed', h); return () => ipcRenderer.removeListener('qrcode:closed', h)
  },

  // ─── 统一数据存储 API ─────────────────────────
  storeAddAccount: (account) => ipcRenderer.invoke('store:add-account', account),
  storeGetAccount: (id) => ipcRenderer.invoke('store:get-account', id),
  storeListAccounts: (platform) => ipcRenderer.invoke('store:list-accounts', platform),
  storeDeleteAccount: (id) => ipcRenderer.invoke('store:delete-account', id),
  storeAddPublishRecord: (record) => ipcRenderer.invoke('store:add-publish-record', record),
  storeListPublishHistory: (opts) => ipcRenderer.invoke('store:list-publish-history', opts),
  storeGetPublishStats: () => ipcRenderer.invoke('store:get-publish-stats'),
  storeAddScheduledTask: (task) => ipcRenderer.invoke('store:add-scheduled-task', task),
  storeListScheduledTasks: () => ipcRenderer.invoke('store:list-scheduled-tasks'),
  storeDeleteTask: (id) => ipcRenderer.invoke('store:delete-task', id),
  storeGetSetting: (key) => ipcRenderer.invoke('store:get-setting', key),
  storeSetSetting: (key, value) => ipcRenderer.invoke('store:set-setting', key, value),
  storeListCallbackLogs: (limit) => ipcRenderer.invoke('store:list-callback-logs', limit),

    // ─── OAuth 认证 API ────────────────────────────
    oauthStart: (opts) => ipcRenderer.invoke('oauth:start', opts),
    oauthClose: () => ipcRenderer.invoke('oauth:close'),
    oauthGetConfigs: () => ipcRenderer.invoke('oauth:get-configs'),
    onOAuthOpened: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('oauth:opened', h); return () => ipcRenderer.removeListener('oauth:opened', h)
    },
    onOAuthCompleted: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('oauth:completed', h); return () => ipcRenderer.removeListener('oauth:completed', h)
    },
    onOAuthFailed: (cb) => {
      const h = (_, d) => cb(d); ipcRenderer.on('oauth:failed', h); return () => ipcRenderer.removeListener('oauth:failed', h)
    },
    onOAuthClosed: (cb) => {
        const h = () => cb(); ipcRenderer.on('oauth:closed', h); return () => ipcRenderer.removeListener('oauth:closed', h)
      },

      // ─── 批量发布 API ────────────────────────────
      batchCreate: (batch) => ipcRenderer.invoke('batch:create', batch),
      batchExecute: (id) => ipcRenderer.invoke('batch:execute', id),
      batchSchedule: (id) => ipcRenderer.invoke('batch:schedule', id),
      batchList: () => ipcRenderer.invoke('batch:list'),
      batchGet: (id) => ipcRenderer.invoke('batch:get', id),
      batchDelete: (id) => ipcRenderer.invoke('batch:delete', id),
      batchDuplicateArticle: (article) => ipcRenderer.invoke('batch:duplicate-article', article),
      onBatchProgress: (cb) => {
        const h = (_, d) => cb(d); ipcRenderer.on('batch:progress', h); return () => ipcRenderer.removeListener('batch:progress', h)
      },

      // ─── 全局导航（快捷键触发）──────────────
      onNavigate: (cb) => {
        const h = (_, route) => cb(route); ipcRenderer.on('app:navigate', h); return () =>
    })
