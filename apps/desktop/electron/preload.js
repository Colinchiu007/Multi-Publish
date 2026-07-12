/**
 * preload.js — Electron 预加载脚本（sandbox 兼容版）
 *
 * 在 sandbox 模式下，Electron 的 preload require 对子目录路径支持有限，
 * 因此将所有 API 方法直接内联在此文件中，不通过 require 加载子模块。
 *
 * 通过 contextBridge.exposeInMainWorld('electronAPI', api) 暴露给渲染进程。
 */
const { contextBridge, ipcRenderer } = require('electron')

const api = {
  // ══ 系统 API ═══
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  // ═══ 自动更新 API ═══
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },

  // ══ 首次运行引导 API ═══
  firstRunCheck: () => ipcRenderer.invoke('first-run:check'),
  onFirstRunStatus: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('first-run:status', handler)
    return () => ipcRenderer.removeListener('first-run:status', handler)
  },

  // ═══ 平台配置 API ══
  platformList: () => ipcRenderer.invoke('platform:list'),
  platformGet: (id) => ipcRenderer.invoke('platform:get', id),
  getPlatformDefinitions: () => ipcRenderer.invoke('platform:definitions'),

  // ═══ 敏感词预检 API ═══
  sensitiveCheck: (text) => ipcRenderer.invoke('sensitive:check', { text }),
  sensitiveReplace: (text) => ipcRenderer.invoke('sensitive:replace', { text }),

  // ═══ 数据同步 API ═══
  syncAll: () => ipcRenderer.invoke('sync:all'),
  syncPlatform: (platform) => ipcRenderer.invoke('sync:platform', platform),
  syncCached: () => ipcRenderer.invoke('sync:cached'),

  // ═══ 通知 API ═══
  showNotification: (data) => ipcRenderer.invoke('show-notification', data),
  onNotification: (cb) => {
    const h = (_, data) => cb(data)
    ipcRenderer.on('notification', h)
    return () => ipcRenderer.removeListener('notification', h)
  },

  // ══ 分屏监控 API ═══
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

  // ═══ 回调服务器 API ═══
  onCallbackReceived: (cb) => {
    const h = (_, d) => cb(d); ipcRenderer.on('callback:received', h); return () => ipcRenderer.removeListener('callback:received', h)
  },

  // ═══ 离线模式 API ═══
  offlineStatus: () => ipcRenderer.invoke('offline:status'),
  offlineIsOffline: () => ipcRenderer.invoke('offline:is-offline'),
  offlineCachedTasks: () => ipcRenderer.invoke('offline:cached-tasks'),
  offlineAddToCache: (task) => ipcRenderer.invoke('offline:add-to-cache', task),
  offlineClearCache: () => ipcRenderer.invoke('offline:clear-cache'),
  onOfflineRestored: (cb) => {
    const h = (_, d) => cb(d); ipcRenderer.on('offline:restored', h); return () => ipcRenderer.removeListener('offline:restored', h)
  },

  // ═══ Onboarding API ═══
  onboardingComplete: () => ipcRenderer.invoke('onboarding:complete'),
  onboardingGetSteps: () => ipcRenderer.invoke('onboarding:get-steps'),
  onboardingStatus: () => ipcRenderer.invoke('onboarding:status'),

  // ═══ 支付 API ═══
  paymentCreateOrder: (options) => ipcRenderer.invoke('payment:create-order', options),
  paymentListOrders: () => ipcRenderer.invoke('payment:list-orders'),
  paymentGetOrder: (orderId) => ipcRenderer.invoke('payment:get-order', orderId),
  paymentComplete: (orderId, txnId) => ipcRenderer.invoke('payment:complete', { orderId, txnId }),
  paymentSimulate: (orderId) => ipcRenderer.invoke('payment:simulate', { orderId }),
  paymentCancel: (orderId) => ipcRenderer.invoke('payment:cancel', orderId),

  // ═══ 全局导航 API ══
  onNavigate: (cb) => {
    const h = (_, route) => cb(route); ipcRenderer.on('app:navigate', h); return () => ipcRenderer.removeListener('app:navigate', h)
  },

  // ═══ Analytics API ═══
  analyticsOverview: () => ipcRenderer.invoke('analytics:overview'),
  analyticsPlatform: (platform) => ipcRenderer.invoke('analytics:platform', { platform }),
  analyticsPlatforms: () => ipcRenderer.invoke('analytics:platforms'),

  // ═══ Hotkeys API ═══
  hotkeysList: () => ipcRenderer.invoke('hotkeys:list'),

  // ══ Keyword API ═══
  keywordStart: (keyword, opts) => ipcRenderer.invoke('keyword:start', { keyword, opts }),
  keywordStop: (keyword) => ipcRenderer.invoke('keyword:stop', { keyword }),
  keywordStatus: () => ipcRenderer.invoke('keyword:status'),
  keywordHistory: (keyword) => ipcRenderer.invoke('keyword:history', { keyword }),
  keywordStopAll: () => ipcRenderer.invoke('keyword:stop-all'),

  // ═══ Proxy API ═══
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

  // ═══ Upload API ═══
  uploadChunked: (filePath) => ipcRenderer.invoke('upload:chunked', { filePath }),
  uploadCancel: () => ipcRenderer.invoke('upload:cancel'),

  // ═══ Template API ═══
  templateList: () => ipcRenderer.invoke('template:list'),
  templateGet: (id) => ipcRenderer.invoke('template:get', id),
  templateAdd: (tpl) => ipcRenderer.invoke('template:add', tpl),
  templateUpdate: (id, updates) => ipcRenderer.invoke('template:update', { id, updates }),
  templateDelete: (id) => ipcRenderer.invoke('template:delete', id),
  templateListByCategory: (category) => ipcRenderer.invoke('template:list-by-category', category),
  templateGetPresets: () => ipcRenderer.invoke('template:get-presets'),

  // ═══ 许可证 API ═══
  licenseInfo: () => ipcRenderer.invoke('license:info'),
  licenseActivate: (key) => ipcRenderer.invoke('license:activate', key),
  licenseDeactivate: () => ipcRenderer.invoke('license:deactivate'),
  licenseActivateTrial: () => ipcRenderer.invoke('license:activate-trial'),
  licenseHasFeature: (name) => ipcRenderer.invoke('license:has-feature', name),
  licenseFeatures: () => ipcRenderer.invoke('license:features'),

  // ═══ Provider API ══
  providerList: () => ipcRenderer.invoke('provider:list'),
  providerCreate: (data) => ipcRenderer.invoke('provider:create', data),
  providerUpdate: (name, data) => ipcRenderer.invoke('provider:update', name, data),
  providerDelete: (name) => ipcRenderer.invoke('provider:delete', name),
  providerTest: (name) => ipcRenderer.invoke('provider:test', name),
  providerListUser: () => ipcRenderer.invoke('provider:list-user'),
  providerGetUser: (name) => ipcRenderer.invoke('provider:get-user', name),
  providerSetUserKey: (name, apiKey, baseUrl) => ipcRenderer.invoke('provider:set-user-key', name, apiKey, baseUrl),
  providerDeleteUserKey: (name) => ipcRenderer.invoke('provider:delete-user-key', name),

  // ═══ AI 生成 API ═══
  aiListProviders: (type) => ipcRenderer.invoke('ai:list-providers', type),
  aiGetConfig: (providerId) => ipcRenderer.invoke('ai:get-config', providerId),
  aiListModels: (providerId) => ipcRenderer.invoke('ai:list-models', providerId),
  aiGenerate: (type, provider, params) => ipcRenderer.invoke('ai:generate', { type, provider, params }),
  aiTestConnection: (providerId) => ipcRenderer.invoke('ai:test-connection', providerId),
  aiSaveConfig: (providerId, config) => ipcRenderer.invoke('ai:save-config', providerId, config),
  aiIsConfigured: () => ipcRenderer.invoke('ai:is-configured'),
  aiGenerateTitles: (topic) => ipcRenderer.invoke('ai:generate-titles', topic),
  aiEnhanceContent: (content, style) => ipcRenderer.invoke('ai:enhance-content', content, style),
  aiGenerateSummary: (content) => ipcRenderer.invoke('ai:generate-summary', content),

  // ═══ 模型服务商管理 API ═══
  modelProviderList: (category) => ipcRenderer.invoke('model-provider:list', category),
  modelProviderGet: (id) => ipcRenderer.invoke('model-provider:get', id),
  modelProviderCreate: (data) => ipcRenderer.invoke('model-provider:create', data),
  modelProviderUpdate: (id, data) => ipcRenderer.invoke('model-provider:update', id, data),
  modelProviderDelete: (id) => ipcRenderer.invoke('model-provider:delete', id),
  modelProviderSetDefault: (category, id) => ipcRenderer.invoke('model-provider:set-default', category, id),
  modelProviderGetDefault: (category) => ipcRenderer.invoke('model-provider:get-default', category),
  modelProviderTest: (id) => ipcRenderer.invoke('model-provider:test', id),
  modelProviderPresets: (category) => ipcRenderer.invoke('model-provider:presets', category),
  modelProviderIsConfigured: (category) => ipcRenderer.invoke('model-provider:is-configured', category),
  onAIProgress: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('ai:progress', h); return () => ipcRenderer.removeListener('ai:progress', h); },
  onAIComplete: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('ai:complete', h); return () => ipcRenderer.removeListener('ai:complete', h); },
  onAIError: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('ai:error', h); return () => ipcRenderer.removeListener('ai:error', h); },

  // ══ 视频处理 API ═══
  videoStatus: () => ipcRenderer.invoke('video:status'),
  videoListProcessTypes: () => ipcRenderer.invoke('video:list-process-types'),
  videoListAnalyzeTypes: () => ipcRenderer.invoke('video:list-analyze-types'),
  videoListStockSources: () => ipcRenderer.invoke('video:list-stock-sources'),
  videoProcess: (type, params) => ipcRenderer.invoke('video:process', { type, params }),
  videoAnalyze: (type, filePath) => ipcRenderer.invoke('video:analyze', type, filePath),
  videoMixAudio: (params) => ipcRenderer.invoke('video:mix-audio', params),
  videoSearchStock: (query, source, limit) => ipcRenderer.invoke('video:search-stock', query, source, limit),
  videoGenerateSubtitle: (audioPath, language) => ipcRenderer.invoke('video:generate-subtitle', audioPath, language),
  onVideoProgress: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('video:progress', h); return () => ipcRenderer.removeListener('video:progress', h); },
  onVideoComplete: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('video:complete', h); return () => ipcRenderer.removeListener('video:complete', h); },
  onVideoError: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('video:error', h); return () => ipcRenderer.removeListener('video:error', h); },

  // ═══ 批量发布 API ═══
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

  // ═══ 发布 API ═══
  publishWechat: (articleData) => ipcRenderer.invoke('publish:wechat', articleData),
  publishBatch: (platforms, article) => ipcRenderer.invoke('publish:batch', { platforms, article }),
  listAccounts: () => ipcRenderer.invoke('accounts:list'),

  // ═══ 渲染 API ═══
  renderStart: (data) => ipcRenderer.invoke('render:start', data),
  renderCancel: () => ipcRenderer.invoke('render:cancel'),
  renderGetStatus: () => ipcRenderer.invoke('render:status'),
  renderInstallDeps: () => ipcRenderer.invoke('render:install-deps'),
  onRenderProgress: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('render:progress', h); return () => ipcRenderer.removeListener('render:progress', h); },
  onRenderComplete: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('render:complete', h); return () => ipcRenderer.removeListener('render:complete', h); },
  onRenderError: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('render:error', h); return () => ipcRenderer.removeListener('render:error', h); },
  onRenderInstallProgress: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('render:install-progress', h); return () => ipcRenderer.removeListener('render:install-progress', h); },
  renderListCompositions: () => ipcRenderer.invoke('render:list-compositions'),
  renderGetComposition: (id) => ipcRenderer.invoke('render:get-composition', id),
  renderValidateProps: (compositionId, props) => ipcRenderer.invoke('render:validate-props', compositionId, props),

  // ═══ 管线 API ═══
  pipelines: {
    list: () => ipcRenderer.invoke('pipeline:list'),
    get: (name) => ipcRenderer.invoke('pipeline:get', name),
  },

  // ═══ 内容情报 API ══
  intelligenceSuggestTags: (content, opts) => ipcRenderer.invoke('intelligence:suggest-tags', { content, opts }),
  intelligenceGetOptimalTime: (keyword) => ipcRenderer.invoke('intelligence:get-optimal-time', { keyword }),
  intelligenceSearch: (query, opts) => ipcRenderer.invoke('intelligence:search', { query, opts }),
  intelligenceSearchTitles: (query, opts) => ipcRenderer.invoke('intelligence:search-titles', { title: query, opts }),
  intelligenceFetchTrending: (opts) => ipcRenderer.invoke('intelligence:fetch-trending', opts),
  intelligenceFindReferences: (url, opts) => ipcRenderer.invoke('intelligence:find-references', { text: url, opts }),
  intelligenceGetBenchmark: (opts) => {
    const o = opts || {}
    return ipcRenderer.invoke('intelligence:get-benchmark', { title: o.keyword || o.title, opts: o })
  },

  // ═══ 队列 API ═══
  getQueueStatus: () => ipcRenderer.invoke('queue:status'),
  getQueueHistory: () => ipcRenderer.invoke('queue:history'),
  cancelTask: (taskId) => ipcRenderer.invoke('queue:cancel', taskId),

  // ═══ 发布历史 API ═══
  historyList: (opts) => ipcRenderer.invoke('history:list', opts),
  historyGet: (id) => ipcRenderer.invoke('history:get', id),

  // ══ 发布统计 API ═══
  dashboardStats: () => ipcRenderer.invoke('dashboard:stats'),

  // ═══ 定时发布 API ═══
  schedulerCreate: (schedule) => ipcRenderer.invoke('scheduler:create', schedule),
  schedulerList: () => ipcRenderer.invoke('scheduler:list'),
  schedulerCancel: (id) => ipcRenderer.invoke('scheduler:cancel', id),

  // ═══ 进度监听 ═══
  onProgress: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('publish:progress', handler)
    return () => ipcRenderer.removeListener('publish:progress', handler)
  },

  // ══ Pipeline 管线 API ═══
  pipelineList: () => ipcRenderer.invoke('pipeline:list'),
  pipelineGet: (name) => ipcRenderer.invoke('pipeline:get', name),
  pipelineStart: (name, params) => ipcRenderer.invoke('pipeline:start', name, params),
  pipelinePause: () => ipcRenderer.invoke('pipeline:pause'),
  pipelineResume: () => ipcRenderer.invoke('pipeline:resume'),
  pipelineCancel: () => ipcRenderer.invoke('pipeline:cancel'),
  pipelineStatus: (name) => ipcRenderer.invoke('pipeline:status', name),
  pipelineAdvance: () => ipcRenderer.invoke('pipeline:advance'),
  pipelineHistory: () => ipcRenderer.invoke('pipeline:history'),
  pipelineFetch: (name) => ipcRenderer.invoke('pipeline:fetch', name),

  // ══ Cloud Publisher API ═══
  cloudPublishSubmit: (params) => ipcRenderer.invoke('cloud-publisher:submit', params),
  cloudPublishListTasks: () => ipcRenderer.invoke('cloud-publisher:list-tasks'),
  cloudPublishGetTask: (taskId) => ipcRenderer.invoke('cloud-publisher:get-task', taskId),
  cloudPublishPlatforms: () => ipcRenderer.invoke('cloud-publisher:platforms'),

  // ══ URL Collect API ═══
  urlCollectFetch: (url) => ipcRenderer.invoke('url-collect:fetch', { url }),

  // ═══ Viral Analysis API ═══
  viralAnalyze: (articles, topic) => ipcRenderer.invoke('viral:analyze', { articles, topic }),
  viralGenerate: (opts) => ipcRenderer.invoke('viral:generate', opts),
  viralTrending: (articles) => ipcRenderer.invoke('viral:trending', { articles }),

  // ═══ Comment Management API ═══
  commentList: (platform, cookie, maxDays) => ipcRenderer.invoke('comment:list', { platform, cookie, maxDays }),
  commentReply: (platform, cookie, commentId, content) => ipcRenderer.invoke('comment:reply', { platform, cookie, commentId, content }),
  commentStartPolling: (opts) => ipcRenderer.invoke('comment:start-polling', opts),
  commentStopPolling: (key) => ipcRenderer.invoke('comment:stop-polling', { key }),
  commentStatus: () => ipcRenderer.invoke('comment:status'),
  onCommentReplied: (cb) => {
    const h = (_, data) => cb(data); ipcRenderer.on('comment:replied', h); return () => ipcRenderer.removeListener('comment:replied', h)
  },

  // ═══ 账号管理 API ══
  accountAdd: (platform) => ipcRenderer.invoke('account:add', platform),
  accountDelete: (accountId) => ipcRenderer.invoke('account:delete', accountId),
  accountCheckLogin: (platform, accountId) => ipcRenderer.invoke('account:check-login', { platform, accountId }),
  accountList: () => ipcRenderer.invoke('account:list'),
  accountSetDefault: (platform, accountId) => ipcRenderer.invoke('store:set-default-account', { platform, accountId }),
  accountGetDefault: (platform) => ipcRenderer.invoke('store:get-default-account', platform),
  accountUpdate: (id, fields) => ipcRenderer.invoke('store:update-account', { id, fields }),

  // ═══ 内嵌浏览器登录 API ═══
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
  authLoginSilent: (platform, cookies, localStorage) => ipcRenderer.invoke('auth:login-silent', { platform, cookies, localStorage }),

  // ═══ 扫码登录 API ═══
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

  // ═══ OAuth 认证 API ═══
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

  // ══ 统一数据存储 API ═══
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
}

contextBridge.exposeInMainWorld('electronAPI', api)
